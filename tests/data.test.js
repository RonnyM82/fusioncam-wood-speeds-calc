// Regression tests 15–17, 19, 20 plus envelope-behaviour checks, all against
// the real JSON in data/.

import { test, assert, approx, notApprox } from './helpers.js';
import { loadData } from './load-node.js';
import { validateData } from '../js/data/validate.js';
import { machinePresets } from '../js/data/presets.js';
import { availablePowerKw, torqueNm } from '../js/core/power.js';
import { selectEntries, resolveBand, depthDerate } from '../js/core/chipload.js';
import { calculate } from '../js/core/calculate.js';

const data = loadData();

test('R15', 'Onsrud lookup: 60-100C, hardwood, 12.7 mm', () => {
  const e = data.chiploads.entries.find(
    (x) => x.source === 'onsrud-2017' && x.series === '60-100C' && x.material === 'hardwood' && x.diameter_mm === 12.7,
  );
  assert(e, 'entry missing');
  approx(e.fz_min_mm, 0.533, { abs: 0.001 });
  approx(e.fz_max_mm, 0.584, { abs: 0.001 });
});

test('R16', 'within-Onsrud geometry spread: 60-100C vs 48-000 hardwood 12.7 mm', () => {
  const find = (series) => data.chiploads.entries.find(
    (x) => x.source === 'onsrud-2017' && x.series === series && x.material === 'hardwood' && x.diameter_mm === 12.7,
  );
  const comp = find('60-100C');
  const straight = find('48-000');
  assert(comp && straight, 'both entries must exist — the spread is a feature, not a bug');
  const ratio = ((comp.fz_min_mm + comp.fz_max_mm) / 2) / ((straight.fz_min_mm + straight.fz_max_mm) / 2);
  assert(ratio >= 3.0 && ratio <= 3.2, `midpoint ratio ${ratio.toFixed(2)} outside 3.0–3.2`);
});

test('R17', 'OSB refuses with the reason, never a number', () => {
  const r = calculate({ material: 'osb', toolType: 'compression', diameterMm: 12.7, thicknessMm: 18 }, data);
  assert(r.status === 'refused', `expected refused, got ${r.status}`);
  assert(/void|density|scatter/i.test(r.refusal.reason), 'reason must explain why OSB is unmodellable');
  assert(!('outputs' in r), 'a refusal must never carry outputs');
});

test('R19', 'every entry has provenance; ITA rows carry the flute-basis switch', () => {
  const { errors } = validateData(data);
  assert(errors.length === 0, `integrity errors:\n${errors.join('\n')}`);
  assert(data.chiploads.entries.length >= 211, `expected at least 211 entries, found ${data.chiploads.entries.length}`);
  const ita = data.chiploads.entries.filter((e) => e.source === 'ita');
  assert(ita.length > 0 && ita.every((e) => e.flute_basis.endsWith('user_switchable')), 'ITA switch missing');
});

test('R20', 'every iwms25 kc row surfaces the production-speed caveat in output', () => {
  const combos = new Set(
    data.kc.affine_models.filter((m) => m.source === 'iwms25').map((m) => `${m.material}|${m.tool}|${m.direction}`),
  );
  const uiMaterial = { mdf: 'mdf', particleboard: 'laminated_pb', plywood_poplar: 'plywood' };
  for (const combo of combos) {
    const [mat, tool, direction] = combo.split('|');
    const r = calculate({
      material: uiMaterial[mat],
      toolType: tool === 'straight' ? 'straight' : 'upcut',
      diameterMm: 12.7,
      thicknessMm: 12,
      direction,
      machine: { spindleKw: 10 },
    }, data);
    assert(r.status === 'ok', `calculate failed for ${combo}: ${r.status}`);
    assert(r.warnings.some((w) => w.code === 'iwms25_speed'), `caveat missing for ${combo}`);
    assert(r.warnings.find((w) => w.code === 'iwms25_speed').message.includes('+15-20%'), 'caveat must state the uplift');
  }
  assert(combos.size >= 12, `expected at least 12 iwms25 combos, found ${combos.size}`);
});

