/** HoldCard, HoldDetails and familyText (C369 H3): plain words on the card (no raw JSON, no raw op/family ids), view lines
    kept, times through Intl in a fixed zone, the details modal's loading / error / not-kept / loaded states, the family
    fallback, and text-only rendering (a view with markup stays text). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { $, $$, act, click, h, mount, skip, ui, wait } from "./dom.ts";

const NOW = Date.UTC(2026, 9, 27, 8, 5); // 2026-10-27 08:05 UTC = 09:05 in Prague (CET after 25 Oct)
const TZ = { now: NOW, timeZone: "Europe/Prague", locale: "en-GB" };

const VIEW = [
  "Send an email",
  "Account: Front desk (Gmail)",
  "To: ana@example.com",
  "Subject: A very long subject line that goes on and on so that the card must wrap it instead of scrolling sideways",
  "",
  "Text (plain text, first 500 characters):",
  "  Hello Ana,",
  "    thanks for the call.",
].join("\n");

const hold = (extra: Record<string, unknown> = {}) => ({
  id: "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8",
  callId: "cal_01HZX3K8Q2V4N6P8R0S2T4V6W9",
  op: "mail_send",
  effect: "outward",
  summary: "Email to ana@example.com: Thanks for the call",
  view: VIEW,
  holdFamily: "outward",
  heldBy: null,
  caller: { type: "agent", id: "agt_front", name: "Front desk" },
  status: "held",
  inputDigest: "sha256:abc",
  meta: {},
  idempotencyKey: null,
  createdAt: Date.UTC(2026, 9, 27, 8, 0),
  decidedAt: null,
  expiresAt: Date.UTC(2026, 9, 29, 8, 0),
  decidedBy: null,
  ...extra,
});

const buttonByText = (root: ParentNode, text: string) => $$(root, "button").find((b) => b.textContent?.trim() === text);

test("familyText: the eight families + policy + caps in plain words; unknown → humanized id; none → Approval needed", { skip }, async () => {
  const { familyText, FAMILY_TEXT } = await ui();
  assert.deepEqual(Object.keys(FAMILY_TEXT).sort(), [
    "caps",
    "destructive",
    "first_contact",
    "identity",
    "live_call",
    "money",
    "outward",
    "policy",
    "profile_change",
    "public_link",
  ]);
  assert.equal(familyText("destructive").label, "Deleting things");
  assert.equal(familyText("money").sentence, "Always waits for you. This cannot be turned off.");
  assert.equal(familyText("policy").label, "A rule you set");
  for (const v of Object.values(FAMILY_TEXT)) {
    assert.match(v.label, /^[A-Z]/);
    assert.match(v.sentence, /\.$/);
    assert.doesNotMatch(`${v.label} ${v.sentence}`, /_/, "no ids in the words");
  }
  assert.deepEqual(familyText("night_call"), { label: "Night call", sentence: "Calls of this kind wait for your approval." });
  assert.equal(familyText("toString").label, "To string", "prototype keys are unknown ids, not Object members");
  assert.equal(familyText(null).label, "Approval needed");
  assert.equal(familyText("").label, "Approval needed");
});

test("humanizeId, viewLines and visibleText", { skip }, async () => {
  const { humanizeId, viewLines, visibleText } = await ui();
  assert.equal(humanizeId("to_address"), "To address");
  assert.equal(humanizeId("toAddress"), "To address");
  assert.equal(humanizeId("issue-delete"), "Issue delete");
  assert.deepEqual(viewLines("a\r\n  b\n\tc\n\nd  "), [
    { text: "a", indent: 0 },
    { text: "b", indent: 2 },
    { text: "c", indent: 2 },
    { text: "", indent: 0 },
    { text: "d", indent: 0 },
  ]);
  const rlo = String.fromCodePoint(0x202e);
  const zwsp = String.fromCodePoint(0x200b);
  const bel = String.fromCodePoint(0x07);
  assert.equal(visibleText(`pay${rlo}evil${zwsp}${bel} ok\tyes`), "payevil ok\tyes");
  // QA-UI17-2: the SDK clean() list + display-only blanks; emoji variation selectors stay
  const hidden = [
    0x00ad, 0x034f, 0x061c, 0x115f, 0x1160, 0x180b, 0x180e, 0x200c, 0x200d, 0x2028, 0x2029, 0x2061, 0x2064, 0x2800, 0x3164, 0xffa0, 0xfff9, 0xfffb, 0xe0001,
    0xe0041, 0xe007f, 0xd800,
  ];
  for (const c of hidden) assert.equal(visibleText(`ana@exam${String.fromCodePoint(c)}ple.com`), "ana@example.com", c.toString(16));
  const heart = `${String.fromCodePoint(0x2764)}${String.fromCodePoint(0xfe0f)}`;
  assert.equal(visibleText(heart), heart);
});

test("viewLines: a run of blank lines shows as ONE blank line (QA-UI17-1 repro: 1,500 blank lines)", { skip }, async () => {
  const { viewLines } = await ui();
  const view = `Send an email\nTo: ana@example.com\n${"\n".repeat(1500)}LAST LINE`;
  assert.deepEqual(viewLines(view), [
    { text: "Send an email", indent: 0 },
    { text: "To: ana@example.com", indent: 0 },
    { text: "", indent: 0 },
    { text: "LAST LINE", indent: 0 },
  ]);
  assert.deepEqual(
    viewLines("a\n   \n\t\n\nb\n\n").map((l) => l.text),
    ["a", "", "b", ""],
    "whitespace-only lines are blank too",
  );
});

test("holdTime: Intl in the given zone, relative + absolute + UTC; invalid → null", { skip }, async () => {
  const { holdTime } = await ui();
  assert.deepEqual(holdTime(Date.UTC(2026, 9, 27, 8, 0), TZ), {
    relative: "5 minutes ago",
    absolute: "27 Oct 2026, 09:00 CET",
    utc: "27 Oct 2026, 08:00 UTC",
    iso: "2026-10-27T08:00:00.000Z",
  });
  assert.equal(holdTime(Date.UTC(2026, 9, 29, 8, 0), TZ)?.relative, "in 47 hours");
  assert.equal(holdTime(NOW + 20_000, TZ)?.relative, "in under a minute");
  assert.equal(holdTime("2026-10-27T08:00:00.000Z", TZ)?.absolute, "27 Oct 2026, 09:00 CET", "ISO strings too");
  assert.equal(holdTime(Date.UTC(2026, 9, 29, 8, 0), { ...TZ, timeZone: "America/New_York", locale: "en-US" })?.absolute, "Oct 29, 2026, 04:00 AM EDT");
  assert.equal(holdTime(null, TZ), null);
  assert.equal(holdTime(Number.NaN, TZ), null);
});

test("relativeTime: sizes rounded down both ways (never more time left than there is), hours up to 48 h", { skip }, async () => {
  const { relativeTime } = await ui();
  const H = 3_600_000;
  const cases: [number, string][] = [
    [36 * H, "in 36 hours"],
    [23.6 * H, "in 23 hours"],
    [1.5 * H, "in 1 hour"],
    [-1.5 * H, "1 hour ago"],
    [59_000, "in under a minute"],
    [-30_000, "under a minute ago"],
    [0, "in under a minute"],
    [90_000, "in 1 minute"],
    [-90_000, "1 minute ago"],
    [49 * H, "in 2 days"],
    [-49 * H, "2 days ago"],
    [79 * H, "in 3 days"],
  ];
  for (const [diff, words] of cases) assert.equal(relativeTime(diff, "en-GB"), words, String(diff));
});

test("HoldCard: summary heading, who asked, view as text lines, why held, times; no raw JSON or ids", { skip }, async () => {
  const { HoldCard } = await ui();
  const m = await mount(h(HoldCard, { hold: hold({ opTitle: "Send email" }), ...TZ, onApprove: () => {}, onDeny: () => {} }));
  const card = $(m.root, "article.tb-card.tb-hold-card");
  const head = $(card, "h3");
  assert.equal(head.textContent, "Email to ana@example.com: Thanks for the call");
  assert.equal(card.getAttribute("aria-labelledby"), head.id);
  assert.equal($(card, ".tb-hold-by").textContent, "Asked by Front desk·, Send email");
  assert.equal(card.querySelector(".tb-hold-by .tb-tag"), null, "an agent gets no kind tag");
  assert.equal($(card, ".tb-hold-by strong").textContent, "Front desk");

  // the view: one element per line, indents as --indent, blank line kept, not a <pre> / mono box
  assert.equal(card.querySelector("pre"), null);
  const view = $(card, "section.tb-hold-view");
  const caption = $(card, ".tb-hold-caption");
  assert.equal(caption.textContent, "What the agent asks");
  assert.equal(view.getAttribute("aria-labelledby"), caption.id);
  assert.equal(card.querySelector(".tb-hold-more"), null, "no overflow: no cue");
  assert.equal(view.getAttribute("tabindex"), "0", "a scrolling view is reachable by keyboard");
  const lines = $$(view, ".tb-hold-line");
  assert.deepEqual(
    lines.map((l) => l.textContent),
    VIEW.split("\n").map((l) => l.trim()),
  );
  assert.ok(lines[4]?.classList.contains("is-blank"));
  assert.equal(lines[6]?.style.getPropertyValue("--indent"), "2");
  assert.equal(lines[7]?.style.getPropertyValue("--indent"), "4");
  assert.equal(lines[0]?.getAttribute("style"), null);

  // why held: the family in words, a heading one level below
  const why = $(card, "section.tb-hold-why");
  assert.equal($(why, "h4").textContent, "Why held");
  assert.match(why.textContent ?? "", /Every message or post\. Waits for you before an app sends any message or post\./);

  // times in Prague: relative + absolute, ISO in dateTime, UTC in the title
  const times = $$(card, ".tb-hold-facts > div").map((d) => [$(d, "dt").textContent, $(d, "dd").textContent]);
  assert.deepEqual(times, [
    ["Asked", "5 minutes ago (27 Oct 2026, 09:00 CET)"],
    ["Expires", "in 47 hours (29 Oct 2026, 09:00 CET)"],
  ]);
  const asked = $(card, ".tb-hold-facts time");
  assert.equal(asked.getAttribute("datetime"), "2026-10-27T08:00:00.000Z");
  assert.equal(asked.getAttribute("title"), "27 Oct 2026, 08:00 UTC");

  // no raw JSON, no raw op id, no raw family id anywhere on the card
  const text = card.textContent ?? "";
  assert.doesNotMatch(text, /[{}]|"\w+":/);
  assert.doesNotMatch(text, /mail_send|\boutward\b/);
  await m.unmount();
});

test("HoldCard: a default-view hold made of JSON is still text lines (no code box), and the op title falls back to words", { skip }, async () => {
  const { HoldCard } = await ui();
  const json = 'Delete issue\n{\n  "id": "iss_1"\n}';
  const m = await mount(h(HoldCard, { hold: hold({ op: "issue_delete", holdFamily: "destructive", view: json }), ...TZ }));
  const card = $(m.root, "article");
  assert.equal(card.querySelector("pre, code"), null);
  assert.equal($$(card, ".tb-hold-line").length, 4);
  assert.match($(card, ".tb-hold-by").textContent ?? "", /Issue delete$/);
  assert.match($(card, ".tb-hold-why").textContent ?? "", /Deleting things\./);
  await m.unmount();
});

test("HoldCard: reason and the rule that held it; app caller; unknown family falls back; expired label", { skip }, async () => {
  const { HoldCard } = await ui();
  const m = await mount(
    h(HoldCard, {
      hold: hold({
        holdFamily: "policy",
        holdReason: "Mail to new customers waits for Martin.",
        heldBy: "rules/rules_gate",
        caller: { type: "app", id: "ins_evo", name: "Evolving Workflows", product: "evolution" },
        expiresAt: NOW - 3 * 60_000,
      }),
      ...TZ,
    }),
  );
  const why = $(m.root, ".tb-hold-why");
  assert.match(why.textContent ?? "", /A rule you set\./);
  assert.equal($(why, ".tb-hold-reason").textContent, "Rule: Mail to new customers waits for Martin.");
  assert.equal($(why, ".tb-hold-rule").textContent, "Rule from Rules & Approvals (rules_gate)");
  assert.equal($(m.root, ".tb-hold-by strong").textContent, "Evolving Workflows", "the name only");
  assert.equal($(m.root, ".tb-hold-by .tb-tag").textContent, "App", "the caller kind is a Tag, not text after the name");
  assert.equal($(m.root, ".tb-hold-caption").textContent, "What the app asks");
  const exp = $$(m.root, ".tb-hold-facts > div")[1];
  assert.equal(exp && $(exp, "dt").textContent, "Expired");
  assert.equal(exp && $(exp, "dd").textContent, "3 minutes ago (27 Oct 2026, 09:02 CET)");

  await m.rerender(h(HoldCard, { hold: hold({ holdReason: "caps_write", heldBy: null }), ...TZ }));
  assert.equal($(m.root, ".tb-hold-reason").textContent, "Reason: caps_write", "no rule: a plain reason");
  assert.equal(m.root.querySelector(".tb-hold-rule"), null);
  await m.rerender(h(HoldCard, { hold: hold({ heldBy: "rules/rules_gate" }), ...TZ }));
  assert.equal($(m.root, ".tb-hold-rule").textContent, "Held by Rules & Approvals (rules_gate)");

  await m.rerender(h(HoldCard, { hold: hold({ holdFamily: "night_call", expiresAt: null, view: undefined }), ...TZ }));
  assert.match($(m.root, ".tb-hold-why").textContent ?? "", /Night call\. Calls of this kind wait for your approval\./);
  assert.equal(m.root.querySelector(".tb-hold-view"), null, "no view: no view block");
  assert.equal($$(m.root, ".tb-hold-facts > div").length, 1, "no expiry: no Expires row");
  await m.unmount();
});

test("HoldCard: XSS — markup in the view, summary and reason renders as text, never as elements", { skip }, async () => {
  const { HoldCard } = await ui();
  const evil = '<img src=x onerror="globalThis.__pwned=1"><script>globalThis.__pwned=2</script>';
  const m = await mount(h(HoldCard, { hold: hold({ view: `Post\n${evil}`, summary: evil, holdReason: evil, opTitle: evil }), ...TZ, onApprove: () => {} }));
  const card = $(m.root, "article");
  assert.equal(card.querySelector("img, script"), null);
  assert.equal($$(card, ".tb-hold-line")[1]?.textContent, evil);
  assert.equal($(card, "h3").textContent, evil);
  assert.equal($(card, ".tb-hold-reason").textContent, `Reason: ${evil}`);
  await wait(5);
  assert.equal((globalThis as Record<string, unknown>).__pwned, undefined);
  await m.unmount();
});

test("HoldCard: Approve (primary) / Deny / More details, labelled, in order; busy disables the decision only; status and actions slot", { skip }, async () => {
  const { HoldCard } = await ui();
  const calls: string[] = [];
  const props = {
    hold: hold({ opTitle: "Send email" }),
    ...TZ,
    onApprove: () => calls.push("approve"),
    onDeny: () => calls.push("deny"),
    onDetails: () => calls.push("details"),
  };
  const m = await mount(h(HoldCard, props));
  const buttons = $$(m.root, ".tb-hold-actions button");
  assert.deepEqual(
    buttons.map((b) => b.textContent),
    ["Approve", "Deny", "More details"],
  );
  assert.deepEqual(
    buttons.map((b) => b.getAttribute("aria-label")),
    ["Approve: Send email, asked by Front desk", "Deny: Send email, asked by Front desk", "More details: Send email, asked by Front desk"],
  );
  assert.ok(buttons[0]?.classList.contains("primary"));
  assert.ok(!buttons[1]?.classList.contains("primary"));
  assert.equal(buttons[2]?.getAttribute("aria-haspopup"), "dialog");
  await click(buttons[0] as HTMLElement);
  await click(buttons[2] as HTMLElement);
  assert.deepEqual(calls, ["approve", "details"]);
  await click(buttons[1] as HTMLElement);
  assert.deepEqual(calls, ["approve", "details"], "a second decision right after the first is ignored (C8 double click)");
  await wait(550);
  await click(buttons[1] as HTMLElement);
  assert.deepEqual(calls, ["approve", "details", "deny"], "the parent never set busy: the card takes a decision again after 0.5 s");

  await m.rerender(h(HoldCard, { ...props, busy: true }));
  const busy = $$(m.root, ".tb-hold-actions button");
  assert.deepEqual(
    busy.map((b) => (b as HTMLButtonElement).disabled),
    [true, true, false],
  );

  await m.rerender(h(HoldCard, { ...props, hold: hold({ status: "approved" }) }));
  assert.equal($(m.root, ".tb-hold-actions .tb-tag").textContent, "Approved");
  assert.equal(buttonByText(m.root, "Approve"), undefined, "a decided hold has no Approve / Deny");
  assert.ok(buttonByText(m.root, "More details"));
  for (const [status, label] of [
    ["weird_state", "Weird state"],
    ["constructor", "Constructor"],
    ["__proto__", "Proto"],
  ]) {
    await m.rerender(h(HoldCard, { ...props, hold: hold({ status }) }));
    assert.equal($(m.root, ".tb-hold-actions .tb-tag").textContent, label, status);
    assert.equal(buttonByText(m.root, "Approve"), undefined, `${status}: only "held" gets Approve / Deny`);
  }
  // expired while held: Approve / Deny disabled next to an "Expired" tag
  await m.rerender(h(HoldCard, { ...props, hold: hold({ expiresAt: NOW - 1 }) }));
  assert.equal($(m.root, ".tb-hold-actions .tb-tag").textContent, "Expired");
  assert.deepEqual(
    $$(m.root, ".tb-hold-actions button").map((b) => [b.textContent, (b as HTMLButtonElement).disabled]),
    [
      ["Approve", true],
      ["Deny", true],
      ["More details", false],
    ],
  );

  await m.rerender(h(HoldCard, { ...props, actions: h("button", { type: "button" }, "Open in Connect") }));
  assert.deepEqual(
    $$(m.root, ".tb-hold-actions button").map((b) => b.textContent),
    ["Open in Connect"],
  );

  await m.rerender(h(HoldCard, { hold: hold(), ...TZ, headingLevel: 2 }));
  assert.equal($(m.root, "article h2").textContent, "Email to ana@example.com: Thanks for the call");
  assert.equal($(m.root, ".tb-hold-why h3").textContent, "Why held");
  assert.equal($$(m.root, ".tb-hold-actions button").length, 0, "no handlers: no buttons");
  await m.unmount();
});

test("HoldCard: keyboard focus stays on the card while the decision runs, and comes back after", { skip }, async () => {
  const { HoldCard } = await ui();
  let busy = false;
  const host: { m?: Awaited<ReturnType<typeof mount>> } = {};
  const render = () => h(HoldCard, { hold: hold(), ...TZ, busy, onApprove: () => void 0, onDeny: () => void 0 });
  host.m = await mount(render());
  const m = host.m;
  const approve = buttonByText(m.root, "Approve") as HTMLButtonElement;
  approve.focus();
  assert.equal(document.activeElement, approve);
  await click(approve);
  busy = true;
  await m.rerender(render());
  const status = $(m.root, ".tb-hold-busy");
  assert.equal(status.getAttribute("role"), "status");
  assert.equal(status.textContent, "Sending your decision…");
  assert.equal(document.activeElement, status, "focus moved to the card's status line, not <body>");
  busy = false;
  await m.rerender(render());
  assert.equal(m.root.querySelector(".tb-hold-busy"), null);
  assert.equal(document.activeElement, buttonByText(m.root, "Approve"), "focus back on Approve when the hold is still there");
  await m.unmount();
});

test("HoldCard: caps agent text (summary 280, name 120 code points) with the full text in title", { skip }, async () => {
  const { HoldCard, HOLD_TEXT_MAX } = await ui();
  assert.deepEqual({ ...HOLD_TEXT_MAX }, { summary: 280, name: 120, action: 120, reason: 280 });
  const longSummary = "S".repeat(3000);
  const longName = `${"N".repeat(499)}${String.fromCodePoint(0x1f600)}`;
  const m = await mount(
    h(HoldCard, { hold: hold({ summary: longSummary, caller: { type: "agent", id: "agt_x", name: longName } }), ...TZ, onApprove: () => {} }),
  );
  const head = $(m.root, "h3");
  assert.equal(Array.from(head.textContent ?? "").length, 280);
  assert.ok(head.textContent?.endsWith("…"));
  assert.equal(head.getAttribute("title"), longSummary);
  const name = $(m.root, ".tb-hold-by strong");
  assert.equal(Array.from(name.textContent ?? "").length, 120);
  assert.equal(name.getAttribute("title"), longName);
  assert.ok((buttonByText(m.root, "Approve")?.getAttribute("aria-label")?.length ?? 0) < 300, "labels use the capped name");
  await m.rerender(h(HoldCard, { hold: hold(), ...TZ }));
  assert.equal($(m.root, "h3").getAttribute("title"), null, "short text: no title");
  await m.unmount();
});

test("HoldView: a view taller than its box shows the fade and 'N more lines — scroll to read all', described for screen readers", { skip }, async () => {
  const { HoldView } = await ui();
  // happy-dom has no layout: give the box 3 lines of 24px, each line 24px tall, at offsetTop = index * 24
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const saved = ["scrollHeight", "clientHeight", "offsetTop", "offsetHeight"].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const);
  const isView = (el: HTMLElement) => el.classList.contains("tb-hold-view");
  const lineIndex = (el: HTMLElement) => (el.parentElement ? Array.from(el.parentElement.children).indexOf(el) : 0);
  Object.defineProperty(proto, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return isView(this) ? this.children.length * 24 : 0;
    },
  });
  Object.defineProperty(proto, "clientHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return isView(this) ? 72 : 0;
    },
  });
  Object.defineProperty(proto, "offsetTop", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("tb-hold-line") ? lineIndex(this) * 24 : 0;
    },
  });
  Object.defineProperty(proto, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("tb-hold-line") ? 24 : 0;
    },
  });
  try {
    const m = await mount(h(HoldView, { view: ["one", "two", "three", "four", "five", "six", "", "", "", "LAST"].join("\n") }));
    const box = $(m.root, "section.tb-hold-view");
    assert.equal($$(box, ".tb-hold-line").length, 8, "blank run collapsed: 6 lines + 1 blank + LAST");
    assert.ok($(m.root, ".tb-hold-view-frame").classList.contains("is-more"), "fade on");
    const more = $(m.root, ".tb-hold-more");
    assert.equal(more.textContent, "5 more lines — scroll to read all");
    assert.equal(box.getAttribute("aria-describedby"), more.id);
    await act(async () => {
      box.scrollTop = 72;
      box.dispatchEvent(new Event("scroll"));
    });
    assert.equal($(m.root, ".tb-hold-more").textContent, "2 more lines — scroll to read all");
    await act(async () => {
      box.scrollTop = 120;
      box.dispatchEvent(new Event("scroll"));
    });
    assert.equal(m.root.querySelector(".tb-hold-more"), null, "at the bottom: no cue");
    assert.ok(!$(m.root, ".tb-hold-view-frame").classList.contains("is-more"));
    assert.equal(box.getAttribute("aria-describedby"), null);
    await m.unmount();
  } finally {
    for (const [k, d] of saved) {
      if (d) Object.defineProperty(proto, k, d);
      else delete proto[k];
    }
  }
});

const INPUT = { to: ["ana@example.com"], subject: "Thanks", body: "<b>hi</b>" };
const details = (extra: Record<string, unknown> = {}) => ({
  holdId: "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8",
  status: "held",
  op: "mail_send",
  opTitle: "Send email",
  tool: "GMAIL_SEND_EMAIL",
  family: "outward",
  reason: "Outward mail waits.",
  heldBy: "rules/rules_gate",
  caller: { type: "agent", id: "agt_front", name: "Front desk" },
  callId: "cal_01HZX3K8Q2V4N6P8R0S2T4V6W9",
  receiptId: "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8",
  inputDigest: "sha256:abc",
  input: INPUT,
  inputState: "kept",
  inputWipeAt: null,
  createdAt: "2026-10-27T08:00:00.000Z",
  expiresAt: "2026-10-29T08:00:00.000Z",
  decidedAt: null,
  viewSha256: "sha256:def",
  ...extra,
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

test("HoldDetails: loading → facts (local + UTC ISO) and the input as pretty JSON text; loads on open only", { skip }, async () => {
  const { HoldDetails } = await ui();
  const asked: string[] = [];
  let gate = deferred<ReturnType<typeof details>>();
  const load = (id: string) => {
    asked.push(id);
    return gate.promise;
  };
  const props = { holdId: "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8", load, onClose: () => {}, timeZone: "Europe/Prague", locale: "en-GB", title: "Email to Ana" };
  const m = await mount(h(HoldDetails, { ...props, open: false }));
  assert.deepEqual(asked, [], "closed: nothing loaded");
  await m.rerender(h(HoldDetails, { ...props, open: true }));
  const dlg = $(m.root, "dialog.tb-dialog.lg.tb-hold-details");
  assert.equal($(dlg, ".tb-kicker").textContent, "Technical details");
  assert.equal($(dlg, "h2").textContent, "Email to Ana");
  assert.equal($(dlg, '[role="status"]').textContent, "Loading the details…");
  assert.deepEqual(asked, ["hld_01HZX3K8Q2V4N6P8R0S2T4V6W8"]);

  await act(async () => gate.resolve(details()));
  assert.equal(dlg.querySelector('[role="status"]'), null);
  const rows = Object.fromEntries($$(dlg, ".tb-hold-facts > div").map((d) => [$(d, "dt").textContent, $(d, "dd").textContent]));
  assert.deepEqual(rows, {
    Status: "Waiting for you",
    Operation: "Send email (mail_send)",
    Tool: "GMAIL_SEND_EMAIL",
    "Held calls of": "Every message or post (outward)",
    Reason: "Outward mail waits.",
    "Held by": "rules/rules_gate",
    Agent: "Front desk (agt_front)",
    "Hold id": "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8",
    "Receipt id": "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8",
    "Call id": "cal_01HZX3K8Q2V4N6P8R0S2T4V6W9",
    Created: "27 Oct 2026, 09:00 CET · 2026-10-27T08:00:00.000Z",
    Expires: "29 Oct 2026, 09:00 CET · 2026-10-29T08:00:00.000Z",
    "Input digest": "sha256:abc",
    "View hash": "sha256:def",
  });
  const input = $(dlg, "section.tb-hold-json");
  assert.equal(input.getAttribute("aria-label"), "Input as JSON");
  assert.equal(input.getAttribute("tabindex"), "0");
  assert.equal($(input, "pre").textContent, JSON.stringify(INPUT, null, 2));
  assert.equal(input.querySelector("b"), null, "markup in the input stays text");

  // re-open loads again (fresh data), and a new loader identity on re-render does not reload
  gate = deferred();
  await m.rerender(h(HoldDetails, { ...props, load: (id: string) => load(id), open: true }));
  assert.equal(asked.length, 1);
  await m.rerender(h(HoldDetails, { ...props, open: false }));
  await m.rerender(h(HoldDetails, { ...props, open: true }));
  assert.equal(asked.length, 2);
  await m.unmount();
});

test("HoldDetails: every input state in words (7-day sentence), decided and kept-until rows, app caller, missing optional fields", { skip }, async () => {
  const { HoldDetails, INPUT_NOT_KEPT, INPUT_STATE_TEXT } = await ui();
  assert.equal(INPUT_NOT_KEPT, "Not kept (inputs are kept 7 days after the decision)");
  assert.deepEqual(INPUT_STATE_TEXT, {
    too_large: "Too large to keep",
    wiped: "Removed 7 days after the decision",
    unreadable: "Kept, but it could not be read",
    none: INPUT_NOT_KEPT,
  });
  const base = details({
    status: "approved",
    tool: undefined,
    reason: undefined,
    heldBy: undefined,
    callId: null,
    viewSha256: null,
    caller: { type: "app", id: "ins_evo", name: "Evolving Workflows", product: "evolution" },
    decidedAt: "2026-10-27T09:30:00.000Z",
  });
  const cases: [Record<string, unknown>, string][] = [
    [{ input: null, inputState: "too_large" }, "Too large to keep"],
    [{ input: null, inputState: "wiped" }, "Removed 7 days after the decision"],
    [{ input: null, inputState: "unreadable" }, "Kept, but it could not be read"],
    [{ input: null, inputState: "none" }, INPUT_NOT_KEPT],
    [{ input: null, inputState: "kept" }, INPUT_NOT_KEPT],
    [{ input: null, inputState: "future_state" }, INPUT_NOT_KEPT],
  ];
  for (const [state, words] of cases) {
    const rec = { ...base, ...state };
    const m = await mount(h(HoldDetails, { open: true, holdId: rec.holdId, load: async () => rec, onClose: () => {}, timeZone: "UTC", locale: "en-GB" }));
    await wait(1);
    const dlg = $(m.root, "dialog");
    assert.equal($(dlg, ".tb-hold-not-kept").textContent, words, String(state.inputState));
    assert.equal(dlg.querySelector("section.tb-hold-json"), null);
    await m.unmount();
  }
  // own words for a state
  const own = await mount(
    h(HoldDetails, {
      open: true,
      holdId: base.holdId,
      load: async () => ({ ...base, input: null, inputState: "wiped" }),
      onClose: () => {},
      inputStateText: { wiped: "Gone." },
    }),
  );
  await wait(1);
  assert.equal($(own.root, ".tb-hold-not-kept").textContent, "Gone.");
  await own.unmount();

  // kept after the decision: the input and when it goes
  const rec = { ...base, inputWipeAt: "2026-11-03T09:30:00.000Z" };
  const m = await mount(h(HoldDetails, { open: true, holdId: rec.holdId, load: async () => rec, onClose: () => {}, timeZone: "UTC", locale: "en-GB" }));
  await wait(1);
  const dlg = $(m.root, "dialog");
  assert.equal($(dlg, "h2").textContent, "More details");
  const rows = Object.fromEntries($$(dlg, ".tb-hold-facts > div").map((d) => [$(d, "dt").textContent, $(d, "dd").textContent]));
  assert.equal(rows.Status, "Approved");
  assert.equal(rows.App, "Evolving Workflows (ins_evo, evolution)");
  assert.equal(rows.Decided, "27 Oct 2026, 09:30 UTC · 2026-10-27T09:30:00.000Z");
  assert.equal(rows["Input kept until"], "3 Nov 2026, 09:30 UTC · 2026-11-03T09:30:00.000Z");
  for (const k of ["Tool", "Reason", "Held by", "Call id", "View hash"]) assert.ok(!(k in rows), `${k}: absent value, no row`);
  assert.equal($(dlg, "section.tb-hold-json pre").textContent, JSON.stringify(INPUT, null, 2));
  await m.unmount();
});

test("HoldDetails: a failed load shows a plain message (alert) and Try again loads again", { skip }, async () => {
  const { HoldDetails } = await ui();
  let n = 0;
  const load = async () => {
    n++;
    if (n === 1) throw Object.assign(new Error("upstream said <secret>"), { code: "internal" });
    if (n === 2) throw Object.assign(new Error("x"), { code: "hold_not_found" });
    if (n === 3) throw Object.assign(new Error("x"), { httpStatus: 403 });
    return details({ input: "not json" });
  };
  const m = await mount(h(HoldDetails, { open: true, holdId: "hld_1", load, onClose: () => {}, timeZone: "UTC" }));
  await wait(1);
  const alert = () => $(m.root, '[role="alert"]').textContent;
  assert.equal(alert(), "Could not load the details. Try again.");
  assert.doesNotMatch($(m.root, "dialog").textContent ?? "", /secret/, "never the raw error");
  const again = () => buttonByText(m.root, "Try again") as HTMLElement;
  await click(again());
  await wait(1);
  assert.equal(alert(), "This approval is no longer waiting.");
  await click(again());
  await wait(1);
  assert.equal(alert(), "Only the owner of this workspace can see these details.");
  await click(again());
  await wait(1);
  assert.equal(m.root.querySelector('[role="alert"]'), null);
  assert.equal($(m.root, "section.tb-hold-json pre").textContent, "not json", "text that is not JSON is shown as it is");
  assert.equal(n, 4);
  await m.unmount();
});

test("HoldDetails: hidden characters — rows drop them (bidi-isolated cells), the JSON shows them as escapes", { skip }, async () => {
  const { HoldDetails } = await ui();
  const rlo = String.fromCodePoint(0x202e);
  const shy = String.fromCodePoint(0x00ad);
  const rec = details({
    tool: `T${rlo}OOL`,
    op: `mail${shy}_send`,
    opTitle: "",
    caller: { type: "agent", id: `agt_${rlo}x`, name: `Front${rlo} desk`, product: `con${shy}nect` },
    callId: `call_${rlo}1`,
    input: { to: `ana@exam${shy}ple.com`, note: `a${rlo}b` },
  });
  const m = await mount(h(HoldDetails, { open: true, holdId: rec.holdId, load: async () => rec, onClose: () => {}, timeZone: "UTC" }));
  await wait(1);
  const dlg = $(m.root, "dialog");
  const rows = Object.fromEntries($$(dlg, ".tb-hold-facts > div").map((d) => [$(d, "dt").textContent, $(d, "dd").textContent]));
  assert.equal(rows.Tool, "TOOL");
  assert.equal(rows.Operation, "mail_send");
  assert.equal(rows.Agent, "Front desk (agt_x, connect)");
  assert.equal(rows["Call id"], "call_1");
  for (const dd of $$(dlg, ".tb-hold-facts dd")) assert.ok(dd.firstElementChild?.tagName === "BDI", "each value is isolated");
  const json = $(dlg, "section.tb-hold-json pre").textContent ?? "";
  const bs = String.fromCharCode(92);
  assert.ok(json.includes(`ana@exam${bs}u00ADple.com`), json);
  assert.ok(json.includes(`a${bs}u202Eb`), json);
  assert.ok(!json.includes(rlo) && !json.includes(shy));
  await m.unmount();
});

test("HoldDetails: an answer that is not a record, null, or a loader that throws at once → error state with Try again", { skip }, async () => {
  const { HoldDetails } = await ui();
  const answers: (() => unknown)[] = [
    () => Promise.resolve({}),
    () => Promise.resolve({ ok: true, result: details() }),
    () => Promise.resolve(null),
    () => Promise.resolve({ ...details(), caller: null }),
    () => {
      throw new Error("sync <boom>");
    },
    () => Promise.resolve(details()),
  ];
  let n = 0;
  const load = () => (answers[n++] as () => Promise<never>)();
  const m = await mount(h(HoldDetails, { open: true, holdId: "hld_1", load, onClose: () => {}, timeZone: "UTC" }));
  const expect = [
    "The details came back in a form this page cannot read. Try again.",
    "The details came back in a form this page cannot read. Try again.",
    "The details came back in a form this page cannot read. Try again.",
    "The details came back in a form this page cannot read. Try again.",
    "Could not load the details. Try again.",
  ];
  for (const words of expect) {
    await wait(1);
    assert.equal($(m.root, '[role="alert"]').textContent, words, `answer ${n}`);
    assert.equal(m.root.querySelector(".tb-hold-facts"), null);
    await click(buttonByText(m.root, "Try again") as HTMLElement);
  }
  await wait(1);
  assert.ok($(m.root, ".tb-hold-facts"), "the sixth answer is a record");
  await m.unmount();
});

test("HoldDetails: closing drops the record (the input does not stay in memory); re-opening shows loading, then fresh data", { skip }, async () => {
  const { HoldDetails } = await ui();
  let gate = deferred<ReturnType<typeof details>>();
  const load = () => gate.promise;
  const props = { holdId: "hld_1", load, onClose: () => {}, timeZone: "UTC" };
  const m = await mount(h(HoldDetails, { ...props, open: true }));
  await act(async () => gate.resolve(details()));
  assert.ok($(m.root, "section.tb-hold-json"));
  await m.rerender(h(HoldDetails, { ...props, open: false }));
  gate = deferred();
  await m.rerender(h(HoldDetails, { ...props, open: true }));
  assert.equal($(m.root, '[role="status"]').textContent, "Loading the details…", "no old data on re-open");
  assert.equal(m.root.querySelector("section.tb-hold-json"), null);
  await act(async () => gate.resolve(details({ input: null, inputState: "wiped" })));
  assert.equal($(m.root, ".tb-hold-not-kept").textContent, "Removed 7 days after the decision");
  await m.unmount();
});
