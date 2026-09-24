// The paint measurement over the built React page.
//
//   node tools/paint.mjs                          build first; serves dist/ with vite preview
//   node tools/paint.mjs --base <url>             a page already served (the live site, say)
//
// Written 2026-09-24, step 5 of docs/CONVERSION_PLAN.md. It replaces
// smoke-measure.py, which measured the page before the conversion through that
// page's own markup (the native selects, the vanilla steppers, the old mode
// buttons) and could not drive the React page. Step 4 ran the same walk from a
// scratch script; this is that script, kept.
//
// WHAT IT MEASURES, per state and width:
//   - The design system's paint probe (livetools-design-system,
//     packages/ui/.storybook/paint-probe.ts, D59 there): icon slots square at
//     their token, every control at the control height, icon buttons on both
//     axes, select faces wide enough for their widest option, table rows whose
//     cells sit side by side, and no hit area under the minimum. Run as
//     rendered, at the other two densities, with no density attribute, under a
//     real coarse pointer, and under forced colours, where every control must
//     keep a visible edge. The probe is compiled here from its one source and
//     never copied, as the design system's own proof-page pass does
//     (scripts/proof-pages.mjs there).
//   - What only this page has, carried over from smoke-measure.py: the charts
//     share one track height and one mark height, and a mark never fills its
//     whole track (the 2026-08-20 finding: the two charts drew the same kind of
//     bar at two geometries). And with every fold open the page does not
//     scroll sideways (the 2026-08-31 finding: an expanded table widened the
//     page), checked at the wide width only: at 390 px a long badge's words do
//     not wrap and the page scrolls sideways, on the old page exactly as on
//     this one (docs/CONVERSION_FINDINGS.md).
//   - That the page loaded cleanly: no console error, no uncaught error, no
//     failed request, the provider's three attributes on <html> and its one
//     sprite with its symbols.
//
// WHERE ITS PIECES COME FROM. Playwright is not a dependency of this repo; it
// is found as tools/baseline.mjs finds it ($PLAYWRIGHT_MODULE, a `playwright`
// package, then the design-system checkout beside this one). TypeScript is
// this repo's own. The probe's source is read from the design-system checkout
// ($LIVETOOLS_DS, else ../livetools-design-system), because the published
// package does not ship it. If any of the three is missing it stops with exit
// code 2 and says so. It never skips quietly: a measurement that did not run
// must not read as one that passed.
//
// Never port 6006. The server it starts is stopped whatever the result.

import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const baseArg = args.includes('--base') ? args[args.indexOf('--base') + 1] : undefined;
const started = Date.now();

function stop2(message) {
  console.error(`paint: ${message} Nothing was measured.`);
  process.exit(2);
}

// ---------------------------------------------------------------------------
// The pieces
// ---------------------------------------------------------------------------
const ds = resolve(process.env.LIVETOOLS_DS ?? join(repo, '..', 'livetools-design-system'));
const probeSource = join(ds, 'packages', 'ui', '.storybook', 'paint-probe.ts');
if (!existsSync(probeSource)) stop2(`the design system's paint probe is not at ${probeSource}. Set LIVETOOLS_DS to the design-system checkout.`);

let chromium;
for (const c of [process.env.PLAYWRIGHT_MODULE, 'playwright', join(ds, 'node_modules', 'playwright')].filter(Boolean)) {
  try { ({ chromium } = require(c)); break; } catch { /* try the next */ }
}
if (!chromium) stop2('Playwright not found. Set PLAYWRIGHT_MODULE to a playwright package folder.');

const ts = require('typescript');
const { outputText } = ts.transpileModule(readFileSync(probeSource, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  fileName: 'paint-probe.ts',
});
// CommonJS output writes to `exports`; hand it one on window.
const probe = `window.__ltPaint = {}; (function (exports) {\n${outputText}\n})(window.__ltPaint);`;

