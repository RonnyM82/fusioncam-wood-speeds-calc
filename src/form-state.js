// @ts-check
// The calculator's form state, in one place, as plain functions: what the old
// page kept in `state` and changed from its event handlers in js/ui/app.js.
// Written 2026-09-24, step 2 of docs/CONVERSION_PLAN.md.
//
// Plain JavaScript with no React and no page in it, so tests/form-state.test.js
// runs it in Node like the engine's tests. src/useCalculatorState.ts wraps it
// in a hook; nothing else writes the state.
//
// THE OLD PAGE IS THE SPECIFICATION. Every rule here is app.js's, carried
// across without changing what it does: readUrlState() and writeUrlState()
// (what a shared link means, including links from before drilling existed),
// currentInput() and currentDrillInput() (what the engine is handed, with the
// machine feed's m/min to mm/min multiply), the parked profile per mode, the
// drill diameter snapping to the nearest size the family publishes, the
// first-cut choice hidden while Finishing, and the advanced fields filled from
// the machine preset until the machine changes. Where this file departs from
// app.js it says so, and the only departures are the two changes below.
//
// THE ONE RULED CHANGE (Scott, 2026-09-24, the plan's rulings): a box the
// calculator cannot read holds the results back. The old page quietly
// calculated from a stand-in when a box held letters (two flutes for "abc",
// 18000 rpm for an unreadable speed). Here a number field that reports an
// unreadable text (letters, a comma) is recorded as a fault, the calculation
// state keeps the last value it accepted, and blockers() names the box so the
// results area can say so. A value outside a field's range is a fault too,
// read from the value itself, so a link carrying one blocks on arrival as the
// field's own chip does. An EMPTY optional box still means what it always
// meant: full board, full slot, the published speed, the machine's own value.
//
// A SECOND CHANGE, Claude's (2026-09-24, step 3, recorded in the plan's
// rulings): an advanced box holding 0 or a negative number is refused like any
// other value outside its range, where app.js quietly served the machine's own
// value in its place, the stand-in the ruling above ended. An EMPTY advanced
// box still means the machine's own value.
//
// THE BETA SWITCH (Scott's ruling, 2026-09-24): the ball nose is offered only
// while "Show beta tools" is ticked. It arrived in commit bc85559 and was never
// live, so with the tick off the tool list is the live site's (commit 1e6c265).
// The tick is off by default; the page remembers it in the browser
// (useCalculatorState.ts), which this file never touches, so createState()
// is handed what was remembered. A link naming the ball nose opens with the
// tick on, so a shared ball-nose link still works, and the address carries no
// key of its own for it. Unticking with the ball nose chosen falls back to the
// page's default tool.
//
// THE BOX AND THE STATE ARE KEPT APART. `boxes` holds what each number field
// holds (its metric base, or null for empty or unreadable), which is what the
// field part is handed back as its value. The calculation state holds what
// app.js's mapping made of it. They differ where app.js mapped: an empty board
// thickness box holds null while the state holds 0 (which the engine refuses
// in words); a flute count of 2.6 holds 2.6 while the state holds 3; an
// advanced box at 0 holds 0 (and holds the results back) while the state
// drops the override.
// Handing the part the mapped number instead would repaint the box under the
// person's fingers (clearing the thickness box would show 0.0 at once, and
// typing 0.4 into the grip factor would be wiped at the 0).

import { DRILL_TOOLS, DRILL_DIAMETERS, drillSubfamilyFor } from '../js/ui/drill-tables.js';

// ---------------------------------------------------------------------------
// The pickers' lists, copied from js/ui/app.js unchanged. app.js cannot be
// imported (it builds the old page the moment it loads), and it goes when the
// conversion is done.
// ---------------------------------------------------------------------------

// Beginner picks. Each material merges the vendor naming synonyms for the same
// physical board (documented in data/schema.md); kcMaterial is the canonical
// key for the cutting-force model. OSB is deliberately absent (D12): the core
// still refuses it with the reason if ever asked.
export const MATERIALS = [
  { id: 'mdf', label: 'MDF', hint: 'Fibreboard, plain or veneered', data: ['mdf'], kcMaterial: 'mdf' },
  { id: 'melamine', label: 'Melamine / chipboard', hint: 'Melamine-faced or laminated particleboard', data: ['laminated_pb', 'laminated_chipboard'], kcMaterial: 'laminated_pb' },
  { id: 'hard_ply', label: 'Hard plywood', hint: 'Birch, hardwood-face and film-faced sheets. Film-faced runs 15-20% harder.', data: ['plywood'], kcMaterial: 'plywood' },
  { id: 'soft_ply', label: 'Soft plywood', hint: 'Softwood construction ply, CD and similar', data: ['softwood_ply'], fallback: ['plywood'], kcMaterial: 'softwood_ply' },
  { id: 'hpl', label: 'HPL-faced panel', hint: 'High-pressure laminate over a board core. If the edge chips, change the tool geometry before the feed.', data: ['hpl'], kcMaterial: 'hpl' },
  { id: 'hardwood', label: 'Hardwood', hint: 'Oak, beech, maple, ash and similar', data: ['hardwood'], kcMaterial: 'hardwood' },
  { id: 'softwood', label: 'Softwood', hint: 'Pine, radiata, spruce', data: ['softwood'], kcMaterial: 'softwood' },
];

