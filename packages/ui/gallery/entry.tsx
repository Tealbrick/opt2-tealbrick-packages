/* Kit gallery: every @opt2-tealbrick/ui export in its states, rendered from the BUILT package (dist), so the rendered
   checks (scripts/check-rendered.ts: contrast in every state, scrollbars, ink centring) test what consumers install.
   Views: ?view=components (default) | shell-app[&app=<id>] | shell | dialog | stepflow[&step=N] | toast | reading | table
   | holds (0.4.0: HoldCard) | hold-details (0.4.0: HoldDetails open, loaded) */
import { type ReactNode, StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AppHeader,
  AppIcon,
  AppMark,
  AppShell,
  Avatar,
  appArt,
  appColour,
  Button,
  ButtonLink,
  Card,
  Chip,
  ChipGroup,
  Choices,
  CloseIcon,
  CopyBlock,
  Count,
  Dialog,
  EmptyState,
  Field,
  HoldCard,
  HoldDetails,
  type HoldDetails as HoldDetailsRecord,
  IconButton,
  Kicker,
  Lockup,
  Menu,
  NativeSelect,
  Notice,
  Panel,
  PayPill,
  Progress,
  SearchIcon,
  Section,
  Segmented,
  Select,
  STANDARD_PAGES,
  StatusPill,
  StepFlow,
  Switch,
  Table,
  Tabs,
  Tag,
  Textarea,
  TextInput,
  TextLink,
  Toast,
} from "../dist/index.js";

const q = new URLSearchParams(location.search);
const view = q.get("view") ?? "components";
const ART_BASE = "./assets/apps/";

const DESTINATIONS = [
  { value: "new", label: "Create new project…" },
  { value: "agents", label: "novak-agents", disabled: true, meta: "used by another workspace" },
  { value: "sandbox", label: "studio-sandbox" },
  { value: "staging", label: "staging-eu" },
  { value: "prod", label: "production-eu" },
  { value: "lab", label: "lab-west" },
  { value: "old", label: "old-dental-site" },
  { value: "x1", label: "experiments" },
  { value: "x2", label: "front-desk" },
  { value: "x3", label: "research-partner" },
];

