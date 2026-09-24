// The React page's form state (src/form-state.js) against the old page it
// replaces. Written 2026-09-24, step 2 of docs/CONVERSION_PLAN.md.
//
// FS1 and FS3 read the baseline the old page recorded (tests/baseline/), so
// the state is held to what legacy.html actually did, not to what this file
// thinks it did. FS2 pins the one unit conversion the page does itself, the
// machine max feed's m/min to mm/min, which the survey ranks second among the
// ways a rewrite could quietly change a machinist's number (section 8, risk 2).

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './helpers.js';
import { loadData } from './load-node.js';
import { machinePresets } from '../js/data/presets.js';
import { calculate } from '../js/core/calculate.js';
import { calculateDrilling } from '../js/core/drilling.js';
import { feedPair, rpmPair, fzPair } from '../js/ui/format.js';
import { DRILL_OUTPUT_ROWS } from '../js/ui/drill-tables.js';
import {
  createState, update, writeUrlState, currentInput, currentDrillInput,
  blockers, blockingMessage, advKey,
} from '../src/form-state.js';

const here = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(here, 'baseline');
const data = loadData();
const presets = machinePresets(data.machines, data.rules);
const states = JSON.parse(readFileSync(join(baselineDir, 'states.json'), 'utf8')).states;
const recorded = (name) => JSON.parse(readFileSync(join(baselineDir, `${name}.json`), 'utf8'));

// The baseline's actions name a control by its role and accessible name, so
// they run on either page. Here each one becomes the change it makes. An
// action this map does not know fails FS1, so a new baseline state cannot be
// skipped here without someone noticing.
const ACTIONS = {
  'radio:Twist drill': { type: 'tool', value: 'twist' },
  'radio:Drilling': { type: 'mode', value: 'drill' },
  'radio:Routing': { type: 'mode', value: 'rout' },
};

function stateFor(st) {
  let s = createState(data, presets, st.query ? `?${st.query}` : '');
  for (const a of st.actions ?? []) {
    const change = a.click ? ACTIONS[`${a.click.role}:${a.click.name}`] : undefined;
    if (!change) throw new Error(`${st.name}: no change known for the action ${JSON.stringify(a)}`);
    s = update(s, change, presets);
  }
  return s;
}

test('FS1', 'the address written for every baseline state is the one the old page wrote', () => {
  assert(states.length >= 50, `only ${states.length} baseline states found`);
  const wrong = [];
  for (const st of states) {
    const want = recorded(st.name).url;
    const got = writeUrlState(stateFor(st));
    if (got !== want) wrong.push(`${st.name}\n      was: ${want}\n      now: ${got}`);
  }
  assert(!wrong.length, `${wrong.length} differ:\n    ${wrong.join('\n    ')}`);
});

test('FS2', 'the machine max feed is entered in m/min and reaches the engine in mm/min', () => {
  // A link carrying 20 m/min: the engine is handed 20000 mm/min, not 20.
  const s = createState(data, presets, '?a_feedMaxMMin=20');
  assert(s.adv.feedMaxMMin === 20, `the box holds ${s.adv.feedMaxMMin}, expected 20 (m/min)`);
  assert(s.boxes[advKey('feedMaxMMin')] === 20, 'the field is handed 20 m/min');
  assert(currentInput(s, data, presets).machine.feedMaxMmMin === 20000,
    `routing hands the engine ${currentInput(s, data, presets).machine.feedMaxMmMin} mm/min, expected 20000`);
  const d = createState(data, presets, '?k=drill&a_feedMaxMMin=0.5');
  assert(currentDrillInput(d, data, presets).machine.feedMaxMmMin === 500,
    `drilling hands the engine ${currentDrillInput(d, data, presets).machine.feedMaxMmMin} mm/min, expected 500`);
  // Every preset's own feed survives the divide into the box and the multiply
  // back out, so an untouched page hands the engine the preset's mm/min.
  for (let i = 0; i < presets.length; i++) {
    const p = createState(data, presets, `?mc=${i}`);
    const got = currentInput(p, data, presets).machine.feedMaxMmMin;
    assert(got === presets[i].machine.feedMaxMmMin, `${presets[i].label}: ${got} mm/min, preset says ${presets[i].machine.feedMaxMmMin}`);
  }
  // Typed into the box by a person: 12 m/min is 12000 mm/min.
  const typed = update(createState(data, presets, ''), { type: 'number', field: advKey('feedMaxMMin'), value: 12, state: 'ok' }, presets);
  assert(currentInput(typed, data, presets).machine.feedMaxMmMin === 12000, 'a typed 12 m/min reaches the engine as 12000 mm/min');
});

