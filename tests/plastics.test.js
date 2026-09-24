// Soft and hard plastic (2026-09-24): the transcription against the two Onsrud
// sheets, the data gate, the serving rule, the depth derate, the maker's
// formula, the metric sizes, what the page and the panel offer, and proof that
// no wood number moved. The IDs are the PL rows in tests/regression-tests.md.
//
// The spot checks in PL1 are typed in from the printed pages
// (research/sources/Soft Plastic.pdf, page 120, and Hard Plastic.pdf, page
// 121) by eye, not copied from the data file, so a transcription slip fails
// here.

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert, approx } from './helpers.js';
import { loadData } from './load-node.js';
import { machinePresets } from '../js/data/presets.js';
import { validateData } from '../js/data/validate.js';
import { calculate } from '../js/core/calculate.js';
import { calculateDrilling } from '../js/core/drilling.js';
import { seriesBandAt } from '../js/core/plastics.js';
import { buildChips } from '../js/core/diagnostics.js';
import {
  MATERIALS, materialsFor, isPlasticPick, diametersFor, createState, update, currentInput, DEFAULT_MATERIAL,
} from '../src/form-state.js';
import { resultsView } from '../src/result-view.js';
import { chartsView } from '../src/chart-view.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const data = loadData();
const presets = machinePresets(data.machines, data.rules);
const IN = 25.4;

const cell = (family, series, col) => data.plastics.entries.filter(
  (e) => e.family === family && e.series === series && e.diameter_printed === col,
);

// A generous machine, so no cap binds unless a test sets one.
const MACHINE = { spindleKw: 10, breakpointRpm: 12000, rpmMax: 24000, feedMaxMmMin: 60000, accelMs2: 3, vacuum: { mu: 0.4, dPkPa: 5 } };
const input = (over) => ({
  material: 'soft_plastic', toolType: 'upcut', diameterMm: 6.35, thicknessMm: 6.35, profile: 'standard',
  firstCut: false, machine: MACHINE, rpm: 18000, flutesTotal: 1, ...over,
});

// ---------------------------------------------------------------------------
// The transcription
// ---------------------------------------------------------------------------

test('PL1', 'spot checks of transcribed cells against the printed sheets, the ends, the 1/2 in split and the misprints', () => {
  // [family, series, column, low, high], typed from the page images.
  const printed = [
    ['hard_plastic', '63-700', '1/4', 0.010, 0.012], // the user's own check
    ['soft_plastic', '61-000P', '1/2', 0.018, 0.022], // the user's own check
    ['soft_plastic', '63-750', '1/16', 0.002, 0.004],
    ['soft_plastic', '63-750', '3/8', 0.008, 0.012],
    ['soft_plastic', '63-750', '1/2', 0.010, 0.014],
    ['soft_plastic', '52-700', '1/2', 0.012, 0.014],
    ['soft_plastic', '52-700', '3/4', 0.016, 0.018],
    ['soft_plastic', '60-200', '3/4', 0.012, 0.016],
    ['soft_plastic', '65-200B/65-300B', '5/16', 0.003, 0.005],
    ['soft_plastic', '61-400', '1/2', 0.020, 0.021],
    ['hard_plastic', '63-700', '1/16', 0.002, 0.004],
    ['hard_plastic', '63-700', '3/8', 0.010, 0.012],
    ['hard_plastic', '63-700', '1/2', 0.012, 0.016],
    ['hard_plastic', '60-200', '1/2', 0.006, 0.010],
    ['hard_plastic', '60-200', '3/4', 0.012, 0.016],
    ['hard_plastic', '56-000', '5/16', 0.004, 0.006],
    ['hard_plastic', '56-600', '3/8', 0.009, 0.011],
    ['hard_plastic', '37-60', '1', 0.008, 0.010],
  ];
  for (const [family, series, col, lo, hi] of printed) {
    const rows = cell(family, series, col);
    assert(rows.length === 1, `${family} ${series} ${col}: expected one entry, got ${rows.length}`);
    assert(rows[0].fz_min_in === lo && rows[0].fz_max_in === hi, `${family} ${series} ${col}: expected ${lo}-${hi}, got ${rows[0].fz_min_in}-${rows[0].fz_max_in}`);
  }
  // The two cells printed without a decimal point, encoded as ruled.
  for (const series of ['56-000', '56-000P']) {
    const [e] = cell('hard_plastic', series, '3/16');
    assert(e.printed === '.004-006', `${series} 3/16: printed text kept as printed, got "${e.printed}"`);
    assert(e.fz_min_in === 0.004 && e.fz_max_in === 0.006, `${series} 3/16: must read 0.004-0.006`);
    assert(/decimal point/.test(e.transcription_note ?? ''), `${series} 3/16: the mend must be recorded`);
  }
  // Cells that are empty on the page must be empty here.
  assert(cell('hard_plastic', '56-000', '3/8').length === 0, 'hard 56-000 prints nothing at 3/8 in');
  assert(cell('soft_plastic', '52-700', '3/8').length === 0, 'soft 52-700 starts at 1/2 in');
  assert(data.plastics.entries.every((e) => !['1 1/8', '1 1/4', '1 1/2', '1 3/4', '2'].includes(e.diameter_printed)),
    'both sheets leave the 1-1/8 in to 2 in columns empty');
});

