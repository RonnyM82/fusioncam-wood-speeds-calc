import { loadData } from '../data/load-browser.js';
import { validateData } from '../data/validate.js';
import { machinePresets } from '../data/presets.js';
import { calculate } from '../core/calculate.js';
import { calculateDrilling } from '../core/drilling.js';
import { buildChips } from '../core/diagnostics.js';
import { feedPair, rpmPair, surfacePair, fzPair, diameterLabel } from './format.js';
import { DRILL_TOOLS, DRILL_DIAMETERS, DRILL_OUTPUT_ROWS, drillSubfamilyFor } from './drill-tables.js';

// Beginner picks. Each material merges the vendor naming synonyms for the same
// physical board (documented in data/schema.md); kcMaterial is the canonical
// key for the cutting-force model. OSB is deliberately absent (D12): the core
// still refuses it with the reason if ever asked.
const MATERIALS = [
  { id: 'mdf', label: 'MDF', hint: 'Fibreboard, plain or veneered', data: ['mdf'], kcMaterial: 'mdf' },
  { id: 'melamine', label: 'Melamine / chipboard', hint: 'Melamine-faced or laminated particleboard', data: ['laminated_pb', 'laminated_chipboard'], kcMaterial: 'laminated_pb' },
  { id: 'hard_ply', label: 'Hard plywood', hint: 'Birch, hardwood-face and film-faced sheets. Film-faced runs 15-20% harder.', data: ['plywood'], kcMaterial: 'plywood' },
  { id: 'soft_ply', label: 'Soft plywood', hint: 'Softwood construction ply, CD and similar', data: ['softwood_ply'], fallback: ['plywood'], kcMaterial: 'softwood_ply' },
  { id: 'hpl', label: 'HPL-faced panel', hint: 'High-pressure laminate over a board core. If the edge chips, change the tool geometry before the feed.', data: ['hpl'], kcMaterial: 'hpl' },
  { id: 'hardwood', label: 'Hardwood', hint: 'Oak, beech, maple, ash and similar', data: ['hardwood'], kcMaterial: 'hardwood' },
  { id: 'softwood', label: 'Softwood', hint: 'Pine, radiata, spruce', data: ['softwood'], kcMaterial: 'softwood' },
];

const TOOL_TYPES = [
  { id: 'upcut', label: 'Up-cut spiral', hint: 'Pulls chips up and out. Clears chips best, but it can fray the top face.' },
  { id: 'downcut', label: 'Down-cut spiral', hint: 'Presses chips down. Leaves a clean top face, but clears chips poorly.' },
  { id: 'compression', label: 'Compression', hint: 'Up-cut tip, down-cut body. Cuts a clean top and bottom face on through cuts.' },
  { id: 'straight', label: 'Straight', hint: 'Simple straight flutes. General purpose, but harder on the faces than a spiral.' },
];

const DIAMETERS = [3.175, 4, 5, 6, 6.35, 8, 9.525, 10, 12, 12.7, 16, 19.05, 25.4];

const PROFILES = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'standard', label: 'Standard' },
  { id: 'aggressive', label: 'Aggressive' },
  { id: 'finishing', label: 'Finishing' },
];

const MODES = [
  { id: 'rout', label: 'Routing' },
  { id: 'drill', label: 'Drilling' },
];

const OUTPUT_ROWS = [
  { key: 'spindleRpm', label: 'Spindle speed', fmt: rpmPair },
  { key: 'surfaceSpeedMMin', label: 'Surface speed', fmt: surfacePair, secondary: true },
  { key: 'cuttingFeedMmMin', label: 'Cutting feedrate', fmt: feedPair },
  { key: 'feedPerToothMm', label: 'Feed per tooth', fmt: fzPair, secondary: true },
  { key: 'leadInFeedMmMin', label: 'Lead-in feedrate', fmt: feedPair, noteKey: 'leadInOut' },
  { key: 'leadOutFeedMmMin', label: 'Lead-out feedrate', fmt: feedPair },
  { key: 'rampFeedMmMin', label: 'Ramp feedrate', fmt: feedPair, noteKey: 'plungeRamp' },
  { key: 'plungeFeedMmMin', label: 'Plunge feedrate', fmt: feedPair },
];

// One glyph per severity, for the whole app, kept in one place so a meaning
// cannot pick up a second drawing at a second call site. Severity is the kind
// here: every badge and banner already names what it measured in words, so the
// glyph carries how it is going, which is the part colour cannot carry on its
// own. Around 8% of men have red-green colour vision deficiency, and this
// calculator's readers are mostly men on a shop floor.
const STATUS_GLYPH = {
  success: 'lt-ic-success',
  warning: 'lt-ic-warning',
  danger: 'lt-ic-alert',
  info: 'lt-ic-info',
};

// buildChips() speaks in levels. The design system speaks in severities.
const CHIP_VARIANT = { cool: 'success', warm: 'warning', hot: 'danger', info: 'info' };

const CAP_LABELS = {
  ideal: 'Chip load target',
  vmax: 'Machine feed',
  pow: 'Spindle power',
  vac: 'Hold-down',
  corn: 'Corners',
};

const state = {
  mode: 'rout',
  material: 'mdf',
  toolType: 'compression',
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
};

// Which profiles each mode offers. Drilling has no finish pass: a hole cannot be
// skimmed, and no source publishes a finishing drill feed. Serving one from the
// band's low edge would be a fourth name for Gentle with a claim attached.
const profilesFor = (mode) => (mode === 'drill'
  ? PROFILES.filter((p) => p.id !== 'finishing')
  : PROFILES);

let data;
let presets;

const $ = (id) => document.getElementById(id);

init();

async function init() {
  // Both failures are conditions that stay true until someone fixes the
  // deployment, so each is a danger banner with an icon and words. They land
  // outside the #results live region, so they carry role="alert" themselves.
  try {
    data = await loadData();
  } catch (err) {
    $('app').innerHTML = alertHtml('danger', 'The page could not load its data files.',
      `${err.message}. Serve the page over HTTP, not from a file.`, 'alert');
    return;
  }
  const { errors } = validateData(data);
  if (errors.length) {
    $('app').innerHTML = alertHtml('danger',
      'The data failed its integrity check, so the calculator shows no numbers.',
      errors.slice(0, 5), 'alert');
    return;
  }
  presets = machinePresets(data.machines, data.rules);
  const genericIdx = presets.findIndex((p) => p.id.startsWith('Generic'));
  state.machineIdx = genericIdx >= 0 ? genericIdx : 0;
  state.firstCut = data.rules.first_cut?.default_on ?? false;
  readUrlState();
  buildForm();
  initChartTips();
  recalc();
}