// Every routing tool type the page knows, beta ones included. What the picker
// offers is toolTypesFor(state.beta).
export const TOOL_TYPES = [
  { id: 'upcut', label: 'Up-cut spiral', hint: 'Pulls chips up and out. Clears chips best, but it can fray the top face.' },
  { id: 'downcut', label: 'Down-cut spiral', hint: 'Presses chips down. Leaves a clean top face, but clears chips poorly.' },
  { id: 'compression', label: 'Compression', hint: 'Up-cut tip, down-cut body. Cuts a clean top and bottom face on through cuts.' },
  { id: 'straight', label: 'Straight', hint: 'Simple straight flutes. General purpose, but harder on the faces than a spiral.' },
  { id: 'ball', label: 'Ball nose', hint: 'Round tip for 3D surfacing and carving. Softwood, hardwood and MDF only.' },
];

// The tool types offered only while the beta tick is on.
export const BETA_TOOL_TYPES = new Set(['ball']);

// The routing tool the page opens on, and the one it falls back to when the
// beta tick goes off with a beta tool chosen.
export const DEFAULT_TOOL_TYPE = 'compression';

/** The routing tool types the picker offers. @param {boolean} beta */
export const toolTypesFor = (beta) => (beta ? TOOL_TYPES : TOOL_TYPES.filter((t) => !BETA_TOOL_TYPES.has(t.id)));

// The ball nose ladder is the chart's own: 1/16 through 3/4 inch. 15.875 is
// there for that chart alone and sits between two metric sizes nothing else
// publishes (2026-09-02).
export const DIAMETERS = [1.5875, 3.175, 4, 5, 6, 6.35, 8, 9.525, 10, 12, 12.7, 15.875, 16, 19.05, 25.4];

export const PROFILES = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'standard', label: 'Standard' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'finishing', label: 'Finishing' },
];

export const MODES = [
  { id: 'rout', label: 'Routing' },
  { id: 'drill', label: 'Drilling' },
];

// Which profiles each mode offers. Drilling has no finish pass: a hole cannot be
// skimmed, and no source publishes a finishing drill feed. Serving one from the
// band's low edge would be a fourth name for Gentle with a claim attached.
/** @param {string} mode */
export const profilesFor = (mode) => (mode === 'drill'
  ? PROFILES.filter((p) => p.id !== 'finishing')
  : PROFILES);

// A plunge has no radial engagement, no corners and no lateral force, so the
// hold-down, corner, direction, flute-basis and timber-density fields have
// nothing to act on in drilling. Machine power and feed still do.
export const DRILL_ADV = new Set(['spindleKw', 'breakpointRpm', 'feedMaxMMin']);

/**
 * @typedef {{ rules: any, machines: any, drills: any, chiploads?: any, kc?: any }} CalcData
 * @typedef {{ id: string, label: string, machine: any, notes?: string }} Preset
 * @typedef {{
 *   id: string, label: string, name: string,
 *   select?: [string, string][],
 *   measure?: 'length' | 'rotation' | 'speed', unit?: string, decimals?: number, step?: number,
 *   hint?: string | ((d: CalcData) => string),
 * }} AdvField
 */