test('PL2', 'the 12,500 rpm asterisk: every soft 37-50 and 37-60 cell carries it, and nothing else does', () => {
  for (const e of data.plastics.entries) {
    const starred = e.family === 'soft_plastic' && (e.series === '37-50' || e.series === '37-60');
    if (starred) {
      assert(e.rpm_max?.rpm === 12500 && e.series_printed.endsWith('*'), `${e.series} ${e.diameter_printed}: the 12,500 rpm flag is missing`);
    } else {
      assert(e.rpm_max === undefined, `${e.family} ${e.series} ${e.diameter_printed}: carries a flag the sheet does not print`);
    }
  }
});

test('PL3', 'every record names its source, page and edition, and the file holds all 248 printed cells', () => {
  const counts = { soft_plastic: 0, hard_plastic: 0 };
  for (const e of data.plastics.entries) {
    counts[e.family] += 1;
    assert(data.plastics.sources[e.source], `${e.series}: unknown source`);
    assert(e.edition === 'PCT-19', `${e.series}: edition`);
    assert(e.page === (e.family === 'soft_plastic' ? 120 : 121), `${e.series}: page`);
    assert(e.data_class === 'vendor', `${e.series}: data_class`);
  }
  assert(counts.soft_plastic === 115 && counts.hard_plastic === 133, `expected 115 soft and 133 hard cells, got ${JSON.stringify(counts)}`);
});

test('PL4', 'the data file is the read, cell for cell: every printed cell of the research read has exactly one entry and no entry has none', () => {
  const read = JSON.parse(readFileSync(join(root, 'research', 'onsrud-pct19-plastics-read.json'), 'utf8'));
  const keys = new Set();
  for (const [sheet, family] of [['soft', 'soft_plastic'], ['hard', 'hard_plastic']]) {
    for (const row of read[sheet].rows) {
      for (const [col, printed] of Object.entries(row.cells)) {
        const rows = cell(family, row.series.replace(/\*$/, ''), col);
        assert(rows.length === 1 && rows[0].printed === printed, `${family} ${row.series} ${col}: read "${printed}", data ${rows.map((r) => r.printed)}`);
        keys.add(`${family}|${row.series.replace(/\*$/, '')}|${col}`);
      }
    }
  }
  assert(keys.size === data.plastics.entries.length, `the read has ${keys.size} cells, the data ${data.plastics.entries.length}`);
});