// ---------------------------------------------------------------------------
// The states: both modes, the fold of four or more warnings, and a refusal.
// Step 4's four. The queries come from the baseline's list where it names them.
// ---------------------------------------------------------------------------
const listed = JSON.parse(readFileSync(join(repo, 'tests', 'baseline', 'states.json'), 'utf8')).states;
const query = (name) => {
  const s = listed.find((x) => x.name === name);
  if (!s) stop2(`tests/baseline/states.json has no state called ${name}.`);
  return s.query;
};
const STATES = [
  { name: 'routing, the default page', query: '', charts: true },
  { name: 'drilling, an 8 mm dowel drill', query: 'k=drill&dt=dowel&dd=8&hd=30', charts: true },
  { name: 'four warnings folded into one list', query: query('four-warnings-fold-into-one-list'), charts: true },
  { name: 'a refusal', query: query('refusal-ball-nose-in-hpl'), charts: false },
];
const WIDTHS = [1280, 390];
const WIDE = 1280;
const DENSITIES = ['compact', 'comfortable', 'spacious'];
// A floor, because a probe that matches nothing reads green: the form alone
// has more controls than this at every state.
const MIN_CONTROLS = 8;

// ---------------------------------------------------------------------------
// The server: vite preview over dist/, on a free port that is never 6006.
// ---------------------------------------------------------------------------
function freePort() {
  return new Promise((ok, fail) => {
    const s = createServer();
    s.unref();
    s.on('error', fail);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => (port === 6006 ? freePort().then(ok, fail) : ok(port)));
    });
  });
}

async function startPreview() {
  if (!existsSync(join(repo, 'dist', 'index.html'))) stop2('dist/index.html is missing. Build first (npm run build).');
  const { preview } = await import('vite');
  const port = await freePort();
  const server = await preview({
    root: repo,
    logLevel: 'silent',
    preview: { port, strictPort: true, host: '127.0.0.1', open: false },
  });
  return { base: `http://127.0.0.1:${port}/`, stop: () => server.close() };
}

