// Stage 4 gate: constructed scenarios force each limit to bind, and the
// diagnostics report them, against the real data files.

import { test, assert, approx } from './helpers.js';
import { loadData } from './load-node.js';
import { calculate } from '../js/core/calculate.js';
import { buildChips } from '../js/core/diagnostics.js';
import { selectEntries } from '../js/core/chipload.js';
import { machinePresets } from '../js/data/presets.js';

const data = loadData();

const BASE = {
  material: 'mdf',
  toolType: 'upcut',
  diameterMm: 12,
  thicknessMm: 12,
  profile: 'standard',
  firstCut: false,
  machine: {
    spindleKw: 10, breakpointRpm: 12000, feedMaxMmMin: 30000, accelMs2: 3,
    vacuum: { mu: 0.4, dPkPa: 5 },
  },
};

function run(overrides = {}, machineOverrides = {}) {
  return calculate({ ...BASE, ...overrides, machine: { ...BASE.machine, ...machineOverrides } }, data);
}

test('SC1', 'machine feed binds when the axes cannot keep up', () => {
  const r = run({}, { feedMaxMmMin: 5000 });
  assert(r.limit.binding === 'vmax', `expected vmax, got ${r.limit.binding}`);
  assert(r.limit.message.includes('machine maximum feed'), r.limit.message);
});

test('SC2', 'spindle power binds on a starved spindle', () => {
  const r = run({}, { spindleKw: 0.3 });
  assert(r.limit.binding === 'pow', `expected pow, got ${r.limit.binding}`);
  assert(r.limit.message.includes('Spindle power is the limit'), r.limit.message);
  const chips = buildChips(r);
  const power = chips.find((c) => c.key === 'power');
  assert(power && power.level === 'hot', `power chip should be hot: ${JSON.stringify(power)}`);
});

test('SC3', 'hold-down binds on a small footprint, and says tabs not more vacuum', () => {
  const r = run({ footprintCm2: 15 });
  assert(r.limit.binding === 'vac', `expected vac, got ${r.limit.binding}`);
  assert(r.limit.message.includes('onion skin or tabs'), r.limit.message);
  assert(r.limit.message.includes('More vacuum does not correct'), r.limit.message);
});

test('SC4', 'corners bind on a small feature with soft acceleration', () => {
  const r = run({ featureMm: 15 }, { accelMs2: 0.5 });
  assert(r.limit.binding === 'corn', `expected corn, got ${r.limit.binding}`);
  assert(r.limit.message.includes('Corner behaviour'), r.limit.message);
  const corner = buildChips(r).find((c) => c.key === 'corner');
  assert(corner, 'corner chip missing');
});

test('SC5', 'no limit applies on a generous machine, and the vendor is named', () => {
  const r = run({}, { spindleKw: 20, feedMaxMmMin: 90000 });
  assert(r.limit.binding === 'ideal', `expected ideal, got ${r.limit.binding}`);
  assert(r.limit.message.startsWith('No limit applies'), r.limit.message);
  assert(/Onsrud|Freud|Rennie|Vortex|ITA/.test(r.limit.message), `no vendor named: ${r.limit.message}`);
});

test('SC6', 'a starved cut trips the chip floor and the chip goes hot', () => {
  const r = run({}, { spindleKw: 0.05 });
  assert(r.warnings.some((w) => w.code === 'chip_plough' || w.code === 'chip_below_min'),
    `expected a floor warning, got ${JSON.stringify(r.warnings.map((w) => w.code))}`);
  const chip = buildChips(r).find((c) => c.key === 'chip');
  assert(chip.level === 'hot', `chip should be hot, got ${chip.level}`);
});

test('SC7', 'constant-torque region gets its own chip below the breakpoint', () => {
  const r = run({ rpm: 9000 });
  const torque = buildChips(r).find((c) => c.key === 'torque');
  assert(torque && torque.level === 'warm', `torque chip missing or wrong: ${JSON.stringify(torque)}`);
  assert(torque.text.includes('75% of rated power'), torque.text);
});