function Spec({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="spec">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Components() {
  const [dest, setDest] = useState("new");
  const [chip, setChip] = useState("all");
  const [seg, setSeg] = useState<"canvas" | "list">("canvas");
  const [tab, setTab] = useState<"licences" | "downloads" | "sessions">("licences");
  const [choice, setChoice] = useState<"railway" | "coolify" | "own">("railway");
  const [on, setOn] = useState(true);
  return (
    <main className="page">
      <div className="tb-stack">
        <Kicker>Design system · @opt2-tealbrick/ui 0.2.0</Kicker>
        <h1>
          One kit for every <em>surface.</em>
        </h1>
        <p className="tb-lede">Every control on this page is a kit component, rendered from the built package.</p>
      </div>

      <Spec title="Buttons (bricks)">
        <div className="tb-ctas">
          <Button variant="primary" size="lg" arrow>
            Deploy Task Board
          </Button>
          <Button variant="primary">Primary 44</Button>
          <Button>Secondary</Button>
          <Button variant="quiet">Quiet</Button>
          <Button variant="danger">Remove app</Button>
          <Button variant="danger" confirm>
            Confirm remove
          </Button>
          <Button size="sm">Small 36</Button>
          <Button disabled>Disabled</Button>
          <Button variant="quiet" size="sm">
            Review draft <Count tone="ink">1</Count>
          </Button>
          <ButtonLink href="#x" variant="quiet">
            Link as button
          </ButtonLink>
          <IconButton label="Search">
            <SearchIcon />
          </IconButton>
          <IconButton label="Close panel">
            <CloseIcon />
          </IconButton>
          <Avatar initials="AR" label="Account menu" />
          <TextLink href="#x" arrow>
            Inline link
          </TextLink>
        </div>
      </Spec>

      <Spec title="Fields">
        <div className="tb-stack narrow">
          <Field label="Workspace name" hint="You can change it later.">
            <TextInput defaultValue="Novak Dental" />
          </Field>
          <Field label="Railway token" error="This token can’t see any projects. Check its scope.">
            <TextInput defaultValue="abc" />
          </Field>
          <Field label="Destination" hint="Where the app and its data live.">
            <Select options={DESTINATIONS} value={dest} onValueChange={setDest} />
          </Field>
          <div data-gallery="options">
            <Field label="Template (long labels)">
              <Select
                options={[
                  { value: "weekly", label: "Template: Weekly report" },
                  { value: "quarterly", label: "Quarterly planning, Gary’s jobs" },
                  { value: "ops", label: "Operator Inbox: Typical replies", meta: "used 4×" },
                  { value: "q", label: "Query: Jumpy spring pipeline" },
                  { value: "xyz", label: "XYZ project (paused)", disabled: true },
                ]}
                defaultValue="quarterly"
              />
            </Field>
          </div>
          <Field label="Status (descenders)">
            <Select
              options={[
                { value: "progress", label: "In progress · gjpqy" },
                { value: "queued", label: "Queued by jaggy typing" },
              ]}
              defaultValue="progress"
            />
          </Field>
          <Field label="Destination (disabled)">
            <Select options={DESTINATIONS} value="sandbox" disabled />
          </Field>
          <Field label="Fallback without JavaScript">
            <NativeSelect options={DESTINATIONS.slice(0, 3)} defaultValue="new" />
          </Field>
          <Field label="Code shown in the app">
            <TextInput code defaultValue="ABCD-EFGH" />
          </Field>
          <Field label="What does it do?">
            <Textarea defaultValue="Answers patient email and books visits." />
          </Field>
          <Field label="Disabled field">
            <TextInput disabled defaultValue="Read only" />
          </Field>
        </div>
      </Spec>

      <Spec title="Choices">
        <div className="narrow">
          <Choices
            label="Where it runs"
            value={choice}
            onChange={setChoice}
            options={[
              { value: "railway", title: "Railway, the simple option", body: "We link your account. All your data stays with you." },
              { value: "own", title: "Your own servers", body: "Bring a Docker host." },
              { value: "coolify", title: "Coolify", body: "Not available yet.", disabled: true },
            ]}
          />
        </div>
      </Spec>

      <Spec title="Tags, counts and status (pills)">
        <div className="tb-row">
          <Tag status="live">Running</Tag>
          <Tag status="busy">Deploying</Tag>
          <Tag status="needs-you">Licence unpaid</Tag>
          <Tag status="idle">Not deployed</Tag>
          <Tag>Default</Tag>
          <Tag status="open">Set up</Tag>
          <Count>2 waiting</Count>
          <Count tone="ink">1</Count>
          <StatusPill>Recording · 12:04</StatusPill>
        </div>
        <div className="tb-row">
          <Kicker>Memory</Kicker>
          <Kicker group="coordination">Coordination</Kicker>
          <Kicker group="control">Control</Kicker>
          <Kicker group="connections">Connections</Kicker>
          <Kicker group="creation">Creation</Kicker>
          <Kicker open>Not made yet</Kicker>
        </div>
      </Spec>

      <Spec title="Chooser pills and tabs">
        <ChipGroup label="Filter by group">
          {["all", "memory", "control"].map((c) => (
            <Chip key={c} pressed={chip === c} onClick={() => setChip(c)}>
              {c === "all" ? "All" : c === "memory" ? "Memory" : "Control"}
            </Chip>
          ))}
        </ChipGroup>
        <div className="tb-row">
          <Segmented
            label="View"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "canvas", label: "Canvas" },
              { value: "list", label: "List" },
            ]}
          />
          <Switch label="Switched on" checked={on} onCheckedChange={setOn} />
          <Switch label="Disabled" disabled />
        </div>
        <Tabs
          label="Account"
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "licences", label: "Licences", badge: 2 },
            { value: "downloads", label: "Downloads" },
            { value: "sessions", label: "CLI sessions" },
          ]}
        />
      </Spec>

      <Spec title="Cards, panels, notices">
        <div className="grid2">
          <Card as="article">
            <Kicker group="coordination">Coordination</Kicker>
            <h3>Task Board</h3>
            <p className="tb-soft">Shared tasks for agents and people.</p>
          </Card>
          <Panel>
            <Kicker>Tinted panel</Kicker>
            <p>At most one per page.</p>
          </Panel>
        </div>
        <Notice>
          <strong>Bridge starting.</strong> You can add your agent meanwhile.
        </Notice>
        <Notice tone="live">
          <strong>Updated and running.</strong> Your data stays.
        </Notice>
        <Notice tone="needs-you" role="alert">
          <strong>The payment didn’t go through.</strong> Nothing was charged. Try again.
        </Notice>
        <Progress label="Deploying" value={62} />
        <Progress label="Loading" />
        <CopyBlock text="tealbrick agent login --code ABCD-EFGH" label="login command" />
      </Spec>

      <Spec title="App identity">
        <div className="tb-row">
          {([16, 24, 32, 48, 64] as const).map((s) => (
            <AppIcon key={s} art={appArt("knowledge", ART_BASE)} size={s} label={`Knowledge ${s}`} />
          ))}
          <AppIcon name="Future app" size={48} />
          <AppMark name="Operator Inbox" art={appArt("inbox", ART_BASE)} />
          <AppMark name="Connect" art={appArt("connect", ART_BASE)} />
          <Lockup sub="Portal" href="#x" />
        </div>
        <div className="tb-row">
          {["knowledge", "kanban", "inbox", "evolution", "rules", "fleet", "connect", "observer", "live-artifacts", "creative"].map((id) => (
            <span key={id} className="app-chip" style={{ background: appColour(id) }}>
              <AppIcon art={appArt(id, ART_BASE)} size={24} />
              <span>{id}</span>
            </span>
          ))}
        </div>
      </Spec>

      <Spec title="Settings sections and a ledger table">
        <Section title="Approvals for apps" first>
          <p className="tb-soft">Held actions wait until the owner approves.</p>
        </Section>
        <Section title="Remove workspace" danger>
          <div className="tb-ctas">
            <Button variant="danger">Remove workspace</Button>
          </div>
        </Section>
        <div className="scroll-x">
          <Table>
            <thead>
              <tr>
                <th>App</th>
                <th>Workspace</th>
                <th>Status</th>
                <th>Bought</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="strong">Knowledge</td>
                <td>Novak Dental</td>
                <td>
                  <Tag status="live">Paid</Tag>
                </td>
                <td className="num">2 Oct 2026</td>
              </tr>
              <tr>
                <td className="strong">Operator Inbox</td>
                <td className="tb-muted">Not assigned</td>
                <td>
                  <Tag status="needs-you">Unpaid</Tag>
                </td>
                <td className="num">28 Sep 2026</td>
              </tr>
            </tbody>
          </Table>
        </div>
      </Spec>

      <Spec title="Empty state, menu, scroll area">
        <EmptyState title="No licences yet." action={<Button variant="primary">Open a workspace</Button>}>
          Add an app to a workspace to buy one.
        </EmptyState>
        <div className="tb-row">
          <Menu label="Account menu" trigger="Account">
            <a href="#x">Licences</a>
            <a href="#x">
              Downloads<small>TBD for macOS</small>
            </a>
            <button type="button">Sign out</button>
          </Menu>
        </div>
        <section className="scroller" tabIndex={0} aria-label="Scroll area">
          {Array.from({ length: 24 }, (_, i) => (
            <p key={i}>Receipt {i + 1}: the agent read 3 notes from “Referrals”.</p>
          ))}
        </section>
      </Spec>
    </main>
  );
}

