/* check-rendered.ts — derived from the design lead's tools/screens.ts (same audits, same thresholds). It renders the
   kit GALLERY (gallery/out, built from dist by gallery/build.ts) in headless Chromium and audits the RENDERED page.
   Run: pnpm check:rendered  (= build + gallery + this). Browser: CHROME_PATH, else Playwright's Chromium (CI: the
   mcr.microsoft.com/playwright image of the same playwright-core version), else (locally only) the system Chrome.
   For each gallery view × width (1280, 375) × theme (light, dark):
     - full-page screenshot to screens/<page>-<width>-<theme>.png (StepFlow pages: one per step; Selects also open)
     - text audit: every visible text node vs its composited background (AA 4.5, large 3.0), opacity included
     - outline audit: every visible focus outline (forced .is-focus and real Tab focus) vs its background (3.0)
     - scrollbar audit: every scroll container (page, StepFlow middle, listbox, panels, demo areas) is scrolled to 40%;
       thumb vs track >= 3:1 measured on pixels, again with the mouse on the thumb (hover); scrolled + hover screenshot
     - hover audit: hovers every control (buttons, tabs, chips, links, triggers, options, menu rows) and re-audits it
     - INK test (C128): for every control (buttons, tags, chips, counts, tabs, segmented, select, inputs, options,
       status/wire pills) the visible cap-height ink of the label must sit centred in the box: |top gap − bottom gap|
       <= 0.5px, measured on real pixels at DPR 1 and 2 (50%-coverage edges of the first capital or digit).
   Writes gallery/out/report/{contrast-report,ink-report}.json and screenshots. Exit 1 on any failure (gate: 0).
   Flags: --ink-only (skip screenshots/contrast). */
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { decodePng } from './png.ts';

const { chromium } = await import('playwright-core');
const root = join(import.meta.dirname, '..', 'gallery', 'out');
if (!existsSync(join(root, 'index.html'))) { console.error('gallery not built: node scripts/build.ts && node gallery/build.ts'); process.exit(2); }
const out = join(root, 'report');
mkdirSync(out, { recursive: true });

const types: Record<string, string> = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent((req.url ?? '/').split('?')[0]));
  if (!p.startsWith(root) || !existsSync(p)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }).end(readFileSync(p));
}).listen(0, '127.0.0.1');
await new Promise(r => server.once('listening', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;

const pages: [string, number, number[]?][] = [ // [gallery view (query), StepFlow steps (0 = none), widths]
  ['index.html', 0], ['index.html?view=shell-app&app=inbox', 0], ['index.html?view=shell-app&app=knowledge', 0], ['index.html?view=shell-app&app=connect', 0],
  ['index.html?view=shell', 0], ['index.html?view=dialog', 0], ['index.html?view=toast', 0], ['index.html?view=stepflow', 4],
  ['index.html?view=reading', 0, [1280, 1440, 375]], // 0.2.3: tinted panel with controls, prose lists, narrow Select
  ['index.html?view=table', 0], // 0.3.0: Receipts-style ledger table (stacked at <= 480px)
  ['index.html?view=holds', 0], ['index.html?view=hold-details', 0], // 0.4.0: HoldCard + HoldDetails (C369)
];

/* runs in the page: composited contrast of text and outlines inside `scope` */
const audit = (scopeSel: string | null) => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const rgba = (c: string): [number, number, number, number] => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const mix = (f: number[], a: number, b: number[]) => [0, 1, 2].map(i => f[i] * a + b[i] * (1 - a));
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ratio = (a: number[], b: number[]) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
  const opacityOf = (el: Element | null) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity); return o; };
  const bgOf = (el: Element | null): number[] => {
    const layers: [number, number, number, number][] = [];
    for (let e = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] > 0) { layers.push(c); if (c[3] >= 1) break; } }
    let col = [255, 255, 255];
    for (const l of layers.reverse()) col = mix(l, l[3], col);
    return col;
  };
  const scope = scopeSel ? document.querySelector(scopeSel) : document.body;
  const res: { what: string; ratio: number; need: number; where: string }[] = [];
  let checked = 0;
  if (!scope) return { checked, res };
  const label = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${[...el.classList].join('.')} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  const seen = new Set<Element>();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const el = n.parentElement;
    if (!el || seen.has(el) || !(n.textContent ?? '').trim() || el.closest('svg, .tb-sr, script, style, noscript, [hidden]') || (el.closest('details:not([open])') && !el.closest('summary'))) continue; // closed <details> content is not rendered
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.getClientRects().length === 0) continue;
    const r = el.getBoundingClientRect(); if (r.width < 1 || r.height < 1) continue;
    seen.add(el);
    const op = opacityOf(el); if (op < .05) continue;
    const bg = bgOf(el); const fgc = rgba(cs.color);
    const fg = mix(fgc, fgc[3] * op, bg);
    const size = parseFloat(cs.fontSize), w = parseInt(cs.fontWeight);
    const need = size >= 24 || (size >= 18.66 && w >= 700) ? 3 : 4.5;
    const rt = ratio(fg, bg); checked++;
    if (rt < need) res.push({ what: 'text', ratio: Math.round(rt * 100) / 100, need, where: label(el) });
  }
  for (const el of [scope, ...scope.querySelectorAll('*')]) {
    const cs = getComputedStyle(el);
    if (cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) < 2 || el.getClientRects().length === 0 || cs.visibility === 'hidden') continue;
    if (!el.matches(':focus-visible, .is-focus, .is-active.tb-option')) continue;
    const bg = bgOf(el.parentElement); const oc = rgba(cs.outlineColor);
    const rt = ratio(mix(oc, oc[3], bg), bg); checked++;
    if (rt < 3) res.push({ what: 'outline', ratio: Math.round(rt * 100) / 100, need: 3, where: label(el) });
  }
  return { checked, res };
};

