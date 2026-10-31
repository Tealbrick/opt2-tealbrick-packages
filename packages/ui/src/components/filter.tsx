import { type ReactNode, useCallback, useState } from "react";
import { Button } from "./button.tsx";
import { Field, TextInput } from "./field.tsx";
import { Notice } from "./surfaces.tsx";

/* ListFilter (C382 batch 4): ONE filter for the long lists. The matching (plain text or a regex, with the plain-text
   fallback), the memory per viewer and the field were made for the access editor; they live here and the editor
   imports them. The bar adds what a list needs to stay honest: it always says that a filter is on ("N of M" and Clear),
   it says plainly when the list is paged and the filter reads only the rows loaded so far, and it counts what it hides. */

/**
 * A repeated group after another repeat or a choice, such as (a+)+ or (a|aa)+: its run time can explode on one name, and
 * the filter is remembered, so the page would freeze at every load. A rule of thumb, wide on purpose: such a filter runs as plain text.
 */
const slowRegex = (q: string) => [...q.matchAll(/\)\s*[+*{]/gu)].some((m) => /[+*{|]/u.test(q.slice(0, m.index)));
export const ACCESS_FILTER_MAX = 200;

/** A filter: a case-insensitive regex; `invalid` when it cannot be used as one, and then it matches as plain text. */
export function accessFilter(query: string): { test: (text: string) => boolean; invalid: boolean; slow?: boolean } {
  const q = query.trim();
  if (!q) return { test: () => true, invalid: false };
  const plain = (text: string) => text.toLowerCase().includes(q.toLowerCase());
  if (slowRegex(q)) return { test: plain, invalid: true, slow: true };
  try {
    const re = new RegExp(q, "i");
    return { test: (text) => re.test(text), invalid: false };
  } catch {
    return { test: plain, invalid: true };
  }
}

/** Browser storage can throw or be empty (private window, blocked site data): a filter is only a convenience. */
export function useAccessFilter(storageKey: string): [string, (value: string) => void] {
  const [value, setValue] = useState(() => {
    try {
      return (globalThis.localStorage?.getItem(storageKey) ?? "").slice(0, ACCESS_FILTER_MAX);
    } catch {
      return "";
    }
  });
  const set = useCallback(
    (next: string) => {
      setValue(next);
      try {
        globalThis.localStorage?.setItem(storageKey, next);
      } catch {
        // the filter stays for this page only
      }
    },
    [storageKey],
  );
  return [value, set];
}

export const count = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

/** The filter field of the kit: plain text or a regex, and it says when a text cannot run as a regex. */
export function AccessFilterField({
  label,
  value,
  onChange,
  placeholder,
  filter,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  filter: { invalid: boolean; slow?: boolean };
}) {
  return (
    <Field
      label={label}
      hint={
        filter.slow
          ? "This regex can freeze the page. Matching as plain text."
          : filter.invalid
            ? "Not a valid regex. Matching as plain text."
            : "Plain text or a regex, such as ^(?!QA)."
      }
    >
      <TextInput
        value={value}
        maxLength={ACCESS_FILTER_MAX}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

/** The same pieces under list names. */
export const listFilter = accessFilter;
export const useListFilter = useAccessFilter;
export const ListFilterField = AccessFilterField;

export type FilterNoun = { one: string; many: string };

const nounOf = (n: number, noun: FilterNoun) => (n === 1 ? noun.one : noun.many);
const num = (n: number) => n.toLocaleString("en");

/** "Showing 4 of 100 loaded receipts." `more`: the list is paged and the server holds more than are loaded. */
export function filterCountText(shown: number, total: number, noun: FilterNoun, more = false): string {
  return `Showing ${num(shown)} of ${num(total)}${more ? " loaded" : ""} ${nounOf(total, noun)}.`;
}

/** The sentence a paged list owes a client-side filter: it reads only what is loaded. */
export function filterPagedText(loaded: number, noun: FilterNoun): string {
  return `The filter searches only the ${num(loaded)} ${nounOf(loaded, noun)} loaded so far. More are not loaded yet, so a match can still be among them.`;
}

/** What to say when the filter leaves nothing. A paged list never says only "nothing": it says what was searched. */
export function filterNothingText(loaded: number, noun: FilterNoun, more: boolean): string {
  if (loaded === 0 && !more) return `No ${noun.one} matches this filter.`;
  return more
    ? `No loaded ${noun.one} matches. ${filterPagedText(loaded, noun)}`
    : `No ${noun.one} matches. The filter searched all ${num(loaded)} ${nounOf(loaded, noun)}.`;
}

/** The warning for items a person may need to act on and the filter hides. */
export function filterHiddenText(hidden: number, noun: FilterNoun): string {
  return `${num(hidden)} ${nounOf(hidden, noun)} ${hidden === 1 ? "is" : "are"} hidden by the filter. Clear the filter to see ${hidden === 1 ? "it" : "them"}.`;
}

export type ListFilterProps = {
  /** the label of the text field */
  label: string;
  value: string;
  onChange: (value: string) => void;
  filter: { invalid: boolean; slow?: boolean };
  placeholder?: string;
  /** what the list holds, such as { one: "receipt", many: "receipts" } */
  noun: FilterNoun;
  /** rows that pass every filter, and rows loaded (before any filter) */
  shown: number;
  total: number;
  /** another filter, such as an agent select, is on */
  facets?: boolean;
  /** the list is paged and the server holds more rows than are loaded */
  more?: boolean;
  /** the text (or a facet) is applied to the loaded rows; false when the server applies every filter in use. Default: the text is not empty. */
  loadedOnly?: boolean;
  /** clears the text and every facet */
  onClear: () => void;
  /** the rows are loading (a new server filter): no count and no "nothing" until they are here */
  busy?: boolean;
  /** the page's own "Show older" action, offered again when nothing matches among the loaded rows */
  onLoadMore?: () => void;
  loadMoreLabel?: string;
  loadingMore?: boolean;
  /** items the filter hides that a person must not miss (held approvals): announced above the list */
  hidden?: number;
  hiddenNoun?: FilterNoun;
  /** the facet controls (selects), shown beside the text field */
  children?: ReactNode;
  /** a list that has nothing to filter yet shows no bar */
  className?: string;
};

/**
 * The bar above a long list. It shows the text field (plain text or a regex) and the facets. While any filter is on it
 * shows "Showing N of M" and a Clear button; a paged list adds that the filter reads only the loaded rows; no match says
 * what was searched, with the page's own "Show older" next to it; hidden items that wait for a person are announced.
 */
export function ListFilter({
  label,
  value,
  onChange,
  filter,
  placeholder = "Name, or a regex",
  noun,
  shown,
  total,
  facets = false,
  more = false,
  loadedOnly,
  onClear,
  onLoadMore,
  loadMoreLabel = "Show older",
  loadingMore = false,
  busy = false,
  hidden = 0,
  hiddenNoun,
  children,
  className,
}: ListFilterProps) {
  const text = value.trim() !== "";
  const on = text || facets;
  const partial = more && (loadedOnly ?? text);
  return (
    <div className={`tb-listfilter${className ? ` ${className}` : ""}`}>
      <div className="tb-listfilter-fields">
        <ListFilterField label={label} value={value} onChange={onChange} placeholder={placeholder} filter={filter} />
        {children}
      </div>
      <div className="tb-listfilter-status" role="status" aria-live="polite">
        {busy ? (
          <span>Loading.</span>
        ) : on ? (
          <>
            <span>{filterCountText(shown, total, noun, more)}</span>
            {partial ? <span>{filterPagedText(total, noun)}</span> : null}
            <Button onClick={onClear}>Clear filter</Button>
          </>
        ) : null}
      </div>
      {on && !busy && shown === 0 ? (
        <Notice tone="needs-you">
          <span className="tb-row">
            <span>{filterNothingText(total, noun, partial)}</span>
            {partial && onLoadMore ? (
              <Button onClick={onLoadMore} disabled={loadingMore}>
                {loadMoreLabel}
              </Button>
            ) : null}
          </span>
        </Notice>
      ) : null}
      {hidden > 0 ? (
        <Notice tone="needs-you" role="alert">
          {filterHiddenText(hidden, hiddenNoun ?? noun)}
        </Notice>
      ) : null}
    </div>
  );
}
