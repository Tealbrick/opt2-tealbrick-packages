import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "./button.tsx";
import { AccessFilterField, accessFilter, count, useAccessFilter } from "./filter.tsx";
import { cx } from "./ink.tsx";
import { Select } from "./select.tsx";
import { Notice } from "./surfaces.tsx";

/* AccessEditor (C382): who may do what, without a grid. The opening view shows each default once and then only what
   differs from it, with a one-line add. The bulk editor picks agents, then scopes, then one level. No dropdown per
   agent and scope anywhere: the page stays usable at 32 agents x 192 scopes. The kit calls the app's own per-cell
   write and never knows the app's server. */

/** A level the app declares. `null` means no access in every prop that takes a level. */
export type AccessLevelId = string | null;
export type AccessOption = {
  id: string;
  label: string;
  /** one line beside the button, what this value does */
  hint?: string;
  /** A level that always asks first, whatever the count: the sentence names the count and what the level allows. No sentence: the normal rule. */
  ask?: (changes: readonly AccessChange[]) => string | null;
};
export type AccessAgent = { id: string; name: string /** short words after the name, e.g. "paused" */; note?: string };
export type AccessScope = { id: string; name: string };
/** A decision the app offers on one cell, e.g. Allow on what an update adds. It is shown also when the level equals the default. */
export type AccessAction = { text: string; label: string; ariaLabel?: string; run: () => Promise<unknown> };
/** One stored row. A pair without a row has no access. */
export type AccessCell = { agent: string; scope: string; level: string; note?: string; action?: AccessAction };
/** One line of "The default for everyone". */
export type AccessDefaultLine = { what: string; level: AccessLevelId };
export type AccessRow = {
  agent: AccessAgent;
  scope: AccessScope;
  level: AccessLevelId;
  defaultLevel: AccessLevelId;
  differs: boolean;
  cell: AccessCell | null;
};

const key = (agent: string, scope: string) => `${agent}\n${scope}`;

/** The cells by agent and scope. */
export function accessIndex(cells: readonly AccessCell[]): Map<string, AccessCell> {
  return new Map(cells.map((c) => [key(c.agent, c.scope), c]));
}

/**
 * What the opening view lists. A difference is computed by value: the stored level against what the default rule gives
 * for that agent and scope. Who wrote the row plays no part, so rows without a writer work and an owner row equal to the
 * default is not listed. A cell with an action is listed also at its default level: the owner must be able to see it.
 */
export function accessDifferences(
  agents: readonly AccessAgent[],
  scopes: readonly AccessScope[],
  cells: readonly AccessCell[],
  defaultOf: (agent: string, scope: string) => AccessLevelId,
): AccessRow[] {
  const index = accessIndex(cells);
  const rows: AccessRow[] = [];
  for (const agent of agents) {
    for (const scope of scopes) {
      const cell = index.get(key(agent.id, scope.id)) ?? null;
      const level = cell?.level ?? null;
      const defaultLevel = defaultOf(agent.id, scope.id);
      const differs = level !== defaultLevel;
      if (differs || cell?.action) rows.push({ agent, scope, level, defaultLevel, differs, cell });
    }
  }
  return rows;
}

export type AccessChange = { agent: string; scope: string; level: AccessLevelId };
/** `notTried`: the writes stopped before this one, so it was not sent. */
export type AccessFailure = AccessChange & { reason: string; notTried?: boolean };
const ACCESS_WRITE_LIMIT = 4;

/** The writes of one click. A pair already at the level is skipped: a write would also change who owns that row. */
export function accessChanges(agents: readonly string[], scopes: readonly string[], level: AccessLevelId, cells: readonly AccessCell[]): AccessChange[] {
  const index = accessIndex(cells);
  const out: AccessChange[] = [];
  for (const agent of agents) for (const scope of scopes) if ((index.get(key(agent, scope))?.level ?? null) !== level) out.push({ agent, scope, level });
  return out;
}

/** The sign-in ended: every write after this one fails the same way, so the rest is not tried. An app with other such codes passes its own test. */
export function accessSessionEnded(error: unknown): boolean {
  const e = (error ?? {}) as { code?: unknown; httpStatus?: unknown };
  return (
    e.httpStatus === 401 ||
    e.code === "session_required" ||
    e.code === "csrf_invalid" ||
    e.code === "ticket_invalid" ||
    e.code === "ticket_used" ||
    e.code === "unauthenticated"
  );
}

/**
 * Runs the writes with limited concurrency, and returns every write that failed. One failure stops no other write, except
 * a failure of the sign-in: then the rest comes back as `notTried` and is not sent. A write in progress still finishes.
 */
export async function accessWriteAll(
  changes: readonly AccessChange[],
  write: (change: AccessChange) => Promise<unknown>,
  reasonOf: (error: unknown) => string,
  progress?: (done: number) => void,
  limit: number = ACCESS_WRITE_LIMIT,
  stopOn: (error: unknown) => boolean = accessSessionEnded,
): Promise<AccessFailure[]> {
  const failed: AccessFailure[] = [];
  let next = 0;
  let done = 0;
  let stop: string | null = null;
  const worker = async () => {
    while (next < changes.length && stop === null) {
      const change = changes[next++] as AccessChange;
      try {
        await write(change);
      } catch (error) {
        const reason = reasonOf(error);
        failed.push({ ...change, reason });
        if (stopOn(error)) stop = reason;
      }
      progress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, changes.length) }, worker));
  if (stop !== null) for (const change of changes.slice(next)) failed.push({ ...change, reason: stop, notTried: true });
  return failed;
}