const PAGE_TIMEOUT = Number(process.env.PAGE_TIMEOUT ?? 120000); // generous: the machine is shared
// real scrollbars (no --hide-scrollbars), so they are checked. Chromium's new headless mode ('chromium' channel), the
// closest to the real browser; locally it falls back to the system Chrome when Playwright's browser is not installed.
const launchOpts = { ignoreDefaultArgs: ['--hide-scrollbars'] };
const browser = process.env.CHROME_PATH
  ? await chromium.launch({ ...launchOpts, executablePath: process.env.CHROME_PATH })
  : await chromium.launch({ ...launchOpts, channel: 'chromium' }).catch((e: Error) => {
      if (process.env.CI) throw e; // CI runs on the pinned browser, never silently on another one (L3)
      return chromium.launch({ ...launchOpts, channel: 'chrome' });
    });
console.log(`browser: chromium ${browser.version()}`);
// L34 self-test: the audit must stay quiet on a good pair and fire on bad text, bad hover text and a bad outline.
{
  const ctx = await browser.newContext(); ctx.setDefaultTimeout(PAGE_TIMEOUT); const page = await ctx.newPage();
  await page.setContent(`<style>body{background:#fff}.b{color:#000;background:#fff}.b:hover{color:#ccc}</style><p id=g style="color:#111">good</p><p id=t style="color:#aaa">bad text</p><button class=b>hover me</button><a id=o href=# class=is-focus style="outline:3px solid #eee">bad outline</a>`);
  const good = await page.evaluate(audit, '#g'), bad = await page.evaluate(audit, '#t'), ol = await page.evaluate(audit, '#o');
  await page.hover('.b'); await page.evaluate(() => document.querySelector('.b')!.id = 'h'); const hv = await page.evaluate(audit, '#h');
  await ctx.close();
  if (good.res.length || !bad.res.length || !hv.res.length || !ol.res.some(r => r.what === 'outline')) { console.error('screens: SELF-TEST FAILED', { good, bad, hv, ol }); process.exit(2); }
  console.log('screens: self-test ok (quiet on good, fires on bad text, bad hover, bad outline)');
}
const report: { page: string; width: number; theme: string; state: string; what: string; ratio: number; need: number; where: string }[] = [];
let checked = 0, shots = 0;
const HOVER = 'button:not([disabled]), a.tb-btn, .tb-tabs > a, .tb-shell-nav > a, .tb-chip, .tb-link, .tb-select-trigger, .tb-menu > a, .tb-brand';
const inkOnly = process.argv.includes('--ink-only');
const ONLY = process.env.ONLY; // e.g. ONLY=stepflow renders only matching views (iteration speed); the full run is the gate
if (ONLY) pages.splice(0, pages.length, ...pages.filter(([f]) => f.includes(ONLY)));
for (const [file, steps, widths] of inkOnly ? [] : pages) for (const width of widths ?? [1280, 375]) for (const theme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width, height: width > 400 ? 860 : 812 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  ctx.setDefaultTimeout(PAGE_TIMEOUT);
  const page = await ctx.newPage();
  const name = file.replace('.html', '').replace(/[?&=]+/g, '-');
  const settle = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 20))))); // let 1ms reduced-motion transitions finish
  const record = (state: string, r: Awaited<ReturnType<typeof audit>>) => { checked += r.checked; for (const x of r.res) report.push({ page: file, width, theme, state, ...x }); };
  for (let s = 1; s <= Math.max(1, steps); s++) {
    await page.goto(base + file + (steps ? `${file.includes('?') ? '&' : '?'}step=${s}` : ''));
    await page.waitForSelector('#root > *');
    await page.evaluate((dark) => { if (dark) document.documentElement.setAttribute('data-theme', 'dark'); return document.fonts.ready; }, theme === 'dark');
    if (theme === 'dark' && await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') throw new Error('dark theme not applied');
    const tag = steps ? `-step${s}` : '';
    // (before any fullPage screenshot: Playwright hides scrollbars while it captures a full page)
    // scrollbars: scroll each container, measure thumb vs track on pixels, hover the thumb, measure again
    const scrollers = await page.evaluate(() => {
      const out: { sel: string; w: number }[] = [];
      const all = [document.documentElement, ...document.querySelectorAll<HTMLElement>('body *')];
      all.forEach((el, k) => {
        const cs = getComputedStyle(el), isDoc = el === document.documentElement;
        if (!isDoc && !/(auto|scroll)/.test(cs.overflowY)) return;
        if (el.scrollHeight <= el.clientHeight + 4 || (!isDoc && !el.getClientRects().length)) return;
        const w = isDoc ? innerWidth - document.documentElement.clientWidth : el.offsetWidth - el.clientWidth - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
        el.setAttribute('data-scroller', String(k)); out.push({ sel: `[data-scroller="${k}"]`, w });
      });
      return out;
    });
    let shotDone = false;
    for (const sc of scrollers) {
      const geo = await page.evaluate((sel) => {
        const el = document.querySelector<HTMLElement>(sel)!, isDoc = el === document.documentElement;
        el.scrollTop = (el.scrollHeight - el.clientHeight) * .4;
        const r = isDoc ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : el.getBoundingClientRect();
        const h = isDoc ? innerHeight : el.clientHeight;
        const thumbMid = r.top + (el.scrollTop + el.clientHeight / 2) / el.scrollHeight * h;
        const thumbLen = Math.max(32, el.clientHeight / el.scrollHeight * h);
        const far = thumbMid < r.top + h / 2 ? Math.min(r.bottom - 6, thumbMid + thumbLen / 2 + 8) : Math.max(r.top + 6, thumbMid - thumbLen / 2 - 8);
        return { x: r.right - (isDoc ? (innerWidth - document.documentElement.clientWidth) : (el.offsetWidth - el.clientWidth)) / 2 - (isDoc ? 0 : parseFloat(getComputedStyle(el).borderRightWidth)), y: thumbMid, far, top: r.top, bottom: r.bottom, visible: r.bottom > 0 && r.top < innerHeight };
      }, sc.sel);
      if (!geo.visible || sc.w < 1) { if (sc.w < 1) report.push({ page: file, width, theme, state: `scroll${tag}`, what: 'scrollbar', ratio: 0, need: 3, where: `${sc.sel} has no visible scrollbar` }); continue; }
      const measure = async (state: string) => {
        await settle();
        const y = Math.min(Math.max(0, Math.round(geo.y)), (await page.viewportSize())!.height - 1), fy = Math.min(Math.max(0, Math.round(geo.far)), (await page.viewportSize())!.height - 1);
        const shot = decodePng(await page.screenshot({ clip: { x: Math.max(0, Math.round(geo.x) - 1), y: 0, width: 3, height: (await page.viewportSize())!.height } }));
        const th = shot.px(1, y), tr = shot.px(1, fy);
        const L = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
        const [a, b] = [L(th), L(tr)].sort((p, q) => q - p); const rt = (a + .05) / (b + .05);
        checked++;
        if (rt < 3) report.push({ page: file, width, theme, state: `${state}${tag}`, what: 'scrollbar', ratio: Math.round(rt * 100) / 100, need: 3, where: `${sc.sel} thumb rgb(${th}) vs track rgb(${tr})` });
      };
      await measure('scrolled');
      await page.mouse.move(geo.x, geo.y);
      await measure('scroll-thumb-hover');
      if (!shotDone && !sc.sel.includes('"0"')) { await page.screenshot({ path: join(out, `${name}${tag}-scroll-hover-${width}-${theme}.png`) }); shots++; shotDone = true; }
      await page.mouse.move(0, 0);
      await page.evaluate((sel) => { const el = document.querySelector<HTMLElement>(sel)!; el.scrollTop = 0; }, sc.sel);
    }
    await settle();
    await page.screenshot({ path: join(out, `${name}${tag}-${width}-${theme}.png`), fullPage: true }); shots++;
    await settle();
    record(`default${tag}`, await page.evaluate(audit, null));

    // hover every control
    const n = await page.locator(HOVER).count();
    for (let i = 0; i < n; i++) {
      const loc = page.locator(HOVER).nth(i);
      if (!(await loc.isVisible())) continue;
      try { await loc.hover({ timeout: 800, force: true }); } catch { continue; }
      await settle();
      const id = await loc.evaluate((el, k) => { el.setAttribute('data-audit', String(k)); return k; }, i);
      record(`hover${tag}`, await page.evaluate(audit, `[data-audit="${id}"]`));
      await loc.evaluate(el => el.removeAttribute('data-audit'));
    }
    await page.mouse.move(0, 0);
    // real keyboard focus: Tab through the page
    for (let t = 0; t < 40; t++) {
      await page.keyboard.press('Tab'); await settle();
      const ok = await page.evaluate(() => { const a = document.activeElement; if (!a || a === document.body) return false; a.setAttribute('data-audit', 'focus'); return true; });
      if (!ok) continue;
      record(`focus${tag}`, await page.evaluate(audit, '[data-audit="focus"]'));
      await page.evaluate(() => document.querySelector('[data-audit="focus"]')?.removeAttribute('data-audit'));
    }
    // open every Select (one at a time), audit the listbox with keyboard-active + selected options, screenshot
    const triggers = page.locator('.tb-select-trigger:not([disabled])');
    const tc = await triggers.count();
    for (let i = 0; i < tc; i++) {
      const tr = triggers.nth(i);
      if (!(await tr.isVisible())) continue;
      // Esc only while a listbox is open: on a native modal <dialog> a bare Esc closes the dialog itself (StepFlow)
      if (await page.locator('.tb-listbox:not([hidden])').count()) await page.keyboard.press('Escape');
      await tr.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown'); await settle();
      record(`select-open${tag}`, await page.evaluate(audit, '.tb-listbox:not([hidden])'));
      const opts = page.locator('.tb-listbox:not([hidden]) .tb-option');
      for (let k = 0; k < await opts.count(); k++) {
        try { await opts.nth(k).hover({ timeout: 500, force: true }); } catch { continue; }
        await settle();
        record(`option-hover${tag}`, await page.evaluate(audit, '.tb-listbox:not([hidden])'));
      }
      if (i === 0) { await settle(); await page.screenshot({ path: join(out, `${name}${tag}-select-open-${width}-${theme}.png`), fullPage: true }); shots++; }
      await page.keyboard.press('Escape');
    }
  }
  await ctx.close();
}