test('R14d', 'depth derating chain against the real 48-000 MDF entry', () => {
  const e = data.chiploads.entries.find(
    (x) => x.source === 'onsrud-2017' && x.series === '48-000' && x.material === 'mdf' && x.diameter_mm === 12.7,
  );
  assert(e, 'entry missing');
  approx(e.fz_min_mm * depthDerate(2), 0.114, { abs: 0.001 });
  approx(e.fz_max_mm * depthDerate(2), 0.152, { abs: 0.001 });
});

test('ENV1', 'D11: hardwood spiral serves the Onsrud band; generic charts become named context', () => {
  const env = resolveBand(data.chiploads.entries, { material: 'hardwood', toolType: 'upcut', diameterMm: 12.7 }, data.rules.envelope_rules);
  approx(env.fzMin, 0.178, { abs: 0.001 });
  approx(env.fzMax, 0.229, { abs: 0.001 });
  assert(env.contributors.every((c) => c.startsWith('Onsrud')), `unexpected serving contributor: ${env.contributors}`);
  const ctx = env.context.map((b) => b.label).join(' ');
  for (const v of ['Freud', 'Rennie', 'Vortex', 'ITA']) {
    assert(ctx.includes(v), `${v} missing from context: ${ctx}`);
  }
  assert(env.context.every((b, i, a) => i === 0 || a[i - 1].lo <= b.lo), 'context bands must arrive sorted low to high for the ladder');
});

test('ENV2', 'compression envelope stays geometry-exact (no generic charts)', () => {
  const env = resolveBand(data.chiploads.entries, { material: 'hardwood', toolType: 'compression', diameterMm: 12.7 }, data.rules.envelope_rules);
  approx(env.fzMin, 0.457, { abs: 0.001 });
  approx(env.fzMax, 0.508, { abs: 0.001 });
  assert(env.contributors.every((c) => c.startsWith('Onsrud')), `unexpected contributor: ${env.contributors}`);
});

test('ENV3', 'materials with only generic charts fall back with visible notes', () => {
  const env = resolveBand(data.chiploads.entries, { material: 'hpl', toolType: 'upcut', diameterMm: 12.7 }, data.rules.envelope_rules);
  assert(env.served && env.fzMin > 0, 'fallback band empty');
  assert(env.notes.some((n) => /resolved by tool geometry/.test(n)), 'fallback note missing');
  assert(env.notes.some((n) => /do not separate tool types/.test(n)), 'inert tool-type note missing');
});