function buildForm() {
  buildRadioGroup('mode', MODES, state.mode, (id) => {
    state.mode = id;
    state.profile = state.profileByMode[id] ?? 'standard';
    // The profile group has to be rebuilt before anything recalculates: drilling
    // offers three buttons where routing offers four, and the first-cut field's
    // visibility is computed from the profile.
    buildProfile();
    buildToolCards();
    fillDiameters();
    applyMode();
  });

  fillSelect($('material'), MATERIALS.map((m) => ({ value: m.id, label: m.label })), state.material);
  $('material').addEventListener('change', (e) => { state.material = e.target.value; recalc(); });

  buildToolCards();
  $('tooltype').addEventListener('change', (e) => {
    if (state.mode === 'drill') {
      state.drillTool = e.target.value;
      fillDiameters();
    } else {
      state.toolType = e.target.value;
    }
    recalc();
  });

  fillDiameters();
  $('diameter').addEventListener('change', (e) => {
    const v = Number(e.target.value);
    if (state.mode === 'drill') state.drillDiameterMm = v;
    else state.diameterMm = v;
    recalc();
  });

  // <lt-number-field> carries the metric base value on .value and reports it
  // on lt-change. It also owns its own error chip and aria-invalid, set in one
  // pass, so the two can never disagree.
  numberField('f-thickness', state.thicknessMm, (v) => {
    state.thicknessMm = Number.isFinite(v) ? v : 0;
  });

  numberField('f-flutes', state.flutes, (v) => {
    state.flutes = Number.isFinite(v) && v >= 1 ? Math.round(v) : 2;
  });

  numberField('f-rpm', state.rpm, (v) => {
    state.rpm = Number.isFinite(v) && v > 0 ? v : 18000;
  });

  const optionalMm = (id, key) => numberField(id, state[key], (v) => {
    state[key] = Number.isFinite(v) && v > 0 ? v : null;
  });
  optionalMm('f-doc', 'apMm');
  optionalMm('f-woc', 'aeMm');

  numberField('f-holedepth', state.holeDepthMm, (v) => {
    state.holeDepthMm = Number.isFinite(v) && v > 0 ? v : null;
  });
  // Empty means "run the published speed", which is how a value the source
  // chose beats a value the calculator would have to invent.
  optionalMm('f-drillrpm', 'drillRpm');

  const bank = $('drillbank');
  bank.checked = state.drillBank;
  bank.addEventListener('change', (e) => { state.drillBank = e.target.checked; recalc(); });

  fillSelect($('machine'), presets.map((p, i) => ({ value: String(i), label: p.label })), String(state.machineIdx));
  const machineNote = () => { $('machine-note').textContent = presets[state.machineIdx].notes ?? ''; };
  machineNote();
  $('machine').addEventListener('change', (e) => {
    state.machineIdx = Number(e.target.value);
    machineNote();
    applyMachineToAdvanced();
    recalc();
  });

  buildProfile();

  const fc = $('firstcut');
  fc.checked = state.firstCut;
  if (data.rules.first_cut) {
    $('firstcut-label').textContent = `First cut: run ${Math.round(data.rules.first_cut.factor * 100)}% of the chart feed until the cut proves good`;
  }
  fc.addEventListener('change', (e) => { state.firstCut = e.target.checked; recalc(); });

  buildAdvanced();
  applyMachineToAdvanced({ keepExisting: true });
}

// The card is the hit area and the radio inside it is a real .lt-check, so
// the control is visible and its focus ring is too. The old card hid the
// radio with opacity, which left a keyboard user with nothing to see.
function buildToolCards() {
  const drilling = state.mode === 'drill';
  const list = drilling ? DRILL_TOOLS : TOOL_TYPES;
  const chosen = drilling ? state.drillTool : state.toolType;
  $('tooltype').innerHTML = list.map((t) => `
    <label class="tool-card lt-check">
      <input type="radio" name="tooltype" value="${t.id}" ${t.id === chosen ? 'checked' : ''} aria-describedby="tool-${t.id}-hint">
      <span class="tool-body">
        <span class="tool-name">${escapeHtml(t.label)}</span>
        <span class="tool-hint" id="tool-${t.id}-hint">${escapeHtml(t.hint)}</span>
      </span>
    </label>`).join('');
}

// Changing the drill family re-fills the diameters and pulls the current value
// to the nearest one the family offers, so the select can never show a size the
// family does not publish.
function fillDiameters() {
  const drilling = state.mode === 'drill';
  const list = drilling ? (DRILL_DIAMETERS[state.drillTool] ?? []) : DIAMETERS;
  if (drilling && !list.includes(state.drillDiameterMm)) {
    state.drillDiameterMm = list.reduce((a, b) =>
      (Math.abs(b - state.drillDiameterMm) < Math.abs(a - state.drillDiameterMm) ? b : a), list[0]);
  }
  const current = drilling ? state.drillDiameterMm : state.diameterMm;
  fillSelect($('diameter'), list.map((d) => ({ value: String(d), label: diameterLabel(d) })), String(current));
  $('diameter-label').textContent = drilling ? 'Drill diameter' : 'Tool diameter';
}

// Wire one <lt-number-field>. The element carries the metric base value on
// .value whatever unit is on screen, and reports it on lt-change.
function numberField(hostId, initial, apply) {
  const el = $(hostId);
  if (initial != null) el.value = initial;
  el.addEventListener('lt-change', (e) => { apply(e.detail.value); recalc(); });
  return el;
}

