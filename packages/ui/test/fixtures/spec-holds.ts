/* Type fixture: the hold shapes of @opt2-tealbrick/spec 0.1.84 (specs#65, branch feat/c369-hold-cards @ b43f7f4), copied
   verbatim (doc comments dropped) from packages/spec/src/{sdk,manifest,credentials,bridge}.ts. The ui kit does not depend on
   the spec (design choice); test/spec-types.test.ts proves these SDK shapes are assignable to the kit's local types.
   When spec 0.1.84 is released, compare this file with the released .d.ts (same names) and update it in the same PR. */

export type Ulid = string;
export type PersonId = `per_${Ulid}`;
export type AgentId = `agt_${Ulid}`;
export type InstanceId = `ins_${Ulid}`;
export type CallId = `call_${Ulid}`;
export type Sha256Digest = `sha256:${string}`;
export type IsoTime = string;
export type ProductId = string;
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export const EFFECTS = ["read", "write", "outward", "destructive", "money"] as const;
export type Effect = (typeof EFFECTS)[number];
export const HOLD_FAMILIES = ["first_contact", "profile_change", "live_call", "destructive", "money", "outward", "identity", "public_link"] as const;
export type HoldFamily = (typeof HOLD_FAMILIES)[number];
export const RECEIPT_STATUSES = ["run", "held", "approved", "denied", "refused", "failed", "after_failed"] as const;
export type ReceiptStatus = (typeof RECEIPT_STATUSES)[number];
export type AdmittedBy = "app_owner_row" | "portal_grant";

export interface Receipt {
  id: `hld_${Ulid}` | `rcp_${Ulid}`;
  callId: CallId | null;
  caller: { type: "agent" | "app"; id: AgentId | InstanceId; name: string; product?: ProductId };
  op: string;
  effect: Effect;
  holdFamily: HoldFamily | "caps" | "policy" | null;
  admittedBy?: AdmittedBy;
  heldBy: string | null;
  holdReason?: string;
  status: ReceiptStatus;
  inputDigest: Sha256Digest;
  summary: string;
  meta: Json;
  idempotencyKey: string | null;
  view?: string;
  createdAt: number;
  decidedAt: number | null;
  expiresAt: number | null;
  decidedBy: PersonId | "expiry" | null;
}

export const HOLD_INPUT_STATES = ["kept", "too_large", "wiped", "unreadable", "none"] as const;
export type HoldInputState = (typeof HOLD_INPUT_STATES)[number];

export interface HoldDetails {
  holdId: `hld_${Ulid}`;
  receiptId: `hld_${Ulid}`;
  status: ReceiptStatus;
  op: string;
  opTitle: string;
  tool?: string;
  family: HoldFamily | "caps" | "policy";
  reason?: string;
  heldBy?: string;
  caller: Receipt["caller"];
  callId: CallId | null;
  inputDigest: Sha256Digest;
  input: Json | null;
  inputState: HoldInputState;
  inputWipeAt: IsoTime | null;
  createdAt: IsoTime;
  expiresAt: IsoTime | null;
  decidedAt: IsoTime | null;
  viewSha256: string | null;
}