/** A write the read-back does not confirm is no success: the page must not say it was set. */
export function accessUnconfirmed(changes: readonly AccessChange[], failed: readonly AccessFailure[], cells: readonly AccessCell[]): AccessFailure[] {
  const index = accessIndex(cells);
  const gone = new Set(failed.map((f) => key(f.agent, f.scope)));
  return changes
    .filter((c) => !gone.has(key(c.agent, c.scope)) && (index.get(key(c.agent, c.scope))?.level ?? null) !== c.level)
    .map((c) => ({ ...c, reason: "The app reports another level after this change." }));
}

/** A multi-select list: one Tab stop, arrows move, Space or Enter toggles. A Tab per row would mean 192 Tabs to reach the levels. */
function PickList({
  label,
  items,
  picked,
  onToggle,
}: {
  label: string;
  items: readonly { id: string; name: string; meta: string }[];
  picked: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLDivElement>());
  const current = activeId !== null && items.some((i) => i.id === activeId) ? activeId : (items[0]?.id ?? null);
  const move = (e: KeyboardEvent, id: string) => {
    const at = items.findIndex((i) => i.id === id);
    const to = e.key === "ArrowDown" ? at + 1 : e.key === "ArrowUp" ? at - 1 : e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -2;
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      onToggle(id);
    } else if (to !== -2) {
      e.preventDefault();
      const target = items[Math.max(0, Math.min(items.length - 1, to))];
      if (target) {
        setActiveId(target.id);
        refs.current.get(target.id)?.focus();
      }
    }
  };
  if (items.length === 0) return <p className="tb-access-none">Nothing matches.</p>;
  return (
    <div className="tb-access-list" role="listbox" aria-multiselectable="true" aria-label={label}>
      {items.map((item) => (
        <div
          key={item.id}
          ref={(el) => {
            if (el) refs.current.set(item.id, el);
            else refs.current.delete(item.id);
          }}
          className="tb-access-pick"
          role="option"
          tabIndex={item.id === current ? 0 : -1}
          aria-selected={picked.has(item.id)}
          onClick={() => {
            setActiveId(item.id);
            onToggle(item.id);
          }}
          onKeyDown={(e) => move(e, item.id)}
        >
          <span className="tb-access-pick-name">{item.name}</span>
          {item.meta ? <span className="tb-access-pick-meta">{item.meta}</span> : null}
        </div>
      ))}
    </div>
  );
}

export type AccessPickItem = { id: string; name: string; meta: string };

/** A column of the bulk editor: the filter, Select all shown, Clear, and a multi-select list with one Tab stop. */
export function AccessPickColumn({
  label,
  step,
  items,
  total,
  picked,
  onToggle,
  query,
  onQuery,
  filter,
  onSelectShown,
  onClear,
  tools,
  note,
}: {
  label: string;
  /** The text above the filter; the count of what shows is added. */
  step: string;
  items: readonly AccessPickItem[];
  total: number;
  picked: ReadonlySet<string>;
  onToggle: (id: string) => void;
  query: string;
  onQuery: (value: string) => void;
  filter: { invalid: boolean; slow?: boolean };
  onSelectShown: () => void;
  onClear: () => void;
  /** Buttons before Select all shown. */
  tools?: ReactNode;
  /** Under the buttons: what the list leaves out, or a setting that shows but cannot change. */
  note?: ReactNode;
}) {
  return (
    <section className="tb-access-column" aria-label={label}>
      <div className="tb-access-column-head">
        <AccessFilterField label={`${step} (${items.length} of ${total})`} value={query} onChange={onQuery} placeholder="Name, or a regex" filter={filter} />
        <div className="tb-access-tools">
          {tools}
          <Button onClick={onSelectShown}>Select all shown</Button>
          <Button onClick={onClear}>Clear</Button>
        </div>
        {note}
      </div>
      <PickList label={label} items={items} picked={picked} onToggle={onToggle} />
    </section>
  );
}