/* ---------------------------------------------------------------- INK test (C128) */
const CONTROLS = '.tb-btn, .tb-tag, .tb-chip, .tb-count, .tb-close, .tb-avatar, .tb-status-pill, .tb-wire-label, .tb-option, .tb-tab, .tb-seg, .tb-select-trigger, .tb-input';
const inkRows: { page: string; width: number; dpr: number; theme: string; control: string; label: string; height: number; top: number; bottom: number; diff: number }[] = [];
// 0.2.2: the open listbox too — the options of the gallery's long-label Select (capitals + descenders) are measured
// with the list open (`#options` = index.html with that Select opened from the keyboard; the active option shows its
// 2px inset focus ring, as users see it)
const inkPages: [string, number, number[]?][] = [...pages, ...(pages.some(([f]) => f === 'index.html') || !ONLY ? [['index.html#options', 0] as [string, number]] : [])];
for (const [entry, , widths] of inkPages) for (const width of widths ?? [1280, 375]) for (const dpr of [1, 2]) for (const theme of ['light', 'dark']) {
  const file = entry.replace('#options', ''), openList = entry.endsWith('#options');
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
  ctx.setDefaultTimeout(PAGE_TIMEOUT);
  const page = await ctx.newPage();
  await page.goto(base + file);
  await page.waitForSelector('#root > *');
  await page.evaluate((dark) => { if (dark) document.documentElement.setAttribute('data-theme', 'dark'); return document.fonts.ready; }, theme === 'dark');
  if (theme === 'dark' && await page.evaluate(() => document.documentElement.dataset.theme) !== 'dark') throw new Error('dark theme not applied');
  if (openList) {
    const trig = page.locator('[data-gallery="options"] .tb-select-trigger');
    await trig.scrollIntoViewIfNeeded(); await trig.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    await page.waitForSelector('[data-gallery="options"] .tb-listbox:not([hidden])');
  }
  const n = await page.evaluate((sel) => { document.querySelectorAll(sel).forEach((el, k) => el.setAttribute('data-ink', String(k))); return document.querySelectorAll(sel).length; }, openList ? '[data-gallery="options"] .tb-listbox:not([hidden]) .tb-option' : CONTROLS);
  if (openList && n < 3) throw new Error('options pass: the long-label Select did not open (the check would be blind)');
  const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
  for (let k = 0; k < n; k++) {
    // one control at a time: scroll it into view, measure in the page, then clip-screenshot just its box
    const t = await page.evaluate((k) => {
      const el = document.querySelector<HTMLElement>(`[data-ink="${k}"]`)!;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect(); if (r.width < 8 || r.height < 12 || getComputedStyle(el).visibility === 'hidden' || !el.getClientRects().length) return null;
      let cols: number[] | null = null, label = '';
      if (el instanceof HTMLInputElement && el.type === 'password') return null; // masked glyphs are not capitals
      if (el instanceof HTMLInputElement) { el.value = 'H0H0'; el.placeholder = ''; const pl = parseFloat(getComputedStyle(el).paddingLeft); cols = [r.left + pl, r.left + pl + 18]; label = 'input'; }
      else {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        for (let n = w.nextNode(); n && !cols; n = w.nextNode()) {
          if (n.parentElement?.closest('small, svg') || (n.parentElement?.closest('.tb-count') && !el.matches('.tb-count'))) continue;
          const tx = n.textContent ?? ''; let i = tx.search(/[BDEFHIKLMNPRTUVWXYZ]/); // flat-top capitals first (no J/Q tails, no round/pointed overshoot)
          if (i < 0) i = [...tx].findIndex((ch, k) => /[A-IK-PR-Z0-9]/.test(ch) && !/[\/(),;]/.test(tx[k + 1] ?? '') && !/[\/(),;]/.test(tx[k - 1] ?? '')); if (i < 0) continue; // never next to a descending slash or bracket
          const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 1); const cr = rg.getBoundingClientRect();
          for (const [fx, fy] of [[.5, .2], [.5, .5], [.5, .8]]) { const hit = document.elementFromPoint(cr.left + cr.width * fx, cr.top + cr.height * fy); if (!hit || !el.contains(hit)) return null; } // covered by something
          cols = [cr.left + .5, cr.right - .5]; label = (n.textContent ?? '').trim().slice(0, 24);
        }
      }
      if (!cols || r.top < 0 || r.bottom > innerHeight) return null;
      for (const fx of [.1, .5, .9]) for (const y of [r.top + 4, r.bottom - 4]) { const hit = document.elementFromPoint(r.left + r.width * fx, y); if (hit && !el.contains(hit) && !hit.contains(el)) return null; } // box covered by an overlay (open menu, sheet): not measurable
      const cls = [...el.classList].filter(c => !c.startsWith('is-')).join('.');
      return { control: `${el.tagName.toLowerCase()}.${cls}`, label, box: [r.left, r.top, r.right, r.bottom], cols, fg: getComputedStyle(el.querySelector('.tb-ink, .tb-select-value') ?? el).color };
    }, k);
    if (!t) continue;
    const [bl, bt, br, bb] = t.box;
    const cx = Math.floor(bl), cy = Math.floor(bt), cw = Math.ceil(br) - cx, ch = Math.ceil(bb) - cy;
    const img = decodePng(await page.screenshot({ clip: { x: cx, y: cy, width: cw, height: ch } }));
    const top = (bt - cy) * dpr, bottom = (bb - cy) * dpr, fg = rgb(t.fg), ring = 3;
    const y0 = Math.ceil(top) + ring * dpr, y1 = Math.min(img.height - 1, Math.floor(bottom) - ring * dpr);
    const x0 = Math.max(0, Math.round((t.cols[0] - cx) * dpr)), x1 = Math.min(img.width - 1, Math.round((t.cols[1] - cx) * dpr));
    // interior fill: 5px inside the box's left edge at mid-height (past any 1.5px ring; never between two glyphs —
    // the design version sampled 3px left of the measured capital, which lands on the previous glyph in "AR")
    const fill = img.px(Math.max(0, Math.round((bl - cx + 5) * dpr)), Math.round((top + bottom) / 2));
    const need = Math.max(...fg.map((c, i) => Math.abs(c - fill[i]))) * .5;
    if (need < 20) continue; // label colour too close to fill to measure
    const cov = (y: number) => { let m = 0; for (let x = x0; x <= x1; x++) { const p = img.px(x, y); m = Math.max(m, ...p.map((c, i) => Math.abs(c - fill[i]))); } return m; };
    let a = -1, b = -1;
    for (let y = y0; y <= y1; y++) if (cov(y) >= need) { if (a < 0) a = y; b = y; }
    if (a < 0) continue;
    if (process.env.INK_DEBUG && t.label.startsWith(process.env.INK_DEBUG) && file.startsWith(process.env.INK_PAGE ?? '')) console.log('DEBUG', file, width, dpr, theme, t.label, t.box, 'need', need, [...Array(y1 - y0 + 1)].map((_, q) => cov(y0 + q)).join(' '));
    const gapTop = (a - top) / dpr, gapBottom = (bottom - (b + 1)) / dpr;
    inkRows.push({ page: entry, width, dpr, theme, control: t.control, label: t.label, height: Math.round((bb - bt) * 100) / 100, top: Math.round(gapTop * 100) / 100, bottom: Math.round(gapBottom * 100) / 100, diff: Math.round((gapTop - gapBottom) * 100) / 100 });
  }
  await ctx.close();
}
/* ---------------------------------------------------------------- DESCENDER test (0.2.1)
   The Select value trims its box to the cap height (C128 ink centring); descenders (g j p q y) must still paint below
   that box, never be clipped by it. For every Select value with a descender letter: the label's ink must reach at least
   2px (CSS) below the trimmed box bottom, measured on pixels at DPR 1 and 2. */