// The unit lives in the field's affix, never in the label. An all-caps label
// carrying "(m/s²)" is a label nobody finishes reading, and the affix puts the
// unit where the number is. `name` is new: the words the blocking message uses
// for the box ("The spindle power can't be read.").
/** @type {AdvField[]} */
export const ADV_FIELDS = [
  { id: 'fluteBasis', label: 'Flute count convention', name: 'flute count convention', select: [['total', 'Count total flutes (default)'], ['upcut_only', 'Count up-cut flutes only']], hint: 'The vendor charts give per-tooth values for the total flute count. Some engineers count only the up-cut flutes on up/down spirals. If that is your convention, the served feed runs conservative.' },
  { id: 'direction', label: 'Cut direction', name: 'cut direction', select: [['climb', 'Climb (default, the safe higher-force assumption)'], ['conventional', 'Conventional (lower force, modelled for MDF, melamine and plywood only)']] },
  { id: 'upcutLengthMm', label: 'Compression up-cut length', name: 'compression up-cut length', measure: 'length', decimals: 1, step: 0.5, hint: 'Defaults to one tool diameter.' },
  { id: 'fluteLengthMm', label: 'Flute length', name: 'flute length', measure: 'length', decimals: 1, step: 1, hint: 'Enter a value to check the pass depth against the flutes. A pass deeper than the flutes draws a red chip.' },
  { id: 'spindleKw', label: 'Spindle power', name: 'spindle power', unit: 'kW', decimals: 1, step: 0.5, hint: 'Filled from the machine preset. Edit it to override.' },
  { id: 'breakpointRpm', label: 'Spindle breakpoint', name: 'spindle breakpoint', measure: 'rotation', step: 500, hint: 'The rpm where constant torque becomes constant power. Typically 12000.' },
  { id: 'feedMaxMMin', label: 'Machine max feed', name: 'machine max feed', measure: 'speed', hint: 'Filled from the machine preset. Edit it to override.' },
  { id: 'accelMs2', label: 'Axis acceleration', name: 'axis acceleration', unit: 'm/s²', decimals: 1, step: 0.1, hint: 'No OEM publishes this value. Derived tiers: hobby 0.4-1, light 1-3, heavy nesting 2-4.' },
  { id: 'footprintCm2', label: 'Part footprint on vacuum', name: 'part footprint on vacuum', unit: 'cm²', decimals: 0, step: 10, hint: (d) => `Enter a value to enable the hold-down check, for example ${d.rules.defaults.footprint_cm2}.` },
  { id: 'featureMm', label: 'Smallest feature length', name: 'smallest feature length', measure: 'length', decimals: 1, step: 1, hint: (d) => `Enter a value to enable the corner check, for example ${d.rules.defaults.feature_mm}.` },
  { id: 'vacDPkPa', label: 'Vacuum ΔP achieved', name: 'vacuum achieved', unit: 'kPa', decimals: 0, step: 5, hint: (d) => `On a cut-open nested sheet, ${d.machines.vacuum.achieved_nested_flow_through_kpa[0]}-${d.machines.vacuum.achieved_nested_flow_through_kpa[1]} kPa is realistic. 83 kPa is a sealed pod, not a nest.` },
  // The symbol goes in the affix, not the label: .lt-field__label uppercases,
  // and CSS uppercase maps Greek mu to capital Mu, which renders as a Latin M.
  // "GRIP FACTOR M" is a different quantity.
  { id: 'vacMu', label: 'Grip factor', name: 'grip factor', unit: 'μ', decimals: 2, step: 0.05, hint: 'Your own estimate, typically 0.4. No source publishes this value. It covers friction, air leakage and safety margin.' },
  { id: 'densityKgM3', label: 'Timber density', name: 'timber density', unit: 'kg/m³', decimals: 0, step: 10, hint: 'Solid timber only, for example 515 for radiata. The model is valid 287-1080 kg/m³ and warns outside that range.' },
];

// ---------------------------------------------------------------------------
// The number fields: the old page's <lt-number-field> attributes, and what
// app.js's numberField() callbacks made of a value (`apply`). `value` given to
// `apply` is the field's base, or null for an empty box; an unreadable text
// never reaches it (see numberChanged below).
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   label: string, name: string, mode: 'rout' | 'drill' | 'adv',
 *   measure?: 'length' | 'rotation' | 'speed', unit?: string, decimals?: number,
 *   min?: number, max?: number, above?: number, step?: number,
 *   hint?: string | ((d: CalcData) => string),
 *   mustHold?: boolean,
 *   read: (s: FormState) => number | null,
 *   apply: (s: FormState, v: number | null) => void,
 * }} NumberSpec
 */