function StepFlowView() {
  const [open, setOpen] = useState(true);
  const [dest, setDest] = useState("new");
  const step = Math.max(1, Number(q.get("step") ?? "1")) - 1;
  return (
    <>
      <main className="page">
        <Button variant="primary" onClick={() => setOpen(true)}>
          Deploy Task Board
        </Button>
      </main>
      <StepFlow
        open={open}
        onClose={() => setOpen(false)}
        title="Deploy Task Board"
        kicker="Coordination · v0.4.0"
        initialStep={step}
        onFinish={() => setOpen(false)}
        steps={[
          {
            name: "Settings",
            render: () => (
              <>
                <Field label="Name" hint="Shown on the canvas.">
                  <TextInput defaultValue="Task Board" />
                </Field>
                <Field label="Destination">
                  <Select options={DESTINATIONS} value={dest} onValueChange={setDest} />
                </Field>
              </>
            ),
          },
          {
            name: "Keys",
            optional: "Skip, add keys later",
            render: () => (
              <Field label="OpenAI key" hint="Stored in Connect. Never shown again.">
                <TextInput placeholder="sk-…" />
              </Field>
            ),
          },
          {
            name: "Review",
            nextLabel: "Deploy",
            render: () => (
              <>
                <p className="tb-soft">Deploying alone doesn’t give an agent access. Connect agents on the canvas.</p>
                {Array.from({ length: 14 }, (_, i) => (
                  <p key={i}>Line {i + 1}: one service, one volume, healthcheck on.</p>
                ))}
              </>
            ),
          },
          {
            name: "Licence",
            optional: "Buy later",
            nextLabel: "Buy licence",
            render: () => (
              <Notice tone="needs-you">
                <strong>Licence unpaid.</strong> The app runs; buy the licence within 14 days.
              </Notice>
            ),
          },
        ]}
      />
    </>
  );
}

