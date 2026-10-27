/** The kit's local hold types against the SDK's (spec 0.1.84 shapes in test/fixtures/spec-holds.ts). The type-level part
    is checked by `pnpm typecheck` (tsconfig includes test/); the runtime part checks the vocabularies the kit spells out. */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { HoldCardProps, HoldDetails, HoldDetailsProps, HoldFamily, HoldInputState, HoldReceipt } from "../src/index.ts";
import { skip, ui } from "./dom.ts";
import * as spec from "./fixtures/spec-holds.ts";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const yes = <T extends true>(_: T) => {};

// SDK rows and records go into the kit as they are (no mapping in the apps)
export const receiptFits = (r: spec.Receipt): HoldReceipt => r;
export const detailsFit = (d: spec.HoldDetails): HoldDetails => d;
export const cardTakesReceipt = (r: spec.Receipt): HoldCardProps => ({ hold: r });
export const loaderFits = (load: (holdId: string) => Promise<spec.HoldDetails>): HoldDetailsProps["load"] => load;
// the vocabularies are the same sets both ways
yes<Equal<HoldFamily, spec.HoldFamily>>(true);
yes<Equal<HoldInputState, spec.HoldInputState>>(true);
// a record without a caller is not a HoldDetails
// @ts-expect-error caller is required
export const noCaller = (d: Omit<spec.HoldDetails, "caller">): HoldDetails => d;

test("vocabularies: FAMILY_TEXT has every spec family (+ policy, caps); INPUT_STATE_TEXT has every input state but kept", { skip }, async () => {
  const { FAMILY_TEXT, INPUT_STATE_TEXT } = await ui();
  assert.deepEqual(Object.keys(FAMILY_TEXT).sort(), [...spec.HOLD_FAMILIES, "policy", "caps"].sort());
  assert.deepEqual(Object.keys(INPUT_STATE_TEXT).sort(), spec.HOLD_INPUT_STATES.filter((s) => s !== "kept").sort());
});
