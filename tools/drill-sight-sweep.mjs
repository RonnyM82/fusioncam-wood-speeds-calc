// The numbers a machinist would actually read, printed as a grid, so they can be
// looked at before a serving policy ships. The checks prove the arithmetic; this
// is for the judgement the checks cannot make.
//
//   node tools/drill-sight-sweep.mjs [machine]

import { loadData } from '../tests/load-node.js';
import { machinePresets } from '../js/data/presets.js';
import { calculateDrilling } from '../js/core/drilling.js';

const data = loadData();
const presets = machinePresets(data.machines, data.rules);
const wanted = process.argv[2] ?? 'SCM Morbidelli X50';
const preset = presets.find((p) => p.id.startsWith(wanted)) ?? presets[0];

const CASES = [
  ['hinge_drill', 35, 'laminated_pb', 'melamine hinge cup, the headline job'],
  ['hinge_drill', 35, 'mdf', 'same cup in MDF'],
  ['hinge_drill', 35, 'hardwood', 'same cup in solid timber'],
  ['hinge_drill', 35, 'plywood', 'same cup in plywood'],
  ['hinge_drill_hw_solid', 35, 'laminated_pb', 'solid-carbide cup, melamine'],
  ['hinge_drill_hw_solid', 35, 'mdf', 'solid-carbide cup, MDF'],
  ['hinge_drill_hw_solid_three_edge', 35, 'laminated_pb', 'three-edge cup, melamine'],
  ['hinge_drill_turnblade', 35, 'laminated_pb', 'turnblade cup, melamine'],
  ['hinge_drill_dp', 35, 'hpl', 'diamond cup in HPL'],
  ['hinge_drill_dp', 35, 'hardwood', 'diamond cup in timber, outside its scope'],
  ['dowel_drill_hw_tipped', 8, 'laminated_pb', '8 mm dowel hole, melamine'],
  ['dowel_drill_hw_tipped', 8, 'particleboard', '8 mm dowel, raw chipboard'],
  ['dowel_drill_hw_tipped', 5, 'laminated_pb', '5 mm shelf pin, melamine'],
  ['dowel_drill_hw_tipped', 16, 'laminated_pb', '16 mm dowel, the top of its table'],
  ['dowel_drill_excellent_hw_solid', 8, 'laminated_pb', '8 mm solid carbide dowel'],
  ['through_hole_drill', 8, 'laminated_pb', '8 mm through hole'],
  ['through_hole_drill_dp', 8, 'mdf', '8 mm diamond through hole'],
];

const pad = (s, n) => String(s).padStart(n);

for (const profile of data.rules.drilling.profiles_offered) {
  console.log(`\n=== ${profile}, on ${preset.label} ===`);
  console.log('    rpm    mm/min   mm/rev  mm/edge   m/min   kW   case');
  for (const [drillType, diameterMm, material, label] of CASES) {
    const r = calculateDrilling(
      { drillType, diameterMm, material, profile, holeDepthMm: 13, machine: preset.machine },
      data,
    );
    if (r.status !== 'ok') {
      console.log(`    ${r.status}: ${label} — ${r.refusal?.reason ?? r.block?.reason}`);
      continue;
    }
    const o = r.outputs;
    const flags = [
      r.meta.factorSubstituted ? 'factor substituted' : null,
      ...r.warnings.map((w) => w.code.replace(/^drill_/, '')),
    ].filter(Boolean);
    console.log(
      `  ${pad(Math.round(o.spindleRpm), 5)} ${pad(Math.round(o.plungeFeedMmMin), 9)}`
      + `   ${o.feedPerRevMm.toFixed(3)}    ${o.feedPerToothMm.toFixed(3)}`
      + `  ${pad(Math.round(o.surfaceSpeedMMin), 6)}  ${pad(r.meta.availKw == null ? '-' : Math.round(r.meta.availKw), 3)}`
      + `   ${label}${flags.length ? `  [${flags.join(', ')}]` : ''}`,
    );
  }
}