/** @type {Record<string, NumberSpec>} */
const MAIN_FIELDS = {
  flutes: {
    label: 'Flutes', name: 'flute count', mode: 'rout', decimals: 0, min: 1, max: 6, step: 1,
    // Empty used to compute for two flutes, silently. It now holds the results
    // back like an unreadable box (a stand-in value, the ruling's own case).
    mustHold: true,
    read: (s) => s.flutes,
    apply: (s, v) => { s.flutes = v != null && v >= 1 ? Math.round(v) : 2; },
  },
  thickness: {
    label: 'Board thickness', name: 'board thickness', mode: 'rout', measure: 'length', decimals: 1, min: 1, max: 120, step: 1,
    // Empty is 0, as in app.js, and the engine refuses it in words ("Enter
    // board thickness."), so it is not a stand-in and holds nothing back here.
    read: (s) => (s.thicknessMm === 0 ? null : s.thicknessMm),
    apply: (s, v) => { s.thicknessMm = v != null && Number.isFinite(v) ? v : 0; },
  },
  doc: {
    label: 'Depth per pass', name: 'depth per pass', mode: 'rout', measure: 'length', decimals: 1, min: 0.1, step: 0.5,
    hint: 'Leave empty to cut the full board thickness. On a ball nose this is the stepdown, and it sets the cutting diameter.',
    read: (s) => s.apMm,
    apply: (s, v) => { s.apMm = v != null && v > 0 ? v : null; },
  },
  // Hole depth is its own field rather than a relabelled board thickness.
  // Reusing that control would keep its value while changing its meaning, so
  // someone who typed 18 for a board would bore an 18 mm hinge cup.
  holedepth: {
    label: 'Hole depth', name: 'hole depth', mode: 'drill', measure: 'length', decimals: 1, min: 1, max: 120, step: 1,
    hint: 'The depth of the hole, not the thickness of the panel. A 35 mm hinge cup is usually about 13 mm.',
    read: (s) => s.holeDepthMm,
    apply: (s, v) => { s.holeDepthMm = v != null && v > 0 ? v : null; },
  },
  // Empty means "run the published speed", which is how a value the source
  // chose beats a value the calculator would have to invent.
  drillrpm: {
    label: 'Spindle speed', name: 'spindle speed', mode: 'drill', measure: 'rotation', min: 500, max: 30000, step: 500,
    hint: 'Leave empty to run at the speed this drill is published for.',
    read: (s) => s.drillRpm,
    apply: (s, v) => { s.drillRpm = v != null && v > 0 ? v : null; },
  },
  woc: {
    label: 'Width of cut', name: 'width of cut', mode: 'rout', measure: 'length', decimals: 1, min: 0.1, step: 0.5,
    hint: 'Leave empty to cut a full slot, one tool diameter wide. On a ball nose this is the stepover. The Finishing profile assumes a 1 mm skim instead.',
    read: (s) => s.aeMm,
    apply: (s, v) => { s.aeMm = v != null && v > 0 ? v : null; },
  },
  rpm: {
    label: 'Spindle speed', name: 'spindle speed', mode: 'rout', measure: 'rotation', min: 1000, max: 30000, step: 500,
    // Empty used to compute at 18000 rpm, silently. Held back, as flutes.
    mustHold: true,
    read: (s) => s.rpm,
    apply: (s, v) => { s.rpm = v != null && v > 0 ? v : 18000; },
  },
};

/** The advanced number fields' ids in the form `adv:<id>`, each backed by state.adv. */
export const advKey = (/** @type {string} */ id) => `adv:${id}`;

/** @type {Record<string, NumberSpec>} */
const ADV_NUMBER_FIELDS = Object.fromEntries(ADV_FIELDS.filter((f) => !f.select).map((f) => [advKey(f.id), {
  label: f.label, name: f.name, mode: /** @type {'adv'} */ ('adv'),
  ...(f.measure ? { measure: f.measure } : {}),
  ...(f.unit ? { unit: f.unit } : {}),
  ...(f.decimals != null ? { decimals: f.decimals } : {}),
  ...(f.step != null ? { step: f.step } : {}),
  ...(f.hint != null ? { hint: f.hint } : {}),
  // The box takes only a number above 0 (the second change, at the top of
  // this file). An exclusive bound, not a `min`: the field part rounds a
  // `min` to the box's display decimals in its message, and the machine max
  // feed shows whole m/min, so any `min` there either refuses the 0.5 m/min
  // the old page served (a baseline state) or tells the person "at least 0".
  above: 0,
  read: (/** @type {FormState} */ s) => s.adv[f.id] ?? null,
  // app.js: anything that is not a number above zero drops the override, and
  // the machine preset serves. A number at 0 or below now also holds the
  // results back (blockers()), so the preset never serves in its place.
  apply: (/** @type {FormState} */ s, /** @type {number | null} */ v) => {
    if (v == null || !Number.isFinite(v) || v <= 0) delete s.adv[f.id];
    else s.adv[f.id] = v;
  },
}]));

/** @type {Record<string, NumberSpec>} */
export const NUMBER_FIELDS = { ...MAIN_FIELDS, ...ADV_NUMBER_FIELDS };

/**
 * Which number fields are on screen for this state. The old page hid the rest
 * with the hidden attribute; the new one does not render them.
 * @param {FormState} s
 */
export function numberFieldsShown(s) {
  const drilling = s.mode === 'drill';
  return Object.keys(NUMBER_FIELDS).filter((key) => {
    const spec = NUMBER_FIELDS[key];
    if (spec.mode === 'adv') return !drilling || DRILL_ADV.has(key.slice(4));
    return spec.mode === s.mode;
  });
}