test('PL5', 'the data gate passes the file and catches a broken record, one fault at a time', () => {
  assert(validateData(data).errors.length === 0, `clean data fails: ${validateData(data).errors.slice(0, 3)}`);
  const breakOne = (mutate) => {
    const copy = structuredClone(data);
    mutate(copy.plastics.entries.find((e) => e.family === 'hard_plastic' && e.series === '63-700' && e.diameter_printed === '1/4'));
    return validateData(copy).errors;
  };
  const faults = {
    'a value that no longer matches its printed text': (e) => { e.fz_max_in = 0.014; },
    'a missing source': (e) => { delete e.source; },
    'a wrong page': (e) => { e.page = 120; },
    'a wrong edition': (e) => { e.edition = 'PCT-17'; },
    'a column the sheet does not print': (e) => { e.diameter_printed = '11/32'; },
    'a millimetre size that is not the inch size': (e) => { e.diameter_mm = 6; },
    'a band that runs high to low': (e) => { e.fz_min_in = 0.02; },
  };
  for (const [name, mutate] of Object.entries(faults)) {
    assert(breakOne(mutate).length > 0, `the gate missed ${name}`);
  }
  const missing = structuredClone(data);
  delete missing.plastics;
  assert(validateData(missing).errors.some((m) => /plastics data file must exist/.test(m)), 'a missing plastics file must fail the gate');
});

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

test('PL6', 'the Best single-pass series serves, split at exactly 1/2 in, and the limit line names it', () => {
  const cases = [
    ['soft_plastic', 12.69, 'Onsrud 63-750'],
    ['soft_plastic', 12.7, 'Onsrud 52-700'],
    ['hard_plastic', 12.69, 'Onsrud 63-700'],
    ['hard_plastic', 12.7, 'Onsrud 60-200'],
  ];
  for (const [material, d, who] of cases) {
    const r = calculate(input({ material, diameterMm: d, thicknessMm: d }), data);
    assert(r.status === 'ok', `${material} ${d}: ${r.refusal?.reason}`);
    assert(r.meta.contributors[0] === who, `${material} ${d} mm: expected ${who}, got ${r.meta.contributors}`);
    assert(r.limit.message.includes(`${who} sets this feed`), `${material} ${d}: limit line "${r.limit.message}"`);
  }
});

test('PL7', 'the maker\'s formula: feed = rpm x cutting edges x chip load, at each profile edge', () => {
  // Hard 63-700 at 1/4 in prints .010-.012 in/tooth.
  for (const [profile, fzIn] of [['gentle', 0.010], ['standard', 0.011], ['aggressive', 0.012]]) {
    for (const z of [1, 2]) {
      const r = calculate(input({ material: 'hard_plastic', profile, flutesTotal: z }), data);
      approx(r.outputs.feedPerToothMm, fzIn * IN, { abs: 1e-9 });
      approx(r.outputs.cuttingFeedMmMin, 18000 * z * fzIn * IN, { abs: 1e-6 });
    }
  }
  // 18,000 rpm, one edge, .011 in: 198 in/min, 5,029.2 mm/min.
  approx(calculate(input({ material: 'hard_plastic' }), data).outputs.cuttingFeedMmMin, 5029.2, { abs: 0.01 });
});

test('PL8', 'depth derating as printed: 1xD the chip load, 2xD less 25 per cent, 3xD less 50 per cent, a deeper slot blocks', () => {
  const D = 6.35;
  const full = calculate(input({ thicknessMm: D }), data).outputs.feedPerToothMm;
  approx(full, 0.010 * IN, { abs: 1e-9 }); // soft 63-750 1/4 in, .008-.012, midpoint
  for (const [ratio, factor] of [[1, 1], [1.5, 0.875], [2, 0.75], [2.5, 0.625], [3, 0.5]]) {
    const r = calculate(input({ thicknessMm: D * ratio }), data);
    approx(r.meta.derate, factor, { abs: 1e-9 });
    approx(r.outputs.feedPerToothMm, full * factor, { abs: 1e-9 });
  }
  const deep = calculate(input({ thicknessMm: D * 3.2 }), data);
  assert(deep.status === 'blocked' && /deeper than 3 tool diameters/.test(deep.block.reason), 'a slot past 3xD must block');
  // A light-radial cut takes chip thinning instead of the derate.
  const light = calculate(input({ thicknessMm: D * 3.2, aeMm: 1 }), data);
  assert(light.status === 'ok' && light.meta.derate === 1 && light.meta.chipThinningFactor > 1, 'a light-radial cut does not derate');
});