const descRows: { page: string; width: number; dpr: number; label: string; below: number }[] = [];
for (const file of ['index.html']) for (const width of [1280, 375]) for (const dpr of [1, 2]) { // the gallery's Field section, always
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: dpr, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(base + file);
  await page.waitForSelector('#root > *');
  await page.evaluate(() => document.fonts.ready);
  const n = await page.evaluate(() => { const els = [...document.querySelectorAll('.tb-select-value')].filter(e => /[gjpqy]/.test(e.textContent ?? '')); els.forEach((e, k) => e.setAttribute('data-desc', String(k))); return els.length; });
  for (let k = 0; k < n; k++) {
    const t = await page.evaluate((k) => {
      const el = document.querySelector<HTMLElement>(`[data-desc="${k}"]`)!;
      el.scrollIntoView({ block: 'center' });
      const r = el.getBoundingClientRect(), tr = el.closest('.tb-select-trigger')!.getBoundingClientRect();
      return { box: [r.left, r.top, r.right, r.bottom], trig: [tr.left, tr.top, tr.right, tr.bottom], fg: getComputedStyle(el).color, label: (el.textContent ?? '').slice(0, 30) };
    }, k);
    const [l, , rr, bottom] = t.box, [, tt, , tb] = t.trig;
    const cx = Math.floor(l), cy = Math.floor(tt), cw = Math.ceil(rr) - cx, ch = Math.ceil(tb) - cy;
    const img = decodePng(await page.screenshot({ clip: { x: cx, y: cy, width: cw, height: ch } }));
    const fg = (t.fg.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const fill = img.px(1, Math.round((bottom - cy + 6) * dpr)); // field fill left of the text, below the box
    const need = Math.max(...fg.map((c, i) => Math.abs(c - fill[i]))) * .5;
    let low = -1;
    for (let y = Math.round((bottom - cy) * dpr); y < Math.min(img.height, Math.round((tb - cy - 3) * dpr)); y++)
      for (let x = 0; x < img.width; x++) { const p = img.px(x, y); if (Math.max(...p.map((c, i) => Math.abs(c - fill[i]))) >= need) { low = y; break; } }
    const below = low < 0 ? 0 : Math.round(((low + 1) / dpr - (bottom - cy)) * 100) / 100;
    descRows.push({ page: file, width, dpr, label: t.label, below });
  }
  await ctx.close();
}
const descFails = descRows.filter(r => r.below < 2);
for (const f of descFails) console.error(`DESCENDER ${f.page} ${f.width}@${f.dpr}x "${f.label}": ink reaches ${f.below}px below the value box (needs >= 2; clipped)`);
console.log(`descenders: ${descRows.length} Select values with g/j/p/q/y measured, ${descFails.length} clipped`);
if (!descRows.length) { console.error('descenders: no Select value with a descender found on the gallery (the check would be blind)'); process.exit(1); }

/* ---------------------------------------------------------------- LAYOUT test (0.2.3, kit backlog §11)
   On the reading view at 1280, 1440 and 375: the tinted panel's padding is a whole, even pixel count (C128 even split);
   prose lists and .tb-list show markers in teal-ink while a plain UI list under .tb-root stays unmarked; the narrow
   Select keeps >= 160px and its option labels do not wrap. Self-test (L34): fires on a 38.4px panel and a wrapped option. */
const layoutCheck = () => {
  const bad: string[] = [];
  const teal = getComputedStyle(document.documentElement).getPropertyValue('--tb-teal-ink').trim();
  const probe = document.createElement('i'); probe.style.color = teal; document.body.append(probe);
  const tealRgb = getComputedStyle(probe).color; probe.remove();
  for (const el of document.querySelectorAll<HTMLElement>('.tb-panel-tint')) {
    for (const side of ['paddingTop', 'paddingLeft'] as const) {
      const v = parseFloat(getComputedStyle(el)[side]);
      if (!Number.isInteger(v) || v % 2) bad.push(`panel ${side} ${v}px (not a whole even pixel)`);
    }
  }
  const lists: [string, string][] = [['[data-gallery="prose"] > ul', 'disc'], ['[data-gallery="prose"] > ol', 'decimal'], ['[data-gallery="prose"] ul ul', 'circle'], ['[data-gallery="list"]', 'disc'], ['[data-gallery="ui-list"]', 'none']];
  for (const [sel, want] of lists) {
    const el = document.querySelector(sel); if (!el) { bad.push(`${sel} missing`); continue; }
    const got = getComputedStyle(el).listStyleType; if (got !== want) bad.push(`${sel} list-style ${got} (want ${want})`);
    const li = el.querySelector('li');
    if (want !== 'none' && li && getComputedStyle(li, '::marker').color !== tealRgb) bad.push(`${sel} marker ${getComputedStyle(li, '::marker').color} (want teal-ink ${tealRgb})`);
  }
  for (const sel of document.querySelectorAll<HTMLElement>('.tb-select')) {
    const r = sel.getBoundingClientRect(), col = sel.parentElement!.getBoundingClientRect();
    const inGrid = getComputedStyle(sel.parentElement!).display.includes('grid'); // a grid track is not an element: only the run-out check applies
    if (!inGrid && r.width > 0 && r.width < Math.min(160, col.width) - 0.5) bad.push(`select ${r.width}px wide (< min(160, column ${col.width}))`);
    if (r.width > 0 && r.right > col.right + 0.5) bad.push(`select runs out of its ${col.width}px column (${r.width}px)`);
    const v = sel.querySelector('.tb-select-value')?.getBoundingClientRect(), ch = sel.querySelector('.tb-chevron')?.getBoundingClientRect();
    if (v && ch && r.width > 0 && (v.right > ch.left || ch.right > r.right)) bad.push(`select value runs over the chevron or out of the trigger`);
  }
  for (const ink of document.querySelectorAll<HTMLElement>('.tb-option > .tb-ink')) {
    if (getComputedStyle(ink).whiteSpace !== 'nowrap') bad.push(`option "${ink.textContent?.slice(0, 20)}" may wrap`);
  }
  return bad;
};
const layoutFails: string[] = [];
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } }); const page = await ctx.newPage();
  await page.goto(base + 'index.html?view=reading'); await page.waitForSelector('[data-gallery="prose"]');
  await page.addStyleTag({ content: '.tb-panel-tint{padding:38.4px!important}.tb-option>.tb-ink{white-space:normal!important}.tb-select-trigger>.tb-select-value{min-width:auto!important}.tb-select{min-width:160px!important}' });
  const bad = await page.evaluate(layoutCheck);
  await ctx.close();
  if (!bad.some(b => b.startsWith('panel')) || !bad.some(b => b.includes('may wrap')) || !bad.some(b => b.includes('runs over')) || !bad.some(b => b.includes('runs out of its'))) { console.error('layout: SELF-TEST FAILED (does not fire on a bad panel / wrapping option / overflowing value / Select wider than its column)', bad); process.exit(2); }
  if (!ONLY || ONLY.includes('reading')) for (const width of [1280, 1440, 375]) {
    const c2 = await browser.newContext({ viewport: { width, height: 800 } }); const p2 = await c2.newPage();
    await p2.goto(base + 'index.html?view=reading'); await p2.waitForSelector('[data-gallery="prose"]');
    for (const b of await p2.evaluate(layoutCheck)) layoutFails.push(`${width}: ${b}`);
    await c2.close();
  }
}
for (const f of layoutFails) console.error(`LAYOUT ${f}`);
console.log(`layout: tinted panel padding, prose/list markers, Select width, column fit and option wrap at 1280/1440/375: ${layoutFails.length} failures (self-test ok)`);

