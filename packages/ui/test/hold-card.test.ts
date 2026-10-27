/** HoldCard, HoldDetails and familyText (C369 H3): plain words on the card (no raw JSON, no raw op/family ids), view lines
    kept, times through Intl in a fixed zone, the details modal's loading / error / not-kept / loaded states, the family
    fallback, and text-only rendering (a view with markup stays text). */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HoldDetails as HoldDetailsRecord, HoldReceipt } from "../src/index.ts";
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
});

test("holdTime: Intl in the given zone, relative + absolute + UTC; invalid → null", { skip }, async () => {
  const { holdTime } = await ui();
  assert.deepEqual(holdTime(Date.UTC(2026, 9, 27, 8, 0), TZ), {
    relative: "5 minutes ago",
    absolute: "27 Oct 2026, 09:00 CET",
    utc: "27 Oct 2026, 08:00 UTC",
    iso: "2026-10-27T08:00:00.000Z",
  });
  assert.equal(holdTime(Date.UTC(2026, 9, 29, 8, 0), TZ)?.relative, "in 2 days");
  assert.equal(holdTime(NOW + 20_000, TZ)?.relative, "now");
  assert.equal(holdTime(Date.UTC(2026, 9, 29, 8, 0), { ...TZ, timeZone: "America/New_York", locale: "en-US" })?.absolute, "Oct 29, 2026, 04:00 AM EDT");
  assert.equal(holdTime(null, TZ), null);
  assert.equal(holdTime(Number.NaN, TZ), null);
});

test("HoldCard: summary heading, who asked, view as text lines, why held, times; no raw JSON or ids", { skip }, async () => {
  const { HoldCard } = await ui();
  const m = await mount(h(HoldCard, { hold: hold({ opTitle: "Send email" }), ...TZ, onApprove: () => {}, onDeny: () => {} }));
  const card = $(m.root, "article.tb-card.tb-hold-card");
  const head = $(card, "h3");
  assert.equal(head.textContent, "Email to ana@example.com: Thanks for the call");
  assert.equal(card.getAttribute("aria-labelledby"), head.id);
  assert.equal($(card, ".tb-hold-by").textContent, "Asked by Front desk · , Send email");
  assert.equal($(card, ".tb-hold-by strong").textContent, "Front desk");

  // the view: one element per line, indents as --indent, blank line kept, not a <pre> / mono box
  assert.equal(card.querySelector("pre"), null);
  const view = $(card, "section.tb-hold-view");
  assert.equal(view.getAttribute("aria-label"), "What would run");
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
    ["Expires", "in 2 days (29 Oct 2026, 09:00 CET)"],
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
  assert.equal($(why, ".tb-hold-reason").textContent, "Mail to new customers waits for Martin.");
  assert.equal($(why, ".tb-hold-rule").textContent, "Held by Rules & Approvals (rules_gate)");
  assert.equal($(m.root, ".tb-hold-by strong").textContent, "Evolving Workflows (app)");
  const exp = $$(m.root, ".tb-hold-facts > div")[1];
  assert.equal(exp && $(exp, "dt").textContent, "Expired");
  assert.equal(exp && $(exp, "dd").textContent, "3 minutes ago (27 Oct 2026, 09:02 CET)");

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
  assert.equal($(card, ".tb-hold-reason").textContent, evil);
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
  for (const b of buttons) await click(b);
  assert.deepEqual(calls, ["approve", "deny", "details"]);

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

// Type level (checked by `pnpm typecheck`): the SDK's own shapes (spec 0.1.84: template-literal ids, unions, ISO times,
// `input: Json | null`) are assignable to the kit's local types as they are.
type SpecHoldDetails = {
  holdId: `hld_${string}`;
  receiptId: `hld_${string}`;
  status: "run" | "held" | "approved" | "denied" | "refused" | "failed" | "after_failed";
  op: string;
  opTitle: string;
  tool?: string;
  family: "first_contact" | "money" | "caps" | "policy";
  reason?: string;
  heldBy?: string;
  caller: { type: "agent" | "app"; id: `agt_${string}` | `ins_${string}`; name: string; product?: string };
  callId: `cal_${string}` | null;
  inputDigest: `sha256:${string}`;
  input: { [k: string]: unknown } | string | number | boolean | null | unknown[];
  inputState: "kept" | "too_large" | "wiped" | "unreadable" | "none";
  inputWipeAt: string | null;
  createdAt: string;
  expiresAt: string | null;
  decidedAt: string | null;
  viewSha256: string | null;
};
type SpecReceipt = {
  id: `hld_${string}` | `rcp_${string}`;
  callId: `cal_${string}` | null;
  caller: { type: "agent" | "app"; id: `agt_${string}`; name: string; product?: string };
  op: string;
  effect: "read" | "write";
  holdFamily: "destructive" | "caps" | "policy" | null;
  heldBy: string | null;
  status: "held" | "approved";
  inputDigest: `sha256:${string}`;
  summary: string;
  meta: unknown;
  idempotencyKey: string | null;
  view?: string;
  holdReason?: string;
  createdAt: number;
  decidedAt: number | null;
  expiresAt: number | null;
  decidedBy: string | null;
};
export const specDetailsFit = (d: SpecHoldDetails): HoldDetailsRecord => d;
export const specReceiptFits = (r: SpecReceipt): HoldReceipt => r;
