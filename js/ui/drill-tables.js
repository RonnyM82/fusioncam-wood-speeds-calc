// The drilling picker tables. Data only, no markup: the class names and the
// template strings stay in app.js, and these live here so the tests can check
// them against the core without loading a page.

import { feedPair, rpmPair, surfacePair, fzPair, revPair, mmPair } from './format.js';

// Drill families, in the words a cabinetmaker uses. The tool subfamilies in the
// data are the vendor's own divisions and there are twelve of them, which is a
// picker nobody wants, so each family names the tools it can offer and the
// diameter decides which of them serves.
export const DRILL_TOOLS = [
  {
    id: 'dowel',
    label: 'Dowel drill',
    hint: 'Blind holes for dowels, shelf pins and confirmats.',
    subfamilies: ['dowel_drill_hw_tipped', 'dowel_drill_premium_hw_tipped', 'dowel_drill_excellent_hw_solid'],
  },
  {
    id: 'through',
    label: 'Through-hole drill',
    hint: 'Holes that break out the far side, with the exit face kept clean.',
    subfamilies: ['through_hole_drill', 'through_hole_drill_premium_hw_tipped', 'through_hole_drill_excellent_hw_solid', 'through_hole_drill_dp'],
  },
  {
    id: 'hinge',
    label: 'Hinge drill',
    hint: 'Cup boring for concealed hinges, on a machining centre or a boring head.',
    subfamilies: ['hinge_drill', 'hinge_drill_hw_solid', 'hinge_drill_hw_solid_three_edge', 'hinge_drill_turnblade', 'hinge_drill_dp'],
  },
  {
    id: 'twist',
    label: 'Twist drill',
    hint: 'General blind and through holes, and the only drills here that go below 3 mm.',
    subfamilies: ['twist_drill_hw_solid', 'twist_drill_hw_double_heel'],
  },
  {
    id: 'levin',
    label: 'Levin drill',
    hint: 'Deep holes in solid timber. A large chip gullet, so it goes deep without stopping to clear.',
    subfamilies: ['levin_drill_hs_solid', 'levin_drill_hw'],
  },
];

// Drills come in whole millimetres. The router list is built on imperial
// fractions, and carrying 12.7 into drilling would offer a drill nobody owns.
export const DRILL_DIAMETERS = {
  dowel: [4, 5, 6, 7, 8, 10, 12, 14, 16],
  through: [3, 4.5, 5, 6, 8, 10, 12],
  hinge: [15, 18, 20, 25, 26, 30, 35, 40],
  twist: [2, 2.5, 3, 3.5, 4, 5, 6, 8, 10, 12],
  levin: [5, 6, 8, 10, 12, 14, 16],
};

// Drilling serves a different vocabulary of numbers. The speed and the plunge
// are the served values; the surface speed and the two per-revolution figures
// are derived from them for transcription. The peck row appears only when the
// source publishes a rule, which `when` decides.
export const DRILL_OUTPUT_ROWS = [
  { key: 'spindleRpm', label: 'Spindle speed', fmt: rpmPair, noteKey: 'speedRange' },
  { key: 'surfaceSpeedMMin', label: 'Surface speed', fmt: surfacePair, secondary: true },
  { key: 'plungeFeedMmMin', label: 'Plunge feedrate', fmt: feedPair },
  { key: 'feedPerRevMm', label: 'Feed per revolution', fmt: revPair, secondary: true },
  { key: 'feedPerToothMm', label: 'Feed per cutting edge', fmt: fzPair, secondary: true },
  { key: 'peckStepMm', label: 'Peck depth', fmt: mmPair, noteKey: 'peck', when: (o) => o.peckStepMm != null },
];

// Which drill subfamily serves. The family names its candidates in the vendor's
// own order, which runs from the standard tool to its upgrades, and the first
// one that publishes the chosen diameter serves. When none does, the first
// candidate serves so the core can refuse with the diameter range the user is
// looking at, rather than the page inventing a message.
export function drillSubfamilyFor(familyId, diameterMm, entries) {
  const family = DRILL_TOOLS.find((t) => t.id === familyId) ?? DRILL_TOOLS[0];
  const fits = family.subfamilies.find((id) => {
    const e = entries.find((x) => x.subfamily_id === id);
    return e && diameterMm >= e.diameter_min_mm && diameterMm <= e.diameter_max_mm;
  });
  return fits ?? family.subfamilies[0];
}