test('SC8', 'down-cut is served from the spiral envelope with Onsrud contributing', () => {
  const r = run({ toolType: 'downcut' });
  assert(r.status === 'ok', `expected ok, got ${r.status}`);
  assert(r.meta.contributors.some((c) => c.includes('Onsrud')), `contributors: ${r.meta.contributors}`);
});

test('SC9', 'timber density outside validity warns and says so', () => {
  const r = run({ material: 'hardwood', densityKgM3: 250 });
  assert(r.warnings.some((w) => w.code === 'density_out_of_validity'), 'density warning missing');
});

test('SC10', 'plunge and ramp are one third of cutting feed; lead-in/out equal it', () => {
  const r = run();
  approx(r.outputs.plungeFeedMmMin, r.outputs.cuttingFeedMmMin * 0.3333, { rel: 0.001 });
  approx(r.outputs.rampFeedMmMin, r.outputs.cuttingFeedMmMin * 0.3333, { rel: 0.001 });
  assert(r.outputs.leadInFeedMmMin === r.outputs.cuttingFeedMmMin, 'lead-in must equal cutting feed');
  assert(r.outputs.leadOutFeedMmMin === r.outputs.cuttingFeedMmMin, 'lead-out must equal cutting feed');
  assert(/reduced engagement/.test(r.outputNotes.leadInOut), 'lead-in note missing');
  assert(!/vendor|publishes/.test(r.outputNotes.leadInOut), 'the lead-in note must not talk about vendors on the page');
});

test('SC11', 'feed scales with the single flute count', () => {
  const two = run({ flutesTotal: 2 });
  const three = run({ flutesTotal: 3 });
  approx(three.outputs.cuttingFeedMmMin / two.outputs.cuttingFeedMmMin, 1.5, { rel: 0.001 });
});

test('SC12', 'compression on thin board blocks with the minimum pass stated', () => {
  const r = run({ toolType: 'compression', thicknessMm: 9, diameterMm: 12.7 });
  assert(r.status === 'blocked', `expected blocked, got ${r.status}`);
  approx(r.block.minPassMm, 14.29, { abs: 0.05 });
});

test('SC13', 'hostile advanced values never produce NaN or drop safety checks', () => {
  const neg = run({ featureMm: -5 });
  assert(neg.status === 'ok', `expected ok, got ${neg.status}`);
  for (const [k, v] of Object.entries(neg.outputs)) {
    assert(Number.isFinite(v), `output ${k} is not finite with a negative feature length`);
  }
  assert(neg.limit.binding !== 'corn', 'a negative feature must not create a corner cap');
  const negAccel = run({ featureMm: 120 }, { accelMs2: -2 });
  assert(Object.values(negAccel.outputs).every(Number.isFinite), 'negative acceleration leaked NaN');
  const negKw = run({}, { spindleKw: -5 });
  assert(Object.values(negKw.outputs).every(Number.isFinite), 'negative spindle power leaked NaN');
});

test('SC14', 'a zero up-cut section length cannot bypass the compression block', () => {
  const r = run({ toolType: 'compression', thicknessMm: 6, diameterMm: 12.7, upcutLengthMm: 0 });
  assert(r.status === 'blocked', `expected blocked, got ${r.status}`);
  const r2 = run({ toolType: 'compression', thicknessMm: 6, diameterMm: 12.7, upcutLengthMm: -5 });
  assert(r2.status === 'blocked', `expected blocked, got ${r2.status}`);
});

test('SC15', 'upcut-only convention notes the conservative reading, same identity maths', () => {
  const total = run({ flutesTotal: 2, fluteBasis: 'total' });
  const upcutOnly = run({ flutesTotal: 2, fluteBasis: 'upcut_only' });
  assert(upcutOnly.outputs.cuttingFeedMmMin === total.outputs.cuttingFeedMmMin, 'the entered count drives the identity either way');
  assert(upcutOnly.notes.some((n) => /up-cut flutes only/.test(n)), 'missing the convention note');
  assert(!total.notes.some((n) => /up-cut flutes only/.test(n)), 'note must not fire on the default convention');
});