test('PL9', 'metric sizes are interpolated in a straight line between the two nearest printed sizes of the serving series, and say so', () => {
  // [family, mm, series, lower column, its band, upper column, its band]
  const cases = [
    ['soft_plastic', 3, '63-750', 1 / 16, [0.002, 0.004], 1 / 8, [0.004, 0.006]],
    ['soft_plastic', 4, '63-750', 1 / 8, [0.004, 0.006], 3 / 16, [0.006, 0.008]],
    ['soft_plastic', 5, '63-750', 3 / 16, [0.006, 0.008], 1 / 4, [0.008, 0.012]],
    ['soft_plastic', 6, '63-750', 3 / 16, [0.006, 0.008], 1 / 4, [0.008, 0.012]],
    ['soft_plastic', 8, '63-750', 1 / 4, [0.008, 0.012], 3 / 8, [0.008, 0.012]],
    ['soft_plastic', 10, '63-750', 3 / 8, [0.008, 0.012], 1 / 2, [0.010, 0.014]],
    ['soft_plastic', 12, '63-750', 3 / 8, [0.008, 0.012], 1 / 2, [0.010, 0.014]],
    ['soft_plastic', 16, '52-700', 5 / 8, [0.014, 0.016], 3 / 4, [0.016, 0.018]],
    ['hard_plastic', 3, '63-700', 1 / 16, [0.002, 0.004], 1 / 8, [0.006, 0.008]],
    ['hard_plastic', 4, '63-700', 1 / 8, [0.006, 0.008], 3 / 16, [0.008, 0.010]],
    ['hard_plastic', 5, '63-700', 3 / 16, [0.008, 0.010], 1 / 4, [0.010, 0.012]],
    ['hard_plastic', 6, '63-700', 3 / 16, [0.008, 0.010], 1 / 4, [0.010, 0.012]],
    ['hard_plastic', 8, '63-700', 1 / 4, [0.010, 0.012], 3 / 8, [0.010, 0.012]],
    ['hard_plastic', 10, '63-700', 3 / 8, [0.010, 0.012], 1 / 2, [0.012, 0.016]],
    ['hard_plastic', 12, '63-700', 3 / 8, [0.010, 0.012], 1 / 2, [0.012, 0.016]],
    ['hard_plastic', 16, '60-200', 1 / 2, [0.006, 0.010], 3 / 4, [0.012, 0.016]],
  ];
  for (const [family, mm, series, aIn, aBand, bIn, bBand] of cases) {
    const t = (mm - aIn * IN) / ((bIn - aIn) * IN);
    const lo = (aBand[0] + t * (bBand[0] - aBand[0])) * IN;
    const hi = (aBand[1] + t * (bBand[1] - aBand[1])) * IN;
    const r = calculate(input({ material: family, diameterMm: mm, thicknessMm: mm }), data);
    assert(r.status === 'ok', `${family} ${mm} mm: ${r.refusal?.reason}`);
    assert(r.meta.contributors[0] === `Onsrud ${series}`, `${family} ${mm} mm: served by ${r.meta.contributors}`);
    approx(r.meta.band.fzMin, lo, { abs: 1e-9 });
    approx(r.meta.band.fzMax, hi, { abs: 1e-9 });
    assert(r.meta.plastic.interpolated === true, `${family} ${mm} mm: must be marked interpolated`);
    assert(r.notes.some((n) => n.includes(`no value at ${mm} mm`) && n.includes('interpolated')), `${family} ${mm} mm: the page must say it is interpolated`);
    assert(r.meta.servingBands[0].label.endsWith(', interpolated'), `${family} ${mm} mm: the chart row must say interpolated`);
    assert(buildChips(r).some((c) => c.key === 'band' && c.text.includes(`interpolated at ${mm} mm`)), `${family} ${mm} mm: the band badge must say interpolated`);
  }
  // A printed inch size is never marked interpolated.
  for (const mm of [3.175, 6.35, 9.525, 12.7, 19.05]) {
    const r = calculate(input({ diameterMm: mm, thicknessMm: mm }), data);
    assert(r.meta.plastic.interpolated === false && !r.notes.some((n) => /interpolated/.test(n)), `${mm} mm is printed and must not read as interpolated`);
  }
});