/* ---------------------------------------------------------------- TABLE test (0.3.0, Live Artifacts S5)
   On the table view at 1280 and 375, light and dark: at <= 480px the table never scrolls sideways (no box and no page
   overflow), every column is on screen (the Status tag included) with its head text as label, the head row is visually
   hidden, rows are blocks, and the label text meets AA against the ground. At 1280 the table stays a ledger table (head
   row shown, no labels, last column right-aligned). Self-test (L34): fires when the stacked rule is switched off at 375px. */
const tableCheck = () => {
  const bad: string[] = [];
  const t = document.querySelector<HTMLElement>('[data-gallery="receipts"]'); if (!t) return ['receipts table missing'];
  const narrow = window.innerWidth <= 480;
  const tr = t.getBoundingClientRect(), box = (t.parentElement as HTMLElement).getBoundingClientRect();
  const docW = document.documentElement.scrollWidth;
  if (docW > window.innerWidth + 0.5) bad.push(`page scrolls sideways (${docW}px in ${window.innerWidth}px)`);
  if (t.scrollWidth > t.clientWidth + 0.5 || tr.right > box.right + 0.5) bad.push(`table runs out of its box (content ${t.scrollWidth}px, box ${Math.round(box.width)}px)`);
  const heads = [...t.querySelectorAll('thead th')].map(h => (h.textContent ?? '').trim());
  const head = t.querySelector('thead')!.getBoundingClientRect();
  const cv = document.createElement('canvas'); cv.width = cv.height = 1; const cx = cv.getContext('2d', { willReadFrequently: true })!;
  const rgba = (c: string) => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lum = (c: number[]) => { const f = (v: number) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const ground = (el: Element) => { for (let e: Element | null = el; e; e = e.parentElement) { const c = rgba(getComputedStyle(e).backgroundColor); if (c[3] >= 1) return c; } return [255, 255, 255, 1]; };
  for (const row of t.querySelectorAll<HTMLElement>('tbody tr')) {
    const cells = [...row.children] as HTMLElement[];
    if (cells.length !== heads.length) { bad.push(`row has ${cells.length} cells for ${heads.length} heads`); continue; }
    cells.forEach((td, i) => {
      const r = td.getBoundingClientRect(), label = getComputedStyle(td, '::before');
      if (r.width < 1 || r.height < 1) bad.push(`cell "${heads[i]}" is not visible`);
      if (r.right > tr.right + 0.5 || r.left < tr.left - 0.5) bad.push(`cell "${heads[i]}" is outside the table (${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(tr.left)}..${Math.round(tr.right)})`);
      if (narrow) {
        const want = i === 0 ? 'none' : JSON.stringify(heads[i]);
        const shown = i === 0 ? (label.display === 'none' || label.content === 'none' ? 'none' : label.content) : label.content;
        if (shown !== want) bad.push(`cell "${heads[i]}" label ${shown} (want ${want})`);
        if (i > 0) {
          const fg = rgba(label.color), bg = ground(td); const [a, b] = [lum(fg), lum(bg)].sort((p, q) => q - p);
          if ((a + .05) / (b + .05) < 4.5) bad.push(`label "${heads[i]}" contrast ${Math.round((a + .05) / (b + .05) * 100) / 100} < 4.5`);
        }
      } else if (label.content !== 'none' && label.content !== 'normal') bad.push(`wide cell "${heads[i]}" shows a label ${label.content}`);
    });
    if (narrow && getComputedStyle(row).display !== 'block') bad.push(`row display ${getComputedStyle(row).display} (want block)`);
    if (narrow && cells.length > 1 && cells[2].querySelector('.tb-tag') === null) bad.push('status tag missing');
  }
  if (narrow) { if (head.width > 2 || head.height > 2) bad.push(`head row is visible (${head.width}x${head.height})`); }
  else {
    if (head.height < 10) bad.push('head row hidden on a wide screen');
    if (getComputedStyle(t).display !== 'table') bad.push(`wide table display ${getComputedStyle(t).display}`);
    const last = t.querySelector<HTMLElement>('tbody tr:first-child td:last-child')!;
    if (getComputedStyle(last).textAlign !== 'right') bad.push(`wide last column text-align ${getComputedStyle(last).textAlign}`);
  }
  return bad;
};
const tableFails: string[] = [];
{
  const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } }); const page = await ctx.newPage();
  await page.goto(base + 'index.html?view=table'); await page.waitForSelector('[data-gallery="receipts"] td');
  await page.addStyleTag({ content: '.tb-table,.tb-table tbody,.tb-table tr,.tb-table td,.tb-table thead{display:revert!important;position:static!important;width:auto!important;height:auto!important;clip-path:none!important}.tb-table th,.tb-table td{white-space:nowrap!important}.tb-table td::before{content:none!important}' });
  const bad = await page.evaluate(tableCheck);
  await ctx.close();
  if (!bad.some(b => b.includes('scrolls sideways') || b.includes('runs out of its box')) || !bad.some(b => b.includes('head row is visible')) || !bad.some(b => b.includes('label')) || !bad.some(b => b.includes('display'))) { console.error('table: SELF-TEST FAILED (does not fire on an unstacked, sideways-scrolling table)', bad); process.exit(2); }
  if (!ONLY || ONLY.includes('table')) for (const width of [1280, 375]) for (const theme of ['light', 'dark']) {
    const c2 = await browser.newContext({ viewport: { width, height: 812 } }); const p2 = await c2.newPage();
    await p2.goto(base + 'index.html?view=table'); await p2.waitForSelector('[data-gallery="receipts"] td');
    await p2.evaluate((dark) => { if (dark) document.documentElement.setAttribute('data-theme', 'dark'); return document.fonts.ready; }, theme === 'dark');
    for (const b of await p2.evaluate(tableCheck)) tableFails.push(`${width} ${theme}: ${b}`);
    await c2.close();
  }
}
for (const f of tableFails) console.error(`TABLE ${f}`);
console.log(`table: stacked at <= 480px (no sideways scroll, every column and label shown, AA labels), ledger at 1280, light + dark: ${tableFails.length} failures (self-test ok)`);