/** The state of one such column. Duplicate names stay apart. A pick that left the list leaves the picks. A filter hides a pick, and `hidden` counts it. */
export function useAccessPicks<T extends { id: string; name: string }>(list: readonly T[], storageKey: string, initial?: readonly string[]) {
  const items = useMemo(() => apart(list), [list]);
  const [query, setQuery] = useAccessFilter(storageKey);
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(initial));
  const filter = accessFilter(query);
  const shown = items.filter((i) => filter.test(i.name));
  const ids = useMemo(() => items.filter((i) => picked.has(i.id)).map((i) => i.id), [items, picked]);
  const hidden = ids.filter((id) => !shown.some((i) => i.id === id)).length;
  return {
    items,
    query,
    setQuery,
    filter,
    shown,
    picked,
    ids,
    hidden,
    toggle: (id: string) =>
      setPicked((s) => {
        const next = new Set(s);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    selectShown: () => setPicked((s) => new Set([...s, ...shown.map((i) => i.id)])),
    clear: () => setPicked(new Set()),
  };
}

/** Note and action of one cell. A failed action says so and the list is read again, because the offer may have changed. */
function CellExtra({
  cell,
  who,
  explain,
  reload,
}: {
  cell: AccessCell | null;
  who: string;
  explain: (error: unknown) => string;
  reload: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!cell?.note && !cell?.action) return null;
  const { action, note } = cell;
  const run = async () => {
    if (!action) return;
    setBusy(true);
    setError(null);
    try {
      await action.run();
    } catch (e) {
      setError(`${who}: ${explain(e)}`);
    }
    try {
      await reload();
    } catch (e) {
      setError(`${who}: ${explain(e)}`);
    }
    setBusy(false);
  };
  return (
    <div className="tb-access-extra">
      {action ? (
        <div className="tb-access-offer">
          <span>{action.text}</span>
          <Button disabled={busy} aria-label={action.ariaLabel} onClick={() => void run()}>
            {action.label}
          </Button>
        </div>
      ) : null}
      {note ? <p className="tb-access-note">{note}</p> : null}
      {error ? (
        <Notice tone="needs-you" role="alert">
          {error}
        </Notice>
      ) : null}
    </div>
  );
}

export type AccessLogEntry = { id: number; text: string; failures: { who: string; reason: string }[]; notTried: number };
type LogEntry = AccessLogEntry;

/** A page's own words where the default words say something else. */
export type AccessWords = {
  /** The people picked in the first column, "agent" / "agents" when left out. */
  agent?: { one: string; many: string };
  /** What one write sets, "permission" / "permissions" when left out. */
  unit?: { one: string; many: string };
  /** The heading of the column with the levels, "Set access" when left out. */
  set?: string;
  /** Under the log while it is empty. */
  start?: string;
  /** The opening view: heading of the list, its text while empty, and the button that goes back to the default. */
  differHead?: string;
  differEmpty?: string;
  back?: string;
  /** What the picks will do, after their names: "This sets 3 permissions." when left out. */
  sentence?: (n: number) => string;
  /** The first line of the opening view. */
  lede?: (total: number, differ: number) => string;
  /** The question above the confirmation limit, and the line when nothing has to change. */
  ask?: (n: number, level: string) => string;
  nothing?: (n: number, level: string) => string;
};

type Word = { one: string; many: string };

type WriteProps = {
  agents: readonly AccessAgent[];
  /** The app's levels in their order, from tealbrick.manifest.json. No access is added by the kit. */
  levels: readonly AccessOption[];
  noneLabel?: string;
  /** False when a page must not offer "no access" in bulk: then the level `null` has no button. */
  allowNone?: boolean;
  cells: readonly AccessCell[];
  /** The app's existing per-cell write. */
  write?: (change: AccessChange) => Promise<unknown>;
  /** For an op that replaces a whole list: ONE call for the changes of one click. It wins over `write`, and it gets no limit, because there is one call. */
  writeMany?: (changes: readonly AccessChange[]) => Promise<unknown>;
  /** Reads the rows again and returns them. */
  reload: () => Promise<readonly AccessCell[]>;
  explain: (error: unknown) => string;
  /** Prefix of what this browser remembers, unique per app. */
  storageKey: string;
  headingLevel?: 2 | 3;
  words?: AccessWords;
};

export type AccessEditorProps = WriteProps & {
  scopes: readonly AccessScope[];
  /** "project" / "projects" */
  scopeWord: { one: string; many: string };
  /** The defaults, shown read only. */
  defaults: readonly AccessDefaultLine[];
  /** What the default rule gives this agent on this scope. */
  defaultOf: (agent: string, scope: string) => AccessLevelId;
  /** The page is about one scope, the only one in `scopes`: no scope column, no scope field, no "to" in the rows. */
  fixedScope?: boolean;
};

/** The bulk editor alone, for one scope: pick many, then one value. */
export type AccessBulkProps = WriteProps & {
  /** What the page sets, such as one role or one setting. Every cell and change carries its id. */
  scope: AccessScope;
  title: string;
  backLabel: string;
  onBack: () => void;
  /** Above the level buttons: a form or a warning the choice needs. */
  panel?: ReactNode;
  /** Why no level can be used yet, such as a missing field. */
  blocked?: string | null;
  /** The word after a name in the first column for its current level, the level name when left out. */
  nowText?: (level: AccessLevelId) => string;
};

const CONFIRM_ABOVE = 25;
const PAGE = 50;
const NO_WORDS: AccessWords = {};
const AGENT_WORD: Word = { one: "agent", many: "agents" };
const UNIT_WORD: Word = { one: "permission", many: "permissions" };

/** Duplicate names stay apart: "Henry work" and "Henry work (2)". */
function apart<T extends { id: string; name: string }>(list: readonly T[]): T[] {
  const seen = new Map<string, number>();
  return list.map((item) => {
    const n = (seen.get(item.name) ?? 0) + 1;
    seen.set(item.name, n);
    return n === 1 ? item : { ...item, name: `${item.name} (${n})` };
  });
}

/** Writes, reads back, says what really happened, and keeps the log of this session. */
function useAccessWrites(
  agents: readonly AccessAgent[],
  scopes: readonly AccessScope[],
  fixedScope: boolean,
  { write, writeMany, reload, explain }: Pick<WriteProps, "write" | "writeMany" | "reload" | "explain">,
) {
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const agentName = useCallback((id: string) => agents.find((a) => a.id === id)?.name ?? id, [agents]);
  const scopeName = useCallback((id: string) => scopes.find((s) => s.id === id)?.name ?? id, [scopes]);
  const whoOf = useCallback(
    (agent: string, scope: string) => (fixedScope ? agentName(agent) : `${agentName(agent)} to ${scopeName(scope)}`),
    [agentName, scopeName, fixedScope],
  );
  const addLog = useCallback(
    (text: string, failures: AccessFailure[]) => {
      logId.current += 1;
      const entry: LogEntry = {
        id: logId.current,
        text,
        failures: failures.filter((f) => !f.notTried).map((f) => ({ who: whoOf(f.agent, f.scope), reason: f.reason })),
        notTried: failures.filter((f) => f.notTried).length,
      };
      setLog((l) => [entry, ...l]);
    },
    [whoOf],
  );
  const apply = useCallback(
    async (changes: AccessChange[], progress?: (done: number) => void): Promise<AccessFailure[]> => {
      let failed: AccessFailure[] = [];
      if (writeMany) {
        try {
          await writeMany(changes);
        } catch (e) {
          const reason = explain(e);
          failed = changes.map((c) => ({ ...c, reason }));
        }
        progress?.(changes.length);
      } else if (write) failed = await accessWriteAll(changes, write, explain, progress);
      else failed = changes.map((c) => ({ ...c, reason: "This page cannot change this." }));
      let fresh: readonly AccessCell[] | null = null;
      try {
        fresh = await reload();
      } catch (e) {
        const reason = `The change could not be checked: ${explain(e)}`;
        const seen = new Set(failed.map((f) => key(f.agent, f.scope)));
        return [...failed, ...changes.filter((c) => !seen.has(key(c.agent, c.scope))).map((c) => ({ ...c, reason }))];
      }
      return [...failed, ...accessUnconfirmed(changes, failed, fresh)];
    },
    [write, writeMany, explain, reload],
  );
  return { log, addLog, apply, whoOf };
}

/** Agents and scopes: the defaults once, then only what differs; the bulk editor opens from Add. */
export function AccessEditor(props: AccessEditorProps) {
  const {
    levels,
    noneLabel = "No access",
    allowNone = true,
    scopeWord,
    cells,
    defaultOf,
    explain,
    reload,
    defaults,
    storageKey,
    headingLevel = 2,
    fixedScope = false,
    words = NO_WORDS,
  } = props;
  const agents = useMemo(() => apart(props.agents), [props.agents]);
  const scopes = useMemo(() => apart(props.scopes), [props.scopes]);
  const [view, setView] = useState<"list" | "many">("list");
  const { log, addLog, apply, whoOf } = useAccessWrites(agents, scopes, fixedScope, props);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const levelName = useCallback(
    (level: AccessLevelId) => (level === null ? noneLabel : (levels.find((l) => l.id === level)?.label ?? level)),
    [levels, noneLabel],
  );
  const rows = useMemo(() => accessDifferences(agents, scopes, cells, defaultOf), [agents, scopes, cells, defaultOf]);

  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [view]);

  const shared: Shared = {
    agents,
    scopes,
    levels,
    allowNone,
    fixedScope,
    words,
    levelName,
    scopeWord,
    cells,
    apply,
    addLog,
    log,
    whoOf,
    explain,
    reload,
    storageKey,
    Heading,
    heading,
  };
  if (view === "many") return <AccessPicker {...shared} title="Add or change many" backLabel="Back to the list" onBack={() => setView("list")} />;
  return <AccessList {...shared} noneLabel={noneLabel} defaults={defaults} rows={rows} onMany={() => setView("many")} />;
}