// The profile picker, built the way <lt-unit-toggle> builds the same shape:
// role=radio buttons in an .lt-btn-group, primary when on and secondary when
// off, arrow keys per the APG radiogroup pattern. State is toggled on the
// existing buttons rather than re-rendered, so arrow-key focus survives.
// One builder for both segmented pickers on this page, so the mode switch cannot
// acquire a different keyboard contract from the profile picker. Returns the
// setter, which the caller uses to move the selection without a click.
function buildRadioGroup(hostId, options, selected, onPick) {
  const box = $(hostId);
  box.innerHTML = options.map((o) =>
    `<button type="button" role="radio" data-value="${escapeHtml(o.id)}" class="lt-btn">${escapeHtml(o.label)}</button>`).join('');
  const buttons = [...box.querySelectorAll('[data-value]')];

  const apply = (id, { fire = true } = {}) => {
    buttons.forEach((b) => {
      const on = b.dataset.value === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('lt-btn--primary', on);
      b.classList.toggle('lt-btn--secondary', !on);
    });
    if (fire) onPick(id);
  };

  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (!btn) return;
    apply(btn.dataset.value);
    // Clicking a button focuses it in Chrome and Firefox but not in Safari, and
    // a mode switch that hides the control the user was on would otherwise drop
    // focus to the document.
    btn.focus();
  });
  box.addEventListener('keydown', (e) => {
    const i = buttons.findIndex((b) => b.tabIndex === 0);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % buttons.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + buttons.length) % buttons.length;
    if (next === null) return;
    e.preventDefault();
    buttons[next].focus();
    apply(buttons[next].dataset.value);
  });

  apply(selected, { fire: false });
  return apply;
}

let setProfile = () => {};

function buildProfile() {
  const options = profilesFor(state.mode);
  if (!options.some((p) => p.id === state.profile)) state.profile = 'standard';
  setProfile = buildRadioGroup('profile', options, state.profile, (id) => {
    state.profile = id;
    state.profileByMode[state.mode] = id;
    // Finishing has no first-cut choice: the reduction guards a heavy proving
    // cut, and on a finish skim it drives the chip toward the rubbing floor.
    // The stored choice is kept and returns with the other profiles.
    applyMode({ recalculate: false });
    recalc();
  });
  applyMode({ recalculate: false });
}

// Which controls belong to the mode on screen. Everything hides with the hidden
// property, which depends on the app-layer correction in styles.css.
function applyMode({ recalculate = true } = {}) {
  const drilling = state.mode === 'drill';
  const show = (id, on) => { const el = $(id); if (el) el.hidden = !on; };

  show('f-flutes', !drilling);
  show('f-thickness', !drilling);
  show('f-doc', !drilling);
  show('f-woc', !drilling);
  show('f-rpm', !drilling);
  show('f-holedepth', drilling);
  show('f-drillrpm', drilling);
  show('drillbank-field', drilling);
  show('firstcut-field', !drilling && state.profile !== 'finishing');
  $('defects-rout').hidden = drilling;
  $('defects-drill').hidden = !drilling;
  $('tooltype-legend').textContent = drilling ? 'Drill type' : 'Tool type';

  for (const f of ADV_FIELDS) {
    const host = $(f.select ? `adv-${f.id}` : `advf-${f.id}`);
    const field = f.select ? host?.closest('.lt-field') : host;
    if (field) field.hidden = drilling && !DRILL_ADV.has(f.id);
  }
  if (recalculate) recalc();
}

// A plunge has no radial engagement, no corners and no lateral force, so the
// hold-down, corner, direction, flute-basis and timber-density fields have
// nothing to act on in drilling. Machine power and feed still do.
const DRILL_ADV = new Set(['spindleKw', 'breakpointRpm', 'feedMaxMMin']);

// The unit lives in the field's affix, never in the label. An all-caps label
// carrying "(m/s²)" is a label nobody finishes reading, and the affix puts the
// unit where the number is. What the placeholders used to say now reads as a
// hint, which is announced with the field instead of vanishing on first
// keystroke.
const ADV_FIELDS = [
  { id: 'fluteBasis', label: 'Flute count convention', select: [['total', 'Count total flutes (default)'], ['upcut_only', 'Count up-cut flutes only']], hint: 'The vendor charts give per-tooth values for the total flute count. Some engineers count only the up-cut flutes on up/down spirals. If that is your convention, the served feed runs conservative.' },
  { id: 'direction', label: 'Cut direction', select: [['climb', 'Climb (default, the safe higher-force assumption)'], ['conventional', 'Conventional (lower force, modelled for MDF, melamine and plywood only)']] },
  { id: 'upcutLengthMm', label: 'Compression up-cut length', measure: 'length', decimals: 1, step: 0.5, hint: 'Defaults to one tool diameter.' },
  { id: 'spindleKw', label: 'Spindle power', unit: 'kW', decimals: 1, step: 0.5, hint: 'Filled from the machine preset. Edit it to override.' },
  { id: 'breakpointRpm', label: 'Spindle breakpoint', measure: 'rotation', step: 500, hint: 'The rpm where constant torque becomes constant power. Typically 12000.' },
  { id: 'feedMaxMMin', label: 'Machine max feed', measure: 'speed', hint: 'Filled from the machine preset. Edit it to override.' },
  { id: 'accelMs2', label: 'Axis acceleration', unit: 'm/s²', decimals: 1, step: 0.1, hint: 'No OEM publishes this value. Derived tiers: hobby 0.4-1, light 1-3, heavy nesting 2-4.' },
  { id: 'footprintCm2', label: 'Part footprint on vacuum', unit: 'cm²', decimals: 0, step: 10, hint: (d) => `Enter a value to enable the hold-down check, for example ${d.rules.defaults.footprint_cm2}.` },
  { id: 'featureMm', label: 'Smallest feature length', measure: 'length', decimals: 1, step: 1, hint: (d) => `Enter a value to enable the corner check, for example ${d.rules.defaults.feature_mm}.` },
  { id: 'vacDPkPa', label: 'Vacuum ΔP achieved', unit: 'kPa', decimals: 0, step: 5, hint: (d) => `On a cut-open nested sheet, ${d.machines.vacuum.achieved_nested_flow_through_kpa[0]}-${d.machines.vacuum.achieved_nested_flow_through_kpa[1]} kPa is realistic. 83 kPa is a sealed pod, not a nest.` },
  // The symbol goes in the affix, not the label: .lt-field__label uppercases,
  // and CSS uppercase maps Greek mu to capital Mu, which renders as a Latin M.
  // "GRIP FACTOR M" is a different quantity.
  { id: 'vacMu', label: 'Grip factor', unit: 'μ', decimals: 2, step: 0.05, hint: 'Your own estimate, typically 0.4. No source publishes this value. It covers friction, air leakage and safety margin.' },
  { id: 'densityKgM3', label: 'Timber density', unit: 'kg/m³', decimals: 0, step: 10, hint: 'Solid timber only, for example 515 for radiata. The model is valid 287-1080 kg/m³ and warns outside that range.' },
];