test('PL10', 'no extrapolation: a size outside the printed range gets no number and a plain reason', () => {
  for (const family of ['soft_plastic', 'hard_plastic']) {
    for (const mm of [1.5, 19.1, 25.4]) {
      const r = calculate(input({ material: family, diameterMm: mm, thicknessMm: mm }), data);
      assert(r.status === 'refused', `${family} ${mm} mm must refuse`);
      assert(/Its chart runs from 1\/16 in \(1\.59 mm\) to 3\/4 in \(19\.05 mm\)/.test(r.refusal.reason), `${family} ${mm}: "${r.refusal.reason}"`);
    }
    assert(calculate(input({ material: family, diameterMm: 1.5875, thicknessMm: 1.5875 }), data).status === 'ok', `${family}: 1/16 in is printed`);
    assert(calculate(input({ material: family, diameterMm: 19.05, thicknessMm: 19.05 }), data).status === 'ok', `${family}: 3/4 in is printed`);
  }
  assert(seriesBandAt(data.plastics.entries, 'soft_plastic', '63-750', 12.8) === null, 'a series gives no band past its last printed size');
});

test('PL11', 'no cutting force: the power and hold-down checks do not run, and the page says so', () => {
  const r = calculate(input({ footprintCm2: 50, thicknessMm: 18, diameterMm: 12.7, flutesTotal: 2 }), data);
  assert(r.status === 'ok', r.refusal?.reason);
  assert(r.limit.caps.pow === undefined && r.limit.caps.vac === undefined, 'no power or hold-down cap');
  assert(r.meta.powerKw === undefined && r.meta.gripN === undefined, 'no power figure and no grip figure');
  assert(r.notes.some((n) => /spindle power and the hold-down checks did not run/.test(n)), 'the note must say the checks did not run');
  const chips = buildChips(r);
  assert(chips.some((c) => c.key === 'power' && c.level === 'warm' && /No power or hold-down check/.test(c.text)), 'the badge must say so');
  assert(!chips.some((c) => c.key === 'kc' || c.key === 'holddown'), 'no cutting-force or grip badge');
});

test('PL12', 'first-cut mode does not apply to plastic, and the wood chip floor does not either', () => {
  const on = calculate(input({ firstCut: true }), data);
  const off = calculate(input({ firstCut: false }), data);
  assert(on.outputs.cuttingFeedMmMin === off.outputs.cuttingFeedMmMin, 'first-cut must not change a plastic feed');
  assert(on.notes.some((n) => /First-cut mode does not apply to plastic/.test(n)), 'the note must say why');
  // 1/16 in soft serves .002-.004 in, about 0.08 mm, under every wood floor.
  const small = calculate(input({ diameterMm: 1.5875, thicknessMm: 1.5875, profile: 'gentle' }), data);
  assert(small.warnings.length === 0, `no wood floor warning on a plastic chip: ${small.warnings.map((w) => w.code)}`);
});

