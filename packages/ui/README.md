# @opt2-tealbrick/ui

The Tealbrick design system for every opt2 surface (Portal GUI, mini apps, website, TBD): tokens, self-hosted Nunito, React 19 components and the `check-system` guard. Source of truth for the look is the approved design (`coordination/design`, C146/C148/C150). This package copies its tokens and component CSS unchanged (`DESIGN-SOURCE.json` records the hashes).

## Install

Releases are CI-built GitHub tarballs (never npm). The repository is private, so install from the public mirror in `Tealbrick/opt2-tealbrick-dist`. Pin the URL and its integrity (`coordination/specs/RELEASES.md`):

```json
"@opt2-tealbrick/ui": "https://github.com/Tealbrick/opt2-tealbrick-dist/releases/download/opt2-tealbrick-packages-ui-v0.4.1/opt2-tealbrick-ui-0.4.1.tgz"
```

## Use

```ts
import "@opt2-tealbrick/ui/tokens.css"; // tokens + @font-face Nunito + base + scrollbars + reduced motion
import "@opt2-tealbrick/ui/components.css";
import "@opt2-tealbrick/ui/clerk.css"; // only where Clerk components render
import { Button, Field, Select, StepFlow } from "@opt2-tealbrick/ui";
import { clerkAppearance } from "@opt2-tealbrick/ui/clerk-appearance"; // <ClerkProvider appearance={clerkAppearance("light")}>
import { resolved, cssVar } from "@opt2-tealbrick/ui/tokens"; // literal values (native, Clerk) / var() refs
```

Put `class="tb-root"` on the page root. Dark values apply under `data-theme="dark"` (TBD only for now, C148).

App stills (10 apps: the 7 opt2 apps, Observer, Live Artifacts and Creative): copy `node_modules/@opt2-tealbrick/ui/assets/apps/` to your public folder, then `appArt(productId, "/that/path/")`. This is interim, until the manifest carries `ui.art`.

## Access pages

`AccessEditor` replaces a grid of agents and scopes: the defaults once, then only what differs, plus a bulk editor. Give it the app's levels and default rule from `tealbrick.manifest.json`, the stored rows, and the app's existing per-cell write. See `src/components/access.tsx`.

## Guard (run it in CI)

```sh
check-system src            # exit 1 on any off-system colour, font, radius, weight, shadow, scrollbar or shape
check-system src --report   # inventory, exit 0
```

A reviewed exception carries `check-system: allow` on the same line.

## Develop

From the repo root:
- `pnpm test` builds and runs the unit tests (components in happy-dom: states, keyboard, ARIA; token sync; guard; package contents; token contrast).
- `pnpm --filter @opt2-tealbrick/ui run check:rendered` builds the gallery and runs the rendered checks in Chromium. It checks contrast in every state, scrollbars, and ink centring at DPR 1 and 2. The gate is 0 failures. CI runs it in `.woodpecker/rendered.yaml`.
- `node packages/ui/scripts/sync-design.ts` re-syncs from `coordination/design` (local only). It regenerates `src/tokens.ts`.

## Licences

The code is under the Tealbrick Software Licence (`LICENSE`; versions up to 0.2.4 were released under MIT and stay MIT, see the repo `LICENSING.md`). Nunito is under the SIL Open Font License 1.1 (`dist/fonts/OFL.txt`). The brand mark and the app art are Tealbrick's own artwork from production (`assets/brand/PROVENANCE.md`, `src/apps.ts`). The licence grants no right to them or to the Tealbrick trademark.