function buildAdvanced() {
  const box = $('advanced-fields');
  const resolve = (v) => (typeof v === 'function' ? v(data) : v);
  const attr = (name, v) => (v == null || v === '' ? '' : ` ${name}="${escapeHtml(v)}"`);

  box.innerHTML = ADV_FIELDS.map((f) => {
    const hint = resolve(f.hint);
    if (f.select) {
      const hintId = `adv-${f.id}-hint`;
      const options = f.select.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
      return `<div class="lt-field">
        <label class="lt-field__label" for="adv-${f.id}">${escapeHtml(f.label)}</label>
        <select class="lt-select" id="adv-${f.id}"${hint ? ` aria-describedby="${hintId}"` : ''}>${options}</select>
        ${hint ? `<span class="lt-field__hint" id="${hintId}">${escapeHtml(hint)}</span>` : ''}
      </div>`;
    }
    // stepper, on every one. The element replaces <input type="number">
    // precisely because native spinners sit far below any sane target size,
    // and these buttons are its replacement at full --lt-control-height.
    // Dropping the native input without adding them leaves no way to nudge a
    // value at all.
    return `<lt-number-field id="advf-${f.id}" input-id="adv-${f.id}" stepper` +
      attr('label', f.label) + attr('measure', f.measure) + attr('unit', f.unit) +
      attr('decimals', f.decimals) + attr('step', f.step) + attr('hint', hint) +
      `></lt-number-field>`;
  }).join('');

  for (const f of ADV_FIELDS) {
    if (f.select) {
      const el = $(`adv-${f.id}`);
      if (state.adv[f.id] != null) el.value = String(state.adv[f.id]);
      el.addEventListener('change', (e) => { state.adv[f.id] = e.target.value; recalc(); });
    } else {
      const el = $(`advf-${f.id}`);
      if (state.adv[f.id] != null) el.value = state.adv[f.id];
      el.addEventListener('lt-change', (e) => {
        const v = e.detail.value;
        if (!Number.isFinite(v) || v <= 0) delete state.adv[f.id];
        else state.adv[f.id] = v;
        recalc();
      });
    }
  }
}

// Picking a machine fills the machine-derived advanced fields with that
// preset's real values, so the preset's contribution is visible and editable
// instead of hiding behind a "from machine" placeholder. Editing a field
// sticks until the machine changes again.
function applyMachineToAdvanced({ keepExisting = false } = {}) {
  const m = presets[state.machineIdx].machine;
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
    if (keepExisting && state.adv[id] != null) continue;
    state.adv[id] = v;
    const el = $(`advf-${id}`);
    if (el) el.value = v;
  }
}

function currentInput() {
  const mat = MATERIALS.find((m) => m.id === state.material);
  const preset = presets[state.machineIdx];
  const adv = state.adv;
  const machine = {
    spindleKw: adv.spindleKw ?? preset.machine.spindleKw,
    breakpointRpm: adv.breakpointRpm ?? preset.machine.breakpointRpm,
    rpmMax: preset.machine.rpmMax,
    rpmMin: preset.machine.rpmMin,
    feedMaxMmMin: adv.feedMaxMMin != null ? adv.feedMaxMMin * 1000 : preset.machine.feedMaxMmMin,
    accelMs2: adv.accelMs2 ?? preset.machine.accelMs2,
    vacuum: { mu: adv.vacMu ?? preset.machine.vacuum.mu, dPkPa: adv.vacDPkPa ?? preset.machine.vacuum.dPkPa },
  };
  return {
    material: mat.kcMaterial,
    materials: mat.data,
    materialsFallback: mat.fallback,
    toolType: state.toolType,
    diameterMm: state.diameterMm,
    thicknessMm: state.thicknessMm,
    profile: state.profile,
    firstCut: state.firstCut,
    machine,
    rpm: state.rpm,
    flutesTotal: state.flutes,
    fluteBasis: adv.fluteBasis,
    direction: adv.direction,
    apMm: state.apMm ?? undefined,
    aeMm: state.aeMm ?? undefined,
    upcutLengthMm: adv.upcutLengthMm,
    footprintCm2: adv.footprintCm2,
    featureMm: adv.featureMm,
    densityKgM3: adv.densityKgM3,
  };
}

function currentDrillInput() {
  const mat = MATERIALS.find((m) => m.id === state.material);
  const preset = presets[state.machineIdx];
  const adv = state.adv;
  return {
    drillType: drillSubfamilyFor(state.drillTool, state.drillDiameterMm, data.drills.entries),
    material: mat.kcMaterial,
    diameterMm: state.drillDiameterMm,
    holeDepthMm: state.holeDepthMm ?? undefined,
    rpm: state.drillRpm ?? undefined,
    profile: state.profile,
    drillBank: state.drillBank,
    machine: {
      spindleKw: adv.spindleKw ?? preset.machine.spindleKw,
      breakpointRpm: adv.breakpointRpm ?? preset.machine.breakpointRpm,
      rpmMax: preset.machine.rpmMax,
      rpmMin: preset.machine.rpmMin,
      feedMaxMmMin: adv.feedMaxMMin != null ? adv.feedMaxMMin * 1000 : preset.machine.feedMaxMmMin,
    },
  };
}

function recalc() {
  const result = state.mode === 'drill'
    ? calculateDrilling(currentDrillInput(), data)
    : calculate(currentInput(), data);
  render(result);
  writeUrlState();
}

// A banner, not a toast: every message here stays true until the numbers
// change, and a toast is gone in five seconds while the reader is looking at
// the workpiece.
//
// The results banners carry no role, deliberately: #results is already an
// aria-live region, so a role inside it would announce the same sentence
// twice. A banner inserted OUTSIDE that region is silent without one, which
// is why the two load-failure banners in init() pass role="alert".
//
// A body given as an array renders as a list, one item per line.
function alertHtml(variant, title, body = null, role = null) {
  const icon = `<svg class="lt-icon" aria-hidden="true" focusable="false"><use href="#${STATUS_GLYPH[variant]}"/></svg>`;
  const parts = [];
  if (title) parts.push(`<span class="lt-alert__title">${escapeHtml(title)}</span>`);
  if (Array.isArray(body)) parts.push(`<ul>${body.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`);
  else if (body) parts.push(`<p>${escapeHtml(body)}</p>`);
  const inner = title && parts.length === 1
    ? parts[0]
    : `<div class="lt-alert__body">${parts.join('')}</div>`;
  return `<div class="lt-alert lt-alert--${variant}"${role ? ` role="${role}"` : ''}>${icon}${inner}</div>`;
}

