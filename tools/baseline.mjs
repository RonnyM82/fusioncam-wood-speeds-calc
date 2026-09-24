// The public page's baseline: what a machinist reads, captured per link.
//
//   node tools/baseline.mjs                         capture into tests/baseline/
//   node tools/baseline.mjs --compare               capture again and compare
//   node tools/baseline.mjs --base http://localhost:4173/ --compare
//   node tools/baseline.mjs --out <dir>             capture somewhere else
//   node tools/baseline.mjs --only name,name        a subset of the states
//
// Written 2026-09-24 as step 0 of the React conversion (docs/CONVERSION_SURVEY.md,
// sections 8 and 9). The conversion is judged by reproducing these files at zero
// differences. A number that drifts looks fine in review; a byte that drifts
// here does not.
//
// Without --base it serves this repo with tools/serve.js on a free port (never
// 6006), loads the page as it was before the conversion, and stops the server
// afterwards. That page is legacy.html since step 1 of the conversion
// (2026-09-24), when index.html became the React page; it is the old
// index.html renamed, not a byte changed, so its relative addresses still
// resolve. With --base it loads that page instead: a `vite preview`, or
// wood.fusioncam.co itself.
//
// Playwright is not a dependency of this repo, and this file adds none. It is
// found, in order, at $PLAYWRIGHT_MODULE, then as a plain `playwright` package
// (for when the repo has its own node_modules), then in the design-system
// checkout beside this one (../livetools-design-system/node_modules/playwright).
// If none resolves it stops with exit 2 and says so. It never skips quietly,
// because a comparison that did not run must not read as one that passed.
//
// WHAT IS NORMALISED, and nothing else:
//   - Text is read with innerText: what the browser renders as text, after its
//     own white-space collapsing and CSS text-transform. No trimming, no
//     rounding, no whitespace changes on top of that.
//   - Before reading, every <details> in the results, the diagnostics and the
//     Advanced fold is opened, so the table twins and the advanced fields are
//     rendered text rather than raw template whitespace. Opening a fold changes
//     no number.
//   - The URL is recorded as location.search only. The origin and path differ
//     between this server, vite preview and the live site; the query is what a
//     shared link carries.
//   - Positions are the strings the code wrote into the style attribute, with
//     the property name and the % sign taken off. Nothing is re-rounded.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const compare = args.includes('--compare');
const baseArg = opt('--base');
const outDir = resolve(opt('--out') ?? join(repo, 'tests', 'baseline'));
const only = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean);
const baselineDir = join(repo, 'tests', 'baseline');

// ---------------------------------------------------------------------------
// Playwright, found without installing anything
// ---------------------------------------------------------------------------
function findPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    'playwright',
    join(repo, '..', 'livetools-design-system', 'node_modules', 'playwright'),
    'C:/source/livetools-design-system/node_modules/playwright',
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      return { mod: require(c), from: require.resolve(c) };
    } catch { /* try the next */ }
  }
  console.error('baseline: Playwright not found. Looked at:\n  ' + candidates.join('\n  ') +
    '\nSet PLAYWRIGHT_MODULE to a playwright package folder. Nothing was captured or compared.');
  process.exit(2);
}

// ---------------------------------------------------------------------------
// A local server, when no --base is given
// ---------------------------------------------------------------------------
function freePort() {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => (port === 6006 ? freePort().then(res, rej) : res(port)));
    });
    s.on('error', rej);
  });
}

async function startServer() {
  const port = await freePort();
  const child = spawn(process.execPath, [join(repo, 'tools', 'serve.js'), String(port)], {
    cwd: repo, stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('tools/serve.js did not start')), 10000);
    child.stdout.on('data', (b) => { if (String(b).includes('serving on')) { clearTimeout(t); res(); } });
    child.on('exit', (code) => rej(new Error(`tools/serve.js exited ${code}`)));
  });
  return { base: `http://localhost:${port}/legacy.html`, stop: () => child.kill() };
}

