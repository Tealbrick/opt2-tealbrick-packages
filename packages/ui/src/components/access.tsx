import { type KeyboardEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "./button.tsx";
import { Field, TextInput } from "./field.tsx";
import { cx } from "./ink.tsx";
import { Select } from "./select.tsx";
import { Notice } from "./surfaces.tsx";

/* AccessEditor (C382): who may do what, without a grid. The opening view shows each default once and then only what
   differs from it, with a one-line add. The bulk editor picks agents, then scopes, then one level. No dropdown per
   agent and scope anywhere: the page stays usable at 32 agents x 192 scopes. The kit calls the app's own per-cell
   write and never knows the app's server. */

/** A level the app declares. `null` means no access in every prop that takes a level. */
export type AccessLevelId = string | null;
export type AccessOption = { id: string; label: string };
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

/** A group that repeats while it holds a repeat: its run time can explode on one name, and the filter is remembered. */
const SLOW_REGEX = /\([^)]*[+*}][^)]*\)\s*[+*{]/u;
export const ACCESS_FILTER_MAX = 200;

/** A filter: a case-insensitive regex; `invalid` when it cannot be used as one, and then it matches as plain text. */
export function accessFilter(query: string): { test: (text: string) => boolean; invalid: boolean } {
  const q = query.trim();
  if (!q) return { test: () => true, invalid: false };
  const plain = (text: string) => text.toLowerCase().includes(q.toLowerCase());
  if (SLOW_REGEX.test(q)) return { test: plain, invalid: true };
  try {
    const re = new RegExp(q, "i");
    return { test: (text) => re.test(text), invalid: false };
  } catch {
    return { test: plain, invalid: true };
  }
}

export type AccessChange = { agent: string; scope: string; level: AccessLevelId };
export type AccessFailure = AccessChange & { reason: string };
const ACCESS_WRITE_LIMIT = 4;

/** The writes of one click. A pair already at the level is skipped: a write would also change who owns that row. */
export function accessChanges(agents: readonly string[], scopes: readonly string[], level: AccessLevelId, cells: readonly AccessCell[]): AccessChange[] {
  const index = accessIndex(cells);
  const out: AccessChange[] = [];
  for (const agent of agents) for (const scope of scopes) if ((index.get(key(agent, scope))?.level ?? null) !== level) out.push({ agent, scope, level });
  return out;
}

/** Runs the writes with limited concurrency, and returns every write that failed. One failure stops no other write. */
export async function accessWriteAll(
  changes: readonly AccessChange[],
  write: (change: AccessChange) => Promise<unknown>,
  reasonOf: (error: unknown) => string,
  progress?: (done: number) => void,
  limit: number = ACCESS_WRITE_LIMIT,
): Promise<AccessFailure[]> {
  const failed: AccessFailure[] = [];
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < changes.length) {
      const change = changes[next++] as AccessChange;
      try {
        await write(change);
      } catch (error) {
        failed.push({ ...change, reason: reasonOf(error) });
      }
      progress?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, changes.length) }, worker));
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