function render(result) {
  const box = $('results');
  const diag = $('diagnostics');
  if (result.status === 'refused') {
    box.innerHTML = alertHtml('danger', 'No number for this one.', result.refusal.reason);
    diag.innerHTML = '';
    return;
  }
  if (result.status === 'blocked') {
    box.innerHTML = alertHtml('warning', 'Blocked, not just warned.', result.block.reason);
    diag.innerHTML = '';
    return;
  }

  const drilling = result.meta.mode === 'drilling';

  // A description list, so the pairing of a label to its number is in the
  // markup rather than implied by two columns lining up.
  const rows = (drilling ? DRILL_OUTPUT_ROWS : OUTPUT_ROWS)
    .filter((row) => !row.when || row.when(result.outputs))
    .map((row) => {
      const pair = row.fmt(result.outputs[row.key]);
      const noteText = row.noteKey ? result.outputNotes[row.noteKey] : null;
      const note = noteText ? `<dd class="row-note">${escapeHtml(noteText)}</dd>` : '';
      return `<div class="out-row${row.secondary ? ' secondary' : ''}">
        <dt class="out-label">${row.label}</dt>
        <dd class="out-vals"><span class="metric">${pair.metric}</span>${pair.imperial ? `<span class="imperial">${pair.imperial}</span>` : ''}</dd>
        ${note}
      </div>`;
    }).join('');

  // The limit line reports on the feed cap alone. In drilling a cut can have no
  // binding cap while the machine cannot reach the drill's speed at all, and a
  // green tick above that warning claims a soundness the cut does not have. So
  // the success tone is reserved for a cut with nothing else to say about it.
  const limitVariant = result.limit.binding === 'ideal'
    ? (drilling && result.warnings.length ? 'info' : 'success')
    : (result.limit.binding === 'pow' || result.limit.binding === 'vac') ? 'danger' : 'info';

  // A warning asks for judgement, so it is a banner. A note is provenance
  // context, and there can be nine of them at once when most published charts
  // hold no value at the chosen diameter. Nine banners is a stream, and a
  // stream belongs in the page rather than in a stack of banners that drowns
  // the numbers above it.
  //
  // The banner pile itself is bounded: the limit line plus at most three
  // banners. Up to three warnings render one each. Four or more fold into
  // one banner carrying a list, at the worst severity among them, because
  // past about three the correct visual has become a stream. Test SC30
  // sweeps the input space to hold the ceiling at four.
  // Routing warnings carry no severity of their own, so their two loud codes are
  // named here. Drilling's core sets a severity on every warning, because it is
  // the half that knows whether a condition is quiet.
  const isDanger = (w) => w.severity === 'danger'
    || w.code === 'chip_plough' || w.code === 'chip_below_min';
  const warnings = result.warnings.length > 3
    ? alertHtml(
      result.warnings.some(isDanger) ? 'danger' : 'warning',
      `${result.warnings.length} things to check on this cut`,
      result.warnings.map((w) => w.message),
    )
    : result.warnings.map((w) => alertHtml(isDanger(w) ? 'danger' : 'warning', null, w.message)).join('');

  const notes = result.notes.length
    ? `<div class="notes">
        <h3 class="notes-title">Notes on this calculation</h3>
        <ul>${result.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>
      </div>`
    : '';

  box.innerHTML = `
    ${alertHtml(limitVariant, result.limit.message)}
    <dl class="out-card">${rows}</dl>
    ${warnings}
    ${notes}
    ${drilling ? drillFeedChart(result) : ladderHtml(result)}
  `;

  if (drilling) {
    diag.innerHTML = drillSpeedChart(result);
    labelChartRows();
    return;
  }

  const chips = buildChips(result);
  const caps = result.limit.caps;
  const shown = Object.entries(caps).filter(([, v]) => v !== undefined);
  const maxCap = Math.max(...shown.map(([, v]) => v));
  const finalV = result.outputs.cuttingFeedMmMin;

  // Every row carries its own tip and its own accessible name, so the hover
  // layer only ever repeats what focus and the table already give.
  const cascRows = shown.map(([k, v]) => {
    const na = k !== 'ideal' && k !== result.limit.binding && v > finalV * 2;
    const binds = k === result.limit.binding;
    const w = Math.max(2, Math.min(100, (v / maxCap) * 100));
    const pair = feedPair(v);
    const verdict = binds ? 'This is the cap that sets the feed.'
      : na ? `Far above the served feed, so it cannot bind.`
      : `Above the served ${feedPair(finalV).metric}, so it does not bind.`;
    return {
      label: CAP_LABELS[k], metric: pair.metric, imperial: pair.imperial, verdict,
      html: `<div class="casc-row${binds ? ' is-bind' : ''}${na ? ' na' : ''}"
        data-tip-value="${escapeHtml(pair.metric)}"
        data-tip-label="${escapeHtml(CAP_LABELS[k])}"
        data-tip-note="${escapeHtml(verdict)}" tabindex="-1">
        <span class="casc-label">${CAP_LABELS[k]}</span>
        <span class="casc-bar"><span class="casc-fill${binds ? ' lt-chart-emphasis' : ''}" style="width:${w}%"></span></span>
        <span class="casc-val">${pair.metric}<span class="imperial">${pair.imperial}</span></span>
      </div>`,
    };
  });

  const badges = chips.map((c) => {
    const variant = CHIP_VARIANT[c.level];
    return `<span class="lt-badge lt-badge--${variant}">` +
      `<svg aria-hidden="true" focusable="false"><use href="#${STATUS_GLYPH[variant]}"/></svg>` +
      `${escapeHtml(c.text)}</span>`;
  }).join('');

  diag.innerHTML = `
    <h2>What is going on in this cut</h2>
    <div class="lt-row">${badges}</div>
    <div class="cascade">${cascRows.map((r) => r.html).join('')}</div>
    ${tableTwin('What could cap the feed', ['Limit', 'Feedrate', 'Does it bind?'],
      cascRows.map((r) => [r.label, `${r.metric} (${r.imperial})`, r.verdict]))}
  `;

  labelChartRows();
}

