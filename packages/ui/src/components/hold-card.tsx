import { type CSSProperties, type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { APPS } from "../apps.ts";
import {
  clampText,
  escapeHidden,
  familyText,
  type HoldDetails as HoldDetailsRecord,
  type HoldInputState,
  type HoldReceipt,
  type HoldTime,
  holdTime,
  humanizeId,
  type TimeOptions,
  viewLines,
  visibleText,
} from "../holds.ts";
import { Button } from "./button.tsx";
import { Dialog } from "./dialog.tsx";
import { cx } from "./ink.tsx";
import { type Status, Tag } from "./pills.tsx";
import { Card, Notice } from "./surfaces.tsx";

/** Caps for agent- or app-written text on the card (code points); the full text is in the title attribute. */
export const HOLD_TEXT_MAX = { summary: 280, name: 120, action: 120, reason: 280 } as const;

const MINUTE = 60_000;

/** "Now" for the relative times. Ticks every 60 s, every 15 s in the last 10 minutes before `expiresAt`, and once exactly
    at `expiresAt` (so "Expired" and the disabled buttons are on time). A fixed `now` (tests) never ticks. */
function useNow(fixed: number | undefined, expiresAt: number | null): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const left = typeof expiresAt === "number" ? expiresAt - Date.now() : Number.POSITIVE_INFINITY;
    let delay = left > 0 && left <= 10 * MINUTE ? 15_000 : MINUTE;
    if (left > 0 && left < delay) delay = left + 20;
    const t = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(t);
  }, [fixed, expiresAt, now]);
  return fixed ?? now;
}

/** "<relative> (<absolute>)" in a <time>; UTC in the tooltip. */
function When({ t }: { t: HoldTime }) {
  return (
    <time dateTime={t.iso} title={t.utc}>
      {t.relative} ({t.absolute})
    </time>
  );
}

/** Text that may be clamped: the clamped text, with the full text in `title` when it was cut. */
function Clamped({ text, max, as: As = "span", className }: { text: string; max: number; as?: "span" | "strong"; className?: string }) {
  const shown = clampText(text, max);
  return (
    <As className={className} title={shown !== text ? text : undefined}>
      {shown}
    </As>
  );
}

/** `<product>/<hookId>` → "Rules & Approvals (rules_gate)"; anything else as given. */
function heldByText(heldBy: string): string {
  const clean = visibleText(heldBy);
  const slash = clean.indexOf("/");
  if (slash <= 0) return clean;
  const product = clean.slice(0, slash);
  const hook = clean.slice(slash + 1);
  const name = Object.hasOwn(APPS, product) ? (APPS[product]?.name ?? product) : product;
  return hook ? `${name} (${hook})` : name;
}

/** Statuses other than "held" (spec RECEIPT_STATUSES): a Tag instead of the buttons. Map: no prototype keys. */
const DONE_STATUS = new Map<string, { label: string; status: Status }>([
  ["approved", { label: "Approved", status: "live" }],
  ["run", { label: "Ran", status: "live" }],
  ["denied", { label: "Denied", status: "idle" }],
  ["refused", { label: "Refused", status: "idle" }],
  ["failed", { label: "Failed", status: "needs-you" }],
  ["after_failed", { label: "Failed", status: "needs-you" }],
]);

/** The hold view as readable text lines (not a code box): line breaks and indents kept, a run of blank lines shown as one,
    long lines wrap. A visible caption names it. When it is taller than its box, a bottom fade and "N more lines — scroll
    to read all" say so (also the region's description for screen readers). Plain text only: nothing is parsed as HTML. */
