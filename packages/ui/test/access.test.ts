/** AccessEditor (C382): differences by value, the filter with its regex fallback, bulk partial failure, confirmation above 25, no cross-product in the DOM. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, h, key, mount, ui } from "./dom.ts";

const LEVELS = [
  { id: "read", label: "Read" },
  { id: "contribute", label: "Read and work" },
  { id: "manage", label: "Read, work and delete" },
];
const AGENTS = Array.from({ length: 32 }, (_, i) => ({ id: `a${i}`, name: i < 2 ? ["Henry", "Tempo"][i] : `QA fleet ${i}` })) as { id: string; name: string }[];
const SCOPES = Array.from({ length: 192 }, (_, i) => ({ id: `s${i}`, name: i === 0 ? "Launch" : `QA project ${i}` }));
const defaultOf = (_agent: string, scope: string) => (scope === "s0" ? "contribute" : null);
const allDefault = AGENTS.map((a) => ({ agent: a.id, scope: "s0", level: "contribute" }));

test("difference by value: same level as the default is no difference whoever wrote the row; a missing row where the default gives access is one", async () => {
  const { accessDifferences } = await ui();
  const agents = AGENTS.slice(0, 2);
  const scopes = SCOPES.slice(0, 2);
  assert.deepEqual(
    accessDifferences(
      agents,
      scopes,
      [
        { agent: "a0", scope: "s0", level: "contribute" },
        { agent: "a1", scope: "s0", level: "contribute" },
      ],
      defaultOf,
    ),
    [],
  );
  const rows = accessDifferences(
    agents,
    scopes,
    [
      { agent: "a0", scope: "s0", level: "read" },
      { agent: "a0", scope: "s1", level: "read" },
    ],
    defaultOf,
  );
  assert.deepEqual(
    rows.map((r) => [r.agent.id, r.scope.id, r.level, r.defaultLevel]),
    [
      ["a0", "s0", "read", "contribute"],
      ["a0", "s1", "read", null],
      ["a1", "s0", null, "contribute"],
    ],
  );
});

test("difference: a cell with an action is listed at its default level, and it is no difference", async () => {
  const { accessDifferences } = await ui();
  const action = { text: "t", label: "Allow", run: async () => {} };
  const rows = accessDifferences(AGENTS.slice(0, 1), SCOPES.slice(0, 1), [{ agent: "a0", scope: "s0", level: "contribute", action }], defaultOf);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.differs, false);
  const noted = accessDifferences(AGENTS.slice(0, 1), SCOPES.slice(0, 1), [{ agent: "a0", scope: "s0", level: "contribute", note: "Saved" }], defaultOf);
  assert.deepEqual(noted, [], "a note alone does not list a row at its default");
});

test("filter: plain text, regex, negative lookahead; an invalid or slow regex falls back to plain text", async () => {
  const { accessFilter } = await ui();
  assert.equal(accessFilter("").test("anything"), true);
  assert.equal(accessFilter("  ").invalid, false);
  assert.equal(accessFilter("henry").test("Henry"), true);
  const noQa = accessFilter("^(?!QA)");
  assert.equal(noQa.invalid, false);
  assert.equal(noQa.test("QA fleet 01"), false);
  assert.equal(noQa.test("Henry"), true);
  const bad = accessFilter("C++(");
  assert.equal(bad.invalid, true);
  assert.equal(bad.test("my c++( notes"), true);
  assert.equal(bad.test("Henry"), false);
  const slow = accessFilter("(a+)+$");
  assert.equal(slow.invalid, true);
  assert.equal(slow.test("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa!"), false, "runs as plain text, no regex");
  for (const q of ["(a|aa)+$", "^(([a-z])+.)+[A-Z]$", "(a*)*"]) assert.equal(accessFilter(q).slow, true, q);
  for (const q of ["^(?!QA)", "(ab)+", "^QA (fleet|C380)", "fleet [0-9]+$"]) assert.equal(accessFilter(q).invalid, false, q);
});

test("bulk: a pair already at the level is not written; every other write runs with limited concurrency; failures come back per row", async () => {
  const { accessChanges, accessWriteAll, accessUnconfirmed } = await ui();
  const cells = [{ agent: "a0", scope: "s0", level: "read" }];
  const changes = accessChanges(["a0", "a1", "a2", "a3", "a4", "a5"], ["s0"], "read", cells);
  assert.deepEqual(
    changes.map((c) => c.agent),
    ["a1", "a2", "a3", "a4", "a5"],
  );
  assert.deepEqual(accessChanges(["a0"], ["s1"], null, cells), [], "no row and no access is already at the level");
  let running = 0;
  let peak = 0;
  const failed = await accessWriteAll(
    changes,
    async (c) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
      if (c.agent === "a2") throw new Error("held");
    },
    (e) => (e as Error).message,
    undefined,
    2,
  );
  assert.equal(peak, 2);
  assert.deepEqual(failed, [{ agent: "a2", scope: "s0", level: "read", reason: "held" }]);
  const after = [
    { agent: "a1", scope: "s0", level: "read" },
    { agent: "a4", scope: "s0", level: "read" },
    { agent: "a5", scope: "s0", level: "read" },
  ];
  assert.deepEqual(
    accessUnconfirmed(changes, failed, after).map((f) => f.agent),
    ["a3"],
    "a write the read-back does not show is not a success",
  );
});

const props = (extra: object = {}) => ({
  agents: AGENTS,
  scopes: SCOPES,
  levels: LEVELS,
  scopeWord: { one: "project", many: "projects" },
  defaults: [
    { what: "Shared projects", level: "contribute" },
    { what: "Any other project", level: null },
  ],
  cells: allDefault,
  defaultOf,
  write: async () => {},
  reload: async () => allDefault,
  explain: (e: unknown) => (e as Error).message,
  storageKey: `test:${Math.random()}`,
  ...extra,
});
const flush = async () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 5));
  });
const button = (root: Element, name: string | RegExp) => {
  const b = [...root.querySelectorAll("button")].find((x) =>
    typeof name === "string" ? x.textContent?.trim() === name : name.test(x.getAttribute("aria-label") ?? x.textContent ?? ""),
  );
  assert.ok(b, `button ${name}`);
  return b as HTMLButtonElement;
};
const click = async (el: Element) => {
  await act(async () => (el as HTMLElement).click());
  await flush();
};
const pick = async (root: Element, name: string) => {
  const o = [...root.querySelectorAll('[role="option"]')].find((x) => x.querySelector(".tb-access-pick-name")?.textContent === name);
  assert.ok(o, `option ${name}`);
  await click(o as Element);
};
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};

test("opening view at 32 x 192: three dropdowns, the defaults once, the empty list said in words", async () => {
  const { AccessEditor } = await ui();
  const m = await mount(h(AccessEditor, props()));
  assert.equal(m.root.querySelectorAll('[role="combobox"]').length, 3);
  assert.match(m.root.textContent ?? "", /32 agents and 192 projects: 6,144 combinations\. None differs from the default\./);
  assert.match(m.root.textContent ?? "", /Every agent has the default\./);
  assert.ok(m.root.querySelectorAll("button").length < 8, "no cross-product of controls");
  await m.unmount();
});

test("Back to default writes the default level; a failure is said and not reported as set", async () => {
  const { AccessEditor } = await ui();
  const writes: unknown[] = [];
  const cells = [...allDefault.slice(1), { agent: "a0", scope: "s0", level: "read" }];
  const m = await mount(
    h(
      AccessEditor,
      props({
        cells,
        reload: async () => cells,
        write: async (c: object) => {
          writes.push(c);
          throw new Error("op_not_completed");
        },
      }),
    ),
  );
  await click(button(m.root, /^Back to default: Henry to Launch$/));
  assert.deepEqual(writes, [{ agent: "a0", scope: "s0", level: "contribute" }]);
  assert.match(m.root.textContent ?? "", /Henry to Launch: op_not_completed/);
  assert.doesNotMatch(m.root.textContent ?? "", /is back to the default/);
  await m.unmount();
});

test("long lists page: 50 rows, then more on request; the filter narrows and is remembered per viewer", async (t) => {
  const { AccessEditor } = await ui();
  const cells = AGENTS.flatMap((a) => SCOPES.slice(1, 11).map((s) => ({ agent: a.id, scope: s.id, level: "read" })));
  const storageKey = `test:${Math.random()}`;
  const stored = new Map<string, string>();
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) },
  });
  t.after(() => {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });
  const m = await mount(h(AccessEditor, props({ cells, storageKey })));
  assert.equal(m.root.querySelectorAll("button[aria-label^='Back to default']").length, 50);
  await click(button(m.root, /^Show 50 more$/));
  assert.equal(m.root.querySelectorAll("button[aria-label^='Back to default']").length, 100);
  await type(m.root.querySelector("input") as HTMLInputElement, "^Henry to QA project 1$");
  assert.equal(m.root.querySelectorAll("button[aria-label^='Back to default']").length, 1);
  await m.unmount();
  const again = await mount(h(AccessEditor, props({ cells, storageKey })));
  assert.equal((again.root.querySelector("input") as HTMLInputElement).value, "^Henry to QA project 1$");
  assert.equal(again.root.querySelectorAll("button[aria-label^='Back to default']").length, 1);
  await again.unmount();
});

test("storage that throws does not break the page", async () => {
  const { AccessEditor } = await ui();
  const g = globalThis as { localStorage?: unknown };
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get: () => {
      throw new Error("blocked");
    },
  });
  try {
    const m = await mount(h(AccessEditor, props()));
    await click(button(m.root, "Add or change many"));
    await type(m.root.querySelector("input") as HTMLInputElement, "Henry");
    assert.equal(m.root.querySelectorAll('[role="option"]').length > 0, true);
    await m.unmount();
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete g.localStorage;
  }
});

test("picker: filters with the invalid-regex hint, select all shown, Mixed, sentence with the count, only-with-access", async () => {
  const { AccessEditor } = await ui();
  const cells = [
    { agent: "a0", scope: "s1", level: "read" },
    { agent: "a1", scope: "s1", level: "manage" },
    { agent: "a0", scope: "s2", level: "read" },
    { agent: "a1", scope: "s2", level: "read" },
  ];
  const m = await mount(h(AccessEditor, props({ cells, reload: async () => cells })));
  await click(button(m.root, "Add or change many"));
  const [agentInput, scopeInput] = [...m.root.querySelectorAll("input")] as HTMLInputElement[];
  await type(agentInput as HTMLInputElement, "^(?!QA)");
  assert.match(m.root.textContent ?? "", /1\. Which agents \(2 of 32\)/);
  await type(agentInput as HTMLInputElement, "(");
  assert.match(m.root.textContent ?? "", /Not a valid regex\. Matching as plain text\./);
  await type(agentInput as HTMLInputElement, "^(?!QA)");
  await click(button(m.root, "Select all shown"));
  await type(scopeInput as HTMLInputElement, "^QA project [12]$");
  const metas = [...m.root.querySelectorAll('[aria-label="projects"] .tb-access-pick-meta')].map((x) => x.textContent);
  assert.deepEqual(metas, ["Mixed", "Read"]);
  await pick(m.root, "QA project 1");
  assert.match(m.root.textContent ?? "", /Henry and Tempo to QA project 1\. This sets 2 permissions\./);
  await type(scopeInput as HTMLInputElement, "");
  await click(button(m.root, "Only with access"));
  assert.match(m.root.textContent ?? "", /To which projects \(2 of 192\)/);
  await m.unmount();
});

test("picker bulk: partial failure per row in the log, no success for a failed write; one confirmation above 25", async () => {
  const { AccessEditor } = await ui();
  let cells = allDefault as { agent: string; scope: string; level: string }[];
  const writes: { agent: string; scope: string; level: string | null }[] = [];
  const m = await mount(
    h(
      AccessEditor,
      props({
        cells,
        reload: async () => cells,
        write: async (c: { agent: string; scope: string; level: string }) => {
          writes.push(c);
          if (c.agent === "a3") throw new Error("Held for approval");
          cells = [...cells.filter((x) => !(x.agent === c.agent && x.scope === c.scope)), c];
        },
      }),
    ),
  );
  await click(button(m.root, "Add or change many"));
  await click(button(m.root, "Select all shown"));
  await pick(m.root, "QA project 1");
  assert.match(m.root.textContent ?? "", /32 agents to QA project 1\. This sets 32 permissions\./);
  await click(button(m.root, "Read"));
  assert.equal(writes.length, 0, "above 25 asks first");
  assert.match(m.root.textContent ?? "", /This changes 32 permissions to Read\./);
  await click(button(m.root, "Cancel"));
  assert.equal(writes.length, 0);
  await click(button(m.root, "Read"));
  await click(button(m.root, "Yes, change them"));
  assert.equal(writes.length, 32);
  const text = m.root.textContent ?? "";
  assert.match(text, /31 set, 1 failed/);
  assert.match(text, /Failed: QA fleet 3 to QA project 1\. Held for approval/);
  assert.doesNotMatch(text, /32 set/);
  assert.match(text, /1 of 32 changes failed/);
  await m.unmount();
});

test("picker: a write the read-back does not show is reported as failed", async () => {
  const { AccessEditor } = await ui();
  const m = await mount(h(AccessEditor, props()));
  await click(button(m.root, "Add or change many"));
  await pick(m.root, "Henry");
  await pick(m.root, "QA project 2");
  await click(button(m.root, "Read"));
  const text = m.root.textContent ?? "";
  assert.match(text, /0 set, 1 failed/);
  assert.match(text, /Failed: Henry to QA project 2\. The app reports another level after this change\./);
  await m.unmount();
});

test("an offer shows in the list and in column 3, and runs only on the click", async () => {
  const { AccessEditor } = await ui();
  let ran = 0;
  const action = {
    text: "This update lets the agent also delete here.",
    label: "Allow",
    ariaLabel: "Allow Henry the new rights in Launch",
    run: async () => {
      ran++;
    },
  };
  const cells = [...allDefault.slice(1), { agent: "a0", scope: "s0", level: "contribute", action }];
  const m = await mount(h(AccessEditor, props({ cells, reload: async () => cells })));
  assert.equal(ran, 0);
  assert.match(m.root.textContent ?? "", /This update lets the agent also delete here\./);
  assert.equal(m.root.querySelector("button[aria-label^='Back to default']"), null, "at its default: no way back to offer");
  await click(button(m.root, /^Allow Henry/));
  assert.equal(ran, 1);
  await click(button(m.root, "Add or change many"));
  await pick(m.root, "Henry");
  await pick(m.root, "Launch");
  assert.match(m.root.textContent ?? "", /Waiting for your decision \(1\)/);
  await click(button(m.root, /^Allow Henry/));
  assert.equal(ran, 2);
  await m.unmount();
});

test("keyboard: the list is one Tab stop; arrows move, Space toggles", async () => {
  const { AccessEditor } = await ui();
  const m = await mount(h(AccessEditor, props()));
  await click(button(m.root, "Add or change many"));
  const list = m.root.querySelector('[aria-label="Agents"][role="listbox"]') as Element;
  assert.equal(list.querySelectorAll('[tabindex="0"]').length, 1);
  const first = list.querySelector('[role="option"]') as HTMLElement;
  first.focus();
  await key(first, "ArrowDown");
  const second = list.querySelectorAll('[role="option"]')[1] as HTMLElement;
  assert.equal(document.activeElement, second);
  await key(second, " ");
  assert.equal(second.getAttribute("aria-selected"), "true");
  await m.unmount();
});

test("two scopes with one name stay apart", async () => {
  const { AccessEditor } = await ui();
  const m = await mount(
    h(
      AccessEditor,
      props({
        scopes: [
          { id: "x", name: "Henry work" },
          { id: "y", name: "Henry work" },
        ],
        cells: [],
        defaultOf: () => null,
        reload: async () => [],
      }),
    ),
  );
  await click(button(m.root, "Add or change many"));
  const names = [...m.root.querySelectorAll('[aria-label="projects"] .tb-access-pick-name')].map((x) => x.textContent);
  assert.deepEqual(names, ["Henry work", "Henry work (2)"]);
  await m.unmount();
});

test("bulk stops after a failure of the sign-in: the rest is not sent and comes back as not tried", async () => {
  const { accessChanges, accessWriteAll, accessSessionEnded } = await ui();
  const changes = accessChanges(
    AGENTS.slice(0, 10).map((a) => a.id),
    ["s0"],
    "read",
    [],
  );
  const sent: string[] = [];
  const failed = await accessWriteAll(
    changes,
    async (c) => {
      sent.push(c.agent);
      if (c.agent === "a1") throw Object.assign(new Error("signed out"), { code: "session_required", httpStatus: 401 });
    },
    (e) => (e as Error).message,
    undefined,
    1,
  );
  assert.deepEqual(sent, ["a0", "a1"], "nothing is sent after the failure");
  assert.equal(failed.filter((f) => !f.notTried).length, 1);
  assert.equal(failed.filter((f) => f.notTried).length, 8);
  assert.equal(accessSessionEnded(Object.assign(new Error("x"), { code: "csrf_invalid" })), true);
  assert.equal(accessSessionEnded(Object.assign(new Error("x"), { code: "role_full", httpStatus: 409 })), false, "a refusal of one row stops nothing");
  assert.equal(accessSessionEnded(null), false);
});

test("picker: after a sign-in failure the page says it stopped, and sends nothing more", async () => {
  const { AccessEditor } = await ui();
  let writes = 0;
  const { root: host } = await mount(
    h(AccessEditor, {
      ...props(),
      write: async () => {
        writes++;
        throw Object.assign(new Error("You are signed out."), { httpStatus: 401 });
      },
    }),
  );
  await click(button(host, "Add or change many"));
  await click(button(host, "Select all shown"));
  const buttons = [...host.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Select all shown");
  await click(buttons[1] as Element);
  await click(button(host, "Read"));
  await click(button(host, "Yes, change them"));
  await flush();
  assert.ok(writes <= 4, `at most the writes in progress: ${writes}`);
  const text = host.textContent ?? "";
  assert.match(text, /Stopped\. You are signed out\./);
  assert.match(text, /not tried/);
  assert.doesNotMatch(text, /Done\./);
});

test("the failure log has an end, and says how many it does not show", async () => {
  const { AccessEditor, ACCESS_FAILURES_SHOWN } = await ui();
  const { root: host } = await mount(h(AccessEditor, { ...props(), write: async () => Promise.reject(new Error("refused")) }));
  await click(button(host, "Add or change many"));
  await pick(host, "Henry");
  const all = [...host.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Select all shown");
  await click(all[1] as Element);
  await click(button(host, "Read"));
  await click(button(host, "Yes, change them"));
  await flush();
  await flush();
  const rows = [...host.querySelectorAll(".tb-access-failures li")].map((x) => x.textContent ?? "");
  assert.equal(rows.length, ACCESS_FAILURES_SHOWN + 1);
  assert.equal(rows.at(-1), `And ${192 - ACCESS_FAILURES_SHOWN} more failed.`);
});

const ONE_TEAM = [{ id: "t1", name: "Support" }];
const team = (extra: object = {}) =>
  props({
    scopes: ONE_TEAM,
    fixedScope: true,
    levels: [
      { id: "member", label: "Member" },
      { id: "lead", label: "Lead" },
    ],
    noneLabel: "Not in team",
    defaults: [{ what: "Everyone", level: null }],
    defaultOf: () => null,
    cells: [{ agent: "a0", scope: "t1", level: "lead" }],
    reload: async () => [{ agent: "a0", scope: "t1", level: "lead" }],
    words: {
      agent: { one: "person or agent", many: "people and agents" },
      unit: { one: "person or agent", many: "people and agents" },
      differHead: "In this team",
      differEmpty: "No one is in this team yet.",
      back: "Remove from team",
      lede: (total: number, differ: number) => `${total} people and agents. ${differ} in this team.`,
    },
    ...extra,
  });

test("one scope: no scope field, no scope column, no 'to' in the rows; one write in the log of the opening view", async () => {
  const { AccessEditor } = await ui();
  const writes: unknown[][] = [];
  const cells = [{ agent: "a0", scope: "t1", level: "lead" }];
  const after = [...cells, { agent: "a1", scope: "t1", level: "member" }];
  let now = cells;
  const { root: host } = await mount(
    h(AccessEditor, {
      ...team({
        writeMany: async (changes: unknown[]) => {
          writes.push(changes);
          now = after;
        },
        write: undefined,
        reload: async () => now,
      }),
    }),
  );
  const text = host.textContent ?? "";
  assert.match(text, /32 people and agents\. 1 in this team\./);
  assert.match(text, /In this team/);
  assert.equal(host.querySelectorAll('[role="combobox"]').length, 2, "who and level; no scope field");
  assert.equal(host.querySelectorAll(".tb-access-list-plain .tb-access-to").length, 0);
  button(host, /Remove from team: Henry/);
  await click(button(host, "Add or change many"));
  assert.equal(host.querySelectorAll('[role="listbox"]').length, 1, "one column to pick from");
  assert.match(host.textContent ?? "", /1\. Which people and agents \(32 of 32\)/);
  assert.match(host.textContent ?? "", /2\. Set access/);
  assert.match(host.textContent ?? "", /Lead/);
  await pick(host, "Tempo");
  await click(button(host, "Member"));
  assert.deepEqual(writes, [[{ agent: "a1", scope: "t1", level: "member" }]], "one call for one click");
  assert.match(host.textContent ?? "", /Tempo: Member\. 1 set\./);
  await click(button(host, "Back to the list"));
  assert.match(host.textContent ?? "", /Changes this session \(1\)/, "the log stays in view on the opening view");
});

test("one call for a whole list: a refusal fails every row of the click, and nothing reads as set", async () => {
  const { AccessEditor } = await ui();
  const { root: host } = await mount(h(AccessEditor, { ...team({ write: undefined, writeMany: async () => Promise.reject(new Error("The team is gone.")) }) }));
  await click(button(host, "Add or change many"));
  await pick(host, "Tempo");
  await pick(host, "QA fleet 2");
  await click(button(host, "Member"));
  const text = host.textContent ?? "";
  assert.match(text, /2 of 2 changes failed/);
  assert.match(text, /Failed: Tempo\. The team is gone\./);
  assert.match(text, /0 set, 2 failed/);
});

const bulkProps = (extra: object = {}) => ({
  agents: AGENTS,
  scope: { id: "access", name: "Access" },
  levels: [
    { id: "1", label: "Read only", hint: "It may read." },
    { id: "2", label: "Read and change", hint: "It may change things." },
  ],
  allowNone: false,
  noneLabel: "Not set",
  cells: [{ agent: "a0", scope: "access", level: "1" }],
  write: async () => {},
  reload: async () => [{ agent: "a0", scope: "access", level: "1" }],
  explain: (e: unknown) => (e as Error).message,
  storageKey: `test:${Math.random()}`,
  title: "Set many",
  backLabel: "Back",
  onBack: () => {},
  ...extra,
});

test("AccessBulk: no button for no access when the page says so, the hints show, the current value shows per name", async () => {
  const { AccessBulk } = await ui();
  const { root: host } = await mount(h(AccessBulk, bulkProps()));
  assert.equal(
    [...host.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Not set"),
    false,
  );
  assert.match(host.textContent ?? "", /It may change things\./);
  const row = [...host.querySelectorAll('[role="option"]')].find((x) => x.textContent?.includes("Henry"));
  assert.match(row?.textContent ?? "", /Read only/);
  const tempo = [...host.querySelectorAll('[role="option"]')].find((x) => x.textContent?.includes("Tempo"));
  assert.match(tempo?.textContent ?? "", /Not set/);
});

test("AccessBulk: a blocked page writes nothing and says why; the panel shows", async () => {
  const { AccessBulk } = await ui();
  let writes = 0;
  const { root: host } = await mount(
    h(AccessBulk, {
      ...bulkProps({
        blocked: "Choose a reason first.",
        panel: h("p", null, "The form"),
        write: async () => {
          writes++;
        },
      }),
    }),
  );
  await pick(host, "Tempo");
  assert.match(host.textContent ?? "", /Choose a reason first\./);
  assert.match(host.textContent ?? "", /The form/);
  assert.equal(button(host, "Read and change").disabled, true);
  assert.equal(writes, 0);
});

test("AccessBulk: a long list of values gets a filter; the value 'none' stays in view", async () => {
  const { AccessBulk } = await ui();
  const levels = Array.from({ length: 30 }, (_, i) => ({ id: `p${i}`, label: i === 0 ? "Martin" : `QA person ${i}` }));
  const writes: unknown[] = [];
  const { root: host } = await mount(
    h(AccessBulk, {
      ...bulkProps({
        levels,
        allowNone: true,
        noneLabel: "No owner",
        cells: [],
        reload: async () => [],
        write: async (c: unknown) => {
          writes.push(c);
        },
      }),
    }),
  );
  const inputs = [...host.querySelectorAll("input")] as HTMLInputElement[];
  assert.equal(inputs.length, 2);
  await type(inputs[1] as HTMLInputElement, "^(?!QA)");
  await flush();
  assert.match(host.textContent ?? "", /Filter these \(1 of 30\)/);
  button(host, "Martin");
  button(host, "No owner");
  assert.equal(
    [...host.querySelectorAll("button")].some((b) => b.textContent?.trim() === "QA person 1"),
    false,
  );
});

test("a level with `ask` asks first at 2 agents, names what it allows, and writes nothing until Yes; 1 agent runs at once", async () => {
  const { AccessBulk } = await ui();
  const writes: string[] = [];
  let cells = [{ agent: "a0", scope: "access", level: "1" }];
  const { root: host } = await mount(
    h(AccessBulk, {
      ...bulkProps({
        levels: [
          { id: "1", label: "Read only" },
          {
            id: "4",
            label: "Everything",
            ask: (c: readonly unknown[]) => (c.length > 1 ? `This gives ${c.length} agents every action without a question.` : null),
          },
        ],
        cells,
        reload: async () => cells,
        write: async (c: { agent: string; scope: string; level: string }) => {
          writes.push(c.agent);
          cells = [...cells.filter((x) => x.agent !== c.agent), c];
        },
      }),
    }),
  );
  await pick(host, "Henry");
  await pick(host, "Tempo");
  await click(button(host, "Everything"));
  assert.equal(writes.length, 0);
  assert.match(host.textContent ?? "", /This gives 2 agents every action without a question\./);
  await click(button(host, "Cancel"));
  assert.equal(writes.length, 0);
  await click(button(host, "Everything"));
  await click(button(host, "Yes, change them"));
  assert.deepEqual(writes, ["a0", "a1"]);

  const one: string[] = [];
  const { root: single } = await mount(
    h(AccessBulk, {
      ...bulkProps({
        levels: [{ id: "4", label: "Everything", ask: (c: readonly unknown[]) => (c.length > 1 ? "Asks" : null) }],
        reload: async () => [{ agent: "a1", scope: "access", level: "4" }],
        write: async (c: { agent: string }) => {
          one.push(c.agent);
        },
      }),
    }),
  );
  await pick(single, "Tempo");
  await click(button(single, "Everything"));
  assert.deepEqual(one, ["a1"]);
});

test("Yes on a confirmation goes off when the form goes invalid, and writes nothing", async () => {
  const { AccessBulk } = await ui();
  const { useState } = await import("react");
  const writes: string[] = [];
  const cells = [{ agent: "a0", scope: "access", level: "1" }];
  function Page() {
    const [bad, setBad] = useState(false);
    return h(AccessBulk, {
      ...bulkProps({
        cells,
        blocked: bad ? "Choose a reason first." : null,
        panel: h("button", { type: "button", onClick: () => setBad(true) }, "Break the form"),
        write: async (c: { agent: string }) => {
          writes.push(c.agent);
        },
      }),
    });
  }
  const { root: host } = await mount(h(Page, null));
  await click(button(host, "Select all shown"));
  await click(button(host, "Read and change"));
  assert.equal(button(host, "Yes, change them").disabled, false);
  await click(button(host, "Break the form"));
  assert.equal(button(host, "Yes, change them").disabled, true);
  await click(button(host, "Yes, change them"));
  assert.equal(writes.length, 0);
});

test("AccessPickColumn with useAccessPicks: regex filter, a hidden pick still counts, duplicate names stay apart, no pick for what left the list", async () => {
  const { AccessPickColumn, useAccessPicks } = await ui();
  const { useState } = await import("react");
  let state: { ids: readonly string[]; hidden: number } = { ids: [], hidden: 0 };
  const LIST = [
    { id: "x1", name: "QA fleet 01" },
    { id: "x2", name: "QA fleet 01" },
    { id: "x3", name: "Henry" },
  ];
  function Page() {
    const [list, setList] = useState(LIST);
    const p = useAccessPicks(list, `test:${"column"}`);
    state = p;
    return h(
      "div",
      null,
      h("button", { type: "button", onClick: () => setList(LIST.slice(1)) }, "Drop one"),
      h(AccessPickColumn, {
        label: "Agents",
        step: "1. Which agents",
        items: p.shown.map((i: { id: string; name: string }) => ({ id: i.id, name: i.name, meta: "" })),
        total: p.items.length,
        picked: p.picked,
        onToggle: p.toggle,
        query: p.query,
        onQuery: p.setQuery,
        filter: p.filter,
        onSelectShown: p.selectShown,
        onClear: p.clear,
      }),
    );
  }
  const { root: host } = await mount(h(Page, null));
  assert.match(host.textContent ?? "", /1\. Which agents \(3 of 3\)/);
  assert.match(host.textContent ?? "", /QA fleet 01 \(2\)/);
  await click(button(host, "Select all shown"));
  assert.deepEqual(state.ids, ["x1", "x2", "x3"]);
  const input = host.querySelector("input") as HTMLInputElement;
  await act(async () => {
    const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
    set?.call(input, "^(?!QA)");
    input.dispatchEvent(new (globalThis as unknown as { Event: typeof Event }).Event("input", { bubbles: true }));
  });
  assert.match(host.textContent ?? "", /1\. Which agents \(1 of 3\)/);
  assert.equal(state.hidden, 2);
  await click(button(host, "Drop one"));
  assert.deepEqual(state.ids, ["x2", "x3"]);
});