/** The bulk editor alone: the first column picks many, the last gives one click per value, and the log says what happened. */
export function AccessBulk(props: AccessBulkProps) {
  const {
    levels,
    noneLabel = "No access",
    allowNone = true,
    scope,
    cells,
    explain,
    reload,
    storageKey,
    headingLevel = 2,
    words = NO_WORDS,
    title,
    backLabel,
    onBack,
    panel,
    blocked,
    nowText,
  } = props;
  const agents = useMemo(() => apart(props.agents), [props.agents]);
  const scopes = useMemo(() => [scope], [scope]);
  const { log, addLog, apply, whoOf } = useAccessWrites(agents, scopes, true, props);
  const levelName = useCallback(
    (level: AccessLevelId) => (level === null ? noneLabel : (levels.find((l) => l.id === level)?.label ?? level)),
    [levels, noneLabel],
  );
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <AccessPicker
      agents={agents}
      scopes={scopes}
      levels={levels}
      allowNone={allowNone}
      fixedScope
      words={words}
      levelName={levelName}
      scopeWord={{ one: scope.name, many: scope.name }}
      cells={cells}
      apply={apply}
      addLog={addLog}
      log={log}
      whoOf={whoOf}
      explain={explain}
      reload={reload}
      storageKey={storageKey}
      Heading={headingLevel === 3 ? "h3" : "h2"}
      heading={heading}
      title={title}
      backLabel={backLabel}
      onBack={onBack}
      panel={panel}
      blocked={blocked}
      nowText={nowText}
    />
  );
}

type Shared = {
  agents: readonly AccessAgent[];
  scopes: readonly AccessScope[];
  levels: readonly AccessOption[];
  allowNone: boolean;
  fixedScope: boolean;
  words: AccessWords;
  levelName: (level: AccessLevelId) => string;
  scopeWord: { one: string; many: string };
  cells: readonly AccessCell[];
  apply: (changes: AccessChange[], progress?: (done: number) => void) => Promise<AccessFailure[]>;
  addLog: (text: string, failures: AccessFailure[]) => void;
  log: readonly LogEntry[];
  whoOf: (agent: string, scope: string) => string;
  explain: (error: unknown) => string;
  reload: () => Promise<readonly AccessCell[]>;
  storageKey: string;
  Heading: "h2" | "h3";
  heading: { current: HTMLHeadingElement | null };
};

const NONE = "__none";
const capital = (s: string) => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** A failure log has an end: after a bad write to 192 scopes the page stays readable, and it says how many it does not show. */
export const ACCESS_FAILURES_SHOWN = 20;