function DialogView() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <main className="page">
        <Button onClick={() => setOpen(true)}>Open dialog</Button>
      </main>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        kicker="Front desk"
        title="Remove agent"
        footer={
          <>
            <Button onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="danger" confirm>
              Confirm remove
            </Button>
          </>
        }
      >
        <p className="tb-soft">Removes the card, revokes its connections and drops its access. This can’t be undone.</p>
        <Field label="Type the agent name">
          <TextInput placeholder="Front desk" />
        </Field>
      </Dialog>
    </>
  );
}

function ShellView({ coloured }: { coloured: boolean }) {
  const id = q.get("app") ?? "inbox";
  const [page, setPage] = useState("holds");
  const pages = STANDARD_PAGES.map((p) => (p.id === "holds" ? { ...p, badge: 2 } : p));
  return (
    <AppShell
      title={coloured ? "Operator Inbox" : "Example app"}
      art={coloured ? appArt(id, ART_BASE) : null}
      colour={coloured ? appColour(id) : undefined}
      pages={pages}
      current={page}
      onNavigate={setPage}
      actions={
        <>
          <ButtonLink href="#x" variant="quiet" size="sm" className="hide-phone">
            Open Portal
          </ButtonLink>
          <Button size="sm">Sign out</Button>
        </>
      }
      banner={
        <Notice tone="needs-you">
          <strong>2 actions wait for you.</strong> Nothing happens until you approve.
        </Notice>
      }
    >
      <div className="tb-stack">
        <Kicker person>Waiting for you</Kicker>
        <h1>Holds</h1>
        <p className="tb-lede">Actions that wait for a person. Deny, and the agent is told why.</p>
      </div>
      <Card>
        <h3>Send a first email to dr.kral@clinic.example</h3>
        <p className="tb-soft">Front desk · First message to someone new · 4 min ago</p>
        <div className="tb-ctas">
          <Button variant="primary" size="sm">
            Approve
          </Button>
          <Button size="sm">Deny</Button>
        </div>
      </Card>
      <PayPill count={2} unpaid onOpen={() => {}} />
    </AppShell>
  );
}

function PortalHeader() {
  return (
    <AppHeader
      actions={
        <>
          <Button variant="quiet" size="sm">
            Settings
          </Button>
          <Button variant="primary" size="sm">
            Add agent
          </Button>
          <Avatar initials="AR" label="Account menu" />
        </>
      }
    >
      <div className="tb-search">
        <SearchIcon />
        <TextInput placeholder="What do you want to add?" aria-label="Search: what do you want to add?" />
      </div>
    </AppHeader>
  );
}