test('PL13', 'a machine limit that holds the chip under the printed band warns, naming the defect the sheet names', () => {
  const capped = (material) => calculate(input({ material, machine: { ...MACHINE, feedMaxMmMin: 1000 } }), data);
  const soft = capped('soft_plastic');
  assert(soft.warnings.some((w) => w.code === 'chip_below_band' && /knife marks/.test(w.message)), 'soft: knife marks');
  const hard = capped('hard_plastic');
  assert(hard.warnings.some((w) => w.code === 'chip_below_band' && /cratering/.test(w.message)), 'hard: cratering');
  assert(buildChips(soft).some((c) => c.key === 'chip' && c.level === 'hot'), 'the chip badge goes hot');
  // The sheet's own depth derate lowers the chip under the band on purpose and does not warn.
  const deep = calculate(input({ thicknessMm: 6.35 * 3 }), data);
  assert(!deep.warnings.some((w) => w.code === 'chip_below_band'), 'the printed derate is not a fault');
});

test('PL14', 'tool types: up-cut, down-cut and straight serve the Best series, compression and the ball nose refuse in words', () => {
  const up = calculate(input({ toolType: 'upcut' }), data);
  for (const toolType of ['downcut', 'straight']) {
    const r = calculate(input({ toolType }), data);
    assert(r.outputs.cuttingFeedMmMin === up.outputs.cuttingFeedMmMin, `${toolType} serves the same number`);
    assert(r.notes.some((n) => /choice does not change this number/.test(n)), `${toolType}: the note must say the tool type moves nothing`);
  }
  const comp = calculate(input({ toolType: 'compression' }), data);
  assert(comp.status === 'refused' && /no compression tool for soft plastic/.test(comp.refusal.reason), 'compression refuses');
  const ball = calculate(input({ toolType: 'ball' }), data);
  assert(ball.status === 'refused' && /ball nose/.test(ball.refusal.reason), 'ball nose refuses');
  // The down-cut chart row shows down-cut series and no up-cut-only one.
  const down = calculate(input({ toolType: 'downcut' }), data);
  const labels = down.meta.contextBands.map((b) => b.label);
  assert(labels.includes('Onsrud 57-600') && labels.includes('Onsrud 62-750') && !labels.includes('Onsrud 52-600'), `down-cut context: ${labels}`);
  // Engraving, ball nose, profile, taper and HSS tools are never drawn.
  for (const r of [up, down, calculate(input({ toolType: 'straight' }), data)]) {
    for (const b of r.meta.contextBands) {
      const series = b.label.replace(/^Onsrud /, '').replace(/, interpolated$/, '');
      assert(data.plastics.series[series].kind === 'router', `${series} is not a router series and must not be drawn`);
    }
  }
});

test('PL15', 'the maker\'s advice: rewelding for both, the spoilboard slot for a soft down-cut only, and the named defect', () => {
  const softUp = calculate(input({}), data).advice.lines.join(' ');
  const softDown = calculate(input({ toolType: 'downcut' }), data).advice.lines.join(' ');
  const hardDown = calculate(input({ material: 'hard_plastic', toolType: 'downcut' }), data).advice.lines.join(' ');
  assert(/weld back/.test(softUp) && /single-edge tool/.test(softUp) && /knife marks/.test(softUp), softUp);
  assert(!/spoilboard/.test(softUp) && /spoilboard/.test(softDown), 'the spoilboard slot is for a down-cut spiral');
  assert(/cratering/.test(hardDown) && !/spoilboard/.test(hardDown), hardDown);
});

test('PL16', 'Finishing serves the low edge of the 60-200 row as the programmed chip, and refuses outside its printed sizes', () => {
  for (const family of ['soft_plastic', 'hard_plastic']) {
    const r = calculate(input({ material: family, profile: 'finishing', diameterMm: 12.7, thicknessMm: 12.7, flutesTotal: 3 }), data);
    assert(r.status === 'ok' && r.meta.contributors[0] === 'Onsrud 60-200', `${family}: ${r.refusal?.reason}`);
    approx(r.outputs.feedPerToothMm, 0.006 * IN, { abs: 1e-9 }); // both sheets print .006-.010 at 1/2 in
    assert(r.meta.thinningCompensated === false, 'a finish chip is programmed, not compensated');
    const small = calculate(input({ material: family, profile: 'finishing', diameterMm: 5, thicknessMm: 5 }), data);
    assert(small.status === 'refused' && /from 1\/4 in/.test(small.refusal.reason), `${family} 5 mm Finishing: ${small.refusal?.reason}`);
  }
  const soft = calculate(input({ profile: 'finishing', diameterMm: 12.7, thicknessMm: 12.7 }), data);
  assert(soft.meta.chartNotes.some((n) => /names no finishing tool/.test(n)), 'the soft borrow of the finishing tool is recorded');
});

