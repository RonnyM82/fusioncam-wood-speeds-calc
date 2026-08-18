import { loadData } from '../data/load-browser.js';
import { validateData } from '../data/validate.js';
import { machinePresets } from '../data/presets.js';
import { calculate } from '../core/calculate.js';
import { buildChips } from '../core/diagnostics.js';
import { feedPair, rpmPair, surfacePair, fzPair, diameterLabel } from './format.js';

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

const CAP_LABELS = {
  ideal: 'Chip load target',
  vmax: 'Machine feed',
  pow: 'Spindle power',
  vac: 'Hold-down',
  corn: 'Corners',
};

const state = {
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
};

let data;
let presets;

const $ = (id) => document.getElementById(id);

init();

async function init() {
  try {
    data = await loadData();
  } catch (err) {
    $('app').innerHTML = `<p class="error-card">The page could not load its data files: ${escapeHtml(err.message)}. Serve the page over HTTP, not from a file.</p>`;
    return;
  }
  const { errors } = validateData(data);
  if (errors.length) {
    $('app').innerHTML = `<p class="error-card">The data failed its integrity check, so the calculator shows no numbers:<br>${errors.slice(0, 5).map(escapeHtml).join('<br>')}</p>`;
    return;
  }
  presets = machinePresets(data.machines, data.rules);
  const genericIdx = presets.findIndex((p) => p.id.startsWith('Generic'));
  state.machineIdx = genericIdx >= 0 ? genericIdx : 0;
  state.firstCut = data.rules.first_cut?.default_on ?? false;
  readUrlState();
  buildForm();
  recalc();
}

function buildForm() {
  fillSelect($('material'), MATERIALS.map((m) => ({ value: m.id, label: m.label })), state.material);
  $('material').addEventListener('change', (e) => { state.material = e.target.value; recalc(); });

  const toolBox = $('tooltype');
  toolBox.innerHTML = TOOL_TYPES.map((t) => `
    <label class="tool-card">
      <input type="radio" name="tooltype" value="${t.id}" ${t.id === state.toolType ? 'checked' : ''}>
      <span class="tool-name">${t.label}</span>
      <span class="tool-hint">${t.hint}</span>
    </label>`).join('');
  toolBox.addEventListener('change', (e) => { state.toolType = e.target.value; recalc(); });

  fillSelect($('diameter'), DIAMETERS.map((d) => ({ value: String(d), label: diameterLabel(d) })), String(state.diameterMm));
  $('diameter').addEventListener('change', (e) => { state.diameterMm = Number(e.target.value); recalc(); });

  $('thickness').value = state.thicknessMm;
  $('thickness').addEventListener('input', (e) => { state.thicknessMm = Number(e.target.value); recalc(); });

  $('flutes').value = state.flutes;
  $('flutes').addEventListener('input', (e) => {
    const n = Number(e.target.value);
    state.flutes = Number.isFinite(n) && n >= 1 ? Math.round(n) : 2;
    recalc();
  });

  $('rpm').value = state.rpm;
  $('rpm').addEventListener('input', (e) => {
    const n = Number(e.target.value);
    state.rpm = Number.isFinite(n) && n > 0 ? n : 18000;
    recalc();
  });

  const optionalMm = (id, key) => {
    if (state[key] != null) $(id).value = state[key];
    $(id).addEventListener('input', (e) => {
      const n = Number(e.target.value);
      state[key] = e.target.value !== '' && Number.isFinite(n) && n > 0 ? n : null;
      recalc();
    });
  };
  optionalMm('doc', 'apMm');
  optionalMm('woc', 'aeMm');

  fillSelect($('machine'), presets.map((p, i) => ({ value: String(i), label: p.label })), String(state.machineIdx));
  const machineNote = () => { $('machine-note').textContent = presets[state.machineIdx].notes ?? ''; };
  machineNote();
  $('machine').addEventListener('change', (e) => {
    state.machineIdx = Number(e.target.value);
    machineNote();
    applyMachineToAdvanced();
    recalc();
  });

  const profBox = $('profile');
  profBox.innerHTML = PROFILES.map((p) => `
    <label class="seg ${p.id === state.profile ? 'is-active' : ''}">
      <input type="radio" name="profile" value="${p.id}" ${p.id === state.profile ? 'checked' : ''}>${p.label}
    </label>`).join('');
  profBox.addEventListener('change', (e) => {
    state.profile = e.target.value;
    profBox.querySelectorAll('.seg').forEach((s) => s.classList.toggle('is-active', s.querySelector('input').value === state.profile));
    recalc();
  });

  const fc = $('firstcut');
  fc.checked = state.firstCut;
  if (data.rules.first_cut) {
    $('firstcut-label').textContent = `First cut: run ${Math.round(data.rules.first_cut.factor * 100)}% of the chart feed until the cut proves good`;
  }
  fc.addEventListener('change', (e) => { state.firstCut = e.target.checked; recalc(); });

  buildAdvanced();
  applyMachineToAdvanced({ keepExisting: true });
}