// ---------------------------------------------------------------------------
// The state
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   mode: string, material: string, toolType: string, diameterMm: number,
 *   flutes: number, thicknessMm: number, apMm: number | null, aeMm: number | null,
 *   rpm: number, machineIdx: number, profile: string, firstCut: boolean,
 *   adv: Record<string, any>,
 *   drillTool: string, drillDiameterMm: number, holeDepthMm: number | null,
 *   drillRpm: number | null, drillBank: boolean,
 *   profileByMode: Record<string, string>,
 *   beta: boolean,
 *   boxes: Record<string, number | null>,
 *   faults: Record<string, 'unreadable' | 'empty'>,
 * }} FormState
 */

/** @param {FormState} s @returns {FormState} */
const copy = (s) => ({
  ...s,
  adv: { ...s.adv },
  profileByMode: { ...s.profileByMode },
  boxes: { ...s.boxes },
  faults: { ...s.faults },
});

/**
 * The page's state at load: app.js's defaults, then init() (the Generic
 * machine, the first-cut default from the data), then readUrlState(), then
 * what buildForm() settles (the drill diameter snapped, the profile checked
 * against the mode, the machine's values filled into the advanced fields
 * that the link did not set). `betaRemembered` is the beta tick as the
 * browser remembered it; a link naming a beta tool turns it on regardless.
 * @param {CalcData} data @param {Preset[]} presets @param {string} search
 * @param {boolean} [betaRemembered]
 * @returns {FormState}
 */
export function createState(data, presets, search, betaRemembered = false) {
  /** @type {FormState} */
  const s = {
    mode: 'rout',
    material: 'mdf',
    toolType: DEFAULT_TOOL_TYPE,
    diameterMm: 12.7,
    flutes: 2,
    thicknessMm: 18,
    apMm: null,
    aeMm: null,
    rpm: 18000,
    machineIdx: 0,
    profile: 'standard',
    firstCut: true,
    adv: {},
    // Drilling keeps its own tool, diameter and speed. Sharing the diameter would
    // carry a 12.7 mm router bit into a drill list of whole millimetres.
    drillTool: 'hinge',
    drillDiameterMm: 35,
    holeDepthMm: 13,
    drillRpm: null,
    drillBank: false,
    // Drilling offers no Finishing profile, so switching modes has to park the
    // choice rather than lose it.
    profileByMode: { rout: 'standard', drill: 'standard' },
    beta: betaRemembered,
    boxes: {},
    faults: {},
  };
  const genericIdx = presets.findIndex((p) => p.id.startsWith('Generic'));
  s.machineIdx = genericIdx >= 0 ? genericIdx : 0;
  s.firstCut = data.rules.first_cut?.default_on ?? false;
  readUrlState(s, search, presets);
  if (BETA_TOOL_TYPES.has(s.toolType)) s.beta = true;
  snapDrillDiameter(s);
  if (!profilesFor(s.mode).some((p) => p.id === s.profile)) s.profile = 'standard';
  applyMachineToAdvanced(s, presets, { keepExisting: true });
  for (const key of Object.keys(NUMBER_FIELDS)) s.boxes[key] = NUMBER_FIELDS[key].read(s);
  return s;
}

/**
 * app.js's readUrlState(), line for line, writing into `s`.
 * @param {FormState} s @param {string} search @param {Preset[]} presets
 */
export function readUrlState(s, search, presets) {
  const q = new URLSearchParams(search);
  const num = (/** @type {string} */ k) => Number(q.get(k));
  // The mode is read first, because each mode validates the profile and the
  // diameter against its own list. Every link shared before drilling existed
  // carries no mode key at all, and must keep reading as routing.
  if (q.get('k') && MODES.some((x) => x.id === q.get('k'))) s.mode = /** @type {string} */ (q.get('k'));
  if (q.get('dt') && DRILL_TOOLS.some((x) => x.id === q.get('dt'))) s.drillTool = /** @type {string} */ (q.get('dt'));
  if (q.get('dd') && (/** @type {Record<string, number[]>} */ (DRILL_DIAMETERS)[s.drillTool] ?? []).includes(num('dd'))) s.drillDiameterMm = num('dd');
  if (q.get('hd') && num('hd') > 0) s.holeDepthMm = num('hd');
  if (q.get('dr') && num('dr') > 0) s.drillRpm = num('dr');
  if (q.get('db') != null) s.drillBank = q.get('db') === '1';
  if (q.get('m') && MATERIALS.some((x) => x.id === q.get('m'))) s.material = /** @type {string} */ (q.get('m'));
  if (q.get('t') && TOOL_TYPES.some((x) => x.id === q.get('t'))) s.toolType = /** @type {string} */ (q.get('t'));
  if (q.get('d') && DIAMETERS.includes(num('d'))) s.diameterMm = num('d');
  if (q.get('th') && num('th') > 0) s.thicknessMm = num('th');
  if (q.get('f') && num('f') >= 1) s.flutes = Math.round(num('f'));
  if (q.get('r') && num('r') > 0) s.rpm = num('r');
  if (q.get('ap') && num('ap') > 0) s.apMm = num('ap');
  if (q.get('ae') && num('ae') > 0) s.aeMm = num('ae');
  if (q.get('mc') && presets[num('mc')]) s.machineIdx = num('mc');
  // A finishing link opened in drilling falls back to Standard: drilling offers
  // no finish pass, so that button does not exist there.
  if (q.get('p') && profilesFor(s.mode).some((x) => x.id === q.get('p'))) s.profile = /** @type {string} */ (q.get('p'));
  s.profileByMode[s.mode] = s.profile;
  if (q.get('fc') != null) s.firstCut = q.get('fc') === '1';
  for (const [k, v] of q.entries()) {
    if (k.startsWith('a_')) {
      const id = k.slice(2);
      const f = ADV_FIELDS.find((x) => x.id === id);
      if (!f) continue;
      if (f.select) {
        if (f.select.some(([val]) => val === v)) s.adv[id] = v;
      } else {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) s.adv[id] = n;
      }
    }
  }
}