test('SC16', 'rpm above the machine maximum clamps and says so', () => {
  const r = run({ rpm: 30000 }, { rpmMax: 24000 });
  assert(r.outputs.spindleRpm === 24000, `expected 24000, got ${r.outputs.spindleRpm}`);
  assert(r.warnings.some((w) => w.code === 'rpm_clamped'), 'missing the clamp warning');
});

test('SC17', 'missing thickness refuses with a message naming thickness', () => {
  const r = run({ thicknessMm: 0 });
  assert(r.status === 'refused', `expected refused, got ${r.status}`);
  assert(/thickness/.test(r.refusal.reason), r.refusal.reason);
});

test('SC18', 'the big-iron generic charts stay context at 3.175 mm; the geometry chart serves', () => {
  const r = run({ diameterMm: 3.175, thicknessMm: 3 });
  assert(r.status === 'ok', `expected ok, got ${r.status}`);
  const names = r.meta.contributors.join(' ');
  for (const v of ['Freud', 'Rennie', 'Vortex']) {
    assert(!names.includes(v), `${v} contributed to a 3.175 mm envelope from a 12.7 mm-only chart`);
  }
  assert(r.meta.band.fzMax < 0.31, `band top ${r.meta.band.fzMax} is a half-inch chip load on a 1/8" tool`);
  assert(r.meta.chartNotes.some((n) => /publishes no values near/.test(n)), 'missing the chart-excluded record');
});

test('SC19', 'a cap that drives the feed to zero blocks with advice, never renders zeros', () => {
  const r = run({ toolType: 'straight', thicknessMm: 18, diameterMm: 12.7, footprintCm2: 80 });
  assert(r.status === 'blocked', `expected blocked, got ${r.status}`);
  assert(/onion skin or tabs/.test(r.block.reason), r.block.reason);
  assert(!('outputs' in r), 'a zero-feed block must not carry outputs');
});

test('SC20', 'no corner chip renders for inputs the corner cap itself rejects', () => {
  const neg = buildChips(run({ featureMm: -5 }));
  assert(!neg.some((c) => c.key === 'corner'), 'corner chip rendered for a negative feature');
  const negAccel = buildChips(run({ featureMm: 120 }, { accelMs2: -2 }));
  assert(!negAccel.some((c) => c.key === 'corner'), 'corner chip rendered for negative acceleration');
});

test('SC21', 'an up-cut-only spiral row cannot serve down-cut without covers_directions', () => {
  const entries = [
    { source: 'onsrud-2017', vendor: 'Onsrud', series: 'UP-ONLY', tool_geometry: 'spiral_upcut', material: 'mdf', diameter_mm: 12.7, fz_min_mm: 0.9, fz_max_mm: 0.95, flute_basis: 'per_tooth_total', data_class: 'vendor' },
    { source: 'onsrud-2017', vendor: 'Onsrud', series: 'BOTH', tool_geometry: 'spiral_upcut', material: 'mdf', diameter_mm: 12.7, fz_min_mm: 0.2, fz_max_mm: 0.25, flute_basis: 'per_tooth_total', data_class: 'vendor', covers_directions: ['upcut', 'downcut'] },
  ];
  const down = selectEntries(entries, { material: 'mdf', toolType: 'downcut' });
  assert(down.entries.length === 1 && down.entries[0].series === 'BOTH', 'up-cut-only row leaked into down-cut selection');
  const up = selectEntries(entries, { material: 'mdf', toolType: 'upcut' });
  assert(up.entries.length === 2, 'up-cut selection should take both rows');
});