test('FS3', 'every baseline state hands the engine what the old page did: same status, limit line and served numbers', () => {
  const ROUT = { 'Spindle speed': ['spindleRpm', rpmPair], 'Cutting feedrate': ['cuttingFeedMmMin', feedPair], 'Feed per tooth': ['feedPerToothMm', fzPair], 'Plunge feedrate': ['plungeFeedMmMin', feedPair] };
  const DRILL = Object.fromEntries(DRILL_OUTPUT_ROWS.map((r) => [r.label, [r.key, r.fmt]]));
  const wrong = [];
  for (const st of states) {
    const s = stateFor(st);
    const r = s.mode === 'drill' ? calculateDrilling(currentDrillInput(s, data, presets), data) : calculate(currentInput(s, data, presets), data);
    const blocks = recorded(st.name).results.blocks;
    const first = blocks[0];
    if (r.status === 'refused' || r.status === 'blocked') {
      const title = r.status === 'refused' ? 'No number for this one.' : 'Blocked, not just warned.';
      if (first.title !== title) wrong.push(`${st.name}: engine says ${r.status}, the old page showed "${first.title}"`);
      continue;
    }
    if (first.title !== r.limit.message) wrong.push(`${st.name}: limit line "${r.limit.message}", the old page showed "${first.title}"`);
    const out = blocks.find((b) => b.role === 'outputs');
    if (!out) { wrong.push(`${st.name}: the old page showed no numbers, the engine served some`); continue; }
    const rows = s.mode === 'drill' ? DRILL : ROUT;
    let compared = 0;
    for (const row of out.rows) {
      const known = rows[row.label];
      if (!known) continue;
      const [key, fmt] = known;
      const pair = fmt(r.outputs[key]);
      compared++;
      if (pair.metric !== row.metric) wrong.push(`${st.name}: ${row.label} ${pair.metric}, the old page showed ${row.metric}`);
    }
    if (compared < 3) wrong.push(`${st.name}: only ${compared} rows compared`);
  }
  assert(!wrong.length, `${wrong.length} differ:\n    ${wrong.join('\n    ')}`);
});

test('FS4', 'a box that cannot be read holds the results back and keeps the last value it accepted', () => {
  const base = createState(data, presets, '');
  // 12,000 in the speed: the field reports no number, in error.
  const speed = update(base, { type: 'number', field: 'rpm', value: null, state: 'error' }, presets);
  assert(speed.rpm === 18000, 'the calculation keeps the speed it had');
  assert(writeUrlState(speed) === writeUrlState(base), 'the address does not change while the box cannot be read');
  const b = blockers(speed);
  assert(b.length === 1 && b[0].why === 'unreadable', `expected one unreadable box, got ${JSON.stringify(b)}`);
  assert(blockingMessage(b) === "The spindle speed can't be read. Fix it to see feeds and speeds.", blockingMessage(b));
  // abc in the flutes, and 6,5 in the depth, together.
  let two = update(base, { type: 'number', field: 'flutes', value: null, state: 'error' }, presets);
  two = update(two, { type: 'number', field: 'doc', value: null, state: 'error' }, presets);
  assert(two.flutes === 2 && two.apMm === null, 'the calculation keeps its flutes and its depth');
  assert(blockingMessage(blockers(two)) === "The flute count can't be read. The depth per pass can't be read. Fix them to see feeds and speeds.", blockingMessage(blockers(two)));
  // Fixing the box releases the results and the value is taken.
  const fixed = update(speed, { type: 'number', field: 'rpm', value: 12000, state: 'ok' }, presets);
  assert(blockers(fixed).length === 0 && fixed.rpm === 12000, 'a fixed box releases the results');
});

test('FS5', 'an empty optional box means what it meant; an empty box that must hold a number holds the results back', () => {
  const base = createState(data, presets, '?ap=3&ae=4&k=rout');
  const emptied = [['doc', 'apMm'], ['woc', 'aeMm']].reduce(
    (s, [field]) => update(s, { type: 'number', field, value: null, state: 'ok' }, presets), base);
  assert(emptied.apMm === null && emptied.aeMm === null, 'empty depth and width are the full board and the full slot');
  assert(blockers(emptied).length === 0, 'an empty depth or width does not hold the results back');
  assert(currentInput(emptied, data, presets).apMm === undefined, 'the engine is handed no depth, as before');
  const drill = update(createState(data, presets, '?k=drill&dr=4000'), { type: 'number', field: 'drillrpm', value: null, state: 'ok' }, presets);
  assert(drill.drillRpm === null && blockers(drill).length === 0, 'an empty drill speed is the published speed');
  const thick = update(createState(data, presets, ''), { type: 'number', field: 'thickness', value: null, state: 'ok' }, presets);
  assert(thick.thicknessMm === 0 && thick.boxes.thickness === null, 'an empty board is 0, which the engine refuses in words');
  assert(calculate(currentInput(thick, data, presets), data).status === 'refused', 'the engine refuses an empty board');
  const flutes = update(base, { type: 'number', field: 'flutes', value: null, state: 'ok' }, presets);
  assert(flutes.flutes === 2, 'the calculation keeps its flutes');
  assert(blockingMessage(blockers(flutes)) === 'The flute count box is empty. Fix it to see feeds and speeds.', blockingMessage(blockers(flutes)));
});