/**
 * app.js's writeUrlState(): the query string the page writes after every
 * change, key for key and in the same order.
 * @param {FormState} s @returns {string}
 */
export function writeUrlState(s) {
  const q = new URLSearchParams({
    k: s.mode,
    m: s.material, mc: String(s.machineIdx), p: s.profile,
  });
  if (s.mode === 'drill') {
    q.set('dt', s.drillTool);
    q.set('dd', String(s.drillDiameterMm));
    if (s.holeDepthMm != null) q.set('hd', String(s.holeDepthMm));
    if (s.drillRpm != null) q.set('dr', String(s.drillRpm));
    if (s.drillBank) q.set('db', '1');
  } else {
    q.set('t', s.toolType);
    q.set('d', String(s.diameterMm));
    q.set('f', String(s.flutes));
    q.set('th', String(s.thicknessMm));
    q.set('r', String(s.rpm));
    q.set('fc', s.firstCut ? '1' : '0');
    if (s.apMm != null) q.set('ap', String(s.apMm));
    if (s.aeMm != null) q.set('ae', String(s.aeMm));
  }
  for (const [k, v] of Object.entries(s.adv)) q.set(`a_${k}`, String(v));
  return `?${q}`;
}

/**
 * app.js's fillDiameters(), the part that moves the value: in drilling, a
 * diameter the family does not publish is pulled to the nearest one it does,
 * the earlier on a tie, so the picker can never show a size the family does
 * not offer. Routing never snaps.
 * @param {FormState} s
 */
function snapDrillDiameter(s) {
  if (s.mode !== 'drill') return;
  const list = /** @type {Record<string, number[]>} */ (DRILL_DIAMETERS)[s.drillTool] ?? [];
  if (!list.includes(s.drillDiameterMm)) {
    s.drillDiameterMm = list.reduce((a, b) =>
      (Math.abs(b - s.drillDiameterMm) < Math.abs(a - s.drillDiameterMm) ? b : a), list[0]);
  }
}

/**
 * app.js's applyMachineToAdvanced(). Picking a machine fills the
 * machine-derived advanced fields with that preset's real values, so the
 * preset's contribution is visible and editable. Editing a field sticks until
 * the machine changes again. The machine max feed is shown in m/min, so the
 * preset's mm/min is divided by 1000 here and multiplied back in
 * currentInput().
 * @param {FormState} s @param {Preset[]} presets @param {{ keepExisting?: boolean }} [opts]
 */
function applyMachineToAdvanced(s, presets, { keepExisting = false } = {}) {
  const m = presets[s.machineIdx].machine;
  const vals = {
    spindleKw: m.spindleKw,
    breakpointRpm: m.breakpointRpm,
    feedMaxMMin: m.feedMaxMmMin / 1000,
    accelMs2: m.accelMs2,
    vacDPkPa: m.vacuum.dPkPa,
    vacMu: m.vacuum.mu,
  };
  for (const [id, v] of Object.entries(vals)) {
    if (v == null) continue;
    if (keepExisting && s.adv[id] != null) continue;
    s.adv[id] = v;
    // The old page set the element's value, which repaints the box whatever
    // it held, so a box that could not be read is cleared of its fault.
    const key = advKey(id);
    s.boxes[key] = v;
    delete s.faults[key];
  }
}

/**
 * app.js's currentInput(): what calculate() is handed for routing.
 * @param {FormState} s @param {CalcData} _data @param {Preset[]} presets
 */