export function HoldView({ view, caption = "What the agent asks" }: { view: string; caption?: string }) {
  const lines = viewLines(view);
  const ref = useRef<HTMLElement>(null);
  const captionId = useId();
  const moreId = useId();
  const [more, setMore] = useState(0);
  // re-measure when the text changes (view)
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const bottom = el.scrollTop + el.clientHeight;
      if (el.scrollHeight <= el.clientHeight + 1 || bottom >= el.scrollHeight - 1) return setMore(0);
      let n = 0;
      for (const child of Array.from(el.children)) {
        const line = child as HTMLElement;
        if (line.offsetTop + line.offsetHeight > bottom + 1) n++;
      }
      setMore(Math.max(n, 1));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [view]);
  return (
    <div className="tb-hold-view-block">
      <p className="tb-hold-caption" id={captionId}>
        {caption}
      </p>
      <div className={cx("tb-hold-view-frame", more > 0 && "is-more")}>
        {/* biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (WCAG 2.1.1) */}
        <section ref={ref} className="tb-hold-view" aria-labelledby={captionId} aria-describedby={more > 0 ? moreId : undefined} tabIndex={0}>
          {lines.map((l, i) => (
            <div key={i} className={cx("tb-hold-line", !l.text && "is-blank")} style={l.indent ? ({ "--indent": l.indent } as CSSProperties) : undefined}>
              {l.text}
            </div>
          ))}
        </section>
      </div>
      {more > 0 ? (
        <p className="tb-hold-more" id={moreId}>
          {more === 1 ? "1 more line" : `${more} more lines`} — scroll to read all
        </p>
      ) : null}
    </div>
  );
}

export type HoldCardProps = TimeOptions & {
  /** the hold row (an SDK `Receipt` from tb.holds_list, plus `opTitle` when the app knows it) */
  hold: HoldReceipt;
  /** Approve (primary). Shown only while the hold waits (status "held"). */
  onApprove?: () => void;
  /** Deny. Shown only while the hold waits. */
  onDeny?: () => void;
  /** a decision is running: Approve / Deny are disabled (C8), focus moves to the card's status line */
  busy?: boolean;
  /** shows "More details" (open a <HoldDetails> modal from it) */
  onDetails?: () => void;
  /** replaces the default buttons (Approve / Deny / More details) */
  actions?: ReactNode;
  /** heading level of the summary (default 3: under the page h1 and a section h2) */
  headingLevel?: 2 | 3 | 4;
  className?: string;
};

/**
 * One held call, in plain words (C369): the summary as the heading, who asked, the call's own view as text lines, why it
 * waits (family label + sentence, the rule or reason with where it came from), when it was asked and when it expires
 * (viewer's zone, relative + absolute), then Approve / Deny / More details. No raw op or family ids on the card.
 * Approve / Deny exist only while the status is "held"; after `expiresAt` they are disabled next to an "Expired" tag.
 */