test('ENV8', 'a chart that excludes a tool type never serves it, even when an in-scope chart takes over', () => {
  // Before the firsthand Vortex chart landed (2026-08-26), hpl compression
  // refused outright: the only hpl chart was Rennie, whose scope says NOT
  // compression. Vortex states no tool-type exclusion, so it serves now —
  // and Rennie must stay out entirely, as serving band and as context.
  const env = resolveBand(data.chiploads.entries, { material: 'hpl', toolType: 'compression', diameterMm: 12.7 }, data.rules.envelope_rules);
  assert(env.served, `Vortex must serve hpl compression: ${env.notes}`);
  assert(env.contributors.every((c) => c.includes('Vortex')), `only Vortex may serve: ${env.contributors}`);
  assert(!env.context.some((b) => b.label.includes('Rennie')), 'Rennie must not appear even as context - its chart says NOT compression');
  approx(env.fzMin, 0.584, { abs: 0.001 });
  approx(env.fzMax, 0.635, { abs: 0.001 });
  assert(env.notes.some((n) => /do not separate tool types/.test(n)), 'the inert tool-type note must disclose the generic serve');
  const melamine = resolveBand(data.chiploads.entries, { material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'], toolType: 'compression', diameterMm: 12.7 }, data.rules.envelope_rules);
  assert(melamine.served, 'melamine compression must still serve (ITA and Freud state no tool-type exclusion)');
});

test('ENV9', 'soft-ply spirals ride the hard-ply chart; compression stays unblended', () => {
  const spiral = resolveBand(data.chiploads.entries, { material: 'softwood_ply', materialsFallback: ['plywood'], toolType: 'upcut', diameterMm: 12.7 }, data.rules.envelope_rules);
  approx(spiral.fzMin, 0.203, { abs: 0.001 });
  approx(spiral.fzMax, 0.254, { abs: 0.001 });
  assert(spiral.contributors.every((c) => c.startsWith('Onsrud')), `expected the borrowed Onsrud chart: ${spiral.contributors}`);
  assert(spiral.notes.some((n) => /nearest match/.test(n)), 'borrow note missing');
  const comp = resolveBand(data.chiploads.entries, { material: 'softwood_ply', materialsFallback: ['plywood'], toolType: 'compression', diameterMm: 12.7 }, data.rules.envelope_rules);
  approx(comp.fzMin, 0.533, { abs: 0.001 });
  approx(comp.fzMax, 0.584, { abs: 0.001 });
});

test('ENV10', 'refusals on diameter coverage carry the real reason, and context shows the tool ladder', () => {
  const far = resolveBand(data.chiploads.entries, { material: 'plywood', toolType: 'upcut', diameterMm: 25.4 }, data.rules.envelope_rules);
  assert(far.served === false, 'expected no band at 25.4 mm for hard-ply spirals');
  assert(far.notes.some((n) => /publishes no values near 25.4/.test(n)), `diameter note missing: ${far.notes}`);
  const comp = resolveBand(data.chiploads.entries, { material: 'hardwood', toolType: 'compression', diameterMm: 12.7 }, data.rules.envelope_rules);
  const c100 = comp.context.find((b) => /60-100C \(compression chipbreaker\)/.test(b.label));
  assert(c100, `60-100C must appear in context with its class tag: ${comp.context.map((b) => b.label).join(', ')}`);
  assert(comp.servingBands?.length > 0 && comp.servingBands.every((b) => b.lo > 0 && b.hi >= b.lo), 'serving bands must carry drawable lo/hi values');
});

test('ENV7', 'hard and soft plywood each serve their own Onsrud chart, never a blend', () => {
  const hardSpiral = resolveBand(data.chiploads.entries, { material: 'plywood', toolType: 'upcut', diameterMm: 12.7 }, data.rules.envelope_rules);
  approx(hardSpiral.fzMin, 0.203, { abs: 0.001 });
  approx(hardSpiral.fzMax, 0.254, { abs: 0.001 });
  assert(hardSpiral.contributors.every((c) => c.startsWith('Onsrud')), `expected Onsrud to serve, got ${hardSpiral.contributors}`);
  assert(hardSpiral.context.some((b) => b.label.includes('Freud')), 'Freud must remain as context');
  const hardComp = resolveBand(data.chiploads.entries, { material: 'plywood', toolType: 'compression', diameterMm: 12.7 }, data.rules.envelope_rules);
  approx(hardComp.fzMin, 0.457, { abs: 0.001 });
  approx(hardComp.fzMax, 0.508, { abs: 0.001 });
  const softComp = resolveBand(data.chiploads.entries, { material: 'softwood_ply', toolType: 'compression', diameterMm: 12.7 }, data.rules.envelope_rules);
  approx(softComp.fzMin, 0.533, { abs: 0.001 });
  approx(softComp.fzMax, 0.584, { abs: 0.001 });
  const softSpiral = resolveBand(data.chiploads.entries, { material: 'softwood_ply', toolType: 'upcut', diameterMm: 12.7 }, data.rules.envelope_rules);
  assert(softSpiral.contributors.some((c) => c.includes('Rennie')), `soft-ply spiral falls to the Rennie chart: ${softSpiral.contributors}`);
  assert(softSpiral.notes.some((n) => /resolved by tool geometry/.test(n)), 'soft-ply spiral must carry the fallback note');
});

test('ENV4', 'D5: down-cut is served, and the covering entries say so in the data', () => {
  const env = resolveBand(data.chiploads.entries, { material: 'mdf', toolType: 'downcut', diameterMm: 12.7 }, data.rules.envelope_rules);
  assert(env && env.fzMin > 0, 'down-cut envelope must exist');
  const onsrudSpirals = data.chiploads.entries.filter((e) => e.series === '52-200/57-200');
  assert(onsrudSpirals.length > 0 && onsrudSpirals.every((e) => (e.covers_directions ?? []).includes('downcut')),
    'Onsrud 52-200/57-200 rows must carry covers_directions with downcut');
});

test('ENV5', 'D11: melamine disagreement resolves to the conservative ITA chart with Freud as context', () => {
  const env = resolveBand(
    data.chiploads.entries,
    { material: 'laminated_pb', materials: ['laminated_pb', 'laminated_chipboard'], toolType: 'upcut', diameterMm: 12.7 },
    data.rules.envelope_rules,
  );
  approx(env.fzMin, 0.15, { abs: 0.001 });
  approx(env.fzMax, 0.25, { abs: 0.001 });
  assert(env.contributors.join(' ').includes('ITA'), `expected ITA to serve, got ${env.contributors}`);
  assert(env.context.some((b) => b.label.includes('Freud')), 'Freud must remain as context');
  assert(env.notes.some((n) => /disagree by more than/.test(n)), 'disagreement note missing');
});

test('ENV6', 'D11: MDF spiral standard profile lands on the Onsrud chart midpoint', () => {
  const env = resolveBand(data.chiploads.entries, { material: 'mdf', toolType: 'upcut', diameterMm: 12.7 }, data.rules.envelope_rules);
  approx(env.fzMin, 0.203, { abs: 0.001 });
  approx(env.fzMax, 0.254, { abs: 0.001 });
});

test('PRESET', 'machine presets normalise, disclose assumptions, and the generic default exists', () => {
  const presets = machinePresets(data.machines, data.rules);
  assert(presets.length >= 8, `expected at least 8 presets, found ${presets.length}`);
  const biesse = presets.find((p) => p.id.includes('Biesse'));
  assert(/publishes no cutting feed/.test(biesse.notes ?? ''), 'Biesse must disclose the substituted cutting feed');
  const anderson = presets.find((p) => p.id.includes('Anderson'));
  assert(/publishes no spindle power/.test(anderson.notes ?? ''), 'Anderson must disclose the substituted spindle power');
  const generic = presets.find((p) => p.id.startsWith('Generic'));
  assert(generic, 'generic preset missing');
  assert(generic.machine.spindleKw === 10 && generic.machine.breakpointRpm === 12000, 'generic preset wrong shape');
  for (const p of presets) {
    assert(p.machine.spindleKw > 0, `${p.id}: no usable spindle power`);
    assert(p.machine.feedMaxMmMin > 0, `${p.id}: no usable feed cap`);
  }
});

test('HELINER', 'the Heliner spindle stays constant-torque to 24,000 rpm', () => {
  const preset = machinePresets(data.machines, data.rules).find((p) => p.id.includes('Heliner'));
  assert(preset, 'Heliner preset missing');
  const m = preset.machine;
  approx(m.spindleKw, 12, { abs: 0.001 });
  approx(m.rpmMax, 24000, { abs: 0.5 });

  // The vendor chart holds 4.78 Nm flat to the top speed, so the breakpoint IS
  // the top speed and 12 kW arrives only there. Reverting this field to the
  // 12,000 rpm reference default would hand out 12 kW at 12,000 rpm — double
  // the truth — with nothing else on the page contradicting it.
  approx(m.breakpointRpm, 24000, { abs: 0.5 });
  approx(availablePowerKw(m.spindleKw, m.breakpointRpm, 12000), 6, { abs: 0.001 });
  approx(availablePowerKw(m.spindleKw, m.breakpointRpm, 18000), 9, { abs: 0.001 });
  notApprox(availablePowerKw(m.spindleKw, m.breakpointRpm, 12000), 12, 5);

  // The published torque and the published power must agree, or one was misread.
  const row = data.machines.machines.find((x) => x.make === 'Heliner');
  approx(torqueNm(row.spindle_kw, row.rpm_max), row.torque_nm, { abs: 0.01 });
  approx(row.torque_nm, 4.78, { abs: 0.005 });

  assert(/S6 60%/.test(preset.notes ?? ''), 'the S6 60% duty rating must stay disclosed');
  assert(/no cutting feed/.test(preset.notes ?? ''), 'the substituted cutting feed must stay disclosed');
});

test('PIN', 'served data values are pinned so silent drift fails here first', () => {
  const kcRow = (mat, tool, dir) => data.kc.affine_models.find(
    (x) => x.material === mat && x.tool === tool && x.direction === dir && x.source === 'iwms25',
  );
  approx(kcRow('mdf', 'spiral_30', 'climb').Ks, 21, { abs: 0.001 });
  assert(kcRow('mdf', 'spiral_30', 'climb').Int === 0, 'mdf spiral Int must be 0');
  approx(kcRow('particleboard', 'spiral_30', 'climb').Ks, 17, { abs: 0.001 });
  approx(kcRow('plywood_poplar', 'spiral_30', 'climb').Ks, 27, { abs: 0.001 });
  approx(kcRow('mdf', 'straight', 'climb').Ks, 36, { abs: 0.001 });
  approx(kcRow('mdf', 'straight', 'climb').Int, 3.4, { abs: 0.001 });
  const goli = data.kc.affine_models.find((x) => x.source === 'goli2018');
  approx(goli.Ks, 31.44, { abs: 0.001 });
  approx(goli.Int, 3.36, { abs: 0.001 });
  approx(data.kc.defaults.kc_softwood, 25, { abs: 0.001 });
  approx(data.kc.defaults.kc_dense_hardwood_hpl, 40, { abs: 0.001 });
  approx(data.machines.vacuum.mu_default, 0.4, { abs: 0.001 });
  approx(data.machines.vacuum.default_kpa, 5, { abs: 0.001 });
  approx(data.chiploads.depth_derating['1xD'], 1, { abs: 0.001 });
  approx(data.chiploads.depth_derating['2xD'], 0.75, { abs: 0.001 });
  approx(data.chiploads.depth_derating['3xD'], 0.5, { abs: 0.001 });
  approx(data.rules.chip_floor_mm_per_tooth.warn_below, 0.1, { abs: 0.0001 });
  approx(data.rules.chip_floor_mm_per_tooth.plough_below, 0.08, { abs: 0.0001 });
  approx(data.rules.chip_floor_mm_per_tooth.marginal_below, 0.14, { abs: 0.0001 });
  approx(data.rules.envelope_rules.coverage_tolerance, 0.25, { abs: 0.0001 });
  approx(data.rules.envelope_rules.disagreement_ratio, 2.0, { abs: 0.0001 });
  approx(data.rules.first_cut.factor, 0.65, { abs: 0.0001 });
  assert(data.rules.first_cut.default_on === true, 'first-cut mode must default on');
});

test('CORRUPT', 'the validator rejects stripped provenance, bad vocabulary, and stringified numbers', () => {
  const corrupted = JSON.parse(JSON.stringify(data));
  delete corrupted.chiploads.entries[0].source;
  delete corrupted.chiploads.entries[1].data_class;
  corrupted.chiploads.entries[2].material = 'soft_ply';
  corrupted.chiploads.entries[3].tool_geometry = 'spiral-upcut';
  corrupted.chiploads.entries[4].covers_directions = ['down-cut'];
  corrupted.chiploads.entries[5].machine_class = 'big_iron_10hp';
  corrupted.chiploads.entries[6].fz_min_mm = '0.203';
  const { errors } = validateData(corrupted);
  assert(errors.length >= 7, `expected at least 7 errors, got ${errors.length}:\n${errors.join('\n')}`);
});