function ToastView() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <PortalHeader />
      <main className="page">
        <p>Toast specimen.</p>
      </main>
      <Toast open={open} actionLabel="Undo" onAction={() => setOpen(false)} onClose={() => setOpen(false)}>
        Connected. The agent can use the app within a minute.
      </Toast>
    </>
  );
}

function ReadingView() {
  // 0.2.3 specimens: the tinted panel with controls inside (ink at 1280/1440: no half-pixel padding), prose lists
  // (.tb-prose / .tb-list keep their markers; the UI-list reset stays), a narrow Select whose options never wrap.
  const [tpl, setTpl] = useState("weekly");
  const [per, setPer] = useState("hour");
  return (
    <>
      <PortalHeader />
      <main className="page tb-stack">
        <Panel data-gallery="tint">
          <Kicker>Tinted panel</Kicker>
          <p>Controls inside sit on whole pixels at every width.</p>
          <div className="tb-ctas">
            <Button variant="primary">Approve</Button>
            <Button>Deny</Button>
          </div>
        </Panel>
        <div style={{ display: "flex", gap: 12, alignItems: "end" }}>
          <div style={{ width: 120 }}>
            <Field label="Template">
              <Select
                value={tpl}
                onValueChange={setTpl}
                options={[
                  { value: "weekly", label: "Template: Weekly report for the whole workspace" },
                  { value: "daily", label: "Daily digest", meta: "08:00" },
                ]}
              />
            </Field>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 96px", gap: 8, maxWidth: 320 }} data-gallery="narrow-col">
          <TextInput aria-label="Calls" defaultValue="500" />
          <Select
            aria-label="Per"
            value={per}
            onValueChange={setPer}
            options={[
              { value: "hour", label: "hour" },
              { value: "day", label: "day" },
            ]}
          />
        </div>
        <div className="tb-prose" data-gallery="prose">
          <p>What changed in this version:</p>
          <ul>
            <li>Agents keep their names.</li>
            <li>
              Holds wait for a person.
              <ul>
                <li>Deny tells the agent why.</li>
              </ul>
            </li>
          </ul>
          <ol>
            <li>Open the app.</li>
            <li>Approve the hold.</li>
          </ol>
        </div>
        <ul className="tb-list" data-gallery="list">
          <li>One list outside prose keeps its markers.</li>
          <li>Second item.</li>
        </ul>
        <ul data-gallery="ui-list">
          <li>UI lists stay unmarked.</li>
        </ul>
      </main>
    </>
  );
}