// The table-view twin. Every chart on this page shows its values as text
// already, so this is not the only way to read a number -- it is the
// WCAG-clean equivalent, with real headers and a real reading order, and it
// is what a tooltip is allowed to enhance rather than gate. Collapsed by
// default so it costs no height, and a <details> gives the keyboard and the
// announced state for free.
function tableTwin(caption, headers, rows) {
  const head = headers.map((h) => `<th scope="col">${escapeHtml(h)}</th>`).join('');
  const body = rows.map((cells) => `<tr>${cells.map((c, i) =>
    i === 0 ? `<th scope="row">${escapeHtml(c)}</th>` : `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('');
  return `<details class="table-twin">
    <summary>Show ${escapeHtml(caption.toLowerCase())} as a table</summary>
    <div class="lt-table-wrap">
      <table class="lt-table lt-table--zebra">
        <caption class="lt-sr-only">${escapeHtml(caption)}</caption>
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  </details>`;
}

// ---------------------------------------------------------------------------
// The chart hover layer.
//
// It ENHANCES and never gates. Every number a tip shows is already visible text
// beside its own bar, and every tip sentence is also the third column of that
// chart's table twin, so a reader who never hovers loses nothing.
//
// Chart labels are vendor names read out of the data files, so the tip is built
// with textContent and never by concatenating markup.
//
// Keyboard parity without fifteen tab stops: each chart is ONE tab stop and the
// arrow keys move a roving tabindex between its rows, the same shape as the
// profile radiogroup above. Focus shows exactly what hover shows.
// ---------------------------------------------------------------------------
const TIP_HOSTS = ['results', 'diagnostics'];

function initChartTips() {
  const tip = $('chart-tip');
  let current = null;

  const show = (row) => {
    if (current === row) return;
    current = row;
    const line = (cls, text) => {
      const el = document.createElement('span');
      el.className = cls;
      el.textContent = text;
      return el;
    };
    // Values lead, labels follow: the reader has the row and wants the number.
    tip.replaceChildren(
      line('chart-tip__value', row.dataset.tipValue),
      line('chart-tip__label', row.dataset.tipLabel),
      line('chart-tip__note', row.dataset.tipNote),
    );
    tip.hidden = false;
    const r = row.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 8;
    tip.style.left = `${Math.min(Math.max(gap, r.left), window.innerWidth - t.width - gap)}px`;
    tip.style.top = `${r.top > t.height + gap * 2 ? r.top - t.height - gap : r.bottom + gap}px`;
  };

  const hide = () => { current = null; tip.hidden = true; };

  // Focus outranks a pointer that has not moved. pointerover fires again when
  // the page scrolls a different row under a stationary pointer, so arrowing
  // down a chart with the mouse resting on it tore the tip away to whatever
  // the mouse happened to be over. pointermove only fires when the pointer
  // really moves, and the lock covers the rest.
  let lockedToFocus = false;

  for (const id of TIP_HOSTS) {
    const host = $(id);
    host.addEventListener('pointermove', (e) => {
      lockedToFocus = false;
      const row = e.target.closest('[data-tip-value]');
      row ? show(row) : hide();
    });
    host.addEventListener('pointerleave', () => { if (!lockedToFocus) hide(); });
    host.addEventListener('focusin', (e) => {
      const row = e.target.closest('[data-tip-value]');
      if (!row) return;
      lockedToFocus = true;
      show(row);
    });
    host.addEventListener('focusout', () => { lockedToFocus = false; hide(); });
    host.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { hide(); return; }
      const row = e.target.closest('[data-tip-value]');
      if (!row) return;
      const rows = [...row.parentElement.querySelectorAll('[data-tip-value]')];
      const i = rows.indexOf(row);
      let next = null;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = Math.min(i + 1, rows.length - 1);
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = Math.max(i - 1, 0);
      if (e.key === 'Home') next = 0;
      if (e.key === 'End') next = rows.length - 1;
      if (next === null) return;
      e.preventDefault();
      rows.forEach((r, n) => { r.tabIndex = n === next ? 0 : -1; });
      rows[next].focus();
    });
  }
}

// Run after every render, because render() replaces the markup the rows live
// in. The accessible name is set here rather than in the template so the one
// set of data attributes is the single source for the tip, the name and the
// table twin.
function labelChartRows() {
  for (const id of TIP_HOSTS) {
    for (const group of $(id).querySelectorAll('.cascade, .ladder')) {
      const rows = [...group.querySelectorAll('[data-tip-value]')];
      rows.forEach((row, i) => {
        row.tabIndex = i === 0 ? 0 : -1;
        row.setAttribute('aria-label',
          `${row.dataset.tipLabel}. ${row.dataset.tipValue}. ${row.dataset.tipNote}`);
      });
    }
  }
}