test('SC23', 'both plywoods and HPL resolve at every published diameter, not just 12.7', () => {
  for (const mat of ['plywood', 'softwood_ply', 'hpl']) {
    for (const dia of [3.175, 6.35, 9.525, 12.7]) {
      // Never deeper than 3xD: the depth block (SC33) is not what this test reads.
      const r = run({ material: mat, materials: [mat], diameterMm: dia, thicknessMm: Math.min(12, 3 * dia) });
      assert(r.status === 'ok', `${mat} at ${dia} mm returned ${r.status}`);
      assert(r.meta.fzDeliv > 0, `${mat} at ${dia} mm gave no chip load`);
    }
  }
  const small = run({ material: 'plywood', materials: ['plywood'], diameterMm: 3.175, thicknessMm: 6 });
  const big = run({ material: 'plywood', materials: ['plywood'], diameterMm: 12.7, thicknessMm: 6 });
  assert(small.meta.band.fzMax < big.meta.band.fzMax, 'small-diameter band must sit below the 1/2 inch band');
});

test('SC24', 'a band resting only on big-iron charts says so; Onsrud-served cuts do not', () => {
  const hpl = run({ material: 'hpl', materials: ['hpl'], diameterMm: 12.7 });
  assert(hpl.warnings.some((w) => w.code === 'big_iron_only'), 'HPL must carry the big-iron caveat');
  assert(/10\+ hp/.test(hpl.warnings.find((w) => w.code === 'big_iron_only').message), 'caveat must name the machine class');
  const mdf = run({ material: 'mdf', materials: ['mdf'], diameterMm: 12.7 });
  assert(!mdf.warnings.some((w) => w.code === 'big_iron_only'), 'MDF is Onsrud-served; caveat must not fire');
});

test('SC25', 'machine choice changes the feed when a machine limit actually binds', () => {
  const cut = { material: 'softwood_ply', materials: ['softwood_ply'], toolType: 'compression', thicknessMm: 18, profile: 'aggressive', rpm: 24000, flutesTotal: 3 };
  const slow = run(cut, { feedMaxMmMin: 30000 });
  const fast = run(cut, { feedMaxMmMin: 50000 });
  assert(slow.limit.binding === 'vmax', `expected vmax on the 30 m/min machine, got ${slow.limit.binding}`);
  assert(fast.outputs.cuttingFeedMmMin > slow.outputs.cuttingFeedMmMin, 'the faster machine must deliver more feed');
});

test('SC22', 'softwood with a density entered surfaces the radiata mapping note', () => {
  const r = run({ material: 'softwood', densityKgM3: 515 });
  assert(r.status === 'ok', `expected ok, got ${r.status}`);
  assert(r.notes.some((n) => /Radiata/.test(n)), 'radiata density-mapping note missing');
});

test('SC27', 'a cap-held chip floor never says raise the feed; first-cut names itself when it holds', () => {
  const vmaxHeld = run({ aeMm: 0.3, flutesTotal: 4, rpm: 24000, profile: 'aggressive', apMm: 6 }, { feedMaxMmMin: 30000 });
  assert(vmaxHeld.limit.binding === 'vmax', `expected vmax, got ${vmaxHeld.limit.binding}`);
  const w = vmaxHeld.warnings.find((x) => x.code === 'chip_below_min' || x.code === 'chip_plough');
  assert(w, 'floor warning expected');
  assert(!/Raise the feed/.test(w.message), `must not say raise the feed at the cap: ${w.message}`);
  assert(/machine maximum feed/.test(w.message), `must name the holder: ${w.message}`);
  const fcHeld = run({ firstCut: true, profile: 'gentle', rpm: 24000 });
  const fw = fcHeld.warnings.find((x) => x.code === 'chip_below_min' || x.code === 'chip_plough' || x.code === 'chip_marginal');
  if (fw && fcHeld.limit.binding === 'ideal' && /below/.test(fw.message)) {
    assert(/first-cut mode/.test(fw.message), `first-cut must name itself as the holder: ${fw.message}`);
  }
});

