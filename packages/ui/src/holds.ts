/* Hold words and shapes (C369): the plain-language family labels, the hold row and the "More details" record the
   shared HoldCard / HoldDetails read, and the small text helpers they share. No React here.

   LOCAL TYPES ON PURPOSE: the ui kit does not depend on @opt2-tealbrick/spec or the miniapp SDK. The field names are the
   spec's (`Receipt` rows of tb.holds_list + `holdReason?` from C369 D3; `HoldDetails` = the answer of the owner-only person
   op `tb.hold_details`, C369 D4). The shapes are deliberately a little wider than the spec (plain strings for ids and
   vocabularies, nullable where a row can be null), so the SDK's own types are assignable to them as they are. When the SDK
   types ship, `HoldDetails` may be replaced by the SDK one without renaming anything. */

/** The families an op may declare (spec HOLD_FAMILIES). A hold row also carries `caps` and `policy` (spec Receipt). */
export type HoldFamily = "first_contact" | "profile_change" | "live_call" | "destructive" | "money" | "outward" | "identity" | "public_link";

/** Who asked: an agent, or another app (spec `Receipt.caller`). */
export interface HoldCaller {
  type: string;
  id: string;
  name: string;
  /** app callers: the verified product id */
  product?: string;
}

/** The fields of a hold row (spec `Receipt` from `tb.holds_list`) that HoldCard reads. An SDK `Receipt` is assignable. */
export interface HoldReceipt {
  id: string;
  op: string;
  /** the op's title from the manifest, when the app passes it (not in the spec row) */
  opTitle?: string;
  summary: string;
  /** the hold view: plain text (hash-bound, UTC); present while held/approved */
  view?: string;
  holdFamily: string | null;
  /** C369 D3: the human "why" (e.g. a Rules rule text), ≤ 280 */
  holdReason?: string;
  /** `<product>/<hookId>` of the before hook whose verdict held this call, else null */
  heldBy: string | null;
  caller: HoldCaller;
  status: string;
  createdAt: number;
  expiresAt: number | null;
}

/** C369 D4: what `tb.hold_details` says about the held input (spec HOLD_INPUT_STATES). */
export type HoldInputState = "kept" | "too_large" | "wiped" | "unreadable" | "none";

/** C369 D4 (spec 0.1.84): the answer of the owner-only person op `tb.hold_details {holdId}`. Field names = spec; times are
    UTC ISO 8601 strings (a number of ms is accepted too). An SDK `HoldDetails` is assignable. */
export interface HoldDetails {
  holdId: string;
  /** the same row: a hold's id stays its receipt id */
  receiptId: string;
  status: string;
  op: string;
  /** the op's manifest title (the op id when the op is gone) */
  opTitle: string;
  /** dynamic ops: the tool name of the call */
  tool?: string;
  family: string;
  /** = `Receipt.holdReason` */
  reason?: string;
  heldBy?: string | null;
  caller: HoldCaller;
  callId: string | null;
  inputDigest: string;
  /** the redacted input as JSON; null unless `inputState` is `kept` */
  input: unknown;
  inputState: HoldInputState;
  /** when the kept input is wiped (terminal status + 7 days); null while the hold waits, and for too_large / none */
  inputWipeAt: string | number | null;
  createdAt: string | number;
  expiresAt: string | number | null;
  decidedAt: string | number | null;
  /** `sha256:` hex of the view the owner saw; null for a hold made before spec 0.1.84 */
  viewSha256: string | null;
}

export type FamilyText = { label: string; sentence: string };

/** Plain words for the hold families (moved from the Portal GUI `hold-families.ts`, C369 H3/H7). `policy` = a Rules hook
    held the call (the rule text is the hold reason); `caps` = the agent reached a usage limit its owner set. */
export const FAMILY_TEXT: Readonly<Record<HoldFamily | "policy" | "caps", FamilyText>> = {
  first_contact: { label: "First message to someone new", sentence: "Waits for you before an app writes to a person or channel it has not contacted before." },
  profile_change: { label: "Profile changes", sentence: "Waits for you before an app changes a profile." },
  live_call: { label: "Live calls", sentence: "Waits for you before an app starts a call." },
  destructive: { label: "Deleting things", sentence: "Waits for you before an app deletes anything." },
  money: { label: "Payments", sentence: "Always waits for you. This cannot be turned off." },
  outward: { label: "Every message or post", sentence: "Waits for you before an app sends any message or post. Off unless you turn it on." },
  identity: { label: "Changes to an agent's public profile", sentence: "Waits for you before an app changes how an agent shows up to others." },
  public_link: {
    label: "Share a page with anyone who has the link",
    sentence: "Waits for you before an app makes a page visible to people outside this workspace.",
  },
  policy: { label: "A rule you set", sentence: "One of your rules says that this call waits for you." },
  caps: { label: "Usage limit reached", sentence: "The agent reached a usage limit that you set, so this call waits for you." },
};

const NO_FAMILY: FamilyText = { label: "Approval needed", sentence: "This call waits for your approval." };

/** `to_address` / `toAddress` / `issue-delete` → "To address" / "To address" / "Issue delete". Empty → "". */
export function humanizeId(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_\-.\s]+/g, " ")
    .trim()
    .toLowerCase();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "";
}

/** Label + sentence of a hold family. An unknown id gets its humanized id and a neutral sentence; none gets "Approval needed". */
export function familyText(family: string | null | undefined): FamilyText {
  if (!family) return NO_FAMILY;
  if (Object.hasOwn(FAMILY_TEXT, family)) return FAMILY_TEXT[family as keyof typeof FAMILY_TEXT];
  return { label: humanizeId(family) || NO_FAMILY.label, sentence: "Calls of this kind wait for your approval." };
}