// The chart ladder: every published chart for this material and tool on one
// chip-load scale, the serving chart highlighted, with a marker at the feed
// per tooth the page serves. This replaces the old prose context note.
function ladderHtml(result) {
  const m = result.meta;
  const serving = (m.servingBands ?? []).map((b) => ({ ...b, serves: true }));
  const context = (m.contextBands ?? []).map((b) => ({ ...b, serves: false }));
  const all = [...serving, ...context].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  if (!all.length) return '';
  // The marker draws the chip on the chart's own basis. For the roughing
  // charts that is the EFFECTIVE chip: chip thinning raises the programmed
  // feed above the band on a light cut and the first-cut reduction lowers it
  // below, and marking the programmed value made the serving chart claim a
  // fit it did not have whenever either applied (found 2026-08-29). In
  // Finishing nothing is compensated, so fzEff is the programmed chip, which
  // is the basis the finisher chart publishes.
  const fz = m.fzEff;
  // In Finishing nothing is compensated, so the marker is the programmed
  // chip and the words must match the legend. Everywhere else it is the
  // effective chip. One name for one quantity: rows, header and legend.
  const chip = m.finishing ? 'programmed chip' : 'effective chip';
  const lo = Math.min(...all.map((b) => b.lo), fz);
  const hi = Math.max(...all.map((b) => b.hi), fz);
  const span = hi - lo || 1;
  const pos = (v) => (((v - lo) / span) * 100).toFixed(1);
  // The bar's position on the shared scale is the one thing this chart shows
  // that its own text does not, so that is what the tip says: whether the
  // effective chip falls inside this chart's published band, and which way
  // out it sits when it does not.
  const verdictFor = (b) => {
    // A tolerance, because a value that IS the band edge can land an ulp
    // off it on the way through the feed maths.
    if (b.serves) {
      if (fz < b.lo - 1e-6) return `Sets your numbers. The ${chip} ${fz.toFixed(3)} sits below this band. A depth derate, the first-cut reduction or a machine cap holds the feed down.`;
      if (fz > b.hi + 1e-6) return `Sets your numbers. The ${chip} ${fz.toFixed(3)} sits above this band.`;
      return `Sets your numbers. The ${chip} ${fz.toFixed(3)} sits in this band.`;
    }
    if (fz < b.lo) return `The ${chip} is below this band, by ${(b.lo - fz).toFixed(3)} mm/tooth.`;
    if (fz > b.hi) return `The ${chip} is above this band, by ${(fz - b.hi).toFixed(3)} mm/tooth.`;
    return `The ${chip} falls inside this band, but this chart does not serve it.`;
  };

  const rowsHtml = all.map((b) => {
    const left = Number(pos(b.lo));
    const width = Math.max(Number(pos(b.hi)) - left, 0.8);
    const tag = b.machineClass ? ' <em class="ladder-tag">10 hp+ charts</em>' : '';
    const range = `${b.lo.toFixed(3)}–${b.hi.toFixed(3)}`;
    return `<div class="ladder-row${b.serves ? ' is-serving' : ''}" tabindex="-1"
      data-tip-value="${range} mm/tooth"
      data-tip-label="${escapeHtml(b.label)}${b.machineClass ? ' (10 hp+ charts)' : ''}"
      data-tip-note="${escapeHtml(verdictFor(b))}">
      <span class="ladder-label">${escapeHtml(b.label)}${tag}</span>
      <span class="ladder-track">
        <span class="ladder-bar${b.serves ? ' lt-chart-emphasis' : ''}" style="left:${left}%;width:${width.toFixed(1)}%"></span>
        <span class="ladder-mark" style="left:${pos(fz)}%"></span>
      </span>
      <span class="ladder-range">${range}</span>
    </div>`;
  }).join('');

  const twin = tableTwin('Every published chart for this cut',
    ['Chart', 'Published band (mm/tooth)', `Against the ${chip}`],
    all.map((b) => [
      b.label + (b.machineClass ? ' (10 hp+ charts)' : ''),
      `${b.lo.toFixed(3)}–${b.hi.toFixed(3)}`,
      verdictFor(b),
    ]));

  return `<div class="ladder">
    <div class="ladder-head"><h2>Every published chart for this cut</h2><span class="ladder-units">mm/tooth</span></div>
    ${rowsHtml}
    <p class="ladder-legend">The highlighted chart sets your numbers. The dotted line marks ${m.finishing ? 'the programmed chip per tooth' : 'the effective chip this cut delivers'}, ${fz.toFixed(3)} mm/tooth. The other charts are context, and their numbers do not serve.</p>
    ${twin}
  </div>`;
}

// Drilling cannot use the chart ladder: that chart exists to show which of many
// competing charts won, and its whole content is chart identity, which decision 7
// removes. These two take its class family instead, so they inherit the geometry
// smoke-measure.py already pins and add no new CSS.
//
// Chart one: the published feed range at the served speed, with the three
// profiles on it. It answers the question the numbers cannot: how much room is
// there either side of the setting you picked.
function drillFeedChart(result) {
  const m = result.meta;
  const b = m.bandServed;
  const served = m.fnDeliv;
  // The chart's own marked point belongs to the speed it was printed at. Drawn
  // against a band read at some other speed it compares two different things,
  // and at a speed outside the published range it lands past the whole band and
  // reads as a target. So it appears only at the speed it was printed for.
  const marked = (m.workedExample && m.workedExample.rpm === result.outputs.spindleRpm)
    ? m.workedExample.fn_mm_rev * m.materialFactor
    : null;
  const lo = Math.min(b.fnMin, served, marked ?? Infinity);
  const hi = Math.max(b.fnMax, served, marked ?? -Infinity);
  const span = hi - lo || 1;
  const pos = (v) => (((v - lo) / span) * 100).toFixed(1);

  const positions = { gentle: b.fnMin, standard: b.fnMin + m.standardPosition * (b.fnMax - b.fnMin), aggressive: b.fnMax };
  const rows = profilesFor('drill').map((p) => {
    const fn = positions[p.id];
    const on = p.id === m.profile;
    const feed = feedPair(fn * result.outputs.spindleRpm);
    const verdict = on
      ? `The setting you picked. It plunges at ${feed.metric}.`
      : `${p.label} would plunge at ${feed.metric}.`;
    const left = Number(pos(b.fnMin));
    const width = Math.max(Number(pos(fn)) - left, 0.8);
    return {
      label: p.label, value: `${fn.toFixed(2)} mm/rev`, verdict, feed: feed.metric,
      html: `<div class="ladder-row${on ? ' is-serving' : ''}" tabindex="-1"
        data-tip-value="${fn.toFixed(2)} mm/rev"
        data-tip-label="${escapeHtml(p.label)}"
        data-tip-note="${escapeHtml(verdict)}">
        <span class="ladder-label">${p.label}</span>
        <span class="ladder-track">
          <span class="ladder-bar${on ? ' lt-chart-emphasis' : ''}" style="left:${left}%;width:${width.toFixed(1)}%"></span>
          ${marked != null ? `<span class="ladder-mark" style="left:${pos(marked)}%"></span>` : ''}
        </span>
        <span class="ladder-range">${fn.toFixed(2)}</span>
      </div>`,
    };
  });

  const legend = marked != null
    ? `The highlighted bar is the setting you picked. The dotted line marks the operating point the published chart itself prints, ${marked.toFixed(2)} mm/rev. The bars run from the slowest published feed, which is the point below which the drill rubs instead of cutting.`
    : 'The highlighted bar is the setting you picked. The bars run from the slowest published feed, which is the point below which the drill rubs instead of cutting.';

  return `<div class="ladder">
    <div class="ladder-head"><h2>The published feed range at this speed</h2><span class="ladder-units">mm/rev</span></div>
    ${rows.map((r) => r.html).join('')}
    <p class="ladder-legend">${legend}</p>
    ${tableTwin('The published feed range at this speed', ['Setting', 'Feed per rev', 'What it means'],
      rows.map((r) => [r.label, r.value, r.verdict]))}
  </div>`;
}

