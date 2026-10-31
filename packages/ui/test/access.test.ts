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
