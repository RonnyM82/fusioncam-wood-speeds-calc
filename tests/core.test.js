// Regression tests 1–14 and 18 (plus refusal/block shape checks) against the
// pure calculation core, with inline fixtures. Worked values come from
// tests/regression-tests.md.

import { test, assert, approx, notApprox } from './helpers.js';
import { ipmToMMin, fzInToMm } from '../js/core/convert.js';
import {
  fzFromFeed, surfaceSpeedMMin, depthDerate, chipThinningFactor,
} from '../js/core/chipload.js';
import {
  kcOfH, cuttingPowerKw, mrrMm3Min, torqueNm, availablePowerKw,
  powerFeedCapMmMin, meanChipThicknessMm,
} from '../js/core/power.js';
import {
  cornerMinLengthMm, vacuumGripN, compressionMinDepthMm, applyLimits,
} from '../js/core/limits.js';
import { checkDensity } from '../js/core/timber.js';
import { calculate } from '../js/core/calculate.js';

test('R1', 'chip load identity, total and upcut-only readings', () => {
  approx(fzFromFeed(20000, 20000, 4), 0.25, { abs: 0.0001 });
  approx(fzFromFeed(20000, 20000, 3), 0.333, { abs: 0.001 });
});

test('R2', 'feed conversion divides by 39.37, never 25.4', () => {
  approx(ipmToMMin(500), 12.70, { abs: 0.005 });
  notApprox(ipmToMMin(500), 19.69, 1);
});

test('R3', 'chip load conversion multiplies by 25.4', () => {
  approx(fzInToMm(0.019), 0.483, { abs: 0.001 });
});

test('R4', 'surface speed', () => {
  approx(surfaceSpeedMMin(12, 18000), 678.6, { abs: 0.1 });
});

test('R5', 'worked slot: MRR and cutting power', () => {
  const mrr = mrrMm3Min(18, 12, 20000);
  approx(mrr, 4.32e6, { abs: 1 });
  approx(cuttingPowerKw(35, mrr), 2.52, { abs: 0.005 });
});

test('R6', 'torque at breakpoint', () => {
  approx(torqueNm(10, 12000), 7.96, { abs: 0.005 });
});

test('R7', 'below-breakpoint power derate', () => {
  approx(availablePowerKw(10, 12000, 6000), 5.0, { abs: 0.001 });
});

test('R8', 'kc(h) small chip, straight MDF (Goli 2018 anchor)', () => {
  approx(kcOfH({ Ks: 31.44, Int: 3.36 }, 0.041), 113, { abs: 1 });
});

test('R9', 'kc(h) spiral flatness: Int = 0 means ratio 1.0', () => {
  const model = { Ks: 19, Int: 0 };
  approx(kcOfH(model, 0.04) / kcOfH(model, 1.0), 1.0, { abs: 1e-9 });
});

test('R10', 'chip thinning factor at 25% radial', () => {
  approx(chipThinningFactor(12, 3), 1.155, { abs: 0.001 });
});

test('R11', 'corner distance: 20 m/min at 2 m/s² needs 55.6 mm', () => {
  approx(cornerMinLengthMm(20000, 2), 55.6, { abs: 0.1 });
});

test('R12', 'vacuum grip: μ 0.4, ΔP 5 kPa, 100 cm² gives 20 N', () => {
  const grip = vacuumGripN(0.4, 5, 100);
  approx(grip, 20, { abs: 0.001 });
  assert(grip >= 12 && grip <= 28, 'grip outside the 12–28 N band');
});

test('R13', 'compression minimum depth: 0.5" up-cut needs a 14.3 mm pass', () => {
  approx(compressionMinDepthMm(12.7, 1.5875), 14.29, { abs: 0.05 });
});

test('R14', 'depth derating chain: Onsrud 48-000 MDF band at 2×D', () => {
  const derate = depthDerate(2);
  approx(0.152 * derate, 0.114, { abs: 0.001 });
  approx(0.203 * derate, 0.152, { abs: 0.001 });
});

test('R18', 'species density bounds warn outside 287–1080', () => {
  const model = { validity_kg_m3: [287, 1080] };
  assert(!checkDensity(250, model).valid, '250 kg/m³ should warn');
  assert(!checkDensity(1200, model).valid, '1200 kg/m³ should warn');
  assert(checkDensity(600, model).valid, '600 kg/m³ should pass');
});