/** Code points that change how text LOOKS without being seen. = the SDK `clean()` list (SDK-API §4.8, spec 0.1.84: C0
    controls except TAB/LF/CR here, U+007F–U+009F, U+061C, U+200B–U+200F incl. ZWNJ/ZWJ, U+2028/U+2029, U+202A–U+202E,
    U+2060–U+2064, U+2066–U+2069, U+FEFF, tag characters U+E0000–U+E007F, lone surrogates) plus display-only extras that
    render blank: soft hyphen U+00AD, combining grapheme joiner U+034F, Hangul fillers U+115F/U+1160/U+3164/U+FFA0,
    Mongolian free variation selectors and vowel separator U+180B–U+180F, Braille blank U+2800, interlinear annotation
    U+FFF9–U+FFFB. Variation selectors (U+FE00–U+FE0F) stay: they only pick text or emoji style. */
export function isHiddenChar(c: number): boolean {
  return (
    (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) ||
    (c >= 0x7f && c <= 0x9f) ||
    c === 0x00ad ||
    c === 0x034f ||
    c === 0x061c ||
    c === 0x115f ||
    c === 0x1160 ||
    (c >= 0x180b && c <= 0x180f) ||
    (c >= 0x200b && c <= 0x200f) ||
    c === 0x2028 ||
    c === 0x2029 ||
    (c >= 0x202a && c <= 0x202e) ||
    (c >= 0x2060 && c <= 0x2064) ||
    (c >= 0x2066 && c <= 0x2069) ||
    c === 0x2800 ||
    c === 0x3164 ||
    (c >= 0xd800 && c <= 0xdfff) ||
    c === 0xfeff ||
    c === 0xffa0 ||
    (c >= 0xfff9 && c <= 0xfffb) ||
    (c >= 0xe0000 && c <= 0xe007f)
  );
}

/** Drops every hidden character (isHiddenChar). Display only; the hash-bound text is not touched. */
export function visibleText(s: string): string {
  let out = "";
  for (const ch of s) if (!isHiddenChar(ch.codePointAt(0) ?? 0)) out += ch;
  return out;
}

const BACKSLASH = String.fromCharCode(92);
/** Writes every hidden character as a visible `\uXXXX` / `\u{XXXXX}` escape (for the technical JSON view: the owner sees that
    the character is there). */
export function escapeHidden(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (!isHiddenChar(c) || c === 0x09 || c === 0x0a) out += ch;
    else out += c > 0xffff ? `${BACKSLASH}u{${c.toString(16).toUpperCase()}}` : `${BACKSLASH}u${c.toString(16).toUpperCase().padStart(4, "0")}`;
  }
  return out;
}

/** At most `max` code points; longer text ends with "…". */
export function clampText(s: string, max: number): string {
  const cps = Array.from(s);
  return cps.length <= max ? s : `${cps.slice(0, Math.max(0, max - 1)).join("")}…`;
}

export type ViewLine = { text: string; indent: number };

/** The view as lines: line breaks kept, leading spaces become an indent level (a tab = 2 spaces), so a wrapped line keeps
    its indent. A run of blank lines shows as ONE blank line (display only: a long run of newlines cannot push a later line
    out of sight). */
export function viewLines(view: string): ViewLine[] {
  const out: ViewLine[] = [];
  for (const line of visibleText(view).split(/\r\n|\r|\n/)) {
    const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
    let indent = 0;
    for (const ch of lead) indent += ch === "\t" ? 2 : 1;
    const text = line.slice(lead.length).trimEnd();
    if (!text && out.length > 0 && out[out.length - 1]?.text === "") continue;
    out.push({ text, indent: text ? indent : 0 });
  }
  return out;
}

export type TimeOptions = {
  /** "now" in ms (tests); default Date.now() */
  now?: number;
  /** IANA zone; default the viewer's browser zone */
  timeZone?: string;
  /** BCP 47 locale; default the browser's */
  locale?: string;
};
export type HoldTime = { relative: string; absolute: string; utc: string; iso: string };

const MINUTE = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

/** Relative words for a distance in ms. The size is rounded DOWN in both directions (never more time left than there is):
    under a minute → "in under a minute" / "under a minute ago"; under an hour → minutes; under 48 hours → hours (36 h →
    "in 36 hours"); else days. */
export function relativeTime(diff: number, locale?: string): string {
  const abs = Math.abs(diff);
  const future = diff >= 0;
  if (abs < MINUTE) return future ? "in under a minute" : "under a minute ago";
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "always" });
  const [n, unit]: [number, Intl.RelativeTimeFormatUnit] =
    abs < HOUR ? [Math.floor(abs / MINUTE), "minute"] : abs < 2 * DAY ? [Math.floor(abs / HOUR), "hour"] : [Math.floor(abs / DAY), "day"];
  return rtf.format(future ? n : -n, unit);
}

/** A time (ms, or an ISO 8601 string) in the viewer's zone (Intl): relative ("5 minutes ago", "in 36 hours"), absolute with
    the zone name, and UTC. null for a missing or invalid time. */
export function holdTime(at: number | string | null | undefined, o: TimeOptions = {}): HoldTime | null {
  const ms = typeof at === "string" ? Date.parse(at) : at;
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const relative = relativeTime(ms - (o.now ?? Date.now()), o.locale);
  const fields: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  const absolute = new Intl.DateTimeFormat(o.locale, { ...fields, timeZone: o.timeZone }).format(d);
  const utc = new Intl.DateTimeFormat(o.locale, { ...fields, timeZone: "UTC" }).format(d);
  return { relative, absolute, utc, iso: d.toISOString() };
}