export function currentInput(s, _data, presets) {
  const mat = /** @type {typeof MATERIALS[number]} */ (MATERIALS.find((m) => m.id === s.material));
  const preset = presets[s.machineIdx];
  const adv = s.adv;
  const machine = {
    spindleKw: adv.spindleKw ?? preset.machine.spindleKw,
    breakpointRpm: adv.breakpointRpm ?? preset.machine.breakpointRpm,
    rpmMax: preset.machine.rpmMax,
    rpmMin: preset.machine.rpmMin,
    // The advanced field is in m/min, the engine reads mm/min. Losing this
    // multiply caps every feed a thousand times too low and still looks like
    // an ordinary "Machine feed" limit (the survey's risk 2). FS2 pins it.
    feedMaxMmMin: adv.feedMaxMMin != null ? adv.feedMaxMMin * 1000 : preset.machine.feedMaxMmMin,
    accelMs2: adv.accelMs2 ?? preset.machine.accelMs2,
    vacuum: { mu: adv.vacMu ?? preset.machine.vacuum.mu, dPkPa: adv.vacDPkPa ?? preset.machine.vacuum.dPkPa },
  };
  return {
    material: mat.kcMaterial,
    materials: mat.data,
    materialsFallback: mat.fallback,
    toolType: s.toolType,
    diameterMm: s.diameterMm,
    thicknessMm: s.thicknessMm,
    profile: s.profile,
    firstCut: s.firstCut,
    machine,
    rpm: s.rpm,
    flutesTotal: s.flutes,
    fluteBasis: adv.fluteBasis,
    direction: adv.direction,
    apMm: s.apMm ?? undefined,
    aeMm: s.aeMm ?? undefined,
    upcutLengthMm: adv.upcutLengthMm,
    footprintCm2: adv.footprintCm2,
    fluteLengthMm: adv.fluteLengthMm,
    featureMm: adv.featureMm,
    densityKgM3: adv.densityKgM3,
  };
}

/**
 * app.js's currentDrillInput(): what calculateDrilling() is handed.
 * @param {FormState} s @param {CalcData} data @param {Preset[]} presets
 */
export function currentDrillInput(s, data, presets) {
  const mat = /** @type {typeof MATERIALS[number]} */ (MATERIALS.find((m) => m.id === s.material));
  const preset = presets[s.machineIdx];
  const adv = s.adv;
  return {
    drillType: drillSubfamilyFor(s.drillTool, s.drillDiameterMm, data.drills.entries),
    material: mat.kcMaterial,
    diameterMm: s.drillDiameterMm,
    holeDepthMm: s.holeDepthMm ?? undefined,
    rpm: s.drillRpm ?? undefined,
    profile: s.profile,
    drillBank: s.drillBank,
    machine: {
      spindleKw: adv.spindleKw ?? preset.machine.spindleKw,
      breakpointRpm: adv.breakpointRpm ?? preset.machine.breakpointRpm,
      rpmMax: preset.machine.rpmMax,
      rpmMin: preset.machine.rpmMin,
      feedMaxMmMin: adv.feedMaxMMin != null ? adv.feedMaxMMin * 1000 : preset.machine.feedMaxMmMin,
    },
  };
}

// ---------------------------------------------------------------------------
// Changes. One function per thing a person can do on the form, each carrying
// the handler it replaces in app.js.
// ---------------------------------------------------------------------------

/**
 * @typedef {(
 *   | { type: 'mode', value: string }
 *   | { type: 'material', value: string }
 *   | { type: 'tool', value: string }
 *   | { type: 'diameter', value: string }
 *   | { type: 'machine', value: string }
 *   | { type: 'profile', value: string }
 *   | { type: 'firstCut', value: boolean }
 *   | { type: 'drillBank', value: boolean }
 *   | { type: 'beta', value: boolean }
 *   | { type: 'advSelect', id: string, value: string }
 *   | { type: 'number', field: string, value: number | null, state: 'ok' | 'warn' | 'error' }
 * )} FormAction
 */

/**
 * @param {FormState} prev @param {FormAction} action @param {Preset[]} presets
 * @returns {FormState}
 */