const ADV_FIELDS = [
  { id: 'fluteBasis', label: 'Flute count convention', select: [['total', 'Count total flutes (default)'], ['upcut_only', 'Count up-cut flutes only']], hint: 'The vendor charts give per-tooth values for the total flute count. Some engineers count only the up-cut flutes on up/down spirals. If that is your convention, the served feed runs conservative.' },
  { id: 'direction', label: 'Cut direction', select: [['climb', 'Climb (default, the safe higher-force assumption)'], ['conventional', 'Conventional (lower force, modelled for MDF, melamine and plywood only)']] },
  { id: 'upcutLengthMm', label: 'Compression up-cut section length (mm)', ph: '1× diameter' },
  { id: 'spindleKw', label: 'Spindle power (kW)', ph: 'from machine' },
  { id: 'breakpointRpm', label: 'Spindle breakpoint (rpm)', ph: '12000' },
  { id: 'feedMaxMMin', label: 'Machine max feed (m/min)', ph: 'from machine' },
  { id: 'accelMs2', label: 'Axis acceleration (m/s²)', ph: 'from machine', hint: 'No OEM publishes this value. Derived tiers: hobby 0.4-1, light 1-3, heavy nesting 2-4.' },
  { id: 'footprintCm2', label: 'Part footprint on vacuum (cm²)', ph: (d) => `e.g. ${d.rules.defaults.footprint_cm2}`, hint: 'Enter a value to enable the hold-down check.' },
  { id: 'featureMm', label: 'Smallest feature length (mm)', ph: (d) => `e.g. ${d.rules.defaults.feature_mm}`, hint: 'Enter a value to enable the corner check.' },
  { id: 'vacDPkPa', label: 'Vacuum ΔP achieved (kPa)', ph: (d) => String(d.machines.vacuum.default_kpa), hint: (d) => `On a cut-open nested sheet, ${d.machines.vacuum.achieved_nested_flow_through_kpa[0]}-${d.machines.vacuum.achieved_nested_flow_through_kpa[1]} kPa is realistic. 83 kPa is a sealed pod, not a nest.` },
  { id: 'vacMu', label: 'Grip factor μ', ph: '0.4', hint: 'Your own estimate. No source publishes this value. It covers friction, air leakage and safety margin.' },
  { id: 'densityKgM3', label: 'Timber density (kg/m³)', ph: 'e.g. 515 radiata', hint: 'Solid timber only. The model is valid 287-1080 kg/m³ and warns outside that range.' },
];