test('PL17', 'drilling refuses a plastic in words', () => {
  for (const material of ['soft_plastic', 'hard_plastic']) {
    const r = calculateDrilling({ drillType: data.drills.entries[0].subfamily_id, material, diameterMm: 5 }, data);
    assert(r.status === 'refused' && /no drilling number for plastic/.test(r.refusal.reason), `${material}: ${JSON.stringify(r)}`);
  }
});

test('PL18', 'no wood number can move: every wood result is identical with and without the plastics data loaded', () => {
  const noPlastics = { ...data, plastics: undefined };
  let n = 0;
  for (const m of MATERIALS.filter((x) => !x.beta)) {
    for (const toolType of ['upcut', 'downcut', 'compression', 'straight', 'ball']) {
      for (const d of [3.175, 6.35, 12.7, 19.05]) {
        for (const profile of ['gentle', 'standard', 'finishing']) {
          const inp = { material: m.kcMaterial, materials: m.data, materialsFallback: m.fallback, toolType, diameterMm: d, thicknessMm: 18, profile, machine: MACHINE, rpm: 18000, flutesTotal: 2, firstCut: true };
          const a = JSON.stringify(calculate(inp, data));
          const b = JSON.stringify(calculate(inp, noPlastics));
          assert(a === b, `${m.id} ${toolType} ${d} ${profile}: the result changed with the plastics data`);
          n += 1;
        }
      }
    }
  }
  assert(n === 420, `swept ${n} wood picks`);
});

// ---------------------------------------------------------------------------
// The page and the panel
// ---------------------------------------------------------------------------

test('PL-PICKS', 'the material picks: one per family, hard first, the page and the panel agree, and each hint lists every plastic the data assigns', () => {
  const picks = MATERIALS.filter((m) => m.beta);
  assert(picks.map((m) => `${m.id}:${m.kcMaterial}`).join(',') === 'hard_plastic:hard_plastic,soft_plastic:soft_plastic', `plastic picks: ${picks.map((m) => m.id)}`);
  for (const m of picks) {
    for (const p of data.plastics.families[m.kcMaterial].picks) {
      assert(m.hint.toLowerCase().includes(p.label.toLowerCase()), `${m.id}: the hint does not list ${p.label}`);
    }
  }
  assert(picks[0].label.includes('cast acrylic') && picks[1].label.includes('extruded acrylic'), 'the labels say which acrylic');
  // The panel copies the same two picks, word for word.
  const block = (src) => {
    const from = src.indexOf('  // The plastics, beta only');
    return src.slice(from, src.indexOf('\n];', from)).replace(/\s+/g, ' ');
  };
  const pageSrc = readFileSync(join(root, 'src', 'form-state.js'), 'utf8');
  const panelSrc = readFileSync(join(root, 'js', 'ui', 'fusion-panel.js'), 'utf8');
  assert(block(pageSrc).length > 200 && block(pageSrc) === block(panelSrc), 'the panel\'s plastic picks must match the page\'s');
});