test('SC28', 'first-cut messaging is honest about who sets the feed', () => {
  const free = run({ firstCut: true });
  assert(free.limit.binding === 'ideal', `expected ideal, got ${free.limit.binding}`);
  assert(/first-cut mode serves 65%/.test(free.limit.message), `headline must credit first-cut: ${free.limit.message}`);
  assert(free.notes.some((n) => /serves 65% of the chart feed/.test(n)), 'first-cut note missing');
  const capped = run({ firstCut: true }, { feedMaxMmMin: 3000 });
  assert(capped.limit.binding === 'vmax', `expected vmax, got ${capped.limit.binding}`);
  assert(capped.notes.some((n) => /sets the feed here regardless/.test(n)), `capped note must defer to the cap: ${capped.notes}`);
  assert(!capped.notes.some((n) => /running 65% of the chart feed/.test(n)), 'must not claim 65% when a cap sets the feed');
});

test('SC29', 'inert controls announce themselves: direction on legacy kc, density on panels', () => {
  const hw = run({ material: 'hardwood', direction: 'conventional' });
  assert(hw.notes.some((n) => /no modelled effect/.test(n)), 'direction inert note missing for hardwood');
  const mdfDensity = run({ densityKgM3: 2000 });
  assert(!mdfDensity.warnings.some((w) => w.code === 'density_out_of_validity'), 'density warning must not fire on a panel material');
  const hwDensity = run({ material: 'hardwood', densityKgM3: 600 });
  assert(hwDensity.notes.some((n) => /does not change the served numbers yet/.test(n)), 'density inertness note missing');
});

test('SC26', 'first-cut mode scales the feed by the rules factor, notes it, and defaults on', () => {
  const off = run({ firstCut: false });
  const on = run({ firstCut: true });
  approx(on.outputs.cuttingFeedMmMin / off.outputs.cuttingFeedMmMin, data.rules.first_cut.factor, { rel: 0.001 });
  assert(on.notes.some((n) => /First-cut mode/.test(n)), 'first-cut note missing');
  assert(!off.notes.some((n) => /First-cut mode/.test(n)), 'note must not fire when off');
  const unspecified = calculate({ ...BASE, firstCut: undefined }, data);
  approx(unspecified.outputs.cuttingFeedMmMin, on.outputs.cuttingFeedMmMin, { rel: 0.001 });
});