// ---------------------------------------------------------------------------
// One state at one width
// ---------------------------------------------------------------------------
async function measureState(browser, base, st, width) {
  const failures = [];
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') failures.push(`console error: ${m.text()}`); });
  page.on('pageerror', (e) => failures.push(`uncaught error in the page: ${e.message}`));
  page.on('requestfailed', (r) => failures.push(`request failed: ${r.url()} (${r.failure()?.errorText})`));
  try {
    const url = new URL(base);
    url.search = st.query ? `?${st.query}` : '';
    const res = await page.goto(url.href, { waitUntil: 'networkidle' });
    if (!res || !res.ok()) failures.push(`the page answered ${res?.status()} at ${url.href}`);
    await page.evaluate(() => document.fonts.ready);
    // Every fold open, so the tables, the advanced fields and the lists
    // under "Something looks wrong" are measured too.
    await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
    await page.waitForTimeout(200);

    const shape = await page.evaluate(() => {
      const h = document.documentElement;
      const s = document.querySelector('svg.lt-sprite');
      return {
        density: h.getAttribute('data-lt-density'),
        scheme: h.getAttribute('data-lt-scheme'),
        theme: h.getAttribute('data-lt-theme'),
        sprites: document.querySelectorAll('svg.lt-sprite').length,
        symbols: s ? s.querySelectorAll('symbol').length : 0,
      };
    });
    for (const a of ['density', 'scheme', 'theme']) if (!shape[a]) failures.push(`<html> has no data-lt-${a} attribute`);
    if (shape.sprites !== 1) failures.push(`the page has ${shape.sprites} svg.lt-sprite elements, expected exactly 1`);
    else if (!shape.symbols) failures.push('the sprite is in the page but holds no symbols');

    // The page's own geometry (from smoke-measure.py).
    const own = await page.evaluate(() => {
      const heights = (sel) => [...document.querySelectorAll(sel)]
        .filter((el) => el.checkVisibility())
        .map((el) => Math.round(el.getBoundingClientRect().height * 100) / 100);
      return {
        tracks: heights('.casc-bar, .ladder-track'),
        marks: heights('.casc-fill, .ladder-bar'),
        pageFits: document.documentElement.scrollWidth <= window.innerWidth + 1,
        widest: document.documentElement.scrollWidth,
      };
    });
    if (st.charts && (!own.tracks.length || !own.marks.length)) {
      failures.push(`[charts] measured ${own.tracks.length} chart tracks and ${own.marks.length} marks where this state draws charts; the measurement no longer sees them`);
    }
    const tracks = [...new Set(own.tracks)].sort((a, b) => a - b);
    const marks = [...new Set(own.marks)].sort((a, b) => a - b);
    if (tracks.length > 1) failures.push(`[charts] the chart tracks are drawn at ${tracks.length} heights (${tracks.join(', ')} px), not one`);
    if (marks.length > 1) failures.push(`[charts] the chart marks are drawn at ${marks.length} heights (${marks.join(', ')} px), not one`);
    if (tracks.length && marks.length && !(marks[marks.length - 1] < tracks[0])) {
      failures.push(`[charts] a mark fills its whole track (mark ${marks.join(', ')} px in a track of ${tracks.join(', ')} px)`);
    }
    if (width >= WIDE && !own.pageFits) failures.push(`[page] with every fold open the page is ${own.widest} px wide in a ${width} px window, so it scrolls sideways`);

    // The design system's probe, in every variant.
    await page.addScriptTag({ content: probe });
    const measure = (mode, label) => page.evaluate(([m, l]) => {
      const r = window.__ltPaint.measurePaint(m);
      return { counts: r.counts, failures: r.failures.map((f) => `[${l}] ${f}`) };
    }, [mode, label]);
    const results = [await measure('baseline', `as rendered, ${shape.density}`)];
    for (const d of DENSITIES) {
      if (d === shape.density) continue;
      await page.evaluate((v) => document.documentElement.setAttribute('data-lt-density', v), d);
      results.push(await measure('baseline', d));
    }
    await page.evaluate(() => document.documentElement.removeAttribute('data-lt-density'));
    results.push(await measure('baseline', 'no density attribute'));
    await page.evaluate((v) => document.documentElement.setAttribute('data-lt-density', v), shape.density);
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    if (await page.evaluate(() => matchMedia('(pointer: coarse)').matches)) results.push(await measure('coarse', 'coarse pointer'));
    else failures.push('[coarse] the browser did not report a coarse pointer after touch emulation was switched on');
    await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: false });
    await page.emulateMedia({ forcedColors: 'active' });
    if (await page.evaluate(() => matchMedia('(forced-colors: active)').matches)) results.push(await measure('forced-colours', 'forced colours'));
    else failures.push('[forced colours] the browser did not report forced colours after emulation was switched on');

    for (const r of results) failures.push(...r.failures);
    const c = results[0].counts;
    if (c.controls < MIN_CONTROLS) failures.push(`[floor] only ${c.controls} controls measured, expected at least ${MIN_CONTROLS}; the probe is no longer seeing the page`);
    const summary = `${results.length} variants; ${c.icons} icon slots, ${c.controls} controls, ${c.targets} targets, ${c.rows} table rows; `
      + `${own.tracks.length} chart tracks, ${own.marks.length} marks`;
    return { failures, summary };
  } finally {
    await context.close();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const server = baseArg ? null : await startPreview();
const base = baseArg ?? server.base;
console.log(`paint: the page at ${base}, probe from ${probeSource}`);
let bad = 0;
const browser = await chromium.launch();
try {
  for (const st of STATES) {
    for (const width of WIDTHS) {
      const { failures, summary } = await measureState(browser, base, st, width);
      console.log(`  ${failures.length ? 'FAIL' : 'ok  '}  ${st.name} at ${width} px: ${summary}`);
      // The same finding in several variants is printed once.
      const seen = new Set();
      for (const f of failures) {
        const k = f.replace(/^\[[^\]]*\] /, '');
        if (seen.has(k)) continue;
        seen.add(k);
        console.log(`        ${f}`);
      }
      if (failures.length) bad++;
    }
  }
} finally {
  await browser.close();
  await server?.stop();
}
const took = Math.round((Date.now() - started) / 1000);
console.log(bad ? `\npaint: ${bad} of ${STATES.length * WIDTHS.length} FAILED (${took} s)` : `\npaint: all ${STATES.length * WIDTHS.length} passed (${took} s)`);
process.exitCode = bad ? 1 : 0;