const inkFails = inkRows.filter(r => Math.abs(r.diff) > .5);
const byControl = new Map<string, number[]>();
for (const r of inkRows) { const k = r.control.replace(/\.(primary|quiet|danger|confirm|lg|sm|block|live|busy|needs-you|idle|open|ink|code|tb-ink|hide-phone|only-phone|tb-next|hide-wide)\b/g, '').replace(/\.$/, ''); byControl.set(k, [...(byControl.get(k) ?? []), r.diff]); }
writeFileSync(join(out, 'ink-report.json'), JSON.stringify({ when: new Date().toISOString(), measured: inkRows.length, failures: inkFails, summary: Object.fromEntries([...byControl].map(([k, d]) => [k, { n: d.length, maxAbsDiff: Math.max(...d.map(Math.abs)), mean: Math.round(d.reduce((x, y) => x + y, 0) / d.length * 100) / 100 }])) }, null, 2));
for (const f of inkFails.slice(0, 40)) console.error(`INK ${f.page} ${f.width}@${f.dpr}x ${f.theme} ${f.control} "${f.label}" h${f.height}: top ${f.top} bottom ${f.bottom} diff ${f.diff}`);
console.log(`ink: ${inkRows.length} control labels measured (DPR 1 + 2, light + dark, 1280 + 375), ${inkFails.length} off-centre by > 0.5px`);
for (const [k, d] of byControl) console.log(`  ${k.padEnd(28)} n=${String(d.length).padStart(4)} max|diff|=${Math.max(...d.map(Math.abs)).toFixed(2)}`);

await browser.close();
server.close();

// de-duplicate identical findings across states
const uniq = [...new Map(report.map(r => [`${r.page}|${r.width}|${r.theme}|${r.what}|${r.where}`, r])).values()];
if (!inkOnly) writeFileSync(join(out, 'contrast-report.json'), JSON.stringify({ when: new Date().toISOString(), pagesRendered: pages.length, screenshots: shots, pairsChecked: checked, failures: uniq }, null, 2));
for (const f of uniq) console.error(`FAIL ${f.page} ${f.width} ${f.theme} [${f.state}] ${f.what} ${f.ratio} < ${f.need}: ${f.where}`);
if (!inkOnly) console.log(`screens: ${shots} screenshots, ${checked} rendered pairs checked (text + outlines, default/hover/focus/open), ${uniq.length} failures`);
process.exit(uniq.length || inkFails.length || descFails.length || layoutFails.length || tableFails.length ? 1 : 0);