export function HoldCard({ hold, onApprove, onDeny, busy = false, onDetails, actions, headingLevel = 3, now, timeZone, locale, className }: HoldCardProps) {
  const headingId = useId();
  const expiresAt = typeof hold.expiresAt === "number" ? hold.expiresAt : null;
  const clock = useNow(now, expiresAt);
  const opts = { now: clock, timeZone, locale };
  const fam = familyText(hold.holdFamily);
  const action = clampText(hold.opTitle ? visibleText(hold.opTitle) : humanizeId(hold.op), HOLD_TEXT_MAX.action);
  const name = visibleText(hold.caller.name);
  const isApp = hold.caller.type === "app";
  const who = `${clampText(name, HOLD_TEXT_MAX.name)}${isApp ? ", an app" : ""}`;
  const summary = visibleText(hold.summary) || action;
  const asked = holdTime(hold.createdAt, opts);
  const expires = holdTime(expiresAt, opts);
  const held = hold.status === "held";
  const expired = held && expiresAt !== null && expiresAt <= clock;
  const tag = held
    ? expired
      ? { label: "Expired", status: "idle" as Status }
      : null
    : (DONE_STATUS.get(hold.status) ?? { label: humanizeId(hold.status) || "Unknown status", status: "default" as Status });
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const Sub = `h${headingLevel + 1}` as "h3" | "h4" | "h5";
  const reason = hold.holdReason ? visibleText(hold.holdReason) : "";
  const rule = hold.heldBy ? heldByText(hold.heldBy) : "";

  // C8 in the card too: one click per decision, even before the parent sets `busy` (a double click calls once)
  const pending = useRef(false);
  const busyNow = useRef(busy);
  busyNow.current = busy;
  useEffect(() => {
    if (!busy) pending.current = false;
  }, [busy]);
  // focus: a disabled button drops focus to <body>; keep the keyboard user on the card's status line, and back after
  const actionsRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const hadFocus = useRef(false);
  const wasBusy = useRef(busy);
  useLayoutEffect(() => {
    if (busy && !wasBusy.current && hadFocus.current) statusRef.current?.focus();
    if (!busy && wasBusy.current && hadFocus.current) {
      const active = document.activeElement;
      if (!active || active === document.body || active === statusRef.current)
        actionsRef.current?.querySelector<HTMLButtonElement>("button:not([disabled])")?.focus();
      hadFocus.current = false;
    }
    wasBusy.current = busy;
  }, [busy]);
  const decide = (fn: (() => void) | undefined) => () => {
    if (!fn || busyNow.current || pending.current || expired) return;
    pending.current = true;
    const active = typeof document === "undefined" ? null : document.activeElement;
    hadFocus.current = !!active && !!actionsRef.current?.contains(active);
    fn();
    setTimeout(() => {
      if (!busyNow.current) pending.current = false;
    }, 500);
  };

  return (
    <Card as="article" className={cx("tb-hold-card", className)} aria-labelledby={headingId}>
      <H id={headingId} className="tb-hold-summary" title={clampText(summary, HOLD_TEXT_MAX.summary) !== summary ? summary : undefined}>
        {clampText(summary, HOLD_TEXT_MAX.summary)}
      </H>
      <p className="tb-hold-by">
        <span>
          Asked by <Clamped as="strong" text={name} max={HOLD_TEXT_MAX.name} />
        </span>
        {isApp ? <Tag>App</Tag> : null}
        <span aria-hidden="true">·</span>
        <span className="tb-sr">, </span>
        <span>{action}</span>
      </p>
      {hold.view ? <HoldView view={hold.view} caption={isApp ? "What the app asks" : "What the agent asks"} /> : null}
      <section className="tb-hold-why" aria-labelledby={`${headingId}-why`}>
        <Sub id={`${headingId}-why`}>Why held</Sub>
        <p>
          <strong>{fam.label}.</strong> {fam.sentence}
        </p>
        {reason ? (
          <p className="tb-hold-reason">
            <strong>{rule ? "Rule:" : "Reason:"}</strong> <Clamped text={reason} max={HOLD_TEXT_MAX.reason} />
          </p>
        ) : null}
        {rule ? <p className="tb-hold-rule">{reason ? `Rule from ${rule}` : `Held by ${rule}`}</p> : null}
      </section>
      <dl className="tb-hold-facts">
        {asked ? (
          <div>
            <dt>Asked</dt>
            <dd>
              <When t={asked} />
            </dd>
          </div>
        ) : null}
        {expires ? (
          <div>
            <dt>{expired ? "Expired" : "Expires"}</dt>
            <dd>
              <When t={expires} />
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="tb-hold-actions" ref={actionsRef}>
        {actions ?? (
          <>
            {tag ? <Tag status={tag.status}>{tag.label}</Tag> : null}
            {held && onApprove ? (
              <Button variant="primary" size="sm" disabled={busy || expired} aria-label={`Approve: ${action}, asked by ${who}`} onClick={decide(onApprove)}>
                Approve
              </Button>
            ) : null}
            {held && onDeny ? (
              <Button size="sm" disabled={busy || expired} aria-label={`Deny: ${action}, asked by ${who}`} onClick={decide(onDeny)}>
                Deny
              </Button>
            ) : null}
            {onDetails ? (
              <Button variant="quiet" size="sm" aria-haspopup="dialog" aria-label={`More details: ${action}, asked by ${who}`} onClick={onDetails}>
                More details
              </Button>
            ) : null}
          </>
        )}
        {busy ? (
          <p className="tb-hold-busy" role="status" tabIndex={-1} ref={statusRef}>
            Sending your decision…
          </p>
        ) : null}
      </div>
    </Card>
  );
}

type LoadState = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ok"; details: HoldDetailsRecord };

/** Plain sentence for a failed load (never raw upstream text). */
function loadError(e: unknown): string {
  const err = (e ?? {}) as { code?: unknown; httpStatus?: unknown };
  if (err.code === "hold_not_found") return "This approval is no longer waiting.";
  if (err.code === "forbidden" || err.code === "role_required" || err.httpStatus === 403) return "Only the owner of this workspace can see these details.";
  if (err.code === "session_required" || err.httpStatus === 401) return "You’re signed out. Open this app from Portal to sign in again.";
  return "Could not load the details. Try again.";
}

const BAD_SHAPE = "The details came back in a form this page cannot read. Try again.";

/** The minimum a record needs before the modal renders it (anything else → the error state). */
function isDetails(v: unknown): v is HoldDetailsRecord {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const d = v as Record<string, unknown>;
  const c = d.caller as Record<string, unknown> | null | undefined;
  return (
    typeof d.holdId === "string" &&
    typeof d.status === "string" &&
    typeof d.op === "string" &&
    typeof d.inputState === "string" &&
    !!c &&
    typeof c === "object" &&
    typeof c.name === "string" &&
    typeof c.id === "string"
  );
}

/** The input as pretty JSON text, hidden characters written as visible escapes. The spec sends a JSON value; JSON text (a
    string) is parsed first, other text stays as it is. */
function prettyJson(input: unknown): string {
  let text: string;
  if (typeof input === "string") {
    try {
      text = JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      text = input;
    }
  } else text = JSON.stringify(input, null, 2) ?? String(input);
  return escapeHidden(text);
}

/** Mono JSON text in a scrolling block; the block is a labelled region the keyboard can reach. */
function JsonBlock({ label, text }: { label: string; text: string }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (WCAG 2.1.1)
    <section className="tb-hold-json" aria-label={label} tabIndex={0}>
      <pre>{text}</pre>
    </section>
  );
}

/** The record of `tb.hold_details` (C369 D4), under the same name as the modal: `import { HoldDetails }` gives both. */
export type HoldDetails = HoldDetailsRecord;

export const INPUT_NOT_KEPT = "Not kept (inputs are kept 7 days after the decision)";

/** What the modal says when there is no input to show, per `inputState` (C369 D4; 7 days after the decision, C369). */
export const INPUT_STATE_TEXT: Readonly<Record<Exclude<HoldInputState, "kept">, string>> = {
  too_large: "Too large to keep",
  wiped: "Removed 7 days after the decision",
  unreadable: "Kept, but it could not be read",
  none: INPUT_NOT_KEPT,
};

const STATUS_TEXT = new Map<string, string>([
  ["held", "Waiting for you"],
  ["approved", "Approved"],
  ["run", "Ran"],
  ["denied", "Denied"],
  ["refused", "Refused"],
  ["failed", "Failed"],
  ["after_failed", "Ran, then a follow-up step failed"],
]);

/** The sentence for an input that is not shown; an unknown state reads as "not kept". */
function notKeptText(state: string, own: HoldDetailsProps["inputStateText"]): ReactNode {
  const key = (Object.hasOwn(INPUT_STATE_TEXT, state) ? state : "none") as keyof typeof INPUT_STATE_TEXT;
  return (own && Object.hasOwn(own, key) ? own[key] : undefined) ?? INPUT_STATE_TEXT[key];
}

export type HoldDetailsProps = Pick<TimeOptions, "timeZone" | "locale"> & {
  open: boolean;
  onClose: () => void;
  holdId: string;
  /** loads the record, e.g. `(holdId) => callOp("tb.hold_details", { holdId })`; called each time the modal opens */
  load: (holdId: string) => Promise<HoldDetailsRecord>;
  /** dialog title (e.g. the hold summary); default "More details" */
  title?: ReactNode;
  /** your own words per input state (default INPUT_STATE_TEXT) */
  inputStateText?: Partial<Record<Exclude<HoldInputState, "kept">, ReactNode>>;
};

/** A string value for a row, hidden characters dropped; anything else → no row. */
const vis = (v: unknown): string | null => (typeof v === "string" && v !== "" ? visibleText(v) : null);

/** "<local> · <UTC ISO>" */
const stamp = (at: unknown, o: TimeOptions): string | null => {
  const t = typeof at === "number" || typeof at === "string" ? holdTime(at, o) : null;
  return t ? `${t.absolute} · ${t.iso}` : null;
};

/**
 * "More details" of a hold (C369 D4): a large modal (kicker "Technical details") with the technical facts of the held call
 * from `tb.hold_details` (owner only) and its input as formatted JSON while it is kept; otherwise the input state in words
 * (too large, removed 7 days after the decision, unreadable, not kept). Loading and error (with Try again) states; an answer
 * that is not a hold-details record is an error too. The record is dropped when the modal closes. All values are text.
 */
export function HoldDetails({ open, onClose, holdId, load, title = "More details", inputStateText, timeZone, locale }: HoldDetailsProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  // the latest loader without re-loading on every parent render (an inline arrow is a new function each time)
  const loadRef = useRef(load);
  loadRef.current = load;
  // `attempt` is the Try again trigger
  useEffect(() => {
    setState({ kind: "loading" }); // also on close: the input does not stay in memory
    if (!open) return;
    let live = true;
    Promise.resolve()
      .then(() => loadRef.current(holdId)) // a loader that throws at once lands in the error state too
      .then(
        (details) => live && setState(isDetails(details) ? { kind: "ok", details } : { kind: "error", message: BAD_SHAPE }),
        (e: unknown) => live && setState({ kind: "error", message: loadError(e) }),
      );
    return () => {
      live = false;
    };
  }, [open, holdId, attempt]);

  const d = state.kind === "ok" ? state.details : null;
  const o = { timeZone, locale };
  const family = d ? vis(d.family) : null;
  const fam = family ? familyText(family) : null;
  const op = d ? vis(d.op) : null;
  const opTitle = d ? vis(d.opTitle) : null;
  const caller = d ? d.caller : null;
  const product = caller ? vis(caller.product) : null;
  const rows: [string, string | null][] =
    d && caller
      ? [
          ["Status", STATUS_TEXT.get(d.status) ?? humanizeId(visibleText(d.status))],
          ["Operation", opTitle && opTitle !== op ? `${opTitle} (${op})` : op],
          ["Tool", vis(d.tool)],
          ["Held calls of", fam ? `${fam.label} (${family})` : null],
          ["Reason", vis(d.reason)],
          ["Held by", vis(d.heldBy)],
          [caller.type === "app" ? "App" : "Agent", `${visibleText(caller.name)} (${visibleText(caller.id)}${product ? `, ${product}` : ""})`],
          ["Hold id", vis(d.holdId)],
          ["Receipt id", vis(d.receiptId)],
          ["Call id", vis(d.callId)],
          ["Created", stamp(d.createdAt, o)],
          ["Expires", stamp(d.expiresAt, o)],
          ["Decided", stamp(d.decidedAt, o)],
          ["Input digest", vis(d.inputDigest)],
          ["Input kept until", d.inputState === "kept" ? stamp(d.inputWipeAt, o) : null],
          ["View hash", vis(d.viewSha256)],
        ]
      : [];
  return (
    <Dialog open={open} onClose={onClose} kicker="Technical details" title={title} size="lg" className="tb-hold-details">
      {state.kind === "loading" ? <p role="status">Loading the details…</p> : null}
      {state.kind === "error" ? (
        <div className="tb-hold-error">
          <Notice tone="needs-you" role="alert">
            {state.message}
          </Notice>
          <Button size="sm" onClick={() => setAttempt((n) => n + 1)}>
            Try again
          </Button>
        </div>
      ) : null}
      {d ? (
        <div className="tb-hold-details-content">
          <dl className="tb-hold-facts">
            {rows
              .filter((r): r is [string, string] => typeof r[1] === "string" && r[1] !== "")
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>
                    <bdi>{v}</bdi>
                  </dd>
                </div>
              ))}
          </dl>
          <h3 className="tb-hold-input-head">Input</h3>
          {d.inputState === "kept" && d.input !== null && d.input !== undefined ? (
            <JsonBlock label="Input as JSON" text={prettyJson(d.input)} />
          ) : (
            <p className="tb-hold-not-kept">{notKeptText(d.inputState === "kept" ? "none" : d.inputState, inputStateText)}</p>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
