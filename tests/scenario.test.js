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
  // A finish skim is light-radial, so it no longer blocks on depth
  // (Scott, 2026-09-02): the block is the deep-slot rule and a 1 mm skim
  // is not a slot. The diameter must sit inside the finisher charts'
  // coverage (5 to 19.05 mm), or Finishing refuses on the chart, not the
  // depth. SC36 pins the light-radial policy in full.
  assert(run({ diameterMm: 6, thicknessMm: 24, profile: 'finishing' }).status === 'ok', 'a deep finish skim must serve');
  assert(data.rules.depth_limit.max_ratio_of_d === 3, 'the depth limit must stay at the vendors 3xD anchor');
});

test('SC36', 'light-radial cuts lose the derate and the block; slots keep both; past the flutes warns hot', () => {
  // Adaptive-shaped cut: 25% radial on a 12 mm tool, 3.5xD deep. Under the
  // 2026-09-02 policy it serves, underated, with thinning compensated.
  const adaptive = run({ aeMm: 3, apMm: 42 });
  assert(adaptive.status === 'ok', `a deep light-radial cut must serve, got ${adaptive.status}`);
  assert(adaptive.meta.derate === 1, 'no deep-slot derate below half the diameter of width');
  assert(adaptive.meta.lightRadial === true, 'the regime must report light radial');
  assert(adaptive.meta.chipThinningFactor > 1.1, 'thinning must still compensate the light-radial chip');
  const depthChip = buildChips(adaptive).find((c) => c.key === 'depth');
  assert(depthChip.level === 'warm' && /watch deflection/.test(depthChip.text), `deep light-radial depth chip must watch deflection: ${depthChip.text}`);
  // A shallower light-radial cut stays cool and says full chip load.
  const shallow = buildChips(run({ aeMm: 3, apMm: 18 })).find((c) => c.key === 'depth');
  assert(shallow.level === 'cool' && /full chip load/.test(shallow.text), shallow.text);
  // The same depth at slot width still blocks: the hazard is engagement.
  assert(run({ apMm: 42 }).status === 'blocked', 'a 3.5xD slot must still block');
  // Half the diameter exactly is slot territory (the boundary is ae < D/2).
  assert(run({ aeMm: 6, apMm: 42 }).status === 'blocked', 'the half-diameter boundary belongs to the slot side');
  // Past a known flute length: served, one hot warning, one hot chip.
  const past = run({ aeMm: 3, apMm: 30, fluteLengthMm: 25 });
  assert(past.status === 'ok', 'past the flutes serves, never blocks');
  assert(past.warnings.some((w) => w.code === 'past_flutes' && /shank rubs/.test(w.message)), 'the past-flutes warning must fire');
  const fluteChip = buildChips(past).find((c) => c.key === 'flutes');
  assert(fluteChip && fluteChip.level === 'hot', 'the past-flutes chip must be hot');
  // Under the flute length nothing fires.
  assert(!run({ aeMm: 3, apMm: 20, fluteLengthMm: 25 }).warnings.some((w) => w.code === 'past_flutes'), 'no warning under the flute length');
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
  const NARRATION = /publishes no|publishes nothing|chart serves|charts? do not|contributes|disagree by more than|does not compensate|Generic (vendor|chart) values|nearest match|flat kc estimate|not drawn beside|states one condition|no second correction/;
  const picks = [
    {},
    { profile: 'finishing' },
    { material: 'plywood', materials: ['plywood'], profile: 'finishing' },
    { material: 'softwood_ply', materials: ['softwood_ply'], materialsFallback: ['plywood'] },
    { material: 'hpl', materials: ['hpl'], diameterMm: 12.7, toolType: 'straight' },
    { material: 'hardwood', materials: ['hardwood'], direction: 'conventional', densityKgM3: 600 },
    { diameterMm: 3.175, thicknessMm: 3 },
    { material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'], diameterMm: 6.35, thicknessMm: 6 },
    // A ball nose, which carries its own chart-selection sentences
    // (2026-09-02). None of them may reach the page.
    { toolType: 'ball', diameterMm: 12.7, apMm: 1.27, aeMm: 1.27 },
    { toolType: 'ball', material: 'hardwood', materials: ['hardwood'], diameterMm: 3.175, apMm: 0.3, aeMm: 0.3, profile: 'gentle' },
    { toolType: 'ball', material: 'softwood', materials: ['softwood'], diameterMm: 19.05, apMm: 7.6, aeMm: 7.6, profile: 'aggressive' },
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
    for (const toolType of ['upcut', 'downcut', 'compression', 'straight', 'ball'])
      for (const diameterMm of [1.5875, 3.175, 6, 6.35, 12, 12.7, 15.875, 19.05, 25.4])
        for (const rpm of [8000, 18000, 30000])
          for (const profile of ['gentle', 'standard', 'aggressive', 'finishing'])
            for (const flutesTotal of [1, 4])
              for (const preset of presets) {
                // A ball nose is a surfacing tool: it never cuts a full slot at
                // 18 mm, so the sweep gives it a stepover and a stepdown,
                // which is the path its feed actually takes (2026-09-02).
                const ballCut = toolType === 'ball'
                  ? { apMm: diameterMm * 0.1, aeMm: diameterMm * 0.1 }
                  : {};
                const r = calculate({
                  ...mat, toolType, diameterMm, rpm, profile, flutesTotal,
                  thicknessMm: 18, firstCut: false, machine: preset.machine,
                  ...ballCut,
                }, data);
                if (r.status !== 'ok') continue;
                worst = Math.max(worst, r.warnings.length);
                assert(r.warnings.length <= 4,
                  `${r.warnings.length} warnings (${r.warnings.map((w) => w.code).join(', ')}) ` +
                  `for ${mat.material} ${toolType} D${diameterMm} ${rpm}rpm ${profile} Z${flutesTotal} on ${preset.id}`);
              }
  assert(worst === 4, `the sweep must reach the known ceiling of 4 warnings, found ${worst}`);
});

// SC37 to SC41 cover the ball nose tool type (2026-09-02, research session
// 6). The chart is Amana's, published at a depth of one tool diameter, which
// is a full-width groove. It serves through the routing engine unchanged: the
// stepover is the width of cut, so the existing chip-thinning compensation is
// what lifts the programmed feed, and no second correction is applied.

test('SC37', 'a ball nose serves from its own chart alone, and the geometry rows come with it', () => {
  const r = run({ toolType: 'ball', diameterMm: 12.7, apMm: 1.27, aeMm: 1.27 });
  assert(r.status === 'ok', `expected ok, got ${r.status}: ${r.refusal?.reason ?? r.block?.reason}`);
  assert(r.meta.contributors.length === 1 && r.meta.contributors[0].includes('Amana'),
    `only the ball chart may serve a ball, got ${r.meta.contributors}`);
  assert(r.meta.ballNose === true, 'the result must record that this is a ball nose');
  // The flat-tool charts must not be drawn beside it: their chip loads are
  // three to five times higher and read as headroom the tool does not have.
  assert(r.meta.contextBands.length === 0, `a ball ladder shows the ball chart alone, got ${r.meta.contextBands.map((b) => b.label)}`);
  // Geometry, exact forms. A 12.7 mm ball at a 1.27 mm stepdown cuts on a
  // 7.62 mm circle, and a 1.27 mm stepover leaves a 0.0318 mm ridge.
  approx(r.outputs.effectiveDiameterMm, 7.62, { abs: 0.001 });
  approx(r.outputs.scallopHeightMm, 0.03183, { abs: 0.0001 });
  approx(r.outputs.effectiveSurfaceSpeedMMin, (Math.PI * 7.62 * 18000) / 1000, { abs: 0.1 });
  assert(r.outputs.effectiveSurfaceSpeedMMin < r.outputs.surfaceSpeedMMin,
    'the effective surface speed must sit below the nominal one at a shallow stepdown');
  // One compensation, on the radial engagement, and no second one: the chip
  // the tool actually takes is the chart value, unchanged.
  approx(r.meta.chipThinningFactor, 12.7 / (2 * Math.sqrt(1.27 * (12.7 - 1.27))), { abs: 1e-9 });
  approx(r.meta.fzPhysical, r.meta.fzTarget, { rel: 1e-9 });
  // The stepdown feeds the cutting diameter and the stepover feeds the
  // scallop, and they are different physical inputs. Every other ball case
  // here passes them equal, so this one pins them apart: swapping the two
  // arguments would give 9.2520 mm and 0.00492 mm instead (2026-09-03).
  const uneven = run({ toolType: 'ball', diameterMm: 12.7, apMm: 0.5, aeMm: 2.0 });
  assert(uneven.status === 'ok', `expected ok, got ${uneven.status}`);
  approx(uneven.outputs.effectiveDiameterMm, 4.9396, { abs: 0.0005 });
  approx(uneven.outputs.scallopHeightMm, 0.07923, { abs: 0.00002 });
  // A full-width cut has no stepover, so it reports no scallop at all. The
  // arithmetic would return half the tool diameter, which is right and reads
  // as nonsense on a groove.
  const slot = run({ toolType: 'ball', diameterMm: 12.7, apMm: 1 });
  assert(slot.status === 'ok', `expected ok, got ${slot.status}`);
  assert(!('scallopHeightMm' in slot.outputs), 'a full-width ball cut must report no scallop');
  assert(!('scallop' in slot.outputNotes), 'and no scallop note either');
  assert(slot.outputs.effectiveDiameterMm != null, 'the cutting diameter still applies to a groove');
});

test('SC38', 'a ball nose never picks up a flat chart, and a flat tool never picks up the ball chart', () => {
  const ball = run({ toolType: 'ball', diameterMm: 12.7, apMm: 1.27, aeMm: 1.27 });
  assert(ball.meta.contributors.every((c) => c.includes('ball nose')),
    `a ball must read the ball chart only, got ${ball.meta.contributors}`);
  for (const toolType of ['upcut', 'downcut', 'compression', 'straight']) {
    const r = run({ toolType, diameterMm: 12.7 });
    if (r.status !== 'ok') continue;
    assert(!r.meta.contributors.some((c) => c.includes('ball nose')),
      `${toolType} must never read the ball chart, got ${r.meta.contributors}`);
    assert(!r.meta.contextBands.some((b) => b.geometry === 'ball_nose'),
      `${toolType} must not draw the ball chart as context either`);
  }
});

test('SC39', 'a ball nose refuses every material and every profile the chart does not cover', () => {
  // The chart publishes softwood, hardwood and MDF. Every panel refuses, and
  // it must refuse rather than borrow a generic chart: no maker publishes a
  // ball nose chip load for plywood, melamine, particleboard or HPL.
  const panels = [
    { material: 'plywood', materials: ['plywood'] },
    { material: 'softwood_ply', materials: ['softwood_ply'], materialsFallback: ['plywood'] },
    { material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'] },
    { material: 'hpl', materials: ['hpl'] },
  ];
  for (const mat of panels) {
    const r = run({ ...mat, toolType: 'ball', diameterMm: 12.7, apMm: 1.27, aeMm: 1.27 });
    assert(r.status === 'refused', `${mat.material}: expected refused, got ${r.status}`);
    assert(/No published chart covers a ball nose/.test(r.refusal.reason), `${mat.material}: ${r.refusal.reason}`);
  }
  // No finisher chart covers a ball nose, so that profile refuses too.
  const fin = run({ toolType: 'ball', diameterMm: 12.7, apMm: 1.27, aeMm: 1.27, profile: 'finishing' });
  assert(fin.status === 'refused', `expected refused, got ${fin.status}`);
  assert(/No finisher chart covers a ball nose/.test(fin.refusal.reason), fin.refusal.reason);
  // Outside the chart's diameter coverage the existing rule refuses.
  // The reason must name the diameter. Until 2026-09-03 it printed a sentence
  // about other tool shapes and never mentioned the size, because a ladder
  // note pushed on the serving branch became the whole refusal.
  const big = run({ toolType: 'ball', diameterMm: 25.4, apMm: 2.5, aeMm: 2.5 });
  assert(big.status === 'refused', `25.4 mm sits past the chart's coverage, got ${big.status}`);
  assert(big.refusal.reason.includes('25.4 mm'), `the reason must name the diameter: ${big.refusal.reason}`);
  assert(!/other tool shapes/.test(big.refusal.reason), `ladder narration must never become a refusal: ${big.refusal.reason}`);
});

test('SC40', 'the ball nose feeds land where research session 6 says, and the sweep never hits the cap', () => {
  // The sight sweep in research-session-6-ball-surfacing.md, reproduced here
  // so a change to the serving policy fails against the numbers Scott read.
  // 12.7 mm ball, 10 per cent stepover, 18,000 rpm, two flutes.
  const common = { toolType: 'ball', diameterMm: 12.7, apMm: 1.27, aeMm: 1.27, rpm: 18000, flutesTotal: 2 };
  const expected = { mdf: [12192, 15240], hardwood: [10668, 13716], softwood: [13716, 16764] };
  for (const [material, band] of Object.entries(expected)) {
    const g = run({ ...common, materials: [material], material, profile: 'gentle' });
    const a = run({ ...common, materials: [material], material, profile: 'aggressive' });
    approx(g.outputs.cuttingFeedMmMin, band[0], { rel: 0.005 });
    approx(a.outputs.cuttingFeedMmMin, band[1], { rel: 0.005 });
  }
  // Across the whole served grid nothing reaches the 30,000 mm/min cap, so
  // the machine limit never silently sets a ball feed.
  let capped = 0;
  let worst = 0;
  for (const material of ['softwood', 'hardwood', 'mdf'])
    for (const diameterMm of [1.5875, 3.175, 6.35, 9.525, 12.7, 15.875, 19.05])
      for (const stepover of [0.05, 0.08, 0.1, 0.12, 0.4])
        for (const profile of ['gentle', 'standard', 'aggressive']) {
          const r = run({
            material, materials: [material], toolType: 'ball', diameterMm,
            apMm: diameterMm * stepover, aeMm: diameterMm * stepover, profile,
          });
          if (r.status !== 'ok') continue;
          worst = Math.max(worst, r.outputs.cuttingFeedMmMin);
          if (r.limit.binding === 'vmax') capped += 1;
        }
  assert(capped === 0, `${capped} ball cuts hit the machine feed cap; the sweep found none on 2026-09-02`);
  assert(worst < 30000, `the fastest ball feed in the sweep was ${Math.round(worst)} mm/min`);
});

test('SC41', 'the chip floor still fires on the smallest ball tools, and the chart value stands', () => {
  // Five of the sixty-three published cells put the physical chip under the
  // 0.08 mm rubbing floor, all at the two smallest diameters. Those are the
  // maker's own minimums, so the calculator warns and must not raise them.
  // MDF takes the panel floor, so the smallest ball at the low edge of the
  // band ploughs: 0.076 mm against the 0.08 mm figure in rules.json.
  const panel = run({
    material: 'mdf', materials: ['mdf'], toolType: 'ball',
    diameterMm: 1.5875, apMm: 0.16, aeMm: 0.16, profile: 'gentle',
  });
  assert(panel.status === 'ok', `expected ok, got ${panel.status}`);
  assert(panel.warnings.some((w) => w.code === 'chip_plough'),
    `expected the ploughing warning, got ${panel.warnings.map((w) => w.code).join(', ') || 'none'}`);
  approx(panel.meta.fzPhysical, 0.076, { abs: 0.0006 });
  // Solid timber has its own wording and its own branch, and the smallest
  // hardwood cell is thinner still at 0.051 mm.
  const thin = run({
    material: 'hardwood', materials: ['hardwood'], toolType: 'ball',
    diameterMm: 1.5875, apMm: 0.16, aeMm: 0.16, profile: 'gentle',
  });
  assert(thin.status === 'ok', `expected ok, got ${thin.status}`);
  assert(thin.warnings.some((w) => w.code === 'chip_thin' || w.code === 'chip_plough' || w.code === 'chip_below_min'),
    `expected a thin-chip warning, got ${thin.warnings.map((w) => w.code).join(', ') || 'none'}`);
  approx(thin.meta.fzPhysical, 0.051, { abs: 0.0006 });
  // The warning never lifts the served chip: the chart's own low edge is the
  // maker's minimum for that tool, and raising it would invent a number.
  approx(thin.meta.fzTarget, thin.meta.band.fzMin, { rel: 1e-9 });
  const fat = run({
    material: 'softwood', materials: ['softwood'], toolType: 'ball',
    diameterMm: 19.05, apMm: 1.9, aeMm: 1.9, profile: 'aggressive',
  });
  assert(!fat.warnings.some((w) => w.code === 'chip_plough'), 'a big ball at the top of the band must not read as ploughing');
});

test('SC42', 'the chip-thinning compensation is held at the stepover floor and never extrapolated below it', () => {
  // Chip thinning is unbounded as the stepover falls. Below about 8 per cent
  // of the diameter it stopped describing the cut: at 2 per cent on a
  // 3.175 mm ball it programmed 0.636 mm per tooth against a 0.064 mm
  // stepover, a chip ten times the width of cut, and served 22,886 mm/min.
  // rules.ball_nose holds the compensation at the floor (2026-09-03).
  const floor = data.rules.ball_nose.thinning_stepover_floor_fraction;
  approx(floor, 0.08, { abs: 1e-9 });
  assert(data.rules.ball_nose.source === 'session-6-ball-surfacing', 'the floor must cite the research file');
  assert(data.rules.ball_nose.data_class === 'project_decision', 'choosing the floor is the calculator decision, not a maker figure');

  const D = 3.175;
  const at = (pct) => run({ toolType: 'ball', diameterMm: D, apMm: 0.5, aeMm: D * pct, profile: 'aggressive' });
  const atFloor = at(floor);
  // Everything at or below the floor serves the floor's feed, exactly.
  for (const pct of [0.02, 0.03, 0.05, floor]) {
    const r = at(pct);
    assert(r.status === 'ok', `${pct}: expected ok, got ${r.status}`);
    approx(r.outputs.cuttingFeedMmMin, atFloor.outputs.cuttingFeedMmMin, { rel: 1e-9 });
  }
  // Above the floor the compensation is untouched, so every number Scott
  // approved is unchanged.
  for (const pct of [0.1, 0.12, 0.4]) {
    const r = at(pct);
    approx(r.meta.chipThinningFactor, D / (2 * Math.sqrt(D * pct * (D - D * pct))), { abs: 1e-9 });
    assert(r.outputs.cuttingFeedMmMin < atFloor.outputs.cuttingFeedMmMin + 1e-6,
      `${pct}: a wider stepover must never serve more feed than the floor`);
  }
  // Below the floor the physical chip falls under the chart value, which is
  // the conservative side, and the floor check must see that number.
  const fine = at(0.02);
  const held = D / (2 * Math.sqrt(D * floor * (D - D * floor)));
  const real = D / (2 * Math.sqrt(D * 0.02 * (D - D * 0.02)));
  approx(fine.meta.fzPhysical, fine.meta.fzTarget * (held / real), { rel: 1e-9 });
  assert(fine.meta.fzPhysical < fine.meta.fzTarget * 0.6,
    `the physical chip must fall well below the chart value when the floor bites, got ${fine.meta.fzPhysical} against ${fine.meta.fzTarget}`);
  // And the page says so, because a finer stepover then buys finish and time
  // and nothing else.
  assert(fine.notes.some((n) => /holds the chip-thinning compensation/.test(n)),
    `the floor must be stated on the page: ${fine.notes.join(' | ')}`);
  assert(!atFloor.notes.some((n) => /holds the chip-thinning compensation/.test(n)),
    'the note must not fire at or above the floor');
  // No other tool type is touched.
  const flat = run({ toolType: 'upcut', diameterMm: 12.7, apMm: 5, aeMm: 12.7 * 0.02 });
  approx(flat.meta.chipThinningFactor, 12.7 / (2 * Math.sqrt(12.7 * 0.02 * (12.7 - 12.7 * 0.02))), { abs: 1e-9 });
  approx(flat.meta.fzPhysical, flat.meta.fzTarget, { rel: 1e-9 });
});

test('SC43', 'the first-cut reduction is skipped on a ball surfacing pass and kept for routing', () => {
  // Scott's ruling, 2026-09-25: a 3D surfacing pass is a light finishing cut,
  // so the first-cut reduction, which guards a heavy proving cut, drives the
  // chip toward the rubbing floor there. A ball nose is the engine's surfacing
  // marker, so the skip runs on every ball. Routing keeps the reduction.
  const factor = data.rules.first_cut.factor;
  assert(factor > 0 && factor < 1, `the reduction must be a real cut, got ${factor}`);

  const ballOn = run({ toolType: 'ball', diameterMm: 12.7, apMm: 1.27, aeMm: 1.27, firstCut: true });
  const ballOff = run({ toolType: 'ball', diameterMm: 12.7, apMm: 1.27, aeMm: 1.27, firstCut: false });
  assert(ballOn.status === 'ok' && ballOff.status === 'ok', 'both ball cuts must serve');
  // First-cut on or off, a ball serves the same feed: the reduction is skipped.
  approx(ballOn.outputs.cuttingFeedMmMin, ballOff.outputs.cuttingFeedMmMin, { rel: 1e-9 });
  assert(ballOn.meta.firstCut.applied === false && ballOn.meta.firstCut.factor === 1,
    `the reduction must never apply to a ball, got ${JSON.stringify(ballOn.meta.firstCut)}`);
  // The banner drops the first-cut clause, and a note says the reduction is off.
  assert(!/first-cut mode serves/.test(ballOn.limit.message), `the ball banner must not credit first-cut: ${ballOn.limit.message}`);
  assert(ballOn.notes.some((n) => /first-cut reduction does not apply to a 3D surfacing pass/.test(n)),
    `the skip must be stated on the page: ${ballOn.notes.join(' | ')}`);

  // A bull nose is a surfacing tool too, so it skips the reduction as well.
  const bull = run({ toolType: 'ball', diameterMm: 12.7, cornerRadiusMm: 3, apMm: 1, aeMm: 1, firstCut: true });
  assert(bull.status === 'ok' && bull.meta.firstCut.applied === false,
    `a bull nose must skip the reduction, got ${bull.status} ${JSON.stringify(bull.meta.firstCut)}`);

  // Routing still applies it: a flat tool with first-cut on serves the reduced
  // feed and says so.
  const routeOn = run({ toolType: 'upcut', diameterMm: 12.7, apMm: 5, aeMm: 12.7, firstCut: true });
  const routeOff = run({ toolType: 'upcut', diameterMm: 12.7, apMm: 5, aeMm: 12.7, firstCut: false });
  approx(routeOn.outputs.cuttingFeedMmMin, routeOff.outputs.cuttingFeedMmMin * factor, { rel: 1e-9 });
  assert(routeOn.meta.firstCut.applied === true && routeOn.meta.firstCut.factor === factor,
    `routing must keep the reduction, got ${JSON.stringify(routeOn.meta.firstCut)}`);
});