function buildAdvanced() {
  const box = $('advanced-fields');
  const resolve = (v) => (typeof v === 'function' ? v(data) : v);
  box.innerHTML = ADV_FIELDS.map((f) => {
    const input = f.select
      ? `<select id="adv-${f.id}">${f.select.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`
      : `<input id="adv-${f.id}" type="number" inputmode="decimal" step="any" placeholder="${escapeHtml(resolve(f.ph))}">`;
    const hint = resolve(f.hint);
    return `<label class="adv-field">${f.label}${input}${hint ? `<span class="hint">${escapeHtml(hint)}</span>` : ''}</label>`;
  }).join('');
  for (const f of ADV_FIELDS) {
    if (state.adv[f.id] != null) $(`adv-${f.id}`).value = String(state.adv[f.id]);
    $(`adv-${f.id}`).addEventListener(f.select ? 'change' : 'input', (e) => {
      const v = e.target.value;
      if (f.select) {
        state.adv[f.id] = v;
      } else {
        const n = Number(v);
        if (v === '' || !Number.isFinite(n) || n <= 0) delete state.adv[f.id];
        else state.adv[f.id] = n;
      }
      recalc();
    });
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
    const el = $(`adv-${id}`);
    if (el) el.value = String(v);
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

function recalc() {
  const input = currentInput();
  const result = calculate(input, data);
  render(result);
  writeUrlState();
}

function render(result) {
  const box = $('results');
  const diag = $('diagnostics');
  if (result.status === 'refused') {
    box.innerHTML = `<div class="error-card"><strong>No number for this one.</strong><p>${escapeHtml(result.refusal.reason)}</p></div>`;
    diag.innerHTML = '';
    return;
  }
  if (result.status === 'blocked') {
    box.innerHTML = `<div class="block-card"><strong>Blocked, not just warned.</strong><p>${escapeHtml(result.block.reason)}</p></div>`;
    diag.innerHTML = '';
    return;
  }

  const rows = OUTPUT_ROWS.map((row) => {
    const pair = row.fmt(result.outputs[row.key]);
    const note = row.noteKey ? `<div class="row-note">${escapeHtml(result.outputNotes[row.noteKey])}</div>` : '';
    return `<div class="out-row ${row.secondary ? 'secondary' : ''}">
      <div class="out-label">${row.label}</div>
      <div class="out-vals"><span class="metric">${pair.metric}</span>${pair.imperial ? `<span class="imperial">${pair.imperial}</span>` : ''}</div>
    </div>${note}`;
  }).join('');

  const limitClass = result.limit.binding === 'ideal' ? 'good' : (result.limit.binding === 'pow' || result.limit.binding === 'vac') ? 'bad' : 'neutral';
  const warnings = result.warnings.map((w) => `<li class="warn warn-${w.code}">${escapeHtml(w.message)}</li>`).join('');
  const notes = result.notes.map((n) => `<li class="note">${escapeHtml(n)}</li>`).join('');

  box.innerHTML = `
    <div class="limit-line ${limitClass}">${escapeHtml(result.limit.message)}</div>
    <div class="out-card">${rows}</div>
    ${warnings || notes ? `<ul class="messages">${warnings}${notes}</ul>` : ''}
    ${ladderHtml(result)}
  `;

  const chips = buildChips(result);
  const caps = result.limit.caps;
  const shown = Object.entries(caps).filter(([, v]) => v !== undefined);
  const maxCap = Math.max(...shown.map(([, v]) => v));
  const finalV = result.outputs.cuttingFeedMmMin;
  const cascade = shown.map(([k, v]) => {
    const na = k !== 'ideal' && k !== result.limit.binding && v > finalV * 2;
    const w = Math.max(2, Math.min(100, (v / maxCap) * 100));
    const pair = feedPair(v);
    return `<div class="casc-row ${k === result.limit.binding ? 'is-bind' : ''} ${na ? 'na' : ''}">
      <span class="casc-label">${CAP_LABELS[k]}</span>
      <span class="casc-bar"><span class="casc-fill" style="width:${w}%"></span></span>
      <span class="casc-val">${pair.metric}<span class="imperial">${pair.imperial}</span></span>
    </div>`;
  }).join('');

  diag.innerHTML = `
    <h2>What is going on in this cut</h2>
    <div class="chips">${chips.map((c) => `<span class="chip chip-${c.level}">${escapeHtml(c.text)}</span>`).join('')}</div>
    <div class="cascade">${cascade}</div>
  `;
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
  const fz = m.fzDeliv;
  const lo = Math.min(...all.map((b) => b.lo), fz);
  const hi = Math.max(...all.map((b) => b.hi), fz);
  const span = hi - lo || 1;
  const pos = (v) => (((v - lo) / span) * 100).toFixed(1);
  const rowsHtml = all.map((b) => {
    const left = Number(pos(b.lo));
    const width = Math.max(Number(pos(b.hi)) - left, 0.8);
    const tag = b.machineClass ? ' <em class="ladder-tag">10 hp+ charts</em>' : '';
    return `<div class="ladder-row ${b.serves ? 'is-serving' : ''}">
      <span class="ladder-label">${escapeHtml(b.label)}${tag}</span>
      <span class="ladder-track">
        <span class="ladder-bar" style="left:${left}%;width:${width.toFixed(1)}%"></span>
        <span class="ladder-mark" style="left:${pos(fz)}%"></span>
      </span>
      <span class="ladder-range">${b.lo.toFixed(3)}–${b.hi.toFixed(3)}</span>
    </div>`;
  }).join('');
  return `<div class="ladder">
    <div class="ladder-head"><h2>Every published chart for this cut</h2><span class="ladder-units">mm/tooth</span></div>
    ${rowsHtml}
    <p class="ladder-legend">The highlighted chart sets your numbers. The dotted line marks the served feed per tooth, ${fz.toFixed(3)} mm/tooth. The other charts are context, and their numbers do not serve.</p>
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
    m: state.material, t: state.toolType, d: String(state.diameterMm),
    f: String(state.flutes), th: String(state.thicknessMm),
    r: String(state.rpm), mc: String(state.machineIdx), p: state.profile,
    fc: state.firstCut ? '1' : '0',
  });
  if (state.apMm != null) q.set('ap', String(state.apMm));
  if (state.aeMm != null) q.set('ae', String(state.aeMm));
  for (const [k, v] of Object.entries(state.adv)) q.set(`a_${k}`, String(v));
  history.replaceState(null, '', `?${q}`);
}

function readUrlState() {
  const q = new URLSearchParams(location.search);
  if (q.get('m') && MATERIALS.some((x) => x.id === q.get('m'))) state.material = q.get('m');
  if (q.get('t') && TOOL_TYPES.some((x) => x.id === q.get('t'))) state.toolType = q.get('t');
  if (q.get('d') && DIAMETERS.includes(Number(q.get('d')))) state.diameterMm = Number(q.get('d'));
  if (q.get('th') && Number(q.get('th')) > 0) state.thicknessMm = Number(q.get('th'));
  if (q.get('f') && Number(q.get('f')) >= 1) state.flutes = Math.round(Number(q.get('f')));
  if (q.get('r') && Number(q.get('r')) > 0) state.rpm = Number(q.get('r'));
  if (q.get('ap') && Number(q.get('ap')) > 0) state.apMm = Number(q.get('ap'));
  if (q.get('ae') && Number(q.get('ae')) > 0) state.aeMm = Number(q.get('ae'));
  if (q.get('mc') && presets[Number(q.get('mc'))]) state.machineIdx = Number(q.get('mc'));
  if (q.get('p') && PROFILES.some((x) => x.id === q.get('p'))) state.profile = q.get('p');
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