// Shape checks and invariants beyond the numbered twenty.

const FIXTURE_RULES = {
  plunge_ramp: { ratio_of_cutting_feed: 1 / 3, angle_deg_max: 45, ramp_length_mm: [50, 100] },
  lead_in_out: { ratio_of_cutting_feed: 1, note: 'no separate source' },
  chip_floor_mm_per_tooth: { warn_below: 0.10, plough_below: 0.08 },
  compression_min_depth: { extra_mm: 1.5875, extra_display: '1/16 in', upcut_length_default_ratio_of_d: 1 },
  defaults: { rpm: 18000, flutes_total: 2, breakpoint_rpm: 12000 },
};

const FIXTURE_DATA = {
  chiploads: {
    entries: [
      { source: 'onsrud-2017', vendor: 'Onsrud', series: '60-100MW', tool_geometry: 'compression_spiral', material: 'mdf', diameter_mm: 12.7, fz_min_mm: 0.406, fz_max_mm: 0.457, flute_basis: 'per_tooth_total', data_class: 'vendor' },
      { source: 'onsrud-2017', vendor: 'Onsrud', series: '52-200/57-200', tool_geometry: 'spiral_upcut', material: 'mdf', diameter_mm: 12.7, fz_min_mm: 0.203, fz_max_mm: 0.254, flute_basis: 'per_tooth_total', data_class: 'vendor' },
    ],
  },
  kc: {
    affine_models: [
      { material: 'mdf', tool: 'spiral_30', direction: 'climb', Ks: 21, Int: 0, source: 'iwms25', data_class: 'measured_chart_read' },
      { material: 'mdf', tool: 'straight', direction: 'climb', Ks: 36, Int: 3.4, source: 'iwms25', data_class: 'measured_chart_read' },
    ],
    defaults: {},
    osb: { modellable: false, reason: 'Ks scattered 8-66 N/mm2 (voids, local density variation) - refuse to output a number' },
    speed_caveat: { uplift: '+15-20%' },
  },
  rules: FIXTURE_RULES,
};

test('R17s', 'OSB refusal shape: refused, with reason, no outputs', () => {
  const r = calculate({ material: 'osb', toolType: 'compression', diameterMm: 12.7, thicknessMm: 18 }, FIXTURE_DATA);
  assert(r.status === 'refused', `expected refused, got ${r.status}`);
  assert(r.refusal && r.refusal.reason.length > 0, 'refusal must carry a reason');
  assert(!('outputs' in r), 'a refusal must not carry outputs');
});

test('R13b', 'compression block is a block, not a warning', () => {
  const r = calculate(
    { material: 'mdf', toolType: 'compression', diameterMm: 12.7, thicknessMm: 12, machine: { spindleKw: 10 } },
    FIXTURE_DATA,
  );
  assert(r.status === 'blocked', `expected blocked, got ${r.status}`);
  approx(r.block.minPassMm, 14.29, { abs: 0.05 });
  assert(!('outputs' in r), 'a block must not carry outputs');
});

test('PINV', 'power invariant: cutting power at the capped feed equals available power', () => {
  const model = { Ks: 36, Int: 3.4 };
  const [availKw, ap, ae, D, rpm, z] = [5, 18, 12, 12, 18000, 2];
  const cap = powerFeedCapMmMin(availKw, model, ap, ae, D, rpm, z);
  const h = meanChipThicknessMm(cap / (rpm * z), ae, D);
  const p = cuttingPowerKw(kcOfH(model, h), mrrMm3Min(ap, ae, cap));
  approx(p, availKw, { rel: 0.01 });
});

test('TIES', 'binding-limit tie-break: ties go to "no limit applies"', () => {
  const lim = applyLimits(10000, { vmax: 10000 });
  assert(lim.binding === 'ideal', `expected ideal on tie, got ${lim.binding}`);
  const lim2 = applyLimits(10000, { vmax: 8000, pow: 9000 });
  assert(lim2.binding === 'vmax', `expected vmax, got ${lim2.binding}`);
});