test('SC31', 'finishing serves the finisher chart as the programmed chip, uncompensated, first-cut ignored', () => {
  const fin = run({ profile: 'finishing', firstCut: true });
  assert(fin.status === 'ok', `expected ok, got ${fin.status}`);
  assert(fin.meta.contributors.some((c) => c.includes('60-200')),
    `the finisher chart must serve, got ${fin.meta.contributors}`);
  approx(fin.meta.aeMm, data.rules.finishing.skim_ae_mm, { abs: 1e-9 });
  assert(fin.meta.firstCut.applied === false, 'first-cut must never apply in finishing');
  assert(fin.limit.binding === 'ideal', `expected ideal, got ${fin.limit.binding}`);
  // The programmed chip IS the chart's low edge: no thinning compensation,
  // no derate on a skim, no first-cut. The feed is the plain identity.
  approx(fin.outputs.feedPerToothMm, fin.meta.band.fzMin, { rel: 1e-9 });
  approx(fin.outputs.cuttingFeedMmMin, fin.meta.band.fzMin * 18000 * 2, { rel: 1e-9 });
  assert(fin.meta.thinningCompensated === false, 'finishing must not compensate for thinning');
  assert(fin.meta.chipThinningFactor > 1.5, `the physical thinning must still report, got ${fin.meta.chipThinningFactor}`);
  assert(fin.meta.fzPhysical < fin.meta.band.fzMin, 'the physical chip must read thinner than the programmed chip');
  assert(!fin.warnings.some((w) => /^chip_/.test(w.code)), `no chip warning may fire at the chart's own value: ${fin.warnings.map((w) => w.code)}`);
  // The number Scott rejected was 24,300 mm/min for a half-inch MDF skim at
  // 18k rpm and two flutes; its compensated sibling was 8,488. The vendor's
  // programmed chip gives 4,572. Pin the class of number, not just the value.
  const half = run({ toolType: 'compression', diameterMm: 12.7, thicknessMm: 18, profile: 'finishing', rpm: 18000, flutesTotal: 2 });
  approx(half.outputs.cuttingFeedMmMin, 0.127 * 18000 * 2, { rel: 0.001 });
  assert(half.outputs.cuttingFeedMmMin < 6000, `a half-inch MDF finish skim at 18k rpm must stay under 6 m/min, got ${half.outputs.cuttingFeedMmMin}`);
  assert(half.meta.derate === 1, 'the deep-slot derate must not touch a skim');
  // Ignoring first-cut means the toggle moves nothing.
  const off = run({ profile: 'finishing', firstCut: false });
  approx(fin.outputs.cuttingFeedMmMin, off.outputs.cuttingFeedMmMin, { rel: 1e-9 });
  assert(fin.meta.chartNotes.some((n) => /finisher chart/.test(n)), 'finisher-chart record missing');
  assert(fin.meta.chartNotes.some((n) => /does not compensate/.test(n)), 'no-compensation record missing');
  assert(fin.notes.some((n) => /assumes a 1 mm skim/.test(n)), 'skim note missing');
  assert(fin.notes.some((n) => /first-cut reduction does not apply/.test(n)), 'first-cut inapplicability note missing');
  // A typed width of cut is respected, and the skim note goes away. A
  // full-width cut in Finishing derates like any other profile and says so.
  const typed = run({ profile: 'finishing', aeMm: 3 });
  approx(typed.meta.aeMm, 3, { abs: 1e-9 });
  assert(!typed.notes.some((n) => /assumes a 1 mm skim/.test(n)), 'the skim note must not claim an assumption the user overrode');
  const slot = run({ profile: 'finishing', aeMm: 12, thicknessMm: 24 });
  assert(slot.meta.derate < 1, 'a full-width finishing cut at 2xD must derate');
  assert(slot.warnings.some((w) => w.code === 'chip_below_chart'), 'a derated finishing chip must warn against the chart minimum');
  // A cap that holds the programmed chip under the chart names itself.
  const capped = run({ profile: 'finishing' }, { feedMaxMmMin: 2000 });
  const w = capped.warnings.find((x) => x.code === 'chip_below_chart');
  assert(w && /machine maximum feed/.test(w.message), `the cap must be named: ${w && w.message}`);
});