/** Browser storage can throw or be empty (private window, blocked site data): a filter is only a convenience. */
function usePersistedFilter(storageKey: string): [string, (value: string) => void] {
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

const count = (n: number, one: string, many: string) => `${n.toLocaleString("en")} ${n === 1 ? one : many}`;

function FilterField({
  label,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  invalid: boolean;
}) {
  return (
    <Field label={label} hint={invalid ? "Not a valid regex. Matching as plain text." : "Plain text and regex both work, for example ^(?!QA)."}>
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

type LogEntry = { id: number; text: string; failures: { who: string; reason: string }[] };

export type AccessEditorProps = {
  agents: readonly AccessAgent[];
  scopes: readonly AccessScope[];
  /** The app's levels in their order, from tealbrick.manifest.json. No access is added by the kit. */
  levels: readonly AccessOption[];
  noneLabel?: string;
  /** "project" / "projects" */
  scopeWord: { one: string; many: string };
  /** The defaults, shown read only. */
  defaults: readonly AccessDefaultLine[];
  cells: readonly AccessCell[];
  /** What the default rule gives this agent on this scope. */
  defaultOf: (agent: string, scope: string) => AccessLevelId;
  /** The app's existing per-cell write. */
  write: (change: AccessChange) => Promise<unknown>;
  /** Reads the rows again and returns them. */
  reload: () => Promise<readonly AccessCell[]>;
  explain: (error: unknown) => string;
  /** Prefix of what this browser remembers, unique per app. */
  storageKey: string;
  headingLevel?: 2 | 3;
};

const CONFIRM_ABOVE = 25;
const PAGE = 50;

/** Duplicate names stay apart: "Henry work" and "Henry work (2)". */
function apart<T extends { id: string; name: string }>(list: readonly T[]): T[] {
  const seen = new Map<string, number>();
  return list.map((item) => {
    const n = (seen.get(item.name) ?? 0) + 1;
    seen.set(item.name, n);
    return n === 1 ? item : { ...item, name: `${item.name} (${n})` };
  });
}

/** Agents and scopes: the defaults once, then only what differs; the bulk editor opens from Add. */
export function AccessEditor(props: AccessEditorProps) {
  const { levels, noneLabel = "No access", scopeWord, cells, defaultOf, write, reload, explain, defaults, storageKey, headingLevel = 2 } = props;
  const agents = useMemo(() => apart(props.agents), [props.agents]);
  const scopes = useMemo(() => apart(props.scopes), [props.scopes]);
  const [view, setView] = useState<"list" | "many">("list");
  const [log, setLog] = useState<LogEntry[]>([]);
  const logId = useRef(0);
  const Heading = headingLevel === 3 ? "h3" : "h2";
  const levelName = useCallback(
    (level: AccessLevelId) => (level === null ? noneLabel : (levels.find((l) => l.id === level)?.label ?? level)),
    [levels, noneLabel],
  );
  const agentName = useCallback((id: string) => agents.find((a) => a.id === id)?.name ?? id, [agents]);
  const scopeName = useCallback((id: string) => scopes.find((s) => s.id === id)?.name ?? id, [scopes]);
  const rows = useMemo(() => accessDifferences(agents, scopes, cells, defaultOf), [agents, scopes, cells, defaultOf]);
  const addLog = useCallback(
    (text: string, failures: AccessFailure[]) => {
      logId.current += 1;
      const entry: LogEntry = {
        id: logId.current,
        text,
        failures: failures.map((f) => ({ who: `${agentName(f.agent)} to ${scopeName(f.scope)}`, reason: f.reason })),
      };
      setLog((l) => [entry, ...l]);
    },
    [agentName, scopeName],
  );

  /** Writes, reads back, says what really happened, and returns the failures. */
  const apply = useCallback(
    async (changes: AccessChange[], progress?: (done: number) => void): Promise<AccessFailure[]> => {
      const failed = await accessWriteAll(changes, write, explain, progress);
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
    [write, explain, reload],
  );

  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    heading.current?.focus();
  }, [view]);

  if (view === "many") {
    return (
      <AccessPicker
        agents={agents}
        scopes={scopes}
        levels={levels}
        levelName={levelName}
        scopeWord={scopeWord}
        cells={cells}
        apply={apply}
        addLog={addLog}
        log={log}
        explain={explain}
        reload={reload}
        storageKey={storageKey}
        Heading={Heading}
        heading={heading}
        onBack={() => setView("list")}
      />
    );
  }
  return (
    <AccessList
      agents={agents}
      scopes={scopes}
      levels={levels}
      noneLabel={noneLabel}
      levelName={levelName}
      scopeWord={scopeWord}
      defaults={defaults}
      rows={rows}
      cells={cells}
      apply={apply}
      addLog={addLog}
      explain={explain}
      reload={reload}
      storageKey={storageKey}
      Heading={Heading}
      heading={heading}
      onMany={() => setView("many")}
    />
  );
}

type Shared = {
  agents: readonly AccessAgent[];
  scopes: readonly AccessScope[];
  levels: readonly AccessOption[];
  levelName: (level: AccessLevelId) => string;
  scopeWord: { one: string; many: string };
  cells: readonly AccessCell[];
  apply: (changes: AccessChange[], progress?: (done: number) => void) => Promise<AccessFailure[]>;
  addLog: (text: string, failures: AccessFailure[]) => void;
  explain: (error: unknown) => string;
  reload: () => Promise<readonly AccessCell[]>;
  storageKey: string;
  Heading: "h2" | "h3";
  heading: { current: HTMLHeadingElement | null };
};

const NONE = "__none";

function AccessList({
  agents,
  scopes,
  levels,
  noneLabel,
  levelName,
  scopeWord,
  defaults,
  rows,
  cells,
  apply,
  addLog,
  explain,
  reload,
  storageKey,
  Heading,
  heading,
  onMany,
}: Shared & { noneLabel: string; defaults: readonly AccessDefaultLine[]; rows: AccessRow[]; onMany: () => void }) {
  const [query, setQuery] = usePersistedFilter(`${storageKey}:rows`);
  const [limit, setLimit] = useState(PAGE);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; failed: boolean } | null>(null);
  const [addAgent, setAddAgent] = useState("");
  const [addScope, setAddScope] = useState("");
  const [addLevel, setAddLevel] = useState("");
  const filter = accessFilter(query);
  const shown = rows.filter((r) => filter.test(`${r.agent.name} to ${r.scope.name}`));
  const combos = agents.length * scopes.length;
  const different = rows.filter((r) => r.differs).length;

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
  };
  const add = () => {
    const level = addLevel === NONE ? null : addLevel;
    const agent = agents.find((a) => a.id === addAgent);
    const scope = scopes.find((s) => s.id === addScope);
    if (!agent || !scope || !addLevel) return;
    const who = `${agent.name} to ${scope.name}`;
    if (accessChanges([agent.id], [scope.id], level, cells).length === 0) {
      setMessage({ text: `${who} already has ${levelName(level)}.`, failed: false });
      return;
    }
    void change(agent.id, scope.id, level, who, `${who}: ${levelName(level)}.`).then(() => {
      setAddScope("");
      setAddLevel("");
    });
  };
  const levelOptions = [{ value: NONE, label: noneLabel }, ...levels.map((l) => ({ value: l.id, label: l.label }))];
  return (
    <div className="tb-access">
      <p className="tb-access-lede">
        {`${count(agents.length, "agent", "agents")} and ${count(scopes.length, scopeWord.one, scopeWord.many)}: ${count(combos, "combination", "combinations")}. ${different === 0 ? "None differs from the default." : `${different.toLocaleString("en")} ${different === 1 ? "differs" : "differ"} from the default.`}`}
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
          What differs from the default
        </Heading>
        {rows.length > 0 ? (
          <FilterField label="Filter this list" value={query} onChange={setQuery} placeholder="Name, or a regex" invalid={filter.invalid} />
        ) : null}
        {message ? (
          <Notice tone={message.failed ? "needs-you" : undefined} role={message.failed ? "alert" : "status"}>
            {message.text}
          </Notice>
        ) : null}
        <div className="tb-access-rows">
          {rows.length === 0 ? <p className="tb-access-empty">Every agent has the default.</p> : null}
          {rows.length > 0 && shown.length === 0 ? (
            <div className="tb-access-empty tb-row">
              <span>{`The filter hides all ${count(rows.length, "row", "rows")}.`}</span>
              <Button onClick={() => setQuery("")}>Clear the filter</Button>
            </div>
          ) : null}
          <ul className="tb-access-list-plain">
            {shown.slice(0, limit).map((r) => {
              const who = `${r.agent.name} to ${r.scope.name}`;
              return (
                <li key={key(r.agent.id, r.scope.id)} className="tb-access-row">
                  <span className="tb-access-who">
                    {r.agent.name}
                    {r.agent.note ? <span className="tb-access-pick-meta">{` ${r.agent.note}`}</span> : null}
                  </span>
                  <span className="tb-access-to">to</span>
                  <span className="tb-access-what">{r.scope.name}</span>
                  <span className="tb-access-level">{levelName(r.level)}</span>
                  {r.differs ? (
                    <Button
                      disabled={busy !== null}
                      aria-label={`Back to default: ${who}`}
                      onClick={() => void change(r.agent.id, r.scope.id, r.defaultLevel, who, `${who} is back to the default, ${levelName(r.defaultLevel)}.`)}
                    >
                      Back to default
                    </Button>
                  ) : null}
                  <CellExtra cell={r.cell} who={who} explain={explain} reload={reload} />
                </li>
              );
            })}
          </ul>
          {shown.length > limit ? (
            <div className="tb-access-more">
              <span>{`Showing ${limit} of ${shown.length.toLocaleString("en")}.`}</span>
              <Button onClick={() => setLimit((n) => n + PAGE)}>Show {Math.min(PAGE, shown.length - limit)} more</Button>
            </div>
          ) : null}
          <div className="tb-access-add">
            <span className="tb-label">Add</span>
            <div className="tb-access-add-field">
              <Select
                aria-label="Agent"
                placeholder="Agent"
                options={agents.map((a) => ({ value: a.id, label: a.name }))}
                value={addAgent}
                onValueChange={setAddAgent}
              />
            </div>
            <span className="tb-access-to">to</span>
            <div className="tb-access-add-field tb-access-add-wide">
              <Select
                aria-label={scopeWord.one}
                placeholder={scopeWord.one}
                options={scopes.map((s) => ({ value: s.id, label: s.name }))}
                value={addScope}
                onValueChange={setAddScope}
              />
            </div>
            <div className="tb-access-add-field">
              <Select aria-label="Access" placeholder="Access" options={levelOptions} value={addLevel} onValueChange={setAddLevel} />
            </div>
            <Button variant="primary" disabled={busy !== null || !addAgent || !addScope || !addLevel} onClick={add}>
              Add
            </Button>
            <Button onClick={onMany}>Add or change many</Button>
          </div>
        </div>
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

function AccessPicker({
  agents,
  scopes,
  levels,
  levelName,
  scopeWord,
  cells,
  apply,
  addLog,
  log,
  explain,
  reload,
  storageKey,
  Heading,
  heading,
  onBack,
}: Shared & { log: readonly LogEntry[]; onBack: () => void }) {
  const [agentQuery, setAgentQuery] = usePersistedFilter(`${storageKey}:agents`);
  const [scopeQuery, setScopeQuery] = usePersistedFilter(`${storageKey}:scopes`);
  const [onlyAccess, setOnlyAccess] = useState(false);
  const [pickedAgents, setPickedAgents] = useState<ReadonlySet<string>>(new Set());
  const [pickedScopes, setPickedScopes] = useState<ReadonlySet<string>>(new Set());
  const [running, setRunning] = useState<{ done: number; total: number } | null>(null);
  const [asking, setAsking] = useState<{ level: AccessLevelId; changes: AccessChange[] } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const titleId = useId();
  const confirmId = useId();
  const levelButtons = useId();
  const levelButtonId = (level: AccessLevelId) => `${levelButtons}-${level ?? NONE}`;
  const focusLevel = (level: AccessLevelId) => requestAnimationFrame(() => document.getElementById(levelButtonId(level))?.focus());
  const index = useMemo(() => accessIndex(cells), [cells]);
  const levelAt = useCallback((agent: string, scope: string): AccessLevelId => index.get(key(agent, scope))?.level ?? null, [index]);
  const agentFilter = accessFilter(agentQuery);
  const scopeFilter = accessFilter(scopeQuery);
  // Rows that are gone after a reload leave the selection: nothing is written to what the page no longer shows.
  const agentIds = useMemo(() => agents.filter((a) => pickedAgents.has(a.id)).map((a) => a.id), [agents, pickedAgents]);
  const scopeIds = useMemo(() => scopes.filter((s) => pickedScopes.has(s.id)).map((s) => s.id), [scopes, pickedScopes]);
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
  const hiddenScopes = scopeIds.filter((id) => !shownScopes.some((s) => s.id === id)).length;
  const hidden = hiddenAgents + hiddenScopes;
  const summary = `${names(agentIds, nameOfAgent, "agent", "agents")} to ${names(scopeIds, nameOfScope, scopeWord.one, scopeWord.many)}`;

  const actions = useMemo(() => {
    const out: { cell: AccessCell; who: string }[] = [];
    if (!ready) return out;
    for (const a of agentIds)
      for (const s of scopeIds) {
        const cell = index.get(key(a, s));
        if (cell?.action) out.push({ cell, who: `${nameOfAgent(a)} to ${nameOfScope(s)}` });
      }
    return out;
  }, [ready, agentIds, scopeIds, index]);

  const run = async (level: AccessLevelId, changes: AccessChange[]) => {
    setAsking(null);
    setStatus(null);
    const skipped = total - changes.length;
    setRunning({ done: 0, total: changes.length });
    const failures = await apply(changes, (done) => setRunning({ done, total: changes.length }));
    setRunning(null);
    const set = changes.length - failures.length;
    const parts = [`${count(set, "set", "set")}`, failures.length ? `${failures.length} failed` : null, skipped ? `${skipped} already had it` : null]
      .filter(Boolean)
      .join(", ");
    addLog(`${summary}: ${levelName(level)}. ${parts}.`, failures);
    setStatus(failures.length ? `${failures.length} of ${count(changes.length, "change", "changes")} failed. See the list below.` : `Done. ${parts}.`);
    focusLevel(level);
  };
  const pick = (level: AccessLevelId) => {
    const changes = accessChanges(agentIds, scopeIds, level, cells);
    if (changes.length === 0) {
      setAsking(null);
      setStatus(`Nothing to change: ${count(total, "permission already has", "permissions already have")} ${levelName(level)}.`);
    } else if (changes.length > CONFIRM_ABOVE) setAsking({ level, changes });
    else void run(level, changes);
  };
  useEffect(() => {
    if (asking) document.getElementById(confirmId)?.focus();
  }, [asking, confirmId]);
  useEffect(() => setAsking(null), [pickedAgents, pickedScopes]);

  return (
    <div className="tb-access">
      <div className="tb-access-picker-head">
        <Heading ref={heading} tabIndex={-1} className="tb-access-head" id={titleId}>
          Add or change many
        </Heading>
        <Button disabled={running !== null} onClick={onBack}>
          Back to the list
        </Button>
      </div>
      <section className="tb-access-columns" aria-labelledby={titleId}>
        <section className="tb-access-column" aria-label="Agents">
          <div className="tb-access-column-head">
            <FilterField
              label={`1. Which agents (${shownAgents.length} of ${agents.length})`}
              value={agentQuery}
              onChange={setAgentQuery}
              placeholder="Name, or a regex"
              invalid={agentFilter.invalid}
            />
            <div className="tb-access-tools">
              <Button onClick={() => setPickedAgents((s) => new Set([...s, ...shownAgents.map((a) => a.id)]))}>Select all shown</Button>
              <Button onClick={() => setPickedAgents(new Set())}>Clear</Button>
            </div>
          </div>
          <PickList
            label="Agents"
            items={shownAgents.map((a) => ({
              id: a.id,
              name: a.name,
              meta: [a.note, count(accessCount.get(a.id) ?? 0, scopeWord.one, scopeWord.many)].filter(Boolean).join(", "),
            }))}
            picked={pickedAgents}
            onToggle={toggle(setPickedAgents)}
          />
        </section>
        <section className="tb-access-column" aria-label={scopeWord.many}>
          <div className="tb-access-column-head">
            <FilterField
              label={`2. To which ${scopeWord.many} (${shownScopes.length} of ${scopes.length})`}
              value={scopeQuery}
              onChange={setScopeQuery}
              placeholder="Name, or a regex"
              invalid={scopeFilter.invalid}
            />
            <div className="tb-access-tools">
              <Button aria-pressed={onlyAccess} className={cx(onlyAccess && "is-on")} onClick={() => setOnlyAccess((v) => !v)}>
                Only with access
              </Button>
              <Button onClick={() => setPickedScopes((s) => new Set([...s, ...shownScopes.map((x) => x.id)]))}>Select all shown</Button>
              <Button onClick={() => setPickedScopes(new Set())}>Clear</Button>
            </div>
          </div>
          <PickList
            label={scopeWord.many}
            items={shownScopes.map((s) => ({ id: s.id, name: s.name, meta: nowOf(s.id) }))}
            picked={pickedScopes}
            onToggle={toggle(setPickedScopes)}
          />
        </section>
        <section className="tb-access-column" aria-label="Access">
          <div className="tb-access-column-head">
            <p className="tb-label tb-access-step">3. Set access</p>
            <p className="tb-access-sentence">
              {ready ? `${summary}. This sets ${count(total, "permission", "permissions")}.` : `Pick at least one agent and one ${scopeWord.one}.`}
            </p>
            {ready && hidden > 0 ? (
              <p className="tb-access-note">{`${count(hidden, "pick is", "picks are")} hidden by a filter, and ${hidden === 1 ? "it counts" : "they count"} too.`}</p>
            ) : null}
            <div className="tb-access-levels">
              {[null, ...levels.map((l) => l.id)].map((id) => (
                <Button key={id ?? NONE} id={levelButtonId(id)} disabled={!ready || running !== null || asking !== null} onClick={() => pick(id)}>
                  {levelName(id)}
                </Button>
              ))}
            </div>
            {asking ? (
              <Notice tone="needs-you" role="alert">
                <span className="tb-access-confirm">
                  <span>{`This changes ${count(asking.changes.length, "permission", "permissions")} to ${levelName(asking.level)}.`}</span>
                  <span className="tb-access-tools">
                    <Button id={confirmId} variant="primary" onClick={() => void run(asking.level, asking.changes)}>
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
            <p className="tb-label">{`Changes this session (${log.length})`}</p>
            {log.length === 0 ? <p className="tb-access-note">{`Pick agents and ${scopeWord.many}, then a level.`}</p> : null}
            {log.map((entry) => (
              <div className="tb-access-log" key={entry.id}>
                <span>{entry.text}</span>
                {entry.failures.length > 0 ? (
                  <ul className="tb-access-failures">
                    {entry.failures.map((f) => (
                      <li key={f.who}>{`Failed: ${f.who}. ${f.reason}`}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
