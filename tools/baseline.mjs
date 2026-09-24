// The public page's baseline: what a machinist reads, captured per link.
//
//   node tools/baseline.mjs                         capture into tests/baseline/
//   node tools/baseline.mjs --compare               capture again and compare
//   node tools/baseline.mjs --base http://localhost:4173/ --compare
//   node tools/baseline.mjs --out <dir>             capture somewhere else
//   node tools/baseline.mjs --only name,name        a subset of the states
//   node tools/baseline.mjs --compare --sections url,form   compare only these parts
//   node tools/baseline.mjs --compare --url-only    the same as --sections url
//   node tools/baseline.mjs --compare --no-charts   leave the charts out of both sides
//   node tools/baseline.mjs --compare --no-accepted apply none of the accepted differences
//
// Against the React page, --compare applies the ruled differences listed in
// tests/baseline/accepted-differences.json (step 5 of the conversion,
// 2026-09-24; see applyAccepted below), and nothing else is relaxed. Against
// legacy.html, or any other copy of the old page, it applies none.
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
//     the property name and the % sign taken off. Nothing is re-rounded. The
//     React page (step 4, 2026-09-24) writes its lengths as inline-size, which
//     the browser rounds when it writes the attribute back, so there the exact
//     string is read from data-at beside it and checked against the
//     inline-size (exact() in readPage). On both pages every bar, fill and
//     marker is also measured where it is painted and must sit within half a
//     pixel of its percentage of its track, or the read fails.

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
// --sections compares only the named top-level parts of each file (url, form,
// results, diagnostics), for a converted page that has not rebuilt the rest
// yet: step 2 of the conversion (2026-09-24) built the form and the address
// but not the results, so it is held to `url` and `form` alone. The parts
// named are compared whole and exactly as in a full comparison; the rest are
// not read. It only narrows a comparison, so it needs --compare.
const SECTIONS = ['url', 'form', 'results', 'diagnostics'];
const sections = args.includes('--url-only') ? ['url'] : opt('--sections')?.split(',').map((s) => s.trim()).filter(Boolean);
if (sections) {
  const unknown = sections.filter((s) => !SECTIONS.includes(s));
  if (unknown.length || !sections.length) {
    console.error(`baseline: --sections takes some of ${SECTIONS.join(', ')}; got ${sections.join(', ') || 'nothing'}`);
    process.exit(2);
  }
  if (!compare) {
    console.error('baseline: --sections and --url-only narrow a comparison, so they need --compare. Nothing was captured.');
    process.exit(2);
  }
}
// --no-charts (added in step 3 of the conversion, 2026-09-24) leaves the charts
// and their table twins out of both sides of a comparison, for a converted
// page whose charts are not built yet: step 3 built the results and the
// badges, and the charts are step 4. On each side, in `results` and
// `diagnostics`, it drops every block the reader calls a chart or a table
// (the converted page's empty chart slots are charts to the reader), and it
// cuts the section's whole text where the first chart's text begins, which
// must be after every other block: the old page drew its charts last in both
// sections. Everything before the cut is compared exactly as in a full
// comparison. If a block that is not a chart follows a chart, or the first
// chart's text cannot be found, the state fails rather than being cut
// somewhere a difference could hide. It only narrows a comparison, so it
// needs --compare.
const noCharts = args.includes('--no-charts');
if (noCharts && !compare) {
  console.error('baseline: --no-charts narrows a comparison, so it needs --compare. Nothing was captured.');
  process.exit(2);
}
// THE ACCEPTED DIFFERENCES (step 5 of the conversion, 2026-09-24). When the
// page loaded is the React page, --compare applies the ruled differences in
// tests/baseline/accepted-differences.json before comparing (applyAccepted
// below); against legacy.html, or any other copy of the old page, it applies
// none. --no-accepted turns them off for the React page too, to see every
// difference the rulings cover.
const noAccepted = args.includes('--no-accepted');
if (noAccepted && !compare) {
  console.error('baseline: --no-accepted changes a comparison, so it needs --compare. Nothing was captured.');
  process.exit(2);
}
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

  // THE CHARTS' POSITIONS on either page (step 4 of the conversion,
  // 2026-09-24). The old page wrote each bar's start and width and each
  // marker's place into the style attribute as left and width, and the string
  // it wrote is read as it was written. The React page cannot write left
  // inline, so it places each bar and marker after an empty spacer
  // (.chart-spacer) sized with inline-size, and sizes the bar and the cascade
  // fill with inline-size. The browser writes an inline-size back into the
  // style attribute rounded to six significant figures, where the code
  // computed an unrounded number (the cascade's 7.235834287500001), so the
  // React page also writes the exact string as data-at, and that is what is
  // recorded; exact() fails the read if the inline-size the browser holds is
  // not that number to its six figures. Either way the JSON carries the
  // number the code computed, in the same field.
  const exact = (el) => {
    const at = el.getAttribute('data-at');
    const styled = styleNum(el, 'inline-size');
    if (at === null || styled === null) throw new Error(`a chart length has no data-at or no inline-size: ${el.outerHTML.slice(0, 120)}`);
    const a = Number(at);
    const b = Number(styled);
    if (!(Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a)))) {
      throw new Error(`a chart length is drawn at ${styled}% where the code computed ${at}%`);
    }
    return at;
  };
  // The spacer in front of a bar or a marker on the React page, or null.
  const lead = (el) => (el && el.previousElementSibling && el.previousElementSibling.matches('.chart-spacer')
    ? el.previousElementSibling : null);
  const startOf = (el) => (lead(el) ? exact(lead(el)) : styleNum(el, 'left'));
  const widthOf = (el) => (el && el.hasAttribute('data-at') ? exact(el) : styleNum(el, 'width'));
  // And the paint: wherever the percentage came from, the mark must be drawn
  // there. Its left edge (and, given a width, its width) is measured against
  // the track it sits in and must land within half a pixel of that percentage
  // of the track's width. This adds nothing to the JSON; a mark drawn
  // anywhere else fails the read, on either page.
  const drawnAt = (el, track, start, width) => {
    if (!el || !track || start === null) return;
    const t = track.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const off = [Math.abs(r.left - (t.left + (Number(start) / 100) * t.width))];
    if (width !== null) off.push(Math.abs(r.width - (Number(width) / 100) * t.width));
    if (off.some((d) => !(d <= 0.5))) {
      throw new Error(`a chart mark is drawn ${off.map((d) => d.toFixed(2)).join(' px and ')} px away from where ${start}% (width ${width}%) puts it`);
    }
  };
  // The highlight: the design system's class on the old page, the app's own
  // on the React page (the plan's chart ruling).
  const emphasised = (el) => !!el && (el.classList.contains('lt-chart-emphasis') || el.classList.contains('chart-emphasis'));

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
    // The table's name. The old page named it with a visually hidden
    // caption; the Table part takes no caption and names its table with
    // aria-label from its label (React Aria drops a caption, the part's
    // header says), so on the React page the name is read from there.
    caption: $('caption', el) ? text($('caption', el)) : ($('table', el) ? $('table', el).getAttribute('aria-label') : null),
    headers: $$('thead th', el).map(text),
    rows: $$('tbody tr', el).map((tr) => [...tr.children].map((c) => ({
      header: c.tagName === 'TH', text: text(c),
    }))),
  });

  const ladder = (el) => {
    const rows = $$('.ladder-row', el).map((r) => {
      const bar = $('.ladder-bar', r);
      const mark = $('.ladder-mark', r);
      const track = $('.ladder-track', r);
      const barLeft = bar ? startOf(bar) : null;
      const barWidth = widthOf(bar);
      const marker = mark ? startOf(mark) : null;
      drawnAt(bar, track, barLeft, barWidth);
      drawnAt(mark, track, marker, null);
      return {
        label: text($('.ladder-label', r)),
        tag: text($('.ladder-tag', r)),
        value: text($('.ladder-range', r)),
        emphasis: emphasised(bar),
        serving: r.classList.contains('is-serving'),
        barLeft,
        barWidth,
        marker,
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
      const fillWidth = widthOf(fill);
      drawnAt(fill, $('.casc-bar', r), fill ? '0' : null, fillWidth);
      return {
        label: text($('.casc-label', r)),
        metric: val && val.firstChild && val.firstChild.nodeType === 3 ? val.firstChild.textContent : null,
        imperial: text($('.imperial', val || r)),
        emphasis: emphasised(fill),
        binds: r.classList.contains('is-bind'),
        farAbove: r.classList.contains('na'),
        fillWidth,
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
    // The converted page holds each chart's place with an empty, hidden
    // element until the chart is built (step 3 of the conversion); the old
    // page has none, so its files never carry this block.
    if (el.matches('[data-chart-slot]')) return { role: 'chart', kind: 'slot', slot: el.getAttribute('data-chart-slot') };
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
  // Each kind of field is found in both pages' markup: the old page's native
  // controls and <lt-number-field>, and the React parts (2026-09-24, step 2).
  // The JSON is the same shape for both, and must be the same text:
  //   - A React Select is a button face; its chosen option is the face's
  //     current chip, and its options are the face's hidden sizing copies
  //     of every option (read with textContent, because they are not painted).
  //   - A React checkbox is an element with role="checkbox".
  //   - A React tool picker is the card-layout radio group, whose label is
  //     the field label where the old page had a fieldset legend. It is read
  //     into toolPicker, as the old fieldset was, and not into fields.
  //   - aria-invalid: the old field always wrote "false" or "true"; the React
  //     field writes it only when wrong. An absent aria-invalid means false
  //     (WAI-ARIA), so it is read as "false".
  const toolGrid = $('#inputs .lt-choice-grid');
  const toolField = toolGrid ? toolGrid.closest('.lt-field') : null;
  const fields = $$('#inputs .lt-field').filter(painted).filter((f) => f !== toolField).map((f) => {
    const group = $('[role="radiogroup"]', f);
    const check = $('.lt-check input[type="checkbox"]', f);
    const reactCheck = $('[role="checkbox"]', f);
    const select = $('select', f);
    const face = $('.lt-status-select__face', f);
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
    } else if (reactCheck) {
      out.checkLabel = text(reactCheck.closest('.lt-check'));
      out.checked = reactCheck.getAttribute('aria-checked') === 'true';
    } else if (select) {
      out.shows = select.selectedOptions[0] ? select.selectedOptions[0].text : null;
      out.options = [...select.options].map((o) => o.text);
    } else if (face) {
      const current = $('.lt-status-select__current', face);
      out.shows = current && current.textContent !== '' ? current.textContent : null;
      out.options = $$('[data-ghost]', face).map((g) => g.textContent);
    } else if (input) {
      out.shows = input.value;
      out.unit = affix && painted(affix) ? text(affix) : null;
      out.invalid = input.getAttribute('aria-invalid') ?? 'false';
    }
    out.hint = text($('.lt-field__hint', f));
    out.message = text(msg);
    return out;
  });
  const legend = $('#inputs fieldset legend');
  const toolPicker = toolField ? {
    legend: text($('.lt-field__label', toolField)),
    options: $$('.lt-choice-card', toolGrid).map(text),
    chosen: $$('.lt-choice-card', toolGrid).filter((c) => $('[role="radio"][aria-checked="true"]', c)).map(text),
  } : {
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
  // Which page this is, for the accepted differences: the React page mounts
  // into #root, which the old page never had. Kept out of the JSON.
  const react = await page.evaluate(() => document.getElementById('root') !== null);
  await ctx.close();
  if (errors.length) throw new Error(`page errors in ${st.name}: ${errors.join(' | ')}`);

  const head = { state: st.name, shows: st.shows, query: st.query, actions: st.actions ?? [] };
  if (st.kind === 'today-unreadable') {
    return {
      react,
      json: {
        WARNING: 'TODAY\'S BEHAVIOUR, RULED TO CHANGE. Scott has ruled that the converted page shows no numbers while a box holds something it cannot read. This file records what the vanilla page did on 2026-09-24 so the change can be seen. It is NOT a target, and the comparison skips it.',
        ...head,
        steps: [...steps, { after: 'the end of the actions', ...snap }],
      },
    };
  }
  return { react, json: { ...head, ...snap } };
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

// --no-charts: one section with its charts left out (see the argument above).
// A chart's text begins with its heading (the ladder), its first row's label
// (the cascade) or its summary (a table twin); an empty slot has none. The
// cut is at the first whole line equal to that: if an earlier line happened
// to match, the cut would come too early and the state would differ, which
// is loud, never a silent pass.
function withoutCharts(section, where) {
  if (!section || !section.present) return section;
  const isChart = (b) => b.role === 'chart' || b.role === 'table';
  const first = section.blocks.findIndex(isChart);
  if (first < 0) return section;
  const after = section.blocks.slice(first).filter((b) => !isChart(b));
  if (after.length) throw new Error(`${where}: a ${after[0].role} block follows a chart, so --no-charts cannot cut the text`);
  const starts = section.blocks.slice(first).map((b) => (b.kind === 'ladder' ? b.heading
    : b.kind === 'cascade' ? (b.rows[0] ? b.rows[0].label : null)
      : b.role === 'table' ? b.summary : null)).filter((t) => t);
  let text = section.text;
  if (starts.length) {
    const lines = text.split('\n');
    const at = lines.indexOf(starts[0]);
    if (at < 0) throw new Error(`${where}: the chart's first line "${starts[0]}" is not in the section's text`);
    // innerText drops the line breaks at the end of a section, so the blank
    // line a paragraph leaves before the chart goes with the chart.
    text = lines.slice(0, at).join('\n').replace(/\n+$/, '');
  }
  return { ...section, text, blocks: section.blocks.filter((b) => !isChart(b)) };
}
const chartsLeftOut = (json, name) => {
  const obj = JSON.parse(json);
  for (const k of ['results', 'diagnostics']) if (k in obj) obj[k] = withoutCharts(obj[k], `${name} ${k}`);
  return serialise(obj);
};

// ---------------------------------------------------------------------------
// The accepted differences (step 5 of the conversion, 2026-09-24)
//
// tests/baseline/accepted-differences.json lists the differences between the
// old page and the React page that have been ruled deliberate, each with its
// field, its states, its old and new form and its ruling. Each entry's
// rewrite is below, keyed by its id. A rewrite first checks that the form it
// expects is really there, and throws if it is not, which fails the state: an
// entry must never absorb a difference it does not describe. Everything an
// entry does not name is compared exactly as before. An id with no rewrite
// here stops the run, so an entry cannot be added to the list alone.
//
// Applied to the parsed baseline (`was`) and the parsed capture (`now`) of
// one state, before --sections and --no-charts narrow them.
// ---------------------------------------------------------------------------
const accepted = JSON.parse(readFileSync(join(baselineDir, 'accepted-differences.json'), 'utf8')).differences;

// Every table under a chart in one section, in reading order: a table block
// of its own (the cascade's) or the table inside a chart block.
const tablesIn = (section) => (section && section.present ? section.blocks : [])
  .map((b) => (b.role === 'table' ? b : b.table ?? null)).filter(Boolean);

const REWRITES = {
  // The React page's row headers are put in capitals, as the old page's CSS
  // painted them, in the cells and in their lines of the section's text. On
  // the React page a table's text is its summary line, its header line, then
  // one line per row starting with the row header and a tab.
  'row-header-case'(entry, was, now, where) {
    let n = 0;
    for (const k of ['results', 'diagnostics']) {
      const section = now[k];
      const tables = tablesIn(section);
      if (!tables.length) continue;
      const lines = section.text.split('\n');
      let at = 0;
      for (const t of tables) {
        const s = lines.indexOf(t.summary, at);
        if (s < 0) throw new Error(`${where}: ${entry.id}: the table "${t.summary}" is not in the ${k} text`);
        if (lines[s + 1] !== t.headers.join('\t')) throw new Error(`${where}: ${entry.id}: the line under "${t.summary}" in ${k} is not its header row`);
        t.rows.forEach((row, i) => {
          const cell = row[0];
          if (!cell || !cell.header) throw new Error(`${where}: ${entry.id}: row ${i} of "${t.summary}" has no row header`);
          const line = lines[s + 2 + i];
          if (!line || !line.startsWith(`${cell.text}\t`)) throw new Error(`${where}: ${entry.id}: row ${i} of "${t.summary}" is not where its text should be in ${k}`);
          const upper = cell.text.toLocaleUpperCase('en-NZ');
          lines[s + 2 + i] = upper + line.slice(cell.text.length);
          cell.text = upper;
          n++;
        });
        at = s + 2 + t.rows.length;
      }
      section.text = lines.join('\n');
    }
    return n;
  },
  // The line under each table's summary on the old side is its hidden
  // caption: removed after checking it is that table's name.
  'table-name-line'(entry, was, now, where) {
    let n = 0;
    for (const k of ['results', 'diagnostics']) {
      const section = was[k];
      const tables = tablesIn(section);
      if (!tables.length) continue;
      const lines = section.text.split('\n');
      let at = 0;
      for (const t of tables) {
        const s = lines.indexOf(t.summary, at);
        if (s < 0) throw new Error(`${where}: ${entry.id}: the table "${t.summary}" is not in the baseline's ${k} text`);
        if (lines[s + 1] !== t.caption) throw new Error(`${where}: ${entry.id}: the line under "${t.summary}" in the baseline's ${k} is not the table's name`);
        lines.splice(s + 1, 1);
        at = s + 1;
        n++;
      }
      section.text = lines.join('\n');
    }
    return n;
  },
  // The ten advanced fields drilling never reads leave the old side's form.
  'drilling-advanced-fields'(entry, was, now, where) {
    for (const label of entry.remove) {
      const hits = was.form.fields.filter((f) => f.label === label);
      if (hits.length !== 1) throw new Error(`${where}: ${entry.id}: the baseline's form has ${hits.length} fields labelled "${label}", not 1`);
    }
    was.form.fields = was.form.fields.filter((f) => !entry.remove.includes(f.label));
    return entry.remove.length;
  },
  // A banner mounted after load has the role its variant gives it.
  'click-banner-roles'(entry, was, now, where) {
    const named = entry.blocks[was.state] ?? [];
    if (!named.length) throw new Error(`${where}: ${entry.id}: the entry names this state but no banner in it`);
    for (const b of named) {
      const block = was[b.section]?.blocks?.[b.block];
      if (!block || block.role !== 'banner') throw new Error(`${where}: ${entry.id}: ${b.section} block ${b.block} in the baseline is not a banner`);
      if (block.ariaRole !== null) throw new Error(`${where}: ${entry.id}: ${b.section} block ${b.block} in the baseline already has the role ${block.ariaRole}`);
      block.ariaRole = b.now;
    }
    return named.length;
  },
  // The beta switch (Scott's ruling, 2026-09-24). While the React page's
  // "Show beta tools" box is unticked the form is the live site's (1e6c265):
  // no ball nose in the tool list, no 1/16 in or 5/8 in, and no ball-nose
  // sentence in the depth and width hints. Reads the box, so it runs before
  // beta-checkbox removes it (the order of accepted-differences.json).
  'beta-hides-ball-nose'(entry, was, now, where) {
    const box = now.form.fields.find((f) => f.checkLabel === 'Show beta tools');
    if (!box || box.checked) return 0;
    const opts = was.form.toolPicker.options;
    const at = opts.indexOf(entry.option);
    if (at < 0 || opts.lastIndexOf(entry.option) !== at || at !== opts.length - 1) {
      throw new Error(`${where}: ${entry.id}: the baseline's tool list does not end in the ball nose once`);
    }
    if (was.form.toolPicker.chosen.includes(entry.option)) throw new Error(`${where}: ${entry.id}: the ball nose is chosen but the beta box is unticked`);
    opts.splice(at, 1);
    // The two sizes added for the ball chart leave the diameter list.
    const dia = was.form.fields.filter((f) => f.label === 'TOOL DIAMETER');
    if (dia.length !== 1) throw new Error(`${where}: ${entry.id}: the baseline has ${dia.length} TOOL DIAMETER fields, not 1`);
    for (const size of entry.diameters) {
      const n = dia[0].options.filter((o) => o === size).length;
      if (n !== 1) throw new Error(`${where}: ${entry.id}: the baseline lists ${size} ${n} times, not once`);
      if (dia[0].shows === size) throw new Error(`${where}: ${entry.id}: the baseline shows ${size} but the beta box is unticked`);
    }
    dia[0].options = dia[0].options.filter((o) => !entry.diameters.includes(o));
    // The depth and width hints lose their ball-nose sentences.
    for (const h of entry.hints) {
      const hits = was.form.fields.filter((f) => f.label === h.label);
      if (hits.length !== 1 || hits[0].hint !== h.was) throw new Error(`${where}: ${entry.id}: the baseline's ${h.label} hint is not the one the entry names`);
      hits[0].hint = h.now;
    }
    return 1;
  },
  // The plastics (Scott's ruling, 2026-09-24) join the material list only
  // while the "Show beta tools" box is ticked. On a ticked React page the
  // fourteen plastic picks leave MATERIAL's options, after checking they are
  // there exactly once each, last, in the entry's order, and not the material
  // shown. Reads the box, so it runs before beta-checkbox removes it.
  'beta-adds-plastics'(entry, was, now, where) {
    const box = now.form.fields.find((f) => f.checkLabel === 'Show beta tools');
    if (!box || !box.checked) return 0;
    const mat = now.form.fields.filter((f) => f.label === 'MATERIAL');
    if (mat.length !== 1) throw new Error(`${where}: ${entry.id}: the page has ${mat.length} MATERIAL fields, not 1`);
    const opts = mat[0].options;
    const tail = opts.slice(opts.length - entry.options.length);
    if (JSON.stringify(tail) !== JSON.stringify(entry.options)) {
      throw new Error(`${where}: ${entry.id}: MATERIAL's options do not end in the fourteen plastics: ${JSON.stringify(tail)}`);
    }
    for (const o of entry.options) {
      if (opts.filter((x) => x === o).length !== 1) throw new Error(`${where}: ${entry.id}: "${o}" is listed more than once`);
      if (mat[0].shows === o) throw new Error(`${where}: ${entry.id}: a baseline state shows the plastic "${o}"`);
    }
    mat[0].options = opts.slice(0, opts.length - entry.options.length);
    return 1;
  },
  // The "Show beta tools" box leaves the React side's form, after checking it
  // is where and what the ruling says: once in routing, never in drilling,
  // right after MATERIAL, ticked exactly when the ball nose is chosen.
  'beta-checkbox'(entry, was, now, where) {
    const hits = now.form.fields.filter((f) => f.checkLabel === entry.checkLabel);
    const routing = was.form.toolPicker.legend === 'TOOL TYPE';
    if (!routing) {
      if (hits.length) throw new Error(`${where}: ${entry.id}: the beta box shows outside routing`);
      return 0;
    }
    if (hits.length !== 1) throw new Error(`${where}: ${entry.id}: ${hits.length} beta boxes, not 1`);
    const box = hits[0];
    const at = now.form.fields.indexOf(box);
    if (at < 1 || now.form.fields[at - 1].label !== 'MATERIAL') throw new Error(`${where}: ${entry.id}: the beta box is not right after MATERIAL`);
    if (box.label !== null || box.hint !== entry.hint || box.message !== null) throw new Error(`${where}: ${entry.id}: the beta box reads ${JSON.stringify(box)}`);
    const ball = now.form.toolPicker.chosen.some((c) => c.startsWith('Ball nose\n'));
    if (box.checked !== ball) throw new Error(`${where}: ${entry.id}: the beta box is ${box.checked ? 'ticked' : 'unticked'} with the ball nose ${ball ? '' : 'not '}chosen`);
    now.form.fields.splice(at, 1);
    return 1;
  },
};
for (const e of accepted) {
  if (!REWRITES[e.id]) {
    console.error(`baseline: accepted-differences.json lists "${e.id}", which has no rewrite in tools/baseline.mjs`);
    process.exit(2);
  }
}

// The entries that apply to one state, applied to both sides. Returns the
// rewritten JSON text of each and the ids of the entries that found
// something to rewrite (an entry for "all" states finds no table in a
// refusal, which has none, and rewrites nothing there).
function applyAccepted(wantJson, bodyJson, name) {
  const was = JSON.parse(wantJson);
  const now = JSON.parse(bodyJson);
  const applied = [];
  for (const e of accepted) {
    if (e.states !== 'all' && !e.states.includes(name)) continue;
    if (REWRITES[e.id](e, was, now, name) > 0) applied.push(e.id);
  }
  return { want: serialise(was), body: serialise(now), applied };
}

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
if (sections) console.log(`baseline: comparing only ${sections.join(', ')}`);
if (noCharts) console.log('baseline: the charts and their tables are left out of both sides');

const browser = await playwright.chromium.launch();
let failed = 0;
let pageKind = null;
let acceptedStates = 0;
try {
  if (!compare) mkdirSync(outDir, { recursive: true });
  for (const st of states) {
    const file = `${st.kind === 'today-unreadable' ? 'today-unreadable-' : ''}${st.name}.json`;
    let body;
    let react;
    try {
      const got = await capture(browser, base, st);
      body = serialise(got.json);
      react = got.react;
    } catch (err) {
      failed++;
      console.log(`  ERROR  ${st.name}: ${err.message}`);
      continue;
    }
    if (pageKind === null) {
      pageKind = react ? 'react' : 'old';
      console.log(pageKind === 'react'
        ? `baseline: this is the React page; ${noAccepted ? 'NO accepted differences applied (--no-accepted)' : `the ${accepted.length} accepted differences in tests/baseline/accepted-differences.json are applied`}`
        : 'baseline: this is the page before the conversion; no accepted differences apply');
    } else if ((pageKind === 'react') !== react) {
      throw new Error(`${st.name} loaded a different page from the states before it`);
    }
    let applied = [];
    if (compare) {
      const path = join(baselineDir, file);
      let want = existsSync(path) ? readFileSync(path, 'utf8') : null;
      if (react && !noAccepted && want !== null) {
        try {
          ({ want, body, applied } = applyAccepted(want, body, st.name));
        } catch (err) {
          failed++;
          console.log(`  ERROR  ${err.message}`);
          continue;
        }
      }
      if (sections && want !== null) {
        const pick = (json) => serialise(Object.fromEntries(sections.map((k) => [k, JSON.parse(json)[k]])));
        want = pick(want);
        body = pick(body);
      }
      if (noCharts && want !== null) {
        try {
          want = chartsLeftOut(want, `${st.name} (baseline)`);
          body = chartsLeftOut(body, `${st.name} (this page)`);
        } catch (err) {
          failed++;
          console.log(`  ERROR  ${err.message}`);
          continue;
        }
      }
      if (want === body) {
        if (applied.length) acceptedStates++;
        console.log(`  same   ${st.name}${applied.length ? `  (accepted: ${applied.join(', ')})` : ''}`);
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
  .filter((f) => f.endsWith('.json') && !['states.json', '_manifest.json', 'accepted-differences.json'].includes(f))
  .filter((f) => !states.some((s) => f === `${s.kind === 'today-unreadable' ? 'today-unreadable-' : ''}${s.name}.json`));
if (leftovers.length && !only) console.log(`\nfiles for states no longer in the list: ${leftovers.join(', ')}`);

console.log(failed ? `\nbaseline: ${failed} ${compare ? 'differ' : 'failed'}` : `\nbaseline: ${states.length} ${compare ? 'identical' : 'captured'}`);
if (compare && acceptedStates) console.log(`baseline: ${acceptedStates} of them match only once the accepted differences are applied`);
process.exitCode = failed ? 1 : 0;
