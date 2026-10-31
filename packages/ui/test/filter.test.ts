/** ListFilter (C382 batch 4): the wording of a paged list, the bar that always says a filter is on, held items counted when hidden. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { act, click, h, mount, ui } from "./dom.ts";

const NOUN = { one: "receipt", many: "receipts" };
const type = async (input: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
};

test("wording: the count says loaded for a paged list; nothing says what was searched; hidden items are counted", async () => {
  const { filterCountText, filterNothingText, filterPagedText, filterHiddenText } = await ui();
  assert.equal(filterCountText(4, 100, NOUN), "Showing 4 of 100 receipts.");
  assert.equal(filterCountText(1, 1, NOUN), "Showing 1 of 1 receipt.");
  assert.equal(filterCountText(4, 100, NOUN, true), "Showing 4 of 100 loaded receipts.");
  assert.match(filterPagedText(100, NOUN), /searches only the 100 receipts loaded so far/);
  assert.match(filterPagedText(100, NOUN), /More are not loaded yet/);
  assert.match(filterNothingText(100, NOUN, true), /^No loaded receipt matches\. The filter searches only the 100 receipts loaded so far/);
  assert.equal(filterNothingText(12, NOUN, false), "No receipt matches. The filter searched all 12 receipts.");
  assert.equal(filterNothingText(0, NOUN, false), "No receipt matches this filter.");
  assert.equal(filterHiddenText(1, { one: "held approval", many: "held approvals" }), "1 held approval is hidden by the filter. Clear the filter to see it.");
  assert.equal(
    filterHiddenText(3, { one: "held approval", many: "held approvals" }),
    "3 held approvals are hidden by the filter. Clear the filter to see them.",
  );
});

test("no filter on: no status line, no Clear button", async () => {
  const { ListFilter, listFilter } = await ui();
  const m = await mount(
    h(ListFilter, { label: "Filter", value: "", onChange: () => {}, filter: listFilter(""), noun: NOUN, shown: 5, total: 5, onClear: () => {} }),
  );
  assert.equal(m.root.querySelector(".tb-listfilter-status")?.textContent, "");
  assert.equal([...m.root.querySelectorAll("button")].filter((b) => /Clear/.test(b.textContent ?? "")).length, 0);
  await m.unmount();
});

test("a filter that is on says so: N of M and Clear; Clear runs onClear", async () => {
  const { ListFilter, listFilter } = await ui();
  let cleared = 0;
  const m = await mount(
    h(ListFilter, {
      label: "Filter",
      value: "henry",
      onChange: () => {},
      filter: listFilter("henry"),
      noun: NOUN,
      shown: 2,
      total: 9,
      onClear: () => cleared++,
    }),
  );
  const text = m.root.textContent ?? "";
  assert.match(text, /Showing 2 of 9 receipts\./);
  assert.doesNotMatch(text, /loaded so far/, "a complete list does not claim to be paged");
  const clear = [...m.root.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Clear filter") as HTMLButtonElement;
  await click(clear);
  assert.equal(cleared, 1);
  await m.unmount();
});

test("a facet alone (a server filter) is a filter that is on, and says nothing about loaded rows", async () => {
  const { ListFilter, listFilter } = await ui();
  const m = await mount(
    h(ListFilter, {
      label: "Filter",
      value: "",
      onChange: () => {},
      filter: listFilter(""),
      noun: NOUN,
      shown: 7,
      total: 7,
      facets: true,
      more: true,
      loadedOnly: false,
      onClear: () => {},
    }),
  );
  const text = m.root.textContent ?? "";
  assert.match(text, /Showing 7 of 7 loaded receipts\./);
  assert.doesNotMatch(text, /searches only/);
  await m.unmount();
});

test("paged list, text filter, nothing found: it says the filter read only the loaded rows and offers Show older", async () => {
  const { ListFilter, listFilter } = await ui();
  let more = 0;
  const m = await mount(
    h(ListFilter, {
      label: "Filter",
      value: "zzz",
      onChange: () => {},
      filter: listFilter("zzz"),
      noun: NOUN,
      shown: 0,
      total: 100,
      more: true,
      onClear: () => {},
      onLoadMore: () => more++,
    }),
  );
  const text = m.root.textContent ?? "";
  assert.match(text, /No loaded receipt matches\./);
  assert.match(text, /The filter searches only the 100 receipts loaded so far\./);
  assert.doesNotMatch(text, /The filter searched all/);
  await click([...m.root.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Show older") as HTMLButtonElement);
  assert.equal(more, 1);
  await m.unmount();
});

test("complete list, nothing found: it says all rows were searched and offers no Show older", async () => {
  const { ListFilter, listFilter } = await ui();
  const m = await mount(
    h(ListFilter, {
      label: "Filter",
      value: "zzz",
      onChange: () => {},
      filter: listFilter("zzz"),
      noun: NOUN,
      shown: 0,
      total: 12,
      onClear: () => {},
      onLoadMore: () => {},
    }),
  );
  assert.match(m.root.textContent ?? "", /No receipt matches\. The filter searched all 12 receipts\./);
  assert.equal([...m.root.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Show older").length, 0);
  await m.unmount();
});

test("hidden held items are announced as an alert", async () => {
  const { ListFilter, listFilter } = await ui();
  const m = await mount(
    h(ListFilter, {
      label: "Filter",
      value: "henry",
      onChange: () => {},
      filter: listFilter("henry"),
      noun: { one: "hold", many: "holds" },
      shown: 1,
      total: 4,
      hidden: 3,
      hiddenNoun: { one: "held approval", many: "held approvals" },
      onClear: () => {},
    }),
  );
  const alert = m.root.querySelector('[role="alert"]');
  assert.match(alert?.textContent ?? "", /3 held approvals are hidden by the filter\./);
  await m.unmount();
});

test("typing in the field calls onChange; a bad regex falls back to plain text and says so", async () => {
  const { ListFilter, listFilter } = await ui();
  const seen: string[] = [];
  const m = await mount(
    h(ListFilter, {
      label: "Filter",
      value: "(",
      onChange: (v: string) => seen.push(v),
      filter: listFilter("("),
      noun: NOUN,
      shown: 0,
      total: 3,
      onClear: () => {},
    }),
  );
  assert.match(m.root.textContent ?? "", /Not a valid regex\. Matching as plain text\./);
  await type(m.root.querySelector("input") as HTMLInputElement, "ab");
  assert.deepEqual(seen, ["ab"]);
  assert.equal(listFilter("^a").test("abc"), true);
  assert.equal(listFilter("^a").test("bac"), false);
  await m.unmount();
});

test("while rows load for a new server filter the bar says Loading and does not claim nothing was found", async () => {
  const { ListFilter, listFilter } = await ui();
  const m = await mount(
    h(ListFilter, {
      label: "Filter",
      value: "",
      onChange: () => {},
      filter: listFilter(""),
      noun: NOUN,
      shown: 0,
      total: 0,
      facets: true,
      busy: true,
      onClear: () => {},
    }),
  );
  const text = m.root.textContent ?? "";
  assert.match(text, /Loading\./);
  assert.doesNotMatch(text, /No receipt matches/);
  await m.unmount();
});

test("a paged filter with matches keeps Show older beside the count; a cut list without it says the list is cut", async () => {
  const { ListFilter, listFilter } = await ui();
  let more = 0;
  const props = { label: "Filter", value: "a", onChange: () => {}, filter: listFilter("a"), noun: NOUN, shown: 3, total: 100, more: true, onClear: () => {} };
  const m = await mount(h(ListFilter, { ...props, onLoadMore: () => more++ }));
  assert.match(m.root.textContent ?? "", /Showing 3 of 100 loaded receipts\./);
  await click([...m.root.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Show older") as HTMLButtonElement);
  assert.equal(more, 1);
  await m.unmount();
  const cut = await mount(h(ListFilter, props));
  const text = cut.root.textContent ?? "";
  assert.match(text, /this page holds\. The list is cut there/);
  assert.equal([...cut.root.querySelectorAll("button")].filter((b) => b.textContent?.trim() === "Show older").length, 0);
  await cut.unmount();
  const none = await mount(h(ListFilter, { ...props, shown: 0 }));
  assert.match(none.root.textContent ?? "", /No loaded receipt matches\. The filter searches only the 100 receipts this page holds\./);
  await none.unmount();
});