// ---------------------------------------------------------------------------
// The in-page reader. Runs inside the browser, so it must be self-contained.
//
// SELECTORS. Everything below that names a class or an id is today's markup.
// The converted page is allowed to change markup, and when it does, the
// selectors here are what changes, in the same commit, and the JSON it
// produces must not. Changing the shape of the output to make a comparison
// pass defeats the point of the baseline.
// ---------------------------------------------------------------------------
function readPage() {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const text = (el) => (el ? el.innerText : null);
  const variantOf = (el, prefix) => {
    const c = [...el.classList].find((x) => x.startsWith(prefix));
    return c ? c.slice(prefix.length) : null;
  };
  const iconOf = (el) => {
    const use = $('use', el);
    return use ? use.getAttribute('href') : null;
  };
  // The value the code wrote for one property in a style attribute, as written.
  const styleNum = (el, prop) => {
    if (!el) return null;
    const s = el.getAttribute('style') || '';
    const m = s.match(new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`));
    return m ? m[1].trim().replace(/%$/, '') : null;
  };

  // Open every fold first, so what is read is rendered text.
  for (const d of $$('#results details, #diagnostics details, details#advanced')) d.open = true;

  const banner = (el) => ({
    role: 'banner',
    variant: variantOf(el, 'lt-alert--'),
    icon: iconOf(el),
    ariaRole: el.getAttribute('role'),
    title: text($('.lt-alert__title', el)),
    paragraphs: $$('p', el).map(text),
    list: $$('li', el).map(text),
    text: text(el),
  });

  const table = (el) => ({
    role: 'table',
    summary: text($('summary', el)),
    caption: text($('caption', el)),
    headers: $$('thead th', el).map(text),
    rows: $$('tbody tr', el).map((tr) => [...tr.children].map((c) => ({
      header: c.tagName === 'TH', text: text(c),
    }))),
  });

  const ladder = (el) => {
    const rows = $$('.ladder-row', el).map((r) => {
      const bar = $('.ladder-bar', r);
      const mark = $('.ladder-mark', r);
      return {
        label: text($('.ladder-label', r)),
        tag: text($('.ladder-tag', r)),
        value: text($('.ladder-range', r)),
        emphasis: !!bar && bar.classList.contains('lt-chart-emphasis'),
        serving: r.classList.contains('is-serving'),
        barLeft: styleNum(bar, 'left'),
        barWidth: styleNum(bar, 'width'),
        marker: styleNum(mark, 'left'),
        name: r.getAttribute('aria-label'),
      };
    });
    return {
      role: 'chart',
      kind: 'ladder',
      heading: text($('.ladder-head h2', el)),
      units: text($('.ladder-units', el)),
      emphasised: rows.filter((r) => r.emphasis).map((r) => r.label),
      rows,
      legend: text($('.ladder-legend', el)),
      table: $('details.table-twin', el) ? table($('details.table-twin', el)) : null,
    };
  };

  const cascade = (el) => {
    const rows = $$('.casc-row', el).map((r) => {
      const fill = $('.casc-fill', r);
      const val = $('.casc-val', r);
      return {
        label: text($('.casc-label', r)),
        metric: val && val.firstChild && val.firstChild.nodeType === 3 ? val.firstChild.textContent : null,
        imperial: text($('.imperial', val || r)),
        emphasis: !!fill && fill.classList.contains('lt-chart-emphasis'),
        binds: r.classList.contains('is-bind'),
        farAbove: r.classList.contains('na'),
        fillWidth: styleNum(fill, 'width'),
        name: r.getAttribute('aria-label'),
      };
    });
    return {
      role: 'chart',
      kind: 'cascade',
      emphasised: rows.filter((r) => r.emphasis).map((r) => r.label),
      rows,
    };
  };

  const block = (el) => {
    if (el.matches('.lt-alert')) return banner(el);
    if (el.matches('dl.out-card')) {
      return {
        role: 'outputs',
        rows: $$('.out-row', el).map((r) => ({
          label: text($('.out-label', r)),
          metric: text($('.metric', r)),
          imperial: text($('.imperial', r)),
          secondary: r.classList.contains('secondary'),
          note: text($('.row-note', r)),
        })),
      };
    }
    if (el.matches('.notes')) {
      return { role: 'notes', title: text($('.notes-title', el)), items: $$('li', el).map(text) };
    }
    if (el.matches('.ladder')) return ladder(el);
    if (el.matches('.cascade')) return cascade(el);
    if (el.matches('details.table-twin')) return table(el);
    if (el.matches('h2, h3')) return { role: 'heading', level: el.tagName, text: text(el) };
    if (el.matches('.lt-row') && $('.lt-badge', el)) {
      return {
        role: 'badges',
        badges: $$('.lt-badge', el).map((b) => ({
          variant: variantOf(b, 'lt-badge--'), icon: iconOf(b), text: text(b),
        })),
      };
    }
    // Anything this reader does not know still lands in the file, whole.
    return { role: 'other', tag: el.tagName, className: el.className, text: text(el) };
  };

  const section = (id) => {
    const host = document.getElementById(id);
    if (!host) return { present: false };
    return { present: true, text: text(host), blocks: [...host.children].map(block) };
  };

  // The form as a machinist sees it after load: every painted field's label,
  // what the box shows, its unit, its hint and any message under it. The data-
  // derived sentences live here (the machine note, the first-cut label, the
  // advanced hints that quote the data), and so does risk 2: the machine max
  // feed shows in m/min.
  const painted = (el) => el.checkVisibility();
  const fields = $$('#inputs .lt-field').filter(painted).map((f) => {
    const group = $('[role="radiogroup"]', f);
    const check = $('.lt-check input', f);
    const select = $('select', f);
    const input = $('input.lt-input', f);
    const affix = $('.lt-affix', f);
    const msg = $('.lt-field__error, .lt-field__warning', f);
    const out = { label: text($('.lt-field__label', f)) };
    if (group) {
      out.options = $$('[role="radio"]', group).map(text);
      out.chosen = $$('[role="radio"][aria-checked="true"]', group).map(text);
    } else if (check) {
      out.checkLabel = text(check.closest('.lt-check'));
      out.checked = check.checked;
    } else if (select) {
      out.shows = select.selectedOptions[0] ? select.selectedOptions[0].text : null;
      out.options = [...select.options].map((o) => o.text);
    } else if (input) {
      out.shows = input.value;
      out.unit = affix && painted(affix) ? text(affix) : null;
      out.invalid = input.getAttribute('aria-invalid');
    }
    out.hint = text($('.lt-field__hint', f));
    out.message = text(msg);
    return out;
  });
  const legend = $('#inputs fieldset legend');
  const toolPicker = {
    legend: text(legend),
    options: $$('#inputs fieldset input[type="radio"]').map((r) => text(r.closest('label'))),
    chosen: $$('#inputs fieldset input[type="radio"]').filter((r) => r.checked).map((r) => text(r.closest('label'))),
  };

  return {
    url: location.search,
    form: { toolPicker, fields },
    results: section('results'),
    diagnostics: section('diagnostics'),
  };
}

// ---------------------------------------------------------------------------
// Driving one state
// ---------------------------------------------------------------------------
async function settle(page) {
  // The page has rendered when #results has content, or when #results is gone
  // (a load failure replaces the whole panel). Then the read is repeated until
  // two in a row agree, so a late effect or a second render is waited out
  // rather than raced.
  await page.waitForFunction(() => {
    const r = document.getElementById('results');
    return !r || r.childElementCount > 0;
  }, null, { timeout: 20000 });
  let prev = JSON.stringify(await page.evaluate(readPage));
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(100);
    const next = JSON.stringify(await page.evaluate(readPage));
    if (next === prev) return JSON.parse(next);
    prev = next;
  }
  throw new Error('the page did not settle in 4 seconds');
}

function fieldByLabel(page, label) {
  return page.getByLabel(label, { exact: true }).filter({ visible: true });
}

async function act(page, a) {
  if (a.click) {
    await page.getByRole(a.click.role, { name: a.click.name, exact: a.click.exact ?? false })
      .filter({ visible: true }).click();
  } else if (a.fill) {
    await fieldByLabel(page, a.fill.label).fill(a.fill.text);
  } else if (a.blur) {
    await fieldByLabel(page, a.blur.label).blur();
  } else {
    throw new Error(`unknown action ${JSON.stringify(a)}`);
  }
}

async function capture(browser, base, st) {
  const ctx = await browser.newContext({
    viewport: { width: 900, height: 1000 },
    locale: 'en-NZ',
    timezoneId: 'Pacific/Auckland',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message)));
  const url = new URL(base);
  url.search = st.query ? `?${st.query}` : '';
  await page.goto(url.href, { waitUntil: 'networkidle' });

  const steps = [];
  let snap = await settle(page);
  for (const a of st.actions ?? []) {
    if (a.snapshot) {
      steps.push({ after: a.snapshot, ...snap });
      continue;
    }
    await act(page, a);
    snap = await settle(page);
  }
  await ctx.close();
  if (errors.length) throw new Error(`page errors in ${st.name}: ${errors.join(' | ')}`);

  const head = { state: st.name, shows: st.shows, query: st.query, actions: st.actions ?? [] };
  if (st.kind === 'today-unreadable') {
    return {
      WARNING: 'TODAY\'S BEHAVIOUR, RULED TO CHANGE. Scott has ruled that the converted page shows no numbers while a box holds something it cannot read. This file records what the vanilla page did on 2026-09-24 so the change can be seen. It is NOT a target, and the comparison skips it.',
      ...head,
      steps: [...steps, { after: 'the end of the actions', ...snap }],
    };
  }
  return { ...head, ...snap };
}

// ---------------------------------------------------------------------------
// Comparing
// ---------------------------------------------------------------------------
function diffPaths(a, b, path = '', out = []) {
  if (out.length >= 12) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') {
    if (a === b) return out;
    // A whole section's text runs to dozens of lines. Name the first line that
    // differs rather than printing both in full; the blocks say the rest.
    if (typeof a === 'string' && typeof b === 'string' && (a.includes('\n') || b.includes('\n'))) {
      const la = a.split('\n');
      const lb = b.split('\n');
      let i = 0;
      while (i < la.length && i < lb.length && la[i] === lb[i]) i++;
      out.push(`${path}, line ${i + 1} of ${la.length} (now ${lb.length})\n      was: ${JSON.stringify(la[i])}\n      now: ${JSON.stringify(lb[i])}`);
      return out;
    }
    out.push(`${path || '(root)'}\n      was: ${JSON.stringify(a)}\n      now: ${JSON.stringify(b)}`);
    return out;
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  for (const k of keys) diffPaths(a[k], b[k], Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`, out);
  return out;
}

const serialise = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const list = JSON.parse(readFileSync(join(baselineDir, 'states.json'), 'utf8'));
let states = [
  ...list.states.map((s) => ({ ...s, kind: 'baseline' })),
  ...list.todayUnreadable.map((s) => ({ ...s, kind: 'today-unreadable' })),
];
const names = new Set();
for (const s of states) {
  if (names.has(s.name)) throw new Error(`duplicate state name ${s.name}`);
  names.add(s.name);
}
if (only) states = states.filter((s) => only.includes(s.name));
if (compare) states = states.filter((s) => s.kind === 'baseline');

const { mod: playwright, from } = findPlaywright();
console.log(`baseline: Playwright from ${from}`);
const server = baseArg ? null : await startServer();
const base = baseArg ?? server.base;
console.log(`baseline: page at ${base}`);

const browser = await playwright.chromium.launch();
let failed = 0;
try {
  if (!compare) mkdirSync(outDir, { recursive: true });
  for (const st of states) {
    const file = `${st.kind === 'today-unreadable' ? 'today-unreadable-' : ''}${st.name}.json`;
    let body;
    try {
      body = serialise(await capture(browser, base, st));
    } catch (err) {
      failed++;
      console.log(`  ERROR  ${st.name}: ${err.message}`);
      continue;
    }
    if (compare) {
      const path = join(baselineDir, file);
      const want = existsSync(path) ? readFileSync(path, 'utf8') : null;
      if (want === body) {
        console.log(`  same   ${st.name}`);
      } else {
        failed++;
        console.log(`  DIFF   ${st.name}`);
        if (want === null) console.log('      no baseline file');
        else for (const d of diffPaths(JSON.parse(want), JSON.parse(body))) console.log(`    ${d}`);
      }
    } else {
      writeFileSync(join(outDir, file), body);
      console.log(`  wrote  ${file}`);
    }
  }
  if (!compare && !only) {
    // Provenance for the files, kept apart from them so that comparing never
    // trips on it. The Chromium version matters: the thousands separators come
    // from its ICU data through toLocaleString('en-NZ').
    let commit = null;
    try { commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo }).toString().trim(); } catch { /* not a checkout */ }
    writeFileSync(join(outDir, '_manifest.json'), serialise({
      capturedFrom: baseArg ? base : 'tools/serve.js on this checkout',
      commit,
      browser: `chromium ${browser.version()}`,
      playwright: require(join(dirname(from), 'package.json')).version,
      viewport: '900x1000, locale en-NZ, light scheme',
      states: states.filter((s) => s.kind === 'baseline').length,
      todayUnreadable: states.filter((s) => s.kind === 'today-unreadable').length,
    }));
  }
} finally {
  await browser.close();
  server?.stop();
}

const leftovers = compare ? [] : readdirSync(outDir)
  .filter((f) => f.endsWith('.json') && f !== 'states.json' && f !== '_manifest.json')
  .filter((f) => !states.some((s) => f === `${s.kind === 'today-unreadable' ? 'today-unreadable-' : ''}${s.name}.json`));
if (leftovers.length && !only) console.log(`\nfiles for states no longer in the list: ${leftovers.join(', ')}`);

console.log(failed ? `\nbaseline: ${failed} ${compare ? 'differ' : 'failed'}` : `\nbaseline: ${states.length} ${compare ? 'identical' : 'captured'}`);
process.exitCode = failed ? 1 : 0;
