# @opt2-tealbrick/ui changelog

## 0.4.0 (reservation, C369 H3)

Hold cards in plain words for every app (C369). New API only; nothing changes for current users.
- `HoldCard`: one held call. Summary as the heading, "Asked by <agent or app>", the hold view as readable text lines
  (line breaks and indents kept, long lines wrap, the kit font, not a mono JSON box; plain text only, never HTML), "Why
  held" (family label + sentence, the hold reason, the rule that held it), asked / expires times in the viewer's zone
  (relative + absolute, UTC in the tooltip), then Approve (primary) / Deny / More details. Props: `hold` (an SDK `Receipt`
  fits), `onApprove`, `onDeny`, `busy` (C8), `onDetails`, `actions` (replaces the buttons), `headingLevel`, and `now` /
  `timeZone` / `locale` for tests. A decided hold shows its status instead of the buttons.
- `HoldDetails`: the "More details" modal (Dialog `lg`, kicker "Technical details"). `load(holdId)` returns the record of
  the owner-only person op `tb.hold_details` (spec 0.1.84). It shows status, operation, tool, family, reason, held by,
  caller, hold / receipt / call ids, created / expires / decided (local + UTC ISO), input digest, view hash and, while the
  input is kept, the input as pretty JSON in a scrolling block. Otherwise one sentence per `inputState` (`INPUT_STATE_TEXT`):
  "Too large to keep", "Removed 7 days after the decision", "Kept, but it could not be read", "Not kept (inputs are kept 7
  days after the decision)". Loading and error states (plain message + Try again; never the raw error).
- `familyText(family)` / `FAMILY_TEXT`: the plain words of the hold families, moved from the Portal GUI
  (`src/core/hold-families.ts`), plus `policy` ("A rule you set") and `caps` ("Usage limit reached"). Unknown id →
  humanized id; no family → "Approval needed".
- Helpers: `holdTime` (Intl, ms or ISO), `relativeTime`, `viewLines`, `visibleText` / `isHiddenChar` / `escapeHidden`,
  `clampText`, `humanizeId`. Local types with the spec's field names, a little wider so the SDK's types fit as they are:
  `HoldReceipt`, `HoldDetails` (same name as the modal), `HoldCaller`, `HoldFamily`, `HoldInputState`.