test('PL19', 'the page offers the plastics and 3 mm only with the beta tick on, and a plastic link ticks it', () => {
  const wood = MATERIALS.filter((m) => !m.beta).map((m) => m.id);
  assert(JSON.stringify(materialsFor(false).map((m) => m.id)) === JSON.stringify(wood), 'beta off: the seven wood picks only');
  assert(materialsFor(true).length === 9, 'beta on: nine picks');
  assert(!diametersFor(true, 'mdf').includes(3) && diametersFor(true, 'soft_plastic').includes(3), '3 mm is for a plastic only');

  const linked = createState(data, presets, '?m=soft_plastic&d=3&th=3&t=upcut', false);
  assert(linked.beta === true && linked.material === 'soft_plastic' && linked.diameterMm === 3, 'a plastic link opens ticked, with its 3 mm');
  const woodLink = createState(data, presets, '?m=mdf&d=3', false);
  assert(woodLink.diameterMm === 12.7, 'a wood link naming 3 mm keeps the default size');

  const off = update(linked, { type: 'beta', value: false }, presets);
  assert(off.material === DEFAULT_MATERIAL && off.diameterMm === 3.175, `unticking falls back to MDF and 1/8 in, got ${off.material} ${off.diameterMm}`);
  const toWood = update(linked, { type: 'material', value: 'hardwood' }, presets);
  assert(toWood.diameterMm === 3.175 && toWood.beta === true, 'leaving the plastics moves 3 mm to 1/8 in');
  const pick = update(createState(data, presets, '', false), { type: 'material', value: 'hard_plastic' }, presets);
  assert(pick.beta === true && isPlasticPick(pick.material), 'choosing a plastic keeps the tick on');

  const inp = currentInput(linked, data, presets);
  assert(inp.material === 'soft_plastic' && inp.diameterMm === 3, 'the engine is handed the family');
  const r = calculate(inp, data);
  assert(r.status === 'ok', `the page's own input serves: ${r.refusal?.reason}`);
});

test('PL20', 'the results view shows the maker\'s advice as an info banner, and a wood view carries no advice at all', () => {
  const r = calculate(input({ toolType: 'downcut' }), data);
  const view = resultsView(r);
  assert(view.kind === 'figures' && view.advice?.variant === 'info', 'an info banner');
  assert(view.advice.title === "Onsrud's advice for soft plastic" && view.advice.list.length === 3, JSON.stringify(view.advice));
  assert(view.warnings.length === 0, 'the advice is not a warning');
  const wood = resultsView(calculate({ ...input({}), material: 'mdf', materials: ['mdf'], toolType: 'compression', diameterMm: 12.7, thicknessMm: 18, flutesTotal: 2 }, data));
  assert(wood.kind === 'figures' && !('advice' in wood), 'a wood view has no advice key');
  // The output rows are the wood rows, so the Fusion and Woodwork for Inventor names do not change.
  assert(view.rows.map((x) => x.label).join('|') === wood.rows.map((x) => x.label).join('|'), 'the same output rows as wood');
  const charts = chartsView(calculate(input({ diameterMm: 8, thicknessMm: 8 }), data), MACHINE);
  assert(charts.ladder.rows.some((x) => x.serves && x.label === 'Onsrud 63-750, interpolated'), 'the serving chart row says interpolated');
});

test('PL21', 'the PDFs never ship: git ignores them, the build copies no research path, and a built site holds none', () => {
  assert(/^research\/sources\/$/m.test(readFileSync(join(root, '.gitignore'), 'utf8')), 'research/sources/ must stay ignored');
  const vite = readFileSync(join(root, 'vite.config.ts'), 'utf8');
  const list = vite.slice(vite.indexOf('const SITE_FILES'), vite.indexOf('];', vite.indexOf('const SITE_FILES')));
  assert(!/research|\.pdf/i.test(list), 'SITE_FILES must copy nothing from research/ and no PDF');
  assert(/must carry no PDF/.test(vite), 'the build must fail on a PDF');
  const dist = join(root, 'dist');
  if (existsSync(dist)) {
    const pdfs = readdirSync(dist, { recursive: true }).map((f) => String(f).split(sep).join('/')).filter((f) => /\.pdf$/i.test(f));
    assert(pdfs.length === 0, `the built site holds ${pdfs}`);
  }
});