export function AccessSessionLog({ log, empty }: { log: readonly AccessLogEntry[]; empty?: string }) {
  return (
    <>
      <p className="tb-label">{`Changes this session (${log.length})`}</p>
      {log.length === 0 && empty ? <p className="tb-access-note">{empty}</p> : null}
      {log.map((entry) => (
        <div className="tb-access-log" key={entry.id}>
          <span>{entry.text}</span>
          {entry.failures.length > 0 || entry.notTried > 0 ? (
            <ul className="tb-access-failures">
              {entry.failures.slice(0, ACCESS_FAILURES_SHOWN).map((f) => (
                <li key={f.who}>{`Failed: ${f.who}. ${f.reason}`}</li>
              ))}
              {entry.failures.length > ACCESS_FAILURES_SHOWN ? (
                <li>{`And ${(entry.failures.length - ACCESS_FAILURES_SHOWN).toLocaleString("en")} more failed.`}</li>
              ) : null}
              {entry.notTried > 0 ? <li>{`${entry.notTried.toLocaleString("en")} not tried: the writes stopped.`}</li> : null}
            </ul>
          ) : null}
        </div>
      ))}
    </>
  );
}

function AccessList({
  agents,
  scopes,
  levels,
  allowNone,
  fixedScope,
  words,
  noneLabel,
  levelName,
  scopeWord,
  defaults,
  rows,
  cells,
  apply,
  addLog,
  log,
  whoOf,
  explain,
  reload,
  storageKey,
  Heading,
  heading,
  onMany,
}: Shared & { noneLabel: string; defaults: readonly AccessDefaultLine[]; rows: AccessRow[]; onMany: () => void }) {
  const [query, setQuery] = useAccessFilter(`${storageKey}:rows`);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [addAgent, setAddAgent] = useState("");
  const [addScope, setAddScope] = useState("");
  const [addLevel, setAddLevel] = useState("");
  const agentWord = words.agent ?? AGENT_WORD;
  const onlyScope = fixedScope ? scopes[0]?.id : undefined;
  const scopeForAdd = onlyScope ?? addScope;
  const filter = accessFilter(query);
  const shown = rows.filter((r) => filter.test(whoOf(r.agent.id, r.scope.id)));
  const combos = agents.length * scopes.length;
  const different = rows.filter((r) => r.differs).length;
  const waiting = rows.filter((r) => r.cell?.action).length;

  const listHead = useRef<HTMLHeadingElement>(null);
  const change = async (agent: string, scope: string, level: AccessLevelId, who: string, done: string) => {
    setBusy(key(agent, scope));
    setMessage(null);
    const failures = await apply([{ agent, scope, level }]);
    const failure = failures[0];
    if (failure) setMessage({ text: `${who}: ${failure.reason}`, failed: true });
    else setMessage({ text: done, failed: false });
    addLog(`${who}: ${levelName(level)}. ${failure ? "Failed." : "Set."}`, failures);
    setBusy(null);
    // the row and its button may be gone: keep the keyboard in the list
    listHead.current?.focus();
    return !failure;
  };
  const add = () => {
    const level = addLevel === NONE ? null : addLevel;
    const agent = agents.find((a) => a.id === addAgent);
    const scope = scopes.find((s) => s.id === scopeForAdd);
    if (!agent || !scope || !addLevel) return;
    const who = whoOf(agent.id, scope.id);
    if (accessChanges([agent.id], [scope.id], level, cells).length === 0) {
      setMessage({ text: `${who} already has ${levelName(level)}.`, failed: false });
      return;
    }
    void change(agent.id, scope.id, level, who, `${who}: ${levelName(level)}.`).then((ok) => {
      if (!ok) return;
      if (fixedScope) setAddAgent("");
      setAddScope("");
      setAddLevel("");
    });
  };
  const levelOptions = [...(allowNone ? [{ value: NONE, label: noneLabel }] : []), ...levels.map((l) => ({ value: l.id, label: l.label }))];
  const backLabel = words.back ?? "Back to default";
  return (
    <div className="tb-access">
      <p className="tb-access-lede">
        {words.lede
          ? words.lede(agents.length, different)
          : `${count(agents.length, agentWord.one, agentWord.many)} and ${count(scopes.length, scopeWord.one, scopeWord.many)}: ${count(combos, "combination", "combinations")}. ${different === 0 ? "None differs from the default." : `${different.toLocaleString("en")} ${different === 1 ? "differs" : "differ"} from the default.`}${waiting > 0 ? ` ${waiting.toLocaleString("en")} waiting for your decision.` : ""}`}
      </p>
      <section className="tb-stack tb-access-part">
        <Heading ref={heading} tabIndex={-1} className="tb-access-head">
          The default for everyone
        </Heading>
        <ul className="tb-access-rows tb-access-defaults">
          {defaults.map((d) => (
            <li key={d.what} className="tb-access-row">
              <span className="tb-access-what">{d.what}</span>
              <span className="tb-access-level">{levelName(d.level)}</span>
            </li>
          ))}
        </ul>
      </section>
      <section className="tb-stack tb-access-part">
        <Heading ref={listHead} tabIndex={-1} className="tb-access-head">
          {words.differHead ?? "What differs from the default"}
        </Heading>
        {rows.length > 0 ? (
          <AccessFilterField label="Filter this list" value={query} onChange={setQuery} placeholder="Name, or a regex" filter={filter} />
        ) : null}
        {message ? (
          <Notice tone={message.failed ? "needs-you" : undefined} role={message.failed ? "alert" : "status"}>
            {message.text}
          </Notice>
        ) : null}
        <div className="tb-access-rows">
          {rows.length === 0 ? <p className="tb-access-empty">{words.differEmpty ?? "Every agent has the default."}</p> : null}
          {rows.length > 0 && shown.length === 0 ? (
            <div className="tb-access-empty tb-row">
              <span>{`The filter hides all ${count(rows.length, "row", "rows")}.`}</span>
              <Button onClick={() => setQuery("")}>Clear the filter</Button>
            </div>
          ) : null}
          <ul className="tb-access-list-plain">
            {shown.slice(0, limit).map((r) => {
              const who = whoOf(r.agent.id, r.scope.id);
              return (
                <li key={key(r.agent.id, r.scope.id)} className="tb-access-row">
                  <span className="tb-access-who">
                    {r.agent.name}
                    {r.agent.note ? <span className="tb-access-pick-meta">{` ${r.agent.note}`}</span> : null}
                  </span>
                  {fixedScope ? null : <span className="tb-access-to">to</span>}
                  {fixedScope ? null : <span className="tb-access-what">{r.scope.name}</span>}
                  <span className="tb-access-level">{levelName(r.level)}</span>
                  {r.differs ? (
                    <Button
                      disabled={busy !== null}
                      aria-label={`${backLabel}: ${who}`}
                      onClick={() =>
                        void change(
                          r.agent.id,
                          r.scope.id,
                          r.defaultLevel,
                          who,
                          fixedScope ? `${who}: ${levelName(r.defaultLevel)}.` : `${who} is back to the default, ${levelName(r.defaultLevel)}.`,
                        )
                      }
                    >
                      {backLabel}
                    </Button>
                  ) : null}
                  <CellExtra cell={r.cell} who={who} explain={explain} reload={reload} />
                </li>
              );
            })}
          </ul>
          {shown.length > 0 && shown.length < rows.length && shown.length <= limit ? (
            <p className="tb-access-more">{`The filter shows ${shown.length.toLocaleString("en")} of ${rows.length.toLocaleString("en")}.`}</p>
          ) : null}
          {shown.length > limit ? (
            <div className="tb-access-more">
              <span>{`Showing ${limit} of ${shown.length.toLocaleString("en")}${shown.length < rows.length ? ` that match; ${rows.length.toLocaleString("en")} in all` : ""}.`}</span>
              <Button onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</Button>
            </div>
          ) : null}
          <div className="tb-access-add">
            <span className="tb-label">Add</span>
            <div className="tb-access-add-field">
              <Select
                aria-label={capital(agentWord.one)}
                placeholder={capital(agentWord.one)}
                options={agents.map((a) => ({ value: a.id, label: a.name }))}
                value={addAgent}
                onValueChange={setAddAgent}
              />
            </div>
            {fixedScope ? null : (
              <>
                <span className="tb-access-to">to</span>
                <div className="tb-access-add-field tb-access-add-wide">
                  <Select
                    aria-label={scopeWord.one}
                    placeholder={capital(scopeWord.one)}
                    options={scopes.map((s) => ({ value: s.id, label: s.name }))}
                    value={addScope}
                    onValueChange={setAddScope}
                  />
                </div>
              </>
            )}
            <div className="tb-access-add-field">
              <Select aria-label="Access" placeholder="Access" options={levelOptions} value={addLevel} onValueChange={setAddLevel} />
            </div>
            <Button variant="primary" disabled={busy !== null || !addAgent || !scopeForAdd || !addLevel} onClick={add}>
              Add
            </Button>
            <Button onClick={onMany}>Add or change many</Button>
          </div>
        </div>
        {log.length > 0 ? (
          <div className="tb-access-rows tb-access-log-box">
            <AccessSessionLog log={log} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function names(ids: readonly string[], nameOf: (id: string) => string, one: string, many: string): string {
  if (ids.length === 0) return `no ${many}`;
  if (ids.length <= 2) return ids.map(nameOf).join(" and ");
  return count(ids.length, one, many);
}

const ACTIONS_SHOWN = 20;
/** Above this many values the value column gets its own filter and scrolls, such as the people who can own an agent. */
const LEVELS_FILTER_ABOVE = 8;

function AccessPicker({
  agents,
  scopes,
  levels,
  allowNone,
  fixedScope,
  words,
  levelName,
  scopeWord,
  cells,
  apply,
  addLog,
  log,
  whoOf,
  explain,
  reload,
  storageKey,
  Heading,
  heading,
  title,
  backLabel,
  onBack,
  panel,
  blocked,
  nowText,
}: Shared & { title: string; backLabel: string; onBack: () => void; panel?: ReactNode; blocked?: string | null; nowText?: (level: AccessLevelId) => string }) {
  const [agentQuery, setAgentQuery] = useAccessFilter(`${storageKey}:agents`);
  const [scopeQuery, setScopeQuery] = useAccessFilter(`${storageKey}:scopes`);
  const [levelQuery, setLevelQuery] = useState("");
  const [onlyAccess, setOnlyAccess] = useState(false);
  const [pickedAgents, setPickedAgents] = useState<ReadonlySet<string>>(new Set());
  const [pickedScopes, setPickedScopes] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [asking, setAsking] = useState<{ level: AccessLevelId; changes: AccessChange[]; sentence: string | null } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const titleId = useId();
  const confirmId = useId();
  const levelButtons = useId();
  const levelButtonId = (level: AccessLevelId) => `${levelButtons}-${level ?? NONE}`;
  const focusLevel = (level: AccessLevelId) => requestAnimationFrame(() => document.getElementById(levelButtonId(level))?.focus());
  const agentWord = words.agent ?? AGENT_WORD;
  const unit = words.unit ?? UNIT_WORD;
  const index = useMemo(() => accessIndex(cells), [cells]);
  const levelAt = useCallback((agent: string, scope: string): AccessLevelId => index.get(key(agent, scope))?.level ?? null, [index]);
  const agentFilter = accessFilter(agentQuery);
  const scopeFilter = accessFilter(scopeQuery);
  const levelFilter = accessFilter(levelQuery);
  // Rows that are gone after a reload leave the selection: nothing is written to what the page no longer shows.
  const agentIds = useMemo(() => agents.filter((a) => pickedAgents.has(a.id)).map((a) => a.id), [agents, pickedAgents]);
  const scopeIds = useMemo(
    () => (fixedScope ? scopes.map((s) => s.id) : scopes.filter((s) => pickedScopes.has(s.id)).map((s) => s.id)),
    [fixedScope, scopes, pickedScopes],
  );
  const onlyScope = fixedScope ? scopes[0]?.id : undefined;
  const nameOfAgent = (id: string) => agents.find((a) => a.id === id)?.name ?? id;
  const nameOfScope = (id: string) => scopes.find((s) => s.id === id)?.name ?? id;

  const accessCount = useMemo(() => {
    const scopeSet = new Set(scopes.map((s) => s.id));
    const n = new Map<string, number>();
    for (const c of cells) if (scopeSet.has(c.scope)) n.set(c.agent, (n.get(c.agent) ?? 0) + 1);
    return n;
  }, [cells, scopes]);
  const shownAgents = agents.filter((a) => agentFilter.test(a.name));
  const shownScopes = scopes.filter(
    (s) => scopeFilter.test(s.name) && (!onlyAccess || agentIds.length === 0 || agentIds.some((a) => levelAt(a, s.id) !== null)),
  );
  const nowOf = (scope: string) => {
    if (agentIds.length === 0) return "";
    const seen = new Set(agentIds.map((a) => levelAt(a, scope)));
    return seen.size === 1 ? levelName([...seen][0] ?? null) : "Mixed";
  };
  const toggle = (set: (fn: (s: ReadonlySet<string>) => ReadonlySet<string>) => void) => (id: string) =>
    set((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const ready = agentIds.length > 0 && scopeIds.length > 0;
  const total = agentIds.length * scopeIds.length;
  const hiddenAgents = agentIds.filter((id) => !shownAgents.some((a) => a.id === id)).length;
  const hiddenScopes = fixedScope ? 0 : scopeIds.filter((id) => !shownScopes.some((s) => s.id === id)).length;
  const hidden = hiddenAgents + hiddenScopes;
  const whoSummary = names(agentIds, nameOfAgent, agentWord.one, agentWord.many);
  const summary = fixedScope ? whoSummary : `${whoSummary} to ${names(scopeIds, nameOfScope, scopeWord.one, scopeWord.many)}`;

  const actions = useMemo(() => {
    const out: { cell: AccessCell; who: string }[] = [];
    if (!ready) return out;
    for (const a of agentIds)
      for (const s of scopeIds) {
        const cell = index.get(key(a, s));
        if (cell?.action) out.push({ cell, who: whoOf(a, s) });
      }
    return out;
  }, [ready, agentIds, scopeIds, index, whoOf]);

  const run = async (level: AccessLevelId, changes: AccessChange[]) => {
    setAsking(null);
    setStatus(null);
    const skipped = total - changes.length;
    setRunning({ done: 0, total: changes.length });
    const failures = await apply(changes, (done) => setRunning({ done, total: changes.length }));
    setRunning(null);
    const notTried = failures.filter((f) => f.notTried).length;
    const failed = failures.length - notTried;
    const set = changes.length - failures.length;
    const parts = [
      `${count(set, "set", "set")}`,
      failed ? `${failed} failed` : null,
      notTried ? `${notTried} not tried` : null,
      skipped ? `${skipped} already had it` : null,
    ]
      .filter(Boolean)
      .join(", ");
    addLog(`${summary}: ${levelName(level)}. ${parts}.`, failures);
    const stopped = failures.find((f) => f.notTried);
    setStatus(
      stopped
        ? `Stopped. ${stopped.reason} ${parts}.`
        : failures.length
          ? `${failed} of ${count(changes.length, "change", "changes")} failed. See the list below.`
          : `Done. ${parts}.`,
    );
    focusLevel(level);
  };
  const pick = (level: AccessLevelId) => {
    const changes = accessChanges(agentIds, scopeIds, level, cells);
    if (changes.length === 0) {
      setAsking(null);
      setStatus(
        words.nothing
          ? words.nothing(total, levelName(level))
          : `Nothing to change: ${count(total, `${unit.one} already has`, `${unit.many} already have`)} ${levelName(level)}.`,
      );
    } else {
      const sentence = levels.find((l) => l.id === level)?.ask?.(changes) ?? null;
      if (sentence || changes.length > CONFIRM_ABOVE) setAsking({ level, changes, sentence });
      else void run(level, changes);
    }
  };
  useEffect(() => {
    if (asking) document.getElementById(confirmId)?.focus();
  }, [asking, confirmId]);
  useEffect(() => setAsking(null), [pickedAgents, pickedScopes, cells]);

  const longLevels = levels.length > LEVELS_FILTER_ABOVE;
  const shownLevels = longLevels ? levels.filter((l) => levelFilter.test(l.label)) : levels;
  const withHints = levels.some((l) => l.hint);
  return (
    <div className="tb-access">
      <div className="tb-access-picker-head">
        <Heading ref={heading} tabIndex={-1} className="tb-access-head" id={titleId}>
          {title}
        </Heading>
        <Button disabled={running !== null} onClick={onBack}>
          {backLabel}
        </Button>
      </div>
      <section className={cx("tb-access-columns", fixedScope && "is-fixed")} aria-labelledby={titleId}>
        <AccessPickColumn
          label={capital(agentWord.many)}
          step={`1. Which ${agentWord.many}`}
          total={agents.length}
          items={shownAgents.map((a) => ({
            id: a.id,
            name: a.name,
            meta: [
              a.note,
              onlyScope !== undefined ? (nowText ?? levelName)(levelAt(a.id, onlyScope)) : count(accessCount.get(a.id) ?? 0, scopeWord.one, scopeWord.many),
            ]
              .filter(Boolean)
              .join(", "),
          }))}
          picked={pickedAgents}
          onToggle={toggle(setPickedAgents)}
          query={agentQuery}
          onQuery={setAgentQuery}
          filter={agentFilter}
          onSelectShown={() => setPickedAgents((s) => new Set([...s, ...shownAgents.map((a) => a.id)]))}
          onClear={() => setPickedAgents(new Set())}
        />
        {fixedScope ? null : (
          <AccessPickColumn
            label={scopeWord.many}
            step={`2. To which ${scopeWord.many}`}
            total={scopes.length}
            items={shownScopes.map((s) => ({ id: s.id, name: s.name, meta: nowOf(s.id) }))}
            picked={pickedScopes}
            onToggle={toggle(setPickedScopes)}
            query={scopeQuery}
            onQuery={setScopeQuery}
            filter={scopeFilter}
            onSelectShown={() => setPickedScopes((s) => new Set([...s, ...shownScopes.map((x) => x.id)]))}
            onClear={() => setPickedScopes(new Set())}
            tools={
              <Button aria-pressed={onlyAccess} className={cx(onlyAccess && "is-on")} onClick={() => setOnlyAccess((v) => !v)}>
                Only with access
              </Button>
            }
          />
        )}
        <section className="tb-access-column" aria-label={words.set ?? "Access"}>
          <div className="tb-access-column-head">
            <p className="tb-label tb-access-step">{`${fixedScope ? 2 : 3}. ${words.set ?? "Set access"}`}</p>
            {panel}
            <p className="tb-access-sentence">
              {ready
                ? `${summary}. ${words.sentence ? words.sentence(total) : `This sets ${count(total, unit.one, unit.many)}.`}`
                : fixedScope
                  ? `Pick at least one ${agentWord.one}.`
                  : `Pick at least one ${agentWord.one} and one ${scopeWord.one}.`}
            </p>
            {ready && hidden > 0 ? (
              <p className="tb-access-note">{`${count(hidden, "pick is", "picks are")} hidden by a filter, and ${hidden === 1 ? "it counts" : "they count"} too.`}</p>
            ) : null}
            {blocked ? <p className="tb-access-note">{blocked}</p> : null}
            {longLevels ? (
              <AccessFilterField
                label={`Filter these (${shownLevels.length} of ${levels.length})`}
                value={levelQuery}
                onChange={setLevelQuery}
                placeholder="Name, or a regex"
                filter={levelFilter}
              />
            ) : null}
            <div className={cx("tb-access-levels", longLevels && "is-long", withHints && "has-hints")}>
              {allowNone ? (
                <Button id={levelButtonId(null)} disabled={!ready || running !== null || asking !== null || !!blocked} onClick={() => pick(null)}>
                  {levelName(null)}
                </Button>
              ) : null}
              {shownLevels.map((l) => (
                <div className="tb-access-level-choice" key={l.id}>
                  <Button id={levelButtonId(l.id)} disabled={!ready || running !== null || asking !== null || !!blocked} onClick={() => pick(l.id)}>
                    {l.label}
                  </Button>
                  {l.hint ? <span className="tb-access-note">{l.hint}</span> : null}
                </div>
              ))}
            </div>
            {asking ? (
              <Notice tone="needs-you" role="alert">
                <span className="tb-access-confirm">
                  <span>
                    {asking.sentence ??
                      (words.ask
                        ? words.ask(asking.changes.length, levelName(asking.level))
                        : `This changes ${count(asking.changes.length, unit.one, unit.many)} to ${levelName(asking.level)}.`)}
                  </span>
                  <span className="tb-access-tools">
                    <Button id={confirmId} variant="primary" disabled={!!blocked || running !== null} onClick={() => void run(asking.level, asking.changes)}>
                      Yes, change them
                    </Button>
                    <Button
                      onClick={() => {
                        focusLevel(asking.level);
                        setAsking(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </span>
                </span>
              </Notice>
            ) : null}
            {running ? <p role="status">{`Setting ${running.done} of ${running.total}.`}</p> : status ? <p role="status">{status}</p> : null}
          </div>
          <div className="tb-access-column-body">
            {actions.length > 0 ? (
              <>
                <p className="tb-label">{`Waiting for your decision (${actions.length})`}</p>
                {actions.slice(0, ACTIONS_SHOWN).map(({ cell, who }) => (
                  <div className="tb-access-log" key={key(cell.agent, cell.scope)}>
                    <span>{who}</span>
                    <CellExtra cell={{ ...cell, note: undefined }} who={who} explain={explain} reload={reload} />
                  </div>
                ))}
                {actions.length > ACTIONS_SHOWN ? <p className="tb-access-note">{`Pick fewer to see the other ${actions.length - ACTIONS_SHOWN}.`}</p> : null}
              </>
            ) : null}
            <AccessSessionLog
              log={log}
              empty={words.start ?? (fixedScope ? `Pick ${agentWord.many}, then one value.` : `Pick ${agentWord.many} and ${scopeWord.many}, then a level.`)}
            />
          </div>
        </section>
      </section>
    </div>
  );
}