// Chart two: the drill's published speed range against the machine's own, with
// the served speed marked on both. It turns the low-speed mismatch from a
// sentence into a picture.
function drillSpeedChart(result) {
  const m = result.meta;
  const preset = presets[state.machineIdx].machine;
  const bank = m.drillBank;
  const machineLo = bank ? null : preset.rpmMin;
  const machineHi = bank ? null : preset.rpmMax;

  const bars = [{ label: 'This drill', lo: m.rpmRangeMin, hi: m.rpmRangeMax, on: true }];
  if (machineLo != null || machineHi != null) {
    bars.push({ label: 'This machine', lo: machineLo ?? m.rpmRangeMin, hi: machineHi ?? m.rpmRangeMax, on: false });
  }
  const served = result.outputs.spindleRpm;
  const lo = Math.min(...bars.map((x) => x.lo), served);
  const hi = Math.max(...bars.map((x) => x.hi), served);
  const span = hi - lo || 1;
  const pos = (v) => (((v - lo) / span) * 100).toFixed(1);

  const rows = bars.map((x) => {
    const range = `${rpmPair(x.lo).metric} to ${rpmPair(x.hi).metric}`;
    const inside = served >= x.lo && served <= x.hi;
    const verdict = x.on
      ? (inside ? `The served speed sits inside what this drill is published for.` : `The served speed sits outside what this drill is published for, so the feed holds at the nearest published value.`)
      : (inside ? 'The served speed is inside what this machine is rated for.' : 'The served speed is outside what this machine is rated for.');
    const left = Number(pos(x.lo));
    const width = Math.max(Number(pos(x.hi)) - left, 0.8);
    return {
      label: x.label, range, verdict,
      html: `<div class="ladder-row${x.on ? ' is-serving' : ''}" tabindex="-1"
        data-tip-value="${escapeHtml(range)}"
        data-tip-label="${escapeHtml(x.label)}"
        data-tip-note="${escapeHtml(verdict)}">
        <span class="ladder-label">${x.label}</span>
        <span class="ladder-track">
          <span class="ladder-bar${x.on ? ' lt-chart-emphasis' : ''}" style="left:${left}%;width:${width.toFixed(1)}%"></span>
          <span class="ladder-mark" style="left:${pos(served)}%"></span>
        </span>
        <span class="ladder-range">${x.lo}–${x.hi}</span>
      </div>`,
    };
  });

  return `<div class="ladder">
    <div class="ladder-head"><h2>Speed range for this drill</h2><span class="ladder-units">rpm</span></div>
    ${rows.map((r) => r.html).join('')}
    <p class="ladder-legend">The dotted line marks the ${rpmPair(served).metric} being served. ${bank ? 'On a drill bank the router spindle range does not apply, so it is not drawn.' : ''}</p>
    ${tableTwin('Speed range for this drill', ['Range', 'From and to', 'Where the served speed sits'],
      rows.map((r) => [r.label, r.range, r.verdict]))}
  </div>`;
}

function fillSelect(el, options, selected) {
  el.innerHTML = options.map((o) => `<option value="${escapeHtml(o.value)}" ${o.value === selected ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function writeUrlState() {
  const q = new URLSearchParams({
    k: state.mode,
    m: state.material, mc: String(state.machineIdx), p: state.profile,
  });
  if (state.mode === 'drill') {
    q.set('dt', state.drillTool);
    q.set('dd', String(state.drillDiameterMm));
    if (state.holeDepthMm != null) q.set('hd', String(state.holeDepthMm));
    if (state.drillRpm != null) q.set('dr', String(state.drillRpm));
    if (state.drillBank) q.set('db', '1');
  } else {
    q.set('t', state.toolType);
    q.set('d', String(state.diameterMm));
    q.set('f', String(state.flutes));
    q.set('th', String(state.thicknessMm));
    q.set('r', String(state.rpm));
    q.set('fc', state.firstCut ? '1' : '0');
    if (state.apMm != null) q.set('ap', String(state.apMm));
    if (state.aeMm != null) q.set('ae', String(state.aeMm));
  }
  for (const [k, v] of Object.entries(state.adv)) q.set(`a_${k}`, String(v));
  history.replaceState(null, '', `?${q}`);
}

function readUrlState() {
  const q = new URLSearchParams(location.search);
  // The mode is read first, because each mode validates the profile and the
  // diameter against its own list. Every link shared before drilling existed
  // carries no mode key at all, and must keep reading as routing.
  if (q.get('k') && MODES.some((x) => x.id === q.get('k'))) state.mode = q.get('k');
  if (q.get('dt') && DRILL_TOOLS.some((x) => x.id === q.get('dt'))) state.drillTool = q.get('dt');
  if (q.get('dd') && (DRILL_DIAMETERS[state.drillTool] ?? []).includes(Number(q.get('dd')))) state.drillDiameterMm = Number(q.get('dd'));
  if (q.get('hd') && Number(q.get('hd')) > 0) state.holeDepthMm = Number(q.get('hd'));
  if (q.get('dr') && Number(q.get('dr')) > 0) state.drillRpm = Number(q.get('dr'));
  if (q.get('db') != null) state.drillBank = q.get('db') === '1';
  if (q.get('m') && MATERIALS.some((x) => x.id === q.get('m'))) state.material = q.get('m');
  if (q.get('t') && TOOL_TYPES.some((x) => x.id === q.get('t'))) state.toolType = q.get('t');
  if (q.get('d') && DIAMETERS.includes(Number(q.get('d')))) state.diameterMm = Number(q.get('d'));
  if (q.get('th') && Number(q.get('th')) > 0) state.thicknessMm = Number(q.get('th'));
  if (q.get('f') && Number(q.get('f')) >= 1) state.flutes = Math.round(Number(q.get('f')));
  if (q.get('r') && Number(q.get('r')) > 0) state.rpm = Number(q.get('r'));
  if (q.get('ap') && Number(q.get('ap')) > 0) state.apMm = Number(q.get('ap'));
  if (q.get('ae') && Number(q.get('ae')) > 0) state.aeMm = Number(q.get('ae'));
  if (q.get('mc') && presets[Number(q.get('mc'))]) state.machineIdx = Number(q.get('mc'));
  // A finishing link opened in drilling falls back to Standard: drilling offers
  // no finish pass, so that button does not exist there.
  if (q.get('p') && profilesFor(state.mode).some((x) => x.id === q.get('p'))) state.profile = q.get('p');
  state.profileByMode[state.mode] = state.profile;
  if (q.get('fc') != null) state.firstCut = q.get('fc') === '1';
  for (const [k, v] of q.entries()) {
    if (k.startsWith('a_')) {
      const id = k.slice(2);
      const f = ADV_FIELDS.find((x) => x.id === id);
      if (!f) continue;
      if (f.select) {
        if (f.select.some(([val]) => val === v)) state.adv[id] = v;
      } else {
        const n = Number(v);
        if (Number.isFinite(n) && n > 0) state.adv[id] = n;
      }
    }
  }
}
