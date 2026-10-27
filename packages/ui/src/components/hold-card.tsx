import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { APPS } from "../apps.ts";
import {
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
import { Tag } from "./pills.tsx";
import { Card, Notice } from "./surfaces.tsx";

/** Re-render once a minute so "5 minutes ago" stays true (not when the caller fixes `now`). */
function useNow(fixed: number | undefined): number {
  const [now, setNow] = useState(() => fixed ?? Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, [fixed]);
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

/** `<product>/<hookId>` → "Rules & Approvals (rules_gate)"; anything else as given. */
function heldByText(heldBy: string): string {
  const slash = heldBy.indexOf("/");
  if (slash <= 0) return heldBy;
  const product = heldBy.slice(0, slash);
  const hook = heldBy.slice(slash + 1);
  const name = Object.hasOwn(APPS, product) ? (APPS[product]?.name ?? product) : product;
  return hook ? `${name} (${hook})` : name;
}

const callerText = (c: HoldReceipt["caller"]): string => (c.type === "app" ? `${visibleText(c.name)} (app)` : visibleText(c.name));

const DONE_STATUS: Record<string, { label: string; status: "live" | "idle" | "needs-you" }> = {
  approved: { label: "Approved", status: "live" },
  run: { label: "Ran", status: "live" },
  denied: { label: "Denied", status: "idle" },
  refused: { label: "Refused", status: "idle" },
  failed: { label: "Failed", status: "needs-you" },
  after_failed: { label: "Failed", status: "needs-you" },
};

/** The hold view as readable text lines (not a code box): line breaks and indents kept, long lines wrap. Plain text only:
    React escapes every character, nothing is parsed as HTML. */
export function HoldView({ view, label = "What would run" }: { view: string; label?: string }) {
  return (
    // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (WCAG 2.1.1)
    <section className="tb-hold-view" aria-label={label} tabIndex={0}>
      {viewLines(view).map((l, i) => (
        <div key={i} className={cx("tb-hold-line", !l.text && "is-blank")} style={l.indent ? ({ "--indent": l.indent } as CSSProperties) : undefined}>
          {l.text}
        </div>
      ))}
    </section>
  );
}

export type HoldCardProps = TimeOptions & {
  /** the hold row (an SDK `Receipt` from tb.holds_list, plus `opTitle` when the app knows it) */
  hold: HoldReceipt;
  /** Approve (primary). No handler: no button. */
  onApprove?: () => void;
  /** Deny. No handler: no button. */
  onDeny?: () => void;
  /** a decision is running: Approve / Deny are disabled (C8) */
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
 * waits (family label + sentence, the hold reason when there is one, which rule held it), when it was asked and when it
 * expires (viewer's zone, relative + absolute), then Approve / Deny / More details. No raw op or family ids on the card.
 */
export function HoldCard({ hold, onApprove, onDeny, busy = false, onDetails, actions, headingLevel = 3, now, timeZone, locale, className }: HoldCardProps) {
  const headingId = useId();
  const clock = useNow(now);
  const opts = { now: clock, timeZone, locale };
  const fam = familyText(hold.holdFamily);
  const action = hold.opTitle ? visibleText(hold.opTitle) : humanizeId(hold.op);
  const who = callerText(hold.caller);
  const asked = holdTime(hold.createdAt, opts);
  const expires = holdTime(hold.expiresAt, opts);
  const expired = expires !== null && typeof hold.expiresAt === "number" && hold.expiresAt <= clock;
  const done = hold.status !== "held" ? DONE_STATUS[hold.status] : undefined;
  const H = `h${headingLevel}` as "h2" | "h3" | "h4";
  const Sub = `h${headingLevel + 1}` as "h3" | "h4" | "h5";
  const reason = hold.holdReason ? visibleText(hold.holdReason) : "";
  return (
    <Card as="article" className={cx("tb-hold-card", className)} aria-labelledby={headingId}>
      <H id={headingId} className="tb-hold-summary">
        {visibleText(hold.summary) || action}
      </H>
      <p className="tb-hold-by">
        Asked by <strong>{who}</strong>
        <span aria-hidden="true"> · </span>
        <span className="tb-sr">, </span>
        {action}
      </p>
      {hold.view ? <HoldView view={hold.view} /> : null}
      <section className="tb-hold-why" aria-labelledby={`${headingId}-why`}>
        <Sub id={`${headingId}-why`}>Why held</Sub>
        <p>
          <strong>{fam.label}.</strong> {fam.sentence}
        </p>
        {reason ? <p className="tb-hold-reason">{reason}</p> : null}
        {hold.heldBy ? <p className="tb-hold-rule">Held by {heldByText(visibleText(hold.heldBy))}</p> : null}
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
      <div className="tb-hold-actions">
        {actions ?? (
          <>
            {done ? <Tag status={done.status}>{done.label}</Tag> : null}
            {!done && onApprove ? (
              <Button variant="primary" size="sm" disabled={busy} aria-label={`Approve: ${action}, asked by ${who}`} onClick={onApprove}>
                Approve
              </Button>
            ) : null}
            {!done && onDeny ? (
              <Button size="sm" disabled={busy} aria-label={`Deny: ${action}, asked by ${who}`} onClick={onDeny}>
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

/** The input as pretty JSON text. The spec sends a JSON value; JSON text (a string) is parsed first, other text stays as it is. */
function prettyJson(input: unknown): string {
  if (typeof input === "string") {
    try {
      return JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      return input;
    }
  }
  return JSON.stringify(input, null, 2) ?? String(input);
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

/** The sentence for an input that is not shown; an unknown state reads as "not kept". */
function notKeptText(state: string, own: HoldDetailsProps["inputStateText"]): ReactNode {
  const key = (Object.hasOwn(INPUT_STATE_TEXT, state) ? state : "none") as keyof typeof INPUT_STATE_TEXT;
  return own?.[key] ?? INPUT_STATE_TEXT[key];
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

const STATUS_TEXT: Record<string, string> = {
  held: "Waiting for you",
  approved: "Approved",
  run: "Ran",
  denied: "Denied",
  refused: "Refused",
  failed: "Failed",
  after_failed: "Ran, then a follow-up step failed",
};

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

/** "<local> · <UTC ISO>" */
const stamp = (at: number | string | null | undefined, o: TimeOptions): string | null => {
  const t = holdTime(at, o);
  return t ? `${t.absolute} · ${t.iso}` : null;
};

/**
 * "More details" of a hold (C369 D4): a large modal (kicker "Technical details") with the technical facts of the held call
 * from `tb.hold_details` (owner only) and its input as formatted JSON while it is kept; otherwise the input state in words
 * (too large, removed 7 days after the decision, unreadable, not kept). Loading and error (with Try again) states. All
 * values are shown as text.
 */
export function HoldDetails({ open, onClose, holdId, load, title = "More details", inputStateText, timeZone, locale }: HoldDetailsProps) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  // the latest loader without re-loading on every parent render (an inline arrow is a new function each time)
  const loadRef = useRef(load);
  loadRef.current = load;
  // `attempt` is the Try again trigger
  useEffect(() => {
    if (!open) return;
    let live = true;
    setState({ kind: "loading" });
    loadRef.current(holdId).then(
      (details) => live && setState({ kind: "ok", details }),
      (e: unknown) => live && setState({ kind: "error", message: loadError(e) }),
    );
    return () => {
      live = false;
    };
  }, [open, holdId, attempt]);

  const d = state.kind === "ok" ? state.details : null;
  const o = { timeZone, locale };
  const fam = d ? familyText(d.family) : null;
  const rows: [string, string | null | undefined][] = d
    ? [
        ["Status", STATUS_TEXT[d.status] ?? humanizeId(d.status)],
        ["Operation", d.opTitle && d.opTitle !== d.op ? `${visibleText(d.opTitle)} (${d.op})` : d.op],
        ["Tool", d.tool],
        ["Held calls of", fam ? `${fam.label} (${d.family})` : null],
        ["Reason", d.reason ? visibleText(d.reason) : null],
        ["Held by", d.heldBy ? visibleText(d.heldBy) : null],
        [d.caller.type === "app" ? "App" : "Agent", `${visibleText(d.caller.name)} (${d.caller.id}${d.caller.product ? `, ${d.caller.product}` : ""})`],
        ["Hold id", d.holdId],
        ["Receipt id", d.receiptId],
        ["Call id", d.callId],
        ["Created", stamp(d.createdAt, o)],
        ["Expires", stamp(d.expiresAt, o)],
        ["Decided", stamp(d.decidedAt, o)],
        ["Input digest", d.inputDigest],
        ["Input kept until", d.inputState === "kept" ? stamp(d.inputWipeAt, o) : null],
        ["View hash", d.viewSha256],
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
                  <dd>{v}</dd>
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
