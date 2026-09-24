// The React page's results (src/result-view.js) against the old page it
// replaces. Written 2026-09-24, step 3 of docs/CONVERSION_PLAN.md.
//
// RS1 runs every baseline state through the form state and the engine, builds
// what the results area and "What is going on in this cut" show, and holds it
// to what legacy.html recorded (tests/baseline/): every banner's variant,
// glyph, title, paragraph and list, every output row's label, metric and
// imperial strings, secondary flag and note, the notes, the heading and every
// badge, in order. The charts are step 4 and are not read here. The browser
// comparison (tools/baseline.mjs) checks the same things as rendered; this
// catches a drift without a browser, on every `npm run check`.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './helpers.js';
import { loadData } from './load-node.js';
import { machinePresets } from '../js/data/presets.js';
import { calculate } from '../js/core/calculate.js';
import { calculateDrilling } from '../js/core/drilling.js';
import { createState, update, currentInput, currentDrillInput, blockers } from '../src/form-state.js';
import { resultsView, figuresOf, STATUS_ICON } from '../src/result-view.js';

const here = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(here, 'baseline');
const data = loadData();
const presets = machinePresets(data.machines, data.rules);
const states = JSON.parse(readFileSync(join(baselineDir, 'states.json'), 'utf8')).states;
const recorded = (name) => JSON.parse(readFileSync(join(baselineDir, `${name}.json`), 'utf8'));

// The same map as tests/form-state.test.js: each baseline action as the change
// it makes. An action it does not know fails RS1.
const ACTIONS = {
  'radio:Twist drill': { type: 'tool', value: 'twist' },
  'radio:Drilling': { type: 'mode', value: 'drill' },
  'radio:Routing': { type: 'mode', value: 'rout' },
};

function viewFor(st) {
  let s = createState(data, presets, st.query ? `?${st.query}` : '');
  for (const a of st.actions ?? []) {
    const change = a.click ? ACTIONS[`${a.click.role}:${a.click.name}`] : undefined;
    if (!change) throw new Error(`${st.name}: no change known for the action ${JSON.stringify(a)}`);
    s = update(s, change, presets);
  }
  if (blockers(s).length) throw new Error(`${st.name}: a box holds the results back`);
  const r = s.mode === 'drill' ? calculateDrilling(currentDrillInput(s, data, presets), data) : calculate(currentInput(s, data, presets), data);
  return resultsView(r);
}

// What the old page's reader recorded for a banner, from a banner here.
const bannerAsRecorded = (b) => ({
  role: 'banner',
  variant: b.variant,
  icon: `#lt-ic-${STATUS_ICON[b.variant]}`,
  title: b.title,
  paragraphs: b.paragraph === null ? [] : [b.paragraph],
  list: b.list ?? [],
});
const bannerRecorded = (blk) => ({
  role: blk.role, variant: blk.variant, icon: blk.icon, title: blk.title, paragraphs: blk.paragraphs, list: blk.list,
});

function expectedBlocks(view) {
  if (view.kind === 'message') return { results: [bannerAsRecorded(view.banner)], diagnostics: [] };
  const results = [
    bannerAsRecorded(view.limit),
    { role: 'outputs', rows: view.rows },
    ...view.warnings.map(bannerAsRecorded),
  ];
  // The reader saw the notes title through CSS uppercase, as the page shows it.
  if (view.notes.length) results.push({ role: 'notes', title: 'NOTES ON THIS CALCULATION', items: view.notes });
  const diagnostics = view.chips === null ? [] : [
    { role: 'heading', level: 'H2', text: 'What is going on in this cut' },
    { role: 'badges', badges: view.chips.map((c) => ({ variant: c.variant, icon: `#lt-ic-${c.icon}`, text: c.text })) },
  ];
  return { results, diagnostics };
}

// The recorded blocks with the charts and their table twins left out, and each
// banner without its role and its whole-text field (the browser comparison
// reads those).
function recordedBlocks(file) {
  const keep = (b) => b.role !== 'chart' && b.role !== 'table';
  const shape = (b) => (b.role === 'banner' ? bannerRecorded(b) : b);
  return {
    results: file.results.blocks.filter(keep).map(shape),
    diagnostics: file.diagnostics.blocks.filter(keep).map(shape),
  };
}

test('RS1', 'every baseline state shows the banners, numbers, notes and badges the old page showed, in its order', () => {
  assert(states.length >= 50, `only ${states.length} baseline states found`);
  const wrong = [];
  for (const st of states) {
    const want = JSON.stringify(recordedBlocks(recorded(st.name)));
    const got = JSON.stringify(expectedBlocks(viewFor(st)));
    if (want !== got) {
      let i = 0;
      while (i < want.length && want[i] === got[i]) i++;
      wrong.push(`${st.name}\n      was: ...${want.slice(Math.max(0, i - 60), i + 80)}\n      now: ...${got.slice(Math.max(0, i - 60), i + 80)}`);
    }
  }
  assert(!wrong.length, `${wrong.length} differ:\n    ${wrong.join('\n    ')}`);
});

test('RS2', 'the baseline covers every kind of result: a refusal, a block, the four-warning fold, a note, drilling and routing badges', () => {
  const views = states.map((st) => [st.name, viewFor(st)]);
  const has = (pred) => views.some(([, v]) => pred(v));
  assert(has((v) => v.kind === 'message' && v.banner.title === 'No number for this one.'), 'no refusal');
  assert(has((v) => v.kind === 'message' && v.banner.title === 'Blocked, not just warned.'), 'no block');
  assert(has((v) => v.kind === 'figures' && v.warnings.length === 1 && v.warnings[0].list !== null && v.warnings[0].list.length >= 4), 'no fold of four or more warnings');
  assert(has((v) => v.kind === 'figures' && v.notes.length > 0), 'no notes');
  assert(has((v) => v.kind === 'figures' && v.drilling && v.chips === null), 'no drilling result');
  assert(has((v) => v.kind === 'figures' && !v.drilling && v.chips.length > 0), 'no routing badges');
  // Never more than the limit line and three banners (app.js; SC30 holds the
  // engine to the same ceiling).
  for (const [name, v] of views) {
    if (v.kind === 'figures') assert(v.warnings.length <= 3, `${name}: ${v.warnings.length} warning banners`);
  }
});

test('RS3', 'the figures a person hears as "Numbers updated." change with a number and not with a message alone', () => {
  const base = viewFor(states.find((s) => s.name === 'routing-default-page-no-link'));
  const again = viewFor(states.find((s) => s.name === 'routing-default-page-no-link'));
  assert(figuresOf(base) === figuresOf(again), 'the same cut gives the same figures');
  const other = viewFor(states.find((s) => s.name === 'routing-gentle-3-flutes-22000rpm'));
  assert(figuresOf(base) !== figuresOf(other), 'a different cut gives different figures');
  assert(figuresOf(null) === null, 'no figures while a box holds the results back');
  const refused = viewFor(states.find((s) => s.name === 'refusal-ball-nose-in-hpl'));
  assert(figuresOf(refused) === null, 'no figures under a refusal');
});
