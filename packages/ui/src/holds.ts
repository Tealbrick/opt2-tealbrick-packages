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

/** C369 D4: the answer of the owner-only person op `tb.hold_details {holdId}` (field names = spec). */
export interface HoldDetails {
  holdId: string;
  op: string;
  opTitle: string;
  /** dynamic ops: the inner tool name */
  tool?: string;
  family: string;
  reason?: string;
  heldBy?: string | null;
  caller: HoldCaller;
  callId: string | null;
  receiptId: string;
  inputDigest: string;
  /** the held call's input as JSON text (after the op's redact rules); null when it is no longer kept */
  input: string | null;
  createdAt: number;
  expiresAt: number | null;
  viewSha256: string;
  /** app-specific technical facts (e.g. Connect's upstream, method, path) */
  extra?: unknown;
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

/** Removes characters that change how text LOOKS without being seen: C0/C1 controls (tab and newline stay), bidi
    embeddings/overrides/isolates and marks, zero-width space/word joiner/BOM. Display only; the hash-bound text is not touched. */
export function visibleText(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    const control = (c < 0x20 && c !== 0x09 && c !== 0x0a && c !== 0x0d) || (c >= 0x7f && c <= 0x9f);
    const bidi = (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0x200e || c === 0x200f || c === 0x061c;
    const zeroWidth = c === 0x200b || c === 0x2060 || c === 0xfeff;
    if (!control && !bidi && !zeroWidth) out += ch;
  }
  return out;
}

export type ViewLine = { text: string; indent: number };

/** The view as lines: line breaks kept, leading spaces become an indent level (a tab = 2 spaces), so a wrapped line keeps
    its indent. Blank lines stay (text ""). */
export function viewLines(view: string): ViewLine[] {
  return visibleText(view)
    .split(/\r\n|\r|\n/)
    .map((line) => {
      const lead = /^[ \t]*/.exec(line)?.[0] ?? "";
      let indent = 0;
      for (const ch of lead) indent += ch === "\t" ? 2 : 1;
      return { text: line.slice(lead.length).trimEnd(), indent };
    });
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

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** A time in the viewer's zone (Intl): relative ("5 minutes ago", "in 2 days"), absolute with the zone name, and UTC. null
    for a missing or invalid time. */
export function holdTime(ms: number | null | undefined, o: TimeOptions = {}): HoldTime | null {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const diff = ms - (o.now ?? Date.now());
  const rtf = new Intl.RelativeTimeFormat(o.locale, { numeric: "auto" });
  let relative = rtf.format(0, "second"); // under a minute: "now"
  for (const [unit, size] of UNITS)
    if (Math.abs(diff) >= size) {
      relative = rtf.format(Math.round(diff / size), unit);
      break;
    }
  const fields: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", timeZoneName: "short" };
  const absolute = new Intl.DateTimeFormat(o.locale, { ...fields, timeZone: o.timeZone }).format(d);
  const utc = new Intl.DateTimeFormat(o.locale, { ...fields, timeZone: "UTC" }).format(d);
  return { relative, absolute, utc, iso: d.toISOString() };
}