test('FS6', 'a number outside a field\'s range holds the results back, from a link as from a person', () => {
  const link = createState(data, presets, '?r=40000&f=8');
  assert(link.rpm === 40000 && link.flutes === 8, 'the link is read as the old page read it');
  const names = blockers(link).map((b) => `${b.key}:${b.why}`).join(',');
  assert(names === 'flutes:range,rpm:range', names);
  const typed = update(createState(data, presets, ''), { type: 'number', field: 'thickness', value: 150, state: 'error' }, presets);
  assert(blockers(typed).length === 1 && blockers(typed)[0].why === 'range', 'a board of 150 mm holds the results back');
  // A drilling box out of range does not hold routing back once routing is on screen.
  const drill = createState(data, presets, '?k=drill&hd=200');
  assert(blockers(drill).length === 1, 'a 200 mm hole blocks in drilling');
  assert(blockers(update(drill, { type: 'mode', value: 'rout' }, presets)).length === 0, 'and not in routing, where its box is not shown');
});

test('FS7', 'the derived rules: parked profile, diameter snap, first cut kept, machine refill', () => {
  // Finishing parks in routing, Standard serves drilling, Finishing returns.
  let s = createState(data, presets, '?p=finishing');
  s = update(s, { type: 'mode', value: 'drill' }, presets);
  assert(s.profile === 'standard', `drilling serves ${s.profile}`);
  s = update(s, { type: 'mode', value: 'rout' }, presets);
  assert(s.profile === 'finishing', `routing returns to ${s.profile}`);
  // A Finishing link opened in drilling falls back to Standard.
  assert(createState(data, presets, '?k=drill&p=finishing').profile === 'standard', 'finishing link in drilling');
  // The drill diameter snaps to the nearest size the family publishes.
  s = createState(data, presets, '?k=drill&dt=hinge&dd=35');
  s = update(s, { type: 'tool', value: 'twist' }, presets);
  assert(s.drillDiameterMm === 12, `35 mm snaps to ${s.drillDiameterMm} on a twist drill, expected 12`);
  // Routing never snaps, and keeps its own diameter apart from drilling's.
  s = update(s, { type: 'mode', value: 'rout' }, presets);
  assert(s.diameterMm === 12.7, 'routing keeps 12.7');
  // The first-cut choice is kept through Finishing.
  s = update(createState(data, presets, '?fc=0'), { type: 'profile', value: 'finishing' }, presets);
  s = update(s, { type: 'profile', value: 'standard' }, presets);
  assert(s.firstCut === false, 'first cut stays off after a trip through Finishing');
  // An advanced override sticks until the machine changes, then the new
  // preset's value is filled and an unreadable box in it is cleared.
  s = update(createState(data, presets, ''), { type: 'number', field: advKey('spindleKw'), value: 4, state: 'ok' }, presets);
  s = update(s, { type: 'number', field: advKey('vacMu'), value: null, state: 'error' }, presets);
  assert(currentInput(s, data, presets).machine.spindleKw === 4, 'the override serves');
  s = update(s, { type: 'machine', value: '0' }, presets);
  assert(s.adv.spindleKw === presets[0].machine.spindleKw, 'a new machine refills the spindle power');
  assert(blockers(s).length === 0, 'and the refilled grip factor box is readable again');
  // An advanced box at 0 or emptied falls back to the preset, as before.
  s = update(s, { type: 'number', field: advKey('accelMs2'), value: null, state: 'ok' }, presets);
  assert(!('accelMs2' in s.adv) && currentInput(s, data, presets).machine.accelMs2 === presets[0].machine.accelMs2, 'an empty advanced box serves the preset');
});

test('FS8', 'the baseline files FS1 and FS3 read are all present', () => {
  const missing = states.filter((st) => !existsSync(join(baselineDir, `${st.name}.json`))).map((st) => st.name);
  assert(!missing.length, `missing: ${missing.join(', ')}`);
});