test('SC32', 'panels without a finisher chart borrow the MDF chart; outside its diameters Finishing refuses', () => {
  for (const mat of [
    { material: 'plywood', materials: ['plywood'] },
    { material: 'softwood_ply', materials: ['softwood_ply'], materialsFallback: ['plywood'] },
    { material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'] },
    { material: 'hpl', materials: ['hpl'], diameterMm: 12.7 },
  ]) {
    const r = run({ ...mat, profile: 'finishing' });
    assert(r.status === 'ok', `${mat.material}: expected ok, got ${r.status}`);
    assert(r.meta.contributors.some((c) => c.includes('60-200')), `${mat.material}: the MDF finisher chart must serve`);
    assert(r.meta.chartNotes.some((n) => /MDF finisher chart serves/.test(n)), `${mat.material}: the borrow must stay on record`);
    const mdf = run({ profile: 'finishing', diameterMm: mat.diameterMm ?? 12 });
    approx(r.meta.band.fzMin, mdf.meta.band.fzMin, { abs: 1e-9 });
    assert(r.meta.contextBands.length > 0, `${mat.material}: the tool charts must stay visible as context`);
  }
  // Solid timber never borrows: hardwood serves its own finisher row.
  const hw = run({ material: 'hardwood', materials: ['hardwood'], diameterMm: 12.7, thicknessMm: 12.7, profile: 'finishing' });
  assert(!hw.meta.chartNotes.some((n) => /MDF finisher chart/.test(n)), 'hardwood must not borrow the MDF chart');
  approx(hw.meta.band.fzMin, 0.178, { abs: 0.002 });
  // Outside the finisher rows' ±25% coverage the profile refuses with the reason.
  for (const diameterMm of [3.175, 25.4]) {
    const r = run({ diameterMm, thicknessMm: Math.min(diameterMm, 18), profile: 'finishing' });
    assert(r.status === 'refused', `${diameterMm} mm: expected refused, got ${r.status}`);
    assert(/finisher chart/.test(r.refusal.reason), `${diameterMm} mm: the reason must name the finisher chart: ${r.refusal.reason}`);
  }
  // The 60-300 chipbreaker finishers never serve: only the finisher class does.
  const fin = run({ profile: 'finishing' });
  assert(!fin.meta.contributors.some((c) => /60-3/.test(c)), `chipbreaker finishers must stay context: ${fin.meta.contributors}`);
});

test('SC33', 'a cut deeper than three diameters blocks and names the maximum pass', () => {
  const deep = run({ diameterMm: 3.175, thicknessMm: 18 });
  assert(deep.status === 'blocked', `expected blocked, got ${deep.status}`);
  assert(/3 tool diameters/.test(deep.block.reason), deep.block.reason);
  assert(/passes of 9.5 mm or less/.test(deep.block.reason), `the maximum pass must be named: ${deep.block.reason}`);
  assert(!('outputs' in deep), 'a block must not carry outputs');
  // Exactly three diameters still serves; a hair past it does not.
  assert(run({ apMm: 36 }).status === 'ok', '3.0xD must serve');
  assert(run({ apMm: 37 }).status === 'blocked', '3.1xD must block');
  // Every profile blocks, Finishing included: no chart goes deeper.
  assert(run({ diameterMm: 3.175, thicknessMm: 18, profile: 'finishing' }).status === 'blocked', 'finishing must block too');
  assert(data.rules.depth_limit.max_ratio_of_d === 3, 'the depth limit must stay at the vendors 3xD anchor');
});

test('SC34', 'the ITA chart contributes only near its 12 mm nesting tools', () => {
  const small = run({ material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'], diameterMm: 3.175, thicknessMm: 3, profile: 'aggressive' });
  assert(small.status === 'ok', `expected ok, got ${small.status}`);
  assert(!small.meta.contributors.some((c) => /ITA/.test(c)), `ITA must not serve a 3.175 mm tool: ${small.meta.contributors}`);
  assert(small.outputs.feedPerToothMm < 0.19, `a 1/8 in melamine chip must stay under the stretched 0.194: ${small.outputs.feedPerToothMm}`);
  approx(small.outputs.feedPerToothMm, 0.15, { abs: 0.001 });
  // At 1/4 in Freud's own row serves alone now. Its low edge (0.25) sits above
  // the 0.15 the unsized ITA row used to pull Gentle down to. That is Freud's
  // published 1/4 in value, and the big-iron caveat now fires with it.
  const quarter = run({ material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'], diameterMm: 6.35, thicknessMm: 6, profile: 'gentle' });
  assert(!quarter.meta.contributors.some((c) => /ITA/.test(c)), `ITA must not serve a 6.35 mm tool: ${quarter.meta.contributors}`);
  assert(quarter.warnings.some((w) => w.code === 'big_iron_only'), 'a Freud-only melamine band must carry the big-iron caveat');
  const mid = run({ material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'], diameterMm: 12.7 });
  assert(mid.meta.contributors.some((c) => /ITA/.test(c)), `ITA must still serve melamine at 12.7 mm: ${mid.meta.contributors}`);
  // At 1 in the unsized row used to serve MDF and hardwood spirals alone.
  for (const material of ['mdf', 'hardwood']) {
    const big = run({ material, materials: [material], diameterMm: 25.4, thicknessMm: 25 });
    assert(big.status === 'refused', `${material} at 25.4 mm must refuse without ITA: ${big.status}`);
  }
  assert(data.chiploads.entries.filter((e) => e.source === 'ita').every((e) => e.diameter_mm === 12), 'ITA rows must carry 12 mm');
});

// SC35 guards the copy contract behind the 2026-08-31 sweep: the public page
// never narrates how the calculator chose its data. That story lives in
// meta.chartNotes for tests and headless callers, and on the page only the
// limit line and the chart ladder name a chart.
test('SC35', 'chart narration never reaches the rendered notes', () => {
  const NARRATION = /publishes no|publishes nothing|chart serves|charts? do not|contributes|disagree by more than|does not compensate|Generic (vendor|chart) values|nearest match|flat kc estimate/;
  const picks = [
    {},
    { profile: 'finishing' },
    { material: 'plywood', materials: ['plywood'], profile: 'finishing' },
    { material: 'softwood_ply', materials: ['softwood_ply'], materialsFallback: ['plywood'] },
    { material: 'hpl', materials: ['hpl'], diameterMm: 12.7, toolType: 'straight' },
    { material: 'hardwood', materials: ['hardwood'], direction: 'conventional', densityKgM3: 600 },
    { diameterMm: 3.175, thicknessMm: 3 },
    { material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'], diameterMm: 6.35, thicknessMm: 6 },
  ];
  for (const pick of picks) {
    const r = run(pick);
    if (r.status !== 'ok') continue;
    for (const n of r.notes) {
      assert(!NARRATION.test(n), `narration leaked into the rendered notes for ${JSON.stringify(pick)}: ${n}`);
    }
    assert(r.notes.length <= 5, `${r.notes.length} notes render for ${JSON.stringify(pick)}; the page carries guidance, not a log`);
  }
});

// SC30 guards the ceiling the results column is built on. Every warning is a
// banner, and the design system calls a pile of more than about three status
// visuals a stream that belongs in a list instead. This page's pile is
// bounded: the limit line plus at most three banners. Up to three warnings
// render as separate banners; four or more fold into ONE banner carrying a
// list (render() in js/ui/app.js), which is what the design system asks for
// when the correct visual arrives too many times. The fourth warning became
// reachable on 2026-08-29, when the ITA rows took their 12 mm diameter and
// Freud-only melamine bands at small diameters picked up the big-iron
// caveat beside the rpm clamp, the chip floor and the low-speed kc caveat.
// If this test fails at five, look at what the fifth is before raising it.
test('SC30', 'no input stacks more than four warnings, and four fold into one banner', () => {
  const presets = machinePresets(data.machines, data.rules);
  // The UI's material table, reduced to what calculate() reads.
  const sweepMaterials = [
    { material: 'mdf', materials: ['mdf'] },
    { material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'] },
    { material: 'plywood', materials: ['plywood'] },
    { material: 'softwood_ply', materials: ['softwood_ply'], materialsFallback: ['plywood'] },
    { material: 'hpl', materials: ['hpl'] },
    { material: 'hardwood', materials: ['hardwood'] },
    { material: 'softwood', materials: ['softwood'] },
  ];
  let worst = 0;
  for (const mat of sweepMaterials)
    for (const toolType of ['upcut', 'downcut', 'compression', 'straight'])
      for (const diameterMm of [3.175, 6, 6.35, 12, 12.7, 19.05, 25.4])
        for (const rpm of [8000, 18000, 30000])
          for (const profile of ['gentle', 'standard', 'aggressive', 'finishing'])
            for (const flutesTotal of [1, 4])
              for (const preset of presets) {
                const r = calculate({
                  ...mat, toolType, diameterMm, rpm, profile, flutesTotal,
                  thicknessMm: 18, firstCut: false, machine: preset.machine,
                }, data);
                if (r.status !== 'ok') continue;
                worst = Math.max(worst, r.warnings.length);
                assert(r.warnings.length <= 4,
                  `${r.warnings.length} warnings (${r.warnings.map((w) => w.code).join(', ')}) ` +
                  `for ${mat.material} ${toolType} D${diameterMm} ${rpm}rpm ${profile} Z${flutesTotal} on ${preset.id}`);
              }
  assert(worst === 4, `the sweep must reach the known ceiling of 4 warnings, found ${worst}`);
});