export function update(prev, action, presets) {
  const s = copy(prev);
  switch (action.type) {
    case 'mode': {
      s.mode = action.value;
      s.profile = s.profileByMode[action.value] ?? 'standard';
      if (!profilesFor(s.mode).some((p) => p.id === s.profile)) s.profile = 'standard';
      snapDrillDiameter(s);
      // A field the new mode does not show is unmounted. When it returns it
      // shows what the calculation state holds, as the old page's hidden
      // element did, and whatever could not be read in it is gone.
      const shown = new Set(numberFieldsShown(s));
      for (const key of Object.keys(NUMBER_FIELDS)) {
        if (shown.has(key)) continue;
        s.boxes[key] = NUMBER_FIELDS[key].read(s);
        delete s.faults[key];
      }
      return s;
    }
    case 'material':
      s.material = action.value;
      return s;
    case 'tool':
      if (s.mode === 'drill') {
        s.drillTool = action.value;
        snapDrillDiameter(s);
      } else {
        s.toolType = action.value;
        // A beta tool is only on offer with the tick on; keep the two agreeing.
        if (BETA_TOOL_TYPES.has(action.value)) s.beta = true;
      }
      return s;
    case 'diameter': {
      const v = Number(action.value);
      if (s.mode === 'drill') s.drillDiameterMm = v;
      else s.diameterMm = v;
      return s;
    }
    case 'machine':
      s.machineIdx = Number(action.value);
      applyMachineToAdvanced(s, presets);
      return s;
    case 'profile':
      s.profile = action.value;
      s.profileByMode[s.mode] = action.value;
      return s;
    case 'firstCut':
      s.firstCut = action.value;
      return s;
    case 'drillBank':
      s.drillBank = action.value;
      return s;
    case 'beta':
      s.beta = action.value;
      // Unticked with a beta tool chosen: the page's default tool, and the
      // results follow as for any other tool change.
      if (!s.beta && BETA_TOOL_TYPES.has(s.toolType)) s.toolType = DEFAULT_TOOL_TYPE;
      return s;
    case 'advSelect':
      s.adv[action.id] = action.value;
      return s;
    case 'number':
      numberChanged(s, action.field, action.value, action.state);
      return s;
    default:
      return prev;
  }
}

/**
 * A person changed a number field. The box always takes what the field
 * holds. Then, and this is the ruled change: a text the field cannot read
 * (it reports no number, in error) is recorded as a fault and the
 * calculation state is left on the last value it accepted, where app.js
 * mapped it to a stand-in. An empty box that must hold a number is the same
 * case. Everything else goes through app.js's own mapping, including a
 * number outside the field's range, which blockers() then reports.
 * @param {FormState} s @param {string} key @param {number | null} value
 * @param {'ok' | 'warn' | 'error'} state
 */
function numberChanged(s, key, value, state) {
  const spec = NUMBER_FIELDS[key];
  if (!spec) return;
  s.boxes[key] = value;
  if (value === null && state === 'error') {
    s.faults[key] = 'unreadable';
    return;
  }
  if (value === null && spec.mustHold) {
    s.faults[key] = 'empty';
    return;
  }
  delete s.faults[key];
  spec.apply(s, value);
}

/**
 * The words under a box that takes only a number above a bound and holds one
 * at or below it. The field part is handed this as its own rule, as
 * EMPTY_WORDS below.
 * @param {number} above
 */
export const aboveWords = (above) => `Must be more than ${above}.`;

/**
 * The words under a box that must hold a number and is empty. The field part
 * is handed this as its own rule, so the chip and the blocking message agree.
 */
export const EMPTY_WORDS = 'Enter a value.';

/**
 * The boxes on screen that hold the results back, in page order, each with
 * why: its text cannot be read, it is empty and must hold a number, or its
 * number is outside the range the field takes.
 * @param {FormState} s
 * @returns {{ key: string, name: string, why: 'unreadable' | 'empty' | 'range' }[]}
 */
export function blockers(s) {
  /** @type {{ key: string, name: string, why: 'unreadable' | 'empty' | 'range' }[]} */
  const out = [];
  for (const key of numberFieldsShown(s)) {
    const spec = NUMBER_FIELDS[key];
    const box = s.boxes[key];
    const fault = s.faults[key];
    if (fault) out.push({ key, name: spec.name, why: fault });
    else if (box != null && ((spec.min != null && box < spec.min) || (spec.max != null && box > spec.max)
      || (spec.above != null && box <= spec.above))) {
      out.push({ key, name: spec.name, why: 'range' });
    }
  }
  return out;
}

/**
 * The results area's message while a box holds the results back, in plain
 * words: which box, and what to do. Scott's wording, 2026-09-24: "The spindle
 * speed can't be read. Fix it to see feeds and speeds."
 * @param {ReturnType<typeof blockers>} list @returns {string}
 */
export function blockingMessage(list) {
  const said = list.map(({ name, why }) => {
    if (why === 'unreadable') return `The ${name} can't be read.`;
    if (why === 'empty') return `The ${name} box is empty.`;
    return `The ${name} is outside the range its box takes.`;
  });
  return `${said.join(' ')} Fix ${list.length === 1 ? 'it' : 'them'} to see feeds and speeds.`;
}

/**
 * The first-cut checkbox's words, from the data, as app.js wrote them.
 * @param {CalcData} data
 */
export function firstCutLabel(data) {
  return data.rules.first_cut
    ? `First cut: run ${Math.round(data.rules.first_cut.factor * 100)}% of the chart feed until the cut proves good`
    : 'First cut: run a reduced feed until the cut proves good';
}