- QA round 1 (packages#17, QA-UI17-1..9), all in this version:
  - The view: a run of blank lines shows as one blank line; a visible caption above it ("What the agent asks" / "What
    the app asks"); when it is taller than its box (max `min(480px, 60vh)`), a bottom fade and "N more lines — scroll to
    read all" under it, also the region's description for screen readers.
  - `visibleText` drops the SDK `clean()` list (spec 0.1.84, incl. ZWNJ/ZWJ, U+2028/2029, U+2060–2064, tag characters,
    lone surrogates) plus display-only blanks (U+00AD, U+034F, Hangul fillers, U+180B–180F, U+2800, U+FFF9–FFFB). Every
    details row goes through it inside a `<bdi>`; the input JSON shows hidden characters as visible escapes (`escapeHidden`).
  - Approve / Deny only while the status is `held`; after `expiresAt` they are disabled next to an "Expired" tag. An
    unknown status gets a neutral Tag. Status and family lookups never hit prototype keys.
  - Times: sizes rounded down both ways (36 h → "in 36 hours", hours up to 48 h, then days), "in under a minute"; the card
    ticks every 15 s in the last 10 minutes and once at the exact expiry (`relativeTime`).
  - While a decision runs, focus moves to the card's status line ("Sending your decision…") and back to Approve after;
    a double click calls `onApprove` / `onDeny` once.
  - `HoldDetails` checks the answer (holdId, status, op, inputState, caller) and shows an error with Try again for
    anything else, for null and for a loader that throws at once; closing drops the record from memory.
  - The reason reads "Rule: …" with "Rule from <app> (<hook>)" (or "Reason: …" without a rule), at the weight of the
    system sentence; caller name ≤ 120 and summary ≤ 280 code points (`HOLD_TEXT_MAX`, full text in `title`); an app
    caller gets an "App" Tag instead of "(app)" after the name.
  - `test/fixtures/spec-holds.ts` (spec 0.1.84 shapes) + `test/spec-types.test.ts`: SDK `Receipt` / `HoldDetails` are
    assignable to the kit's types and the vocabularies are equal.
- Gallery views `holds` (with an overflowing view) and `hold-details`, both in the rendered check (contrast, ink,
  scrollbars, 1280 + 375, light + dark).

## 0.3.0 (2026-10-17)

Found in Live Artifacts S5 (mini-apps lead). One breaking rename, with its migration note.
- App art: the kit now ships stills for Observer (`observer-backfill`), Live Artifacts (`live-artifacts`) and Creative (`open-design`), 1x and 2x, byte copies of production like the other seven (10 apps in all). `appArt()`, `appName()` and `APPS` know the ids `observer`, `live-artifacts` and `creative`; an app without art showed the plate tile with its initial ("L"). `appColour()` now also resolves an app id from `APPS` (`appColour("live-artifacts")` is the artifacts colour), not only a colour id.
- BREAKING (design source, synced): the header colour tokens `--tb-app-scribe` and `--tb-app-design` are now `--tb-app-observer` and `--tb-app-creative`, and `APP_COLOUR_IDS` lists `observer` and `creative` instead of `scribe` and `design`. Migration: `appColour("scribe")` becomes `appColour("observer")`, `appColour("design")` becomes `appColour("creative")`; a raw `var(--tb-app-scribe)` / `var(--tb-app-design)` in app CSS is renamed the same way. No opt2 app used the old names.
- Table: at 480px and below every row stacks into one ruled entry (first cell = row title; other cells = "Label  value" lines, label = the column head). Before, the table scrolled sideways on a phone (413px of content in a 333px box at 375px) and hid the Status column. `<Table>` copies the head text to `data-label` on the body cells by itself (colspan counted, rows added later included); a body cell with its own `data-label`, or a head cell with `data-label`, overrides it. The head row stays in the DOM, visually hidden. At 481px and above nothing changes.
- Rendered check: a Receipts-style table view at 1280 and 375, light and dark (contrast of every text, plus a layout test: no sideways scroll, every column and label on screen, label contrast AA, head row hidden/shown, ledger kept at 1280; self-test fires on an unstacked table). Unit tests for the labels.

## 0.2.4 (2026-10-15)

Fix for 0.2.3. No API change.
- Select: `min-width: min(160px, 100%)` instead of a fixed 160px. In a narrower column (the Portal agent panel's 96px "per hour/day" cell) the Select fills the column instead of running out of it; 0.2.3 made that panel scroll sideways by 40px (found by the final rendered run, ink check on the shifted inputs). Option labels still never wrap.
- Rendered check: the reading view has a 96px Select column; the layout test fails when a Select is wider than its column (self-test: fires on a fixed 160px).

## 0.2.3 (2026-10-14)

Kit backlog (DESIGN-SYSTEM §11, C156a, C161). No API change.
- Select: the selected option's text is ink (`--tb-option-selected-on: var(--tb-ink)`), and the check mark carries the teal-ink. Teal-ink on the selected-hover fill was only 4.4:1.
- Select: the trigger keeps at least 160px, and option labels never wrap (one line, ellipsis, descenders kept by the clip margin). A wrapped label put the ink off-centre in Evolving Workflows 0.2.8.
- Prose lists: `.tb-prose` restores list markers for every list inside it (disc / decimal / circle, teal-ink markers, 4px between items); `ul.tb-list` / `ol.tb-list` restore one list. The UI-list reset under `.tb-root` stays. Use them for help, consent, legal text, change lists and histories.
- `.tb-panel-tint` padding is rounded to 2px (`round(nearest, clamp(24px, 3vw, 40px), 2px)`): 3vw gave 38.4px at 1280px and put the controls inside on half pixels.
- clerk.css: Clerk's white gradient over the primary button (`::after`) is removed (our primary is flat); UserProfile's card keeps inside narrow columns (`.cl-cardBox { max-width: 100% }`).
- Design source synced (components.css, tokens.css). The rendered check has a reading view (tinted panel with controls, prose lists, narrow Select) at 1280/1440/375 and a layout test with a self-test that fires on a 38.4px panel and a wrapping option.

## 0.2.2 (2026-10-14)

- New export `@opt2-tealbrick/ui/clerk.css`: unlayered rules that put the brick field and button edges, the flat primary, the focus rings and the title size back on Clerk's components. `clerkAppearance` puts Clerk's CSS in `@layer clerk`, but Clerk's own rules there are more specific than the appearance elements, so its hairline shadows and lifted primary stayed (found on the live Portal sign-in, QA 2026-10-14). Import it next to `components.css` wherever Clerk renders.
- The rendered check now measures the options of an OPEN listbox (long labels with capitals, descenders, meta, disabled): 0.00px off on mac and Linux, DPR 1 and 2.

## 0.2.1 (2026-10-14)

Fixes found while moving the Portal GUI onto 0.2.0. No API change.
- Select: descenders in the value ("y", "g", "p") are no longer cut. components.css (design source) sets `overflow: clip` with a clip margin on `.tb-select-value`, then resets it to `overflow: hidden`; kit.css restores the clip. Reported to the design lead. The rendered check now has a descender case (a Select value with g, j, p, q, y must paint ≥ 2px below the trimmed box at DPR 1 and 2); it fires on 0.2.0 and passes on 0.2.1.
- AppIcon: the fallback initial (no art) is upright, because the icon element is an `<i>`.
- Choices: the choice cards are `<button>`s; they no longer show the browser's button border and font.

## 0.2.0 (2026-10-14)

This release is the Tealbrick design system from the approved design (C146, C148, C150), and it **breaks** 0.1.x. opt2 is version 0, so 0.2.0 has no compatibility aliases (C133). Consumers move in one step, using the table below.

### What is new
- **Tokens.** `tokens.css` comes from the design source (`coordination/design/tokens.css`). It holds the base values (light), a dark block (`data-theme="dark"`, TBD only for now), roles, the C128 state pairs (fill + on-fill), scrollbars, reduced motion and the per-app header colours (`--tb-app-*`). `@opt2-tealbrick/ui/tokens` (TS) is generated from `tokens.css`. It exports `tokens`, `dark`, `resolved`, `resolvedDark`, `cssName` and `cssVar`. A test checks that the two stay in sync and match the design hashes in `DESIGN-SOURCE.json`.
- **Font.** Nunito is self-hosted (`dist/fonts/*.woff2` + `OFL.txt`, SIL OFL 1.1). The `@font-face` is in `tokens.css`. No surface loads Google Fonts.
- **Shapes (C125/C126).** One brick radius of 6px is used for everything you act with or that holds content. A pill (999px) is used only to choose or show a state. The 2px radius is kept only for the iso swatch.
- **Components.**
  - Buttons: `Button` (primary / secondary / quiet / danger + `confirm`), `ButtonLink`, `TextLink`, `IconButton`, `CloseButton`, `Avatar`.
  - Fields: `Field` (label/hint/error wiring), `TextInput`, `Textarea`, `Select` (brick trigger + listbox, ARIA select-only combobox, full keyboard and type-ahead), `NativeSelect`.
  - Pills: `Tag`, `Count`, `Chip`, `ChipGroup`, `Switch`, `Segmented`, `StatusPill`.
  - Surfaces: `Card`, `Panel`, `Section`, `Kicker`, `Swatch`, `Notice`, `EmptyState`, `Table`, `Progress`, `CopyBlock`, `Choices`.
  - Overlays: `Dialog` (native modal), `StepFlow` (C126/C128: one step at a time, fixed size, fade, reduced motion, focus to the first field, Skip only on optional steps), `Menu`, `Toast`, `PayPill` (steady brick-red ring, no glow).
  - Navigation and shells: `Tabs`, `AppHeader`, `AppShell` (header in the app's own colour, C148).
  - Brand and apps: `BrandMark` (the real drawn mark), `Lockup`, `AppIcon`, `AppMark`.
  - Helpers: `Ink` / `inked` (C128 label centring), `cx`.
- **App identity.** `APPS`, `appArt(id, base)`, `appColour(id)` and `appName(id)` are an interim lookup by product id. The 7 opt2 app stills are in `assets/apps/`. TODO: when the manifest carries `ui.art` (specs/REQUESTS.md), the art comes from there.
- **Clerk.** `@opt2-tealbrick/ui/clerk-appearance` exports `clerkAppearance(theme)` for `@clerk/react` 6.17.x (C138).
- **Guard.** `check-system <dir>` (package bin) fails CI on any of these:
  - a raw colour
  - a foreign font or font import
  - a radius, weight or shadow outside the tokens (CSS and JS style objects)
  - a scrollbar restyle
  - the wrong shape: a pill radius on a brick element, or a brick radius on a pill element

  Run it in every consumer: `check-system src`.

### Breaking changes and migration (0.1.x → 0.2.0)

| 0.1.x | 0.2.0 |
|---|---|
| Geist / Geist Mono / Georgia (`@fontsource-variable/geist*` imports) | Nunito from `tokens.css` (delete the imports); mono = `var(--tb-font-mono)` (system) |
| radius 2px (`--tb-radius`) | `--tb-radius-brick` (6px) for bricks, `--tb-radius-pill` for state pills, `--tb-radius-swatch` for the iso swatch |
| teal scale `--tb-teal-50…900` | `--tb-teal-wash`, `--tb-teal-wash-line`, `--tb-teal` (fills only), `--tb-teal-ink` (text), `--tb-teal-deep`; words are `--tb-ink` |
| burgundy scale `--tb-burgundy-*`, `--tb-accent` | brick red: `--tb-brick` (fill), `--tb-brick-ink` (text), `--tb-brick-wash`, `--tb-on-brick` |
| `--tb-surface`, `--tb-white`, `--tb-panel` | `--tb-tile` (raised) / `--tb-paper` (page) / `--tb-plate` |
| `--tb-canvas` | `--tb-film` |
| `--tb-primary`, `--tb-primary-hover`, `--tb-on-primary` | `--tb-primary-fill`, `--tb-primary-hover-fill`, `--tb-primary-on` (and every C128 state pair) |
| `--tb-text-xs/sm/md/lg/xl/2xl` | `--tb-text-hint` 13, `--tb-text-tag` / `--tb-text-control` 14, `--tb-text-label` 15, `--tb-text-body` 16, `--tb-text-lede` 18, `--tb-text-title` 20, `--tb-text-h2` 26, `--tb-text-h1` 36 |
| `--tb-shadow-1` / `--tb-shadow-2` | flat (none) / `--tb-shadow-float` (floating surfaces only) |
| `--tb-ok/progress/action/blocked/neutral`, `--tb-tone-ok…` | status pairs `--tb-status-{live,busy,needs-you,idle}-{fill,on,edge}` |
| `--tb-fast`, `--tb-med` | `--tb-dur-fast`, `--tb-dur` |
| `Button variant="accent"` / `"ghost"` | `"primary"` / `"quiet"` |
| `Tag tone="ok|progress|action|blocked|neutral"` | `Tag status="live|busy|needs-you|needs-you|default"` (`idle`, `open` also exist) |
| `Notice tone="ok|action"` | `Notice tone="live|needs-you"` (default `neutral`) |
| `Select` (native, `onChange(e)`) | `Select` = custom listbox, `onValueChange(value)`; `NativeSelect` for the native fallback (`.tb-select-native`) |
| `Eyebrow` | `Kicker` (`group`, `person`, `open`) |
| `Steps`, `SetupSteps`, one-page multi-step dialogs | `StepFlow` (C126) |
| `SetupOverlay` | removed (use `EmptyState` / `StepFlow`) |
| `Dialog eyebrow` | `Dialog kicker` |
| `Menu` with `<li>` children | `Menu` with `<a>` / `<button>` children (`<hr>` separates) |
| `BrandMark size` (inline SVG) | `BrandMark width` (the real drawn PNG mark, data URI) |
| `AppShell icon` | `AppShell art` + `colour` (`appArt`, `appColour`) |
| AppShell nav = buttons | nav = links (`a.tb-tab`, `pageHref`, default `?page=<id>`), `onNavigate` on a plain click |
| `.tb-brick` canvas card (`--tb-brick-*`) | `.tb-node` (canvas rebuild, C143/C146) |
| `assets/teal-brick-mark-160.png` | `assets/brand/logo-mark@3x.png` (+ logo-32/48/apple-180) |
| `test/brand.test.ts` style guards (2px, no green/orange) | `check-system` (package bin) |