function TableView() {
  // 0.3.0 specimen: a Receipts-style ledger (title + five columns, Status among them). At <= 480px every row stacks;
  // at 1280px it is the ledger table. A phone-width box must never scroll sideways and must show every column.
  const rows: [string, string, "live" | "needs-you" | "idle", string, string, string][] = [
    ["Weekly report page", "Scout", "live", "Paid", "£0.42", "2 Oct 2026, 09:14"],
    ["Cost breakdown by workspace and month", "Writer on the staging cluster", "needs-you", "Held", "£12.80", "28 Sep 2026, 16:02"],
    ["Release notes", "Reviewer", "idle", "Refunded", "£0.00", "27 Sep 2026, 08:30"],
  ];
  return (
    <>
      <PortalHeader />
      <main className="page tb-stack">
        <Section title="Receipts" first>
          <p className="tb-soft">Every charge an agent made on your behalf.</p>
          <Table data-gallery="receipts">
            <thead>
              <tr>
                <th>Page</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Cost</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([page, agent, status, label, cost, when]) => (
                <tr key={page}>
                  <td className="strong">{page}</td>
                  <td>{agent}</td>
                  <td>
                    <Tag status={status}>{label}</Tag>
                  </td>
                  <td className="num">{cost}</td>
                  <td className="num">{when}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      </main>
    </>
  );
}

// 0.4.0 (C369): hold cards as an app's Holds page shows them, and the "More details" modal with a loaded record.
const HOLD_NOW = Date.now();
const MAIL_VIEW = [
  "Send an email",
  "Account: Front desk (Gmail)",
  "To: ana.novak@example.com",
  "Subject: Thanks for the call, and the price list we talked about on Tuesday afternoon",
  "Attachments (names only): price-list-2027.pdf",
  "",
  "Text (plain text, first 500 characters):",
  "  Hello Ana,",
  "  thanks for the call today. The price list is attached.",
  "    Best regards, Front desk",
].join("\n");
const GALLERY_HOLDS = [
  {
    id: "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8",
    op: "mail_send",
    opTitle: "Send email",
    summary: "Email to ana.novak@example.com: Thanks for the call",
    view: MAIL_VIEW,
    holdFamily: "outward",
    heldBy: null,
    caller: { type: "agent", id: "agt_front", name: "Front desk" },
    status: "held",
    createdAt: HOLD_NOW - 5 * 60_000,
    expiresAt: HOLD_NOW + 2 * 86_400_000,
  },
  {
    id: "hld_01HZX3K8Q2V4N6P8R0S2T4V6W9",
    op: "issue_delete",
    summary: "Delete issue “Old price list” with its comments",
    view: "Delete issue\nIssue: Old price list\nProject: Launch\nComments: 4",
    holdFamily: "policy",
    holdReason: "Deleting anything in the Launch project waits for Martin.",
    heldBy: "rules/rules_gate",
    caller: { type: "app", id: "ins_evo", name: "Evolving Workflows", product: "evolution" },
    status: "held",
    createdAt: HOLD_NOW - 26 * 3_600_000,
    expiresAt: HOLD_NOW + 3_600_000,
  },
];
const GALLERY_DETAILS: HoldDetailsRecord = {
  holdId: "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8",
  op: "mail_send",
  opTitle: "Send email",
  tool: "GMAIL_SEND_EMAIL",
  family: "outward",
  reason: "Outward mail waits for you.",
  heldBy: null,
  caller: { type: "agent", id: "agt_front", name: "Front desk" },
  callId: "cal_01HZX3K8Q2V4N6P8R0S2T4V6WA",
  receiptId: "hld_01HZX3K8Q2V4N6P8R0S2T4V6W8",
  inputDigest: "sha256:4f1c0d3b2a9e8f7d6c5b4a39281706f5e4d3c2b1a09f8e7d6c5b4a3928170615",
  status: "held",
  input: { to: ["ana.novak@example.com"], subject: "Thanks for the call", body: "Hello Ana, thanks for the call today.", attachments: ["price-list-2027.pdf"] },
  inputState: "kept",
  inputWipeAt: null,
  createdAt: new Date(HOLD_NOW - 5 * 60_000).toISOString(),
  expiresAt: new Date(HOLD_NOW + 2 * 86_400_000).toISOString(),
  decidedAt: null,
  viewSha256: "sha256:9a8b7c6d5e4f30211203f4e5d6c7b8a99a8b7c6d5e4f30211203f4e5d6c7b8a9",
};

function HoldsView() {
  const [open, setOpen] = useState(view === "hold-details");
  return (
    <>
      <PortalHeader />
      <main className="page tb-stack" data-gallery="holds">
        {GALLERY_HOLDS.map((h, i) => (
          <HoldCard
            key={h.id}
            hold={h}
            onApprove={() => {}}
            onDeny={() => {}}
            busy={i === 1 && q.has("busy")}
            onDetails={() => setOpen(true)}
            headingLevel={2}
          />
        ))}
      </main>
      <HoldDetails
        open={open}
        onClose={() => setOpen(false)}
        holdId={GALLERY_DETAILS.holdId}
        load={async () => GALLERY_DETAILS}
        title={GALLERY_HOLDS[0]?.summary}
      />
    </>
  );
}

function App() {
  if (view === "holds" || view === "hold-details") return <HoldsView />;
  if (view === "table") return <TableView />;
  if (view === "reading") return <ReadingView />;
  if (view === "stepflow") return <StepFlowView />;
  if (view === "dialog") return <DialogView />;
  if (view === "shell-app") return <ShellView coloured />;
  if (view === "shell") return <ShellView coloured={false} />;
  if (view === "toast") return <ToastView />;
  return (
    <>
      <PortalHeader />
      <Components />
    </>
  );
}

const host = document.getElementById("root");
if (host)
  createRoot(host).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
