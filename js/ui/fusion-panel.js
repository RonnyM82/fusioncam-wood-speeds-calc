// The Fusion panel page. This is the one DOM module for fusion.html: it talks
// to the add-in bridge, holds the panel state, and renders every result. The
// three js/fusion/ modules are pure and carry the message policy
// (fusion-addin/protocol.md). This file only wires them to the screen.
//
// The session shape (protocol.md): the page registers its handler, loads the
// data files, sends hello, and renders each job snapshot the add-in sends.
// Apply sends the ticked rows and renders the two-stage report. With
// ?harness=1 and no Fusion bridge, tools/fusion-harness.js supplies a fake
// bridge, so the whole panel runs under tools/serve.js in an ordinary
// browser (build phase 2).

import { loadData } from '../data/load-browser.js';
import { validateData } from '../data/validate.js';
import { machinePresets } from '../data/presets.js';
import { calculate } from '../core/calculate.js';
import { buildChips } from '../core/diagnostics.js';
import { feedPair, rpmPair, fzPair, diameterLabel } from './format.js';
import {
  PROTOCOL_VERSION, PROTOCOL_FLOOR,
  acceptsProtocol, isBadBuild, validateEnvelope, readJob,
  makeHello, makePersist, makeRefresh, makeApply, makePageError,
} from '../fusion/protocol.js';
import { identifyTool } from '../fusion/tool-identity.js';
import { mapOperation } from '../fusion/map-operation.js';

// Rides the hello message, so the add-in can log which page answered it. It
// is also the cache-bust key: every stylesheet and script address in
// fusion.html carries ?v=<PAGE_BUILD>, and FP15 pins the two equal. Bump it
// on every page change, because the Fusion palette browser serves a stale
// cached copy otherwise (spike-results-windows.md section 11, item 6).
const PAGE_BUILD = '2026-09-01c';

// The Fusion bridge appears AFTER the page scripts run: the palette browser
// injects window.adsk 20 to 32 ms after the first script, after the load
// event (spike-results-windows.md section 11). A test at module time always
// takes the outside-Fusion branch. So the page polls for the bridge, every
// 50 ms for up to timeoutMs, and resolves false only after that. Copied from
// the proven palette page of the wait-code add-in.
function adskReady(timeoutMs) {
  return new Promise((resolve) => {
    const start = Date.now();
    (function poll() {
      if (window.adsk && typeof window.adsk.fusionSendData === 'function') {
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        resolve(false);
      } else {
        setTimeout(poll, 50);
      }
    })();
  });
}

const NO_ANSWER = 'The add-in did not answer. Stop and re-run the add-in (Utilities > Add-Ins), then reopen this panel.';

// Copied from js/ui/app.js, which is the source of truth for this list. The
// panel must serve exactly the site's seven materials, with the same ids and
// the same data mapping, because the two surfaces are one product. OSB is
// deliberately absent (decision D12): the core still refuses it with the
// reason if ever asked.
const MATERIALS = [
  { id: 'mdf', label: 'MDF', hint: 'Fibreboard, plain or veneered', data: ['mdf'], kcMaterial: 'mdf' },
  { id: 'melamine', label: 'Melamine / chipboard', hint: 'Melamine-faced or laminated particleboard', data: ['laminated_pb', 'laminated_chipboard'], kcMaterial: 'laminated_pb' },
  { id: 'hard_ply', label: 'Hard plywood', hint: 'Birch, hardwood-face and film-faced sheets. Film-faced runs 15-20% harder.', data: ['plywood'], kcMaterial: 'plywood' },
  { id: 'soft_ply', label: 'Soft plywood', hint: 'Softwood construction ply, CD and similar', data: ['softwood_ply'], fallback: ['plywood'], kcMaterial: 'softwood_ply' },
  { id: 'hpl', label: 'HPL-faced panel', hint: 'High-pressure laminate over a board core. If the edge chips, change the tool geometry before the feed.', data: ['hpl'], kcMaterial: 'hpl' },
  { id: 'hardwood', label: 'Hardwood', hint: 'Oak, beech, maple, ash and similar', data: ['hardwood'], kcMaterial: 'hardwood' },
  { id: 'softwood', label: 'Softwood', hint: 'Pine, radiata, spruce', data: ['softwood'], kcMaterial: 'softwood' },
];

// The four geometries the user can confirm, in the site's vocabulary
// (js/ui/app.js TOOL_TYPES ids).
const GEOMETRIES = [
  { id: 'upcut', label: 'Up-cut spiral' },
  { id: 'downcut', label: 'Down-cut spiral' },
  { id: 'compression', label: 'Compression' },
  { id: 'straight', label: 'Straight' },
];

// Finishing is per row on this surface, never global: a finish pass is a
// property of one operation, and the toggle on each contour row drives it.
const PROFILES = [
  { id: 'gentle', label: 'Gentle' },
  { id: 'standard', label: 'Standard' },
  { id: 'aggressive', label: 'Aggressive' },
];

// One glyph per severity, the js/ui/app.js map. The glyph carries how it is
// going, the part colour cannot carry on its own.
const STATUS_GLYPH = {
  success: 'lt-ic-success',
  warning: 'lt-ic-warning',
  danger: 'lt-ic-alert',
  info: 'lt-ic-info',
};

// buildChips() speaks in levels. The design system speaks in severities.
const CHIP_VARIANT = { cool: 'success', warm: 'warning', hot: 'danger', info: 'info' };

// The binding limit, in words, as the site names it.
const CAP_LABELS = {
  ideal: 'Chip load target',
  vmax: 'Machine feed',
  pow: 'Spindle power',
  vac: 'Hold-down',
  corn: 'Corners',
};

// One badge per row state, in one dict, so a meaning cannot pick up a second
// drawing at a second call site. The pencil is the draft mark: a guess is a
// draft until the user rules on it. The dash-circle is the withdrawn mark:
// ruled out by a decision, not forbidden.
const ROW_BADGE = {
  suppressed: { variant: 'neutral', glyph: 'lt-ic-dash-circle', word: 'Suppressed' },
  confirm: { variant: 'neutral', glyph: 'lt-ic-pencil', word: 'Confirm the tool' },
  unsupported: { variant: 'neutral', glyph: 'lt-ic-dash-circle', word: 'Not served' },
  unreadable: { variant: 'warning', glyph: 'lt-ic-warning', word: 'Unreadable' },
  refused: { variant: 'danger', glyph: 'lt-ic-alert', word: 'No number' },
  blocked: { variant: 'warning', glyph: 'lt-ic-warning', word: 'Blocked' },
};

const REPORT_BADGE = {
  written: { variant: 'success', glyph: 'lt-ic-success', word: 'Written' },
  failed: { variant: 'warning', glyph: 'lt-ic-warning', word: 'Failed' },
  inconsistent: { variant: 'danger', glyph: 'lt-ic-alert', word: 'Inconsistent' },
  skipped_changed: { variant: 'warning', glyph: 'lt-ic-warning', word: 'Skipped' },
};

const state = {
  bridge: null,
  harness: false,
  waiting: false,
  noAnswer: false,         // the hello reply came back empty: a stale palette
  tooOld: null,            // a sentence when this add-in build may not Apply
  tooOldUrl: null,         // the address-borne half of that verdict, fixed per session
  data: null,
  presets: null,
  job: null,
  machineId: null,         // the preset name string, never a list position
  profile: 'standard',
  rpm: null,
  firstCut: true,
  materialBySetup: {},     // setupId -> material id
  finishRows: new Set(),   // opIds marked as a finish pass
  tools: new Map(),        // toolKey -> { geometry, confirmed, upcutLengthMm }
  toolRows: [],            // distinct tools, in first-seen order
  toolKeyByOp: new Map(),  // opId -> toolKey
  served: new Map(),       // opId -> { result, rounded }, current render only
  ticked: new Set(),       // opIds ticked for Apply
  applying: false,
  report: null,
  regen: new Map(),        // opId -> { status, reason } per regenerated op
};

const $ = (id) => document.getElementById(id);
const query = new URLSearchParams(location.search);

init();

async function init() {
  if (query.get('harness') === '1') {
    // Dev only: a fake add-in, so the whole panel runs in an ordinary
    // browser and a human check is one URL.
    const mod = await import('../../tools/fusion-harness.js');
    state.bridge = mod.createHarnessBridge();
    state.harness = true;
  } else if (await adskReady(8000)) {
    state.bridge = window.adsk;
  } else {
    // Only after the poll fails is the page outside Fusion. A test at
    // module time took this branch inside Fusion every time
    // (spike-results-windows.md section 11).
    renderOutside();
    return;
  }

  // Both failures are conditions that stay true until someone fixes the
  // deployment, so each is a danger banner with an icon and words, mirroring
  // js/ui/app.js. They sit outside the live report region, so they carry
  // role="alert" themselves. Each also sends pageError over the bridge
  // (2026-09-01): without it the add-in's hello timeout misreads a data
  // failure as no internet. The harness ignores the type, and the banner
  // still renders in every case.
  try {
    state.data = await loadData();
  } catch (err) {
    send(makePageError(`The page could not load its data files: ${err.message}.`));
    $('notice').innerHTML = alertHtml('danger', 'The page could not load its data files.',
      `${err.message}. Serve the page over HTTP, not from a file.`, 'alert');
    return;
  }
  const { errors } = validateData(state.data);
  if (errors.length) {
    send(makePageError(`The data failed its integrity check: ${errors[0]}`));
    $('notice').innerHTML = alertHtml('danger',
      'The data failed its integrity check, so the panel shows no numbers.',
      errors.slice(0, 5), 'alert');
    return;
  }

  state.presets = machinePresets(state.data.machines, state.data.rules);
  const generic = state.presets.find((p) => p.id.startsWith('Generic'));
  state.machineId = (generic ?? state.presets[0]).id;
  state.rpm = state.data.rules.defaults.rpm;
  state.firstCut = state.data.rules.first_cut?.default_on ?? false;
  versionGate();

  // The handler must exist before hello goes out: the add-in may answer at
  // once. Every reply is its own message (protocol.md). The handler still
  // returns a string, so a push from the add-in never throws.
  window.fusionJavaScriptHandler = {
    handle(type, json) {
      try {
        onMessage(type, JSON.parse(json));
      } catch (err) {
        $('notice').innerHTML = alertHtml('danger',
          'A message from the add-in could not be read.', err.message, 'alert');
      }
      return '';
    },
  };
  state.waiting = true;
  renderNotices();
  // The hello reply is the one return value the page reads, as a liveness
  // check only. The add-in sets returnData on every message it handles, so
  // an empty reply means no handler is attached: a palette that survived a
  // previous add-in run (spike-results-windows.md section 11, item 3). The
  // harness returns nothing by design and is exempt.
  const reply = await send(makeHello(PAGE_BUILD));
  if (!reply && !state.harness && state.job === null) {
    state.waiting = false;
    state.noAnswer = true;
    renderNotices();
  }
}

// Protocol rule 5: the add-in's version rides the panel address as a query
// string, so this screen works even when messaging itself is broken. Viewing
// still works. Only Apply is refused.
function versionGate() {
  const protocolParam = query.get('protocol');
  const addinParam = query.get('addin');
  // The address never changes within a panel session, so this verdict is
  // kept apart and re-applied per job. The job-borne verdict recomputes on
  // every snapshot, so a good build after a bad one gets Apply back
  // (verifier finding, 2026-09-01).
  if (protocolParam != null && !acceptsProtocol(Number(protocolParam))) {
    state.tooOldUrl = 'This add-in speaks a message format the page no longer accepts.';
  } else if (addinParam != null && isBadBuild(addinParam)) {
    state.tooOldUrl = 'This add-in build has a known defect.';
  }
  state.tooOld = state.tooOldUrl;
}

// Sends one message and resolves to the add-in's returnData string. The
// palette browser resolves fusionSendData to that string; an older bridge,
// and the harness, return undefined, which resolves at once, so nothing
// awaits forever. Only the hello caller reads the result. Every other reply
// is its own message (protocol.md), so the rest ignore it.
async function send(msg) {
  try {
    const reply = await state.bridge.fusionSendData(msg.type, JSON.stringify(msg));
    return typeof reply === 'string' ? reply : '';
  } catch (err) {
    $('notice').innerHTML = alertHtml('danger',
      'The message to the add-in failed.', err.message, 'alert');
    return '';
  }
}

function onMessage(type, msg) {
  // A job message goes straight to onJob (2026-09-01): readJob is the one
  // judge of a snapshot, so a broken snapshot clears the numbers instead of
  // leaving them standing behind an envelope banner.
  if (type === 'job' || msg?.type === 'job') {
    onJob(msg);
    return;
  }
  const env = validateEnvelope(msg);
  if (!env.ok) {
    $('notice').innerHTML = alertHtml('danger',
      'A message from the add-in failed its checks.', env.errors.slice(0, 5), 'alert');
    return;
  }
  if (msg.type === 'writeReport') onWriteReport(msg);
  else if (msg.type === 'regenReport') onRegenReport(msg);
  // An unknown type is ignored, never an error (protocol versioning rule 1).
}

// Every trace of the previous snapshot goes before the next one is judged:
// ticks, served numbers, the applying flag and the regeneration ledger. A
// document switch must never serve the old document's picks where ids
// collide (2026-09-01).
function clearSnapshot() {
  state.ticked.clear();
  state.served = new Map();
  state.applying = false;
  state.regen.clear();
}

// The whole-panel refusal: the old snapshot leaves the screen before the
// banner claims no numbers, so the claim is always true. The actions row
// still renders, so Refresh remains and no failure dead-ends the panel
// (2026-09-01).
function renderRefusalScreen(title, body) {
  clearSnapshot();
  state.job = null;
  state.waiting = false;
  state.report = null;
  $('notice').innerHTML = alertHtml('danger', title, body, 'alert');
  for (const id of ['context', 'settings', 'tools', 'setups', 'report']) {
    $(id).innerHTML = '';
  }
  renderActions();
}

function onJob(msg) {
  const { job, errors } = readJob(msg);
  // The contract of 2026-09-01: a message that is structurally a job renders,
  // and a nulled field refuses only its own rows, through mapOperation. The
  // whole-panel danger banner is reserved for a message that is not a job at
  // all, because then not even the document's identity can be trusted.
  if (job === null) {
    renderRefusalScreen(
      'The snapshot from the add-in could not be read, so the panel shows no numbers.',
      (errors ?? []).slice(0, 5));
    return;
  }
  // Version gating binds to the message itself, not only to the URL early
  // screen (2026-09-01): the URL can lie, the snapshot cannot.
  if (!acceptsProtocol(job.protocol)) {
    const body = Number.isInteger(job.protocol) && job.protocol > PROTOCOL_VERSION
      ? 'The add-in is newer than this page. The page cannot serve this add-in version yet. Try again after the page updates.'
      : Number.isInteger(job.protocol) && job.protocol < PROTOCOL_FLOOR && job.protocol >= 1
        ? 'This add-in build is behind the page. Update the add-in in the Autodesk App Store.'
        : 'The snapshot did not name a protocol version the page can read. Update the add-in in the Autodesk App Store.';
    renderRefusalScreen('The page cannot serve this add-in build, so the panel shows no numbers.', body);
    return;
  }
  // A known-bad build still views its numbers. Only Apply is refused, with
  // the reason and the update instruction (protocol.md rule 4, 2026-09-01).
  // Recomputed on every snapshot so the verdict follows the build that
  // actually sent this job (verifier finding, 2026-09-01).
  state.tooOld = state.tooOldUrl
    ?? (isBadBuild(job.addinVersion) ? 'This add-in build has a known defect.' : null);
  state.job = job;
  state.waiting = false;
  // A snapshot proves the add-in is attached, whatever the hello reply said.
  state.noAnswer = false;
  // A new snapshot is re-ticked deliberately: the rows the user meant may
  // have changed underneath the old ticks.
  clearSnapshot();
  // A stale write reply promises "nothing was written" and a fresh job. The
  // banner survives exactly that one fresh render: it is marked consumed on
  // the first job render after it arrives and cleared on the next
  // (2026-09-01).
  if (state.report?.stale && !state.report.consumed) {
    state.report.consumed = true;
  } else {
    state.report = null;
  }
  restoreMemory(job);
  buildTools(job);
  // The full re-render replaces the control the user is holding, so the
  // focus comes back to the same id where one survives (2026-09-01).
  keepFocus(renderAll);
}

// The memory blobs come back verbatim from the add-in. Their shapes are the
// page's business alone (protocol.md). A corrupt blob restores nothing:
// silently starting fresh beats guessing at a broken record.
function restoreMemory(job) {
  // A new snapshot may be a different document, and setup and operation ids
  // repeat between documents. The per-document choices reset before the
  // incoming blob merges, so a document switch can never serve the old
  // document's picks where ids collide (2026-09-01).
  state.materialBySetup = {};
  state.finishRows = new Set();
  const doc = parseBlob(job.memory?.docBlob);
  if (doc) {
    for (const [sid, mid] of Object.entries(doc.materialBySetup ?? {})) {
      if (MATERIALS.some((m) => m.id === mid)) state.materialBySetup[sid] = mid;
    }
    if (typeof doc.machineId === 'string' && state.presets.some((p) => p.id === doc.machineId)) {
      state.machineId = doc.machineId;
    }
    if (PROFILES.some((p) => p.id === doc.profile)) state.profile = doc.profile;
    if (Number.isFinite(doc.rpm) && doc.rpm > 0) state.rpm = doc.rpm;
    if (typeof doc.firstCut === 'boolean') state.firstCut = doc.firstCut;
    if (Array.isArray(doc.finishRows)) {
      state.finishRows = new Set(doc.finishRows.filter((x) => typeof x === 'string'));
    }
  }
  const user = parseBlob(job.memory?.userBlob);
  if (user && user.tools) {
    for (const [key, t] of Object.entries(user.tools)) {
      if (!t || !GEOMETRIES.some((g) => g.id === t.geometry)) continue;
      // The user confirmed this geometry in an earlier session, and the
      // add-in returned the record. That confirmation stands.
      state.tools.set(key, {
        geometry: t.geometry,
        confirmed: true,
        upcutLengthMm: Number.isFinite(t.upcutLengthMm) && t.upcutLengthMm > 0 ? t.upcutLengthMm : null,
      });
    }
  }
}

function parseBlob(s) {
  if (typeof s !== 'string' || s === '') return null;
  try { return JSON.parse(s); } catch { return null; }
}

// One row per distinct tool key across all operations. The identity and the
// guess come from the pure module. The guess prefills the pick and only the
// user's confirmation makes it real (decision A3).
function buildTools(job) {
  state.toolRows = [];
  state.toolKeyByOp = new Map();
  const seen = new Set();
  for (const setup of job.setups) {
    for (const op of setup.operations) {
      const id = identifyTool(op.tool, state.data.chiploads);
      state.toolKeyByOp.set(op.opId, id.key);
      if (seen.has(id.key)) continue;
      seen.add(id.key);
      state.toolRows.push({ key: id.key, kind: id.kind, guess: id.guess, guessSource: id.guessSource, tool: op.tool });
      if (!state.tools.has(id.key)) {
        state.tools.set(id.key, { kind: id.kind, geometry: id.guess, confirmed: false, upcutLengthMm: null });
      } else {
        // A record restored from memory carries no kind: the kind is a fact
        // about the tool Fusion sent, never a stored choice (2026-09-01).
        state.tools.get(id.key).kind = id.kind;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Outgoing messages.
// ---------------------------------------------------------------------------

function persistDoc() {
  send(makePersist('doc', JSON.stringify({
    materialBySetup: state.materialBySetup,
    machineId: state.machineId,
    profile: state.profile,
    rpm: state.rpm,
    firstCut: state.firstCut,
    finishRows: [...state.finishRows],
    toolOverrides: {},
  })));
}

function persistUser() {
  const tools = {};
  for (const [key, t] of state.tools) {
    if (!t.confirmed || !t.geometry) continue;
    tools[key] = { geometry: t.geometry };
    if (t.upcutLengthMm > 0) tools[key].upcutLengthMm = t.upcutLengthMm;
  }
  send(makePersist('user', JSON.stringify({ tools })));
}

// Mirrors the display steps of js/ui/format.js feedPair, which is read-only
// for this panel and stays the source of these steps: a feed rounds to
// 100 mm/min from 2000 up and to 10 mm/min below.
function roundFeed(mmMin) {
  const step = mmMin >= 2000 ? 100 : 10;
  return Math.round(mmMin / step) * step;
}

// The written value must equal the displayed value (2026-09-01). The outputs
// round once, here, with the same steps the display pairs in js/ui/format.js
// use: feedPair's steps for every feed, rpmPair's whole rev for the spindle,
// fzPair's three decimals for the chip. The rows render from these rounded
// values and makeApply sends exactly them. The chip derives from the rounded
// cutting feed, not from the raw one, so the pair Fusion holds stays
// self-consistent: Fusion recomputes neither value from the other.
function roundedOutputs(outputs, flutesTotal) {
  const rpm = Math.round(outputs.spindleRpm);
  const cuttingMmMin = roundFeed(outputs.cuttingFeedMmMin);
  return {
    rpm,
    cuttingMmMin,
    feedPerToothMm: Number((cuttingMmMin / (rpm * flutesTotal)).toFixed(3)),
    plungeMmMin: roundFeed(outputs.plungeFeedMmMin),
    rampMmMin: roundFeed(outputs.rampFeedMmMin),
    leadInMmMin: roundFeed(outputs.leadInFeedMmMin),
    leadOutMmMin: roundFeed(outputs.leadOutFeedMmMin),
  };
}

// The apply rows carry every value the add-in must write, explicitly, and
// each one is the value its row displayed: roundedOutputs() rounded the
// outputs once at render time, the row rendered from them, and Apply sends
// them untouched (2026-09-01).
function applyRows() {
  return [...state.ticked].map((opId) => {
    const { rounded } = state.served.get(opId);
    return { opId, ...rounded };
  });
}

function onWriteReport(msg) {
  state.applying = false;
  if (msg.stale || msg.jobId !== state.job?.jobId) {
    // Nothing was written. A fresh job message follows and re-renders the
    // rows. The stale flag keeps this banner alive through that render.
    state.report = { stale: true };
  } else {
    state.report = { stale: false, undoHint: msg.undoHint, rows: msg.rows ?? [] };
  }
  renderActions();
  renderReport();
}

function onRegenReport(msg) {
  if (msg.jobId !== state.job?.jobId) return;
  // The reason on a failed row is kept and rendered beside the badge, the
  // way write-report reasons already render (2026-09-01).
  for (const row of msg.rows ?? []) {
    state.regen.set(row.opId, { status: row.status, reason: row.reason ?? null });
  }
  renderReport();
}

// ---------------------------------------------------------------------------
// Rendering. The settings and the tools render on demand. The setup tables
// re-render on every state change that moves a number, because every row's
// numbers come from one calculate() pass over the current state.
// ---------------------------------------------------------------------------

function renderAll() {
  renderNotices();
  renderContext();
  renderSettings();
  renderTools();
  renderSetups();
  renderReport();
}

function renderOutside() {
  $('app').innerHTML = `<div class="lt-prose">
    <h2>This page runs inside Fusion</h2>
    <p>The Fusion add-in opens this page as its panel and sends it the document. Opened on its own, it has nothing to read.</p>
    <p><a class="lt-link" href="./">Open the calculator instead</a></p>
  </div>`;
}

function renderNotices() {
  let html = '';
  if (state.harness) {
    html += alertHtml('info', 'Harness data.',
      'A development harness drives this page, not Fusion. Nothing here is a real document.', 'status');
  }
  if (state.tooOld) {
    html += alertHtml('danger', 'Apply is off for this add-in build.',
      `${state.tooOld} Update the add-in in the Autodesk App Store. Viewing still works.`, 'alert');
  }
  if (state.noAnswer) {
    // A condition, not a receipt: it stays true until the add-in is re-run,
    // so it is a banner with an icon and words, never a toast.
    html += alertHtml('danger', 'No reply from the add-in.', NO_ANSWER, 'alert');
  }
  if (state.waiting) {
    html += alertHtml('info', 'Connected to the add-in.',
      'Waiting for the document snapshot from Fusion.', 'status');
  }
  $('notice').innerHTML = html;
}

function renderContext() {
  const j = state.job;
  const units = j.documentUnits === 'in' ? 'inches' : 'millimetres';
  $('context').innerHTML = `<p class="doc-line">Document ${escapeHtml(j.documentName)} · snapshot ${escapeHtml(j.jobId)} · shown in ${units} first</p>`;
}

function renderSettings() {
  // Each option carries its preset note as a native title, so a browser that
  // shows option tooltips shows the note in the open list. The info button
  // beside the select is the path that works everywhere (2026-09-01).
  const machineOptions = state.presets.map((p) =>
    `<option value="${escapeHtml(p.id)}" title="${escapeHtml(p.notes ?? '')}" ${p.id === state.machineId ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('');
  const fc = state.data.rules.first_cut;
  const fcLabel = fc
    ? `First cut: run ${Math.round(fc.factor * 100)}% of the chart feed until the cut proves good`
    : 'First cut: run a reduced feed until the cut proves good';

  $('settings').innerHTML = `
    <h2>Machine and cut</h2>
    <div class="lt-form-grid">
      <div class="lt-field">
        <label class="lt-field__label" for="machine">Machine</label>
        <div class="machine-row">
          <select class="lt-select" id="machine" aria-describedby="machine-note">${machineOptions}</select>
          <button type="button" class="lt-btn lt-btn--ghost lt-btn--icon" id="machine-info"
                  aria-label="About this machine" aria-describedby="machine-note">
            <svg class="lt-icon" aria-hidden="true" focusable="false"><use href="#lt-ic-info"/></svg>
          </button>
        </div>
        <span class="lt-sr-only" id="machine-note"></span>
      </div>
      <lt-number-field id="f-rpm" input-id="rpm" label="Spindle speed"
                       measure="rotation" min="1000" max="30000" step="500" stepper></lt-number-field>
    </div>
    <div class="lt-field">
      <span class="lt-field__label" id="profile-label">How hard to run it</span>
      <div id="profile" class="lt-btn-group profile-group" role="radiogroup"
           aria-labelledby="profile-label" aria-describedby="profile-hint"></div>
      <span class="lt-field__hint" id="profile-hint">A finish pass is per operation. Use the finish-pass tick on a contour row.</span>
    </div>
    <div class="lt-field">
      <label class="lt-check">
        <input type="checkbox" id="firstcut">
        <span>${escapeHtml(fcLabel)}</span>
      </label>
    </div>`;

  // The preset note left the page flow on 2026-09-01 (Scott, first run inside
  // Fusion). It lives in a visually hidden span the select and the button
  // describe themselves by, and shows as a tip on the info button. The tip
  // enhances and never gates: the same text is announced without it.
  const tip = $('machine-tip');
  const info = $('machine-info');
  const machineNote = () => {
    const note = presetById().notes ?? 'This machine preset carries no note.';
    $('machine-note').textContent = note;
    tip.textContent = note;
  };
  const showTip = () => {
    tip.hidden = false;
    const r = info.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const gap = 8;
    tip.style.left = `${Math.min(Math.max(gap, r.right - t.width), window.innerWidth - t.width - gap)}px`;
    tip.style.top = `${r.bottom + t.height + gap < window.innerHeight ? r.bottom + gap : r.top - t.height - gap}px`;
  };
  const hideTip = () => { tip.hidden = true; };
  machineNote();
  info.addEventListener('pointerenter', showTip);
  info.addEventListener('pointerleave', hideTip);
  info.addEventListener('focus', showTip);
  info.addEventListener('blur', hideTip);
  // A tap has no hover: the button toggles the tip for a touch user.
  info.addEventListener('click', () => (tip.hidden ? showTip() : hideTip()));
  info.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTip(); });
  $('machine').addEventListener('change', (e) => {
    state.machineId = e.target.value;
    machineNote();
    hideTip();
    persistDoc();
    renderSetups();
  });

  // <lt-number-field> carries the metric base value on .value and reports it
  // on lt-change, the js/ui/app.js pattern.
  const rpmEl = $('f-rpm');
  rpmEl.value = state.rpm;
  rpmEl.addEventListener('lt-change', (e) => {
    const v = e.detail.value;
    state.rpm = Number.isFinite(v) && v > 0 ? v : state.data.rules.defaults.rpm;
    persistDoc();
    renderSetups();
  });

  buildProfile();

  const fcBox = $('firstcut');
  fcBox.checked = state.firstCut;
  fcBox.addEventListener('change', (e) => {
    state.firstCut = e.target.checked;
    persistDoc();
    renderSetups();
  });
}

// The profile picker, built the way js/ui/app.js builds it: role=radio
// buttons in an .lt-btn-group, primary when on and secondary when off, arrow
// keys per the APG radiogroup pattern. State toggles on the existing
// buttons, so arrow-key focus survives.
function buildProfile() {
  const box = $('profile');
  box.innerHTML = PROFILES.map((p) =>
    `<button type="button" role="radio" data-profile="${p.id}" class="lt-btn">${p.label}</button>`).join('');
  const buttons = [...box.querySelectorAll('[data-profile]')];

  const apply = (id, { commit = true } = {}) => {
    state.profile = id;
    buttons.forEach((b) => {
      const on = b.dataset.profile === id;
      b.setAttribute('aria-checked', String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle('lt-btn--primary', on);
      b.classList.toggle('lt-btn--secondary', !on);
    });
    if (commit) {
      persistDoc();
      renderSetups();
    }
  };

  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-profile]');
    if (btn) apply(btn.dataset.profile);
  });
  box.addEventListener('keydown', (e) => {
    const i = buttons.findIndex((b) => b.tabIndex === 0);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (i + 1) % buttons.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (i - 1 + buttons.length) % buttons.length;
    if (next === null) return;
    e.preventDefault();
    buttons[next].focus();
    apply(buttons[next].dataset.profile);
  });

  apply(state.profile, { commit: false });
}

// Tools that are not router bits take no geometry question. Fusion knows the
// tool type, and a drill or a ball-nose asked for a spiral direction is the
// wrong question (Scott, 2026-09-01, first run inside Fusion). Their rows
// refuse in the operation table with the strategy's own reason.
const KIND_NOTE = {
  drill: {
    label: 'Drill',
    note: 'A drill takes no spiral direction. Drill rows serve when the drilling numbers reach the panel.',
  },
  ball: {
    label: 'Ball-nose or form tool',
    note: 'No published chart covers 3D surfacing yet, so this tool\'s rows are not served.',
  },
  chamfer: {
    label: 'Chamfer or engraving tool',
    note: 'No published chart covers this tool, so its rows are not served.',
  },
};

function renderTools() {
  const rows = state.toolRows.map((t, i) => {
    const st = state.tools.get(t.key);
    if (t.kind !== 'router') {
      const k = KIND_NOTE[t.kind] ?? KIND_NOTE.chamfer;
      return `<div class="tool-row">
        <div class="tool-id">
          <span class="tool-desc">${escapeHtml(toolLabel(t.tool))}</span>
          ${badgeHtml('info', 'lt-ic-info', k.label)}
        </div>
        <p class="section-note">${escapeHtml(k.note)}</p>
      </div>`;
    }
    const badge = st.confirmed
      ? badgeHtml('success', 'lt-ic-check', 'Confirmed')
      : badgeHtml(ROW_BADGE.confirm.variant, ROW_BADGE.confirm.glyph,
        st.geometry ? 'Confirm the guess' : 'Pick the geometry');
    const options = [
      `<option value="" ${st.geometry ? '' : 'selected'} disabled hidden>Pick the geometry</option>`,
      ...GEOMETRIES.map((g) =>
        `<option value="${g.id}" ${g.id === st.geometry ? 'selected' : ''}>${g.label}</option>`),
    ].join('');
    const hint = !st.confirmed && st.geometry
      ? `Guessed from the ${t.guessSource === 'product_id' ? 'product number' : 'description'}. Confirm it before the rows serve.`
      : 'Fusion does not record the spiral direction, so the panel asks once per tool.';
    const confirmBtn = !st.confirmed && st.geometry
      ? `<button type="button" class="lt-btn lt-btn--secondary" data-confirm="${escapeHtml(t.key)}">Confirm</button>`
      : '';
    const upcut = st.geometry === 'compression'
      ? `<lt-number-field id="tf-upcut-${i}" input-id="tool-upcut-${i}" data-key="${escapeHtml(t.key)}"
           label="Up-cut length" measure="length" decimals="1" min="0.5" step="0.5" stepper
           hint="${escapeHtml(upcutHint(t.tool))}"></lt-number-field>`
      : '';
    return `<div class="tool-row">
      <div class="tool-id">
        <span class="tool-desc">${escapeHtml(toolLabel(t.tool))}</span>
        ${badge}
        ${confirmBtn}
      </div>
      <div class="lt-field">
        <label class="lt-field__label" for="tool-geo-${i}">Geometry</label>
        <select class="lt-select" id="tool-geo-${i}" data-key="${escapeHtml(t.key)}"
                aria-describedby="tool-geo-${i}-hint">${options}</select>
        <span class="lt-field__hint" id="tool-geo-${i}-hint">${escapeHtml(hint)}</span>
      </div>
      ${upcut}
    </div>`;
  });

  $('tools').innerHTML = `
    <h2>Tools</h2>
    <p class="section-note">Confirm each router bit's geometry once. The answer is remembered for every document. Drills and 3D tools need no answer.</p>
    <div class="tool-rows">${rows.join('') || '<p class="section-note">The document has no tools to confirm.</p>'}</div>`;

  for (const sel of $('tools').querySelectorAll('select[data-key]')) {
    sel.addEventListener('change', (e) => {
      confirmGeometry(e.target.dataset.key, e.target.value);
    });
  }
  for (const btn of $('tools').querySelectorAll('button[data-confirm]')) {
    btn.addEventListener('click', (e) => {
      const key = e.currentTarget.dataset.confirm;
      confirmGeometry(key, state.tools.get(key).geometry);
      // The Confirm button is gone after the re-render, so keepFocus alone
      // cannot restore it: the keyboard lands on the row's geometry select
      // instead (2026-09-01).
      const i = state.toolRows.findIndex((t) => t.key === key);
      if (i >= 0) $(`tool-geo-${i}`)?.focus();
    });
  }
  for (const nf of $('tools').querySelectorAll('lt-number-field[data-key]')) {
    const st = state.tools.get(nf.dataset.key);
    if (st?.upcutLengthMm > 0) nf.value = st.upcutLengthMm;
    nf.addEventListener('lt-change', (e) => {
      const v = e.detail.value;
      st.upcutLengthMm = Number.isFinite(v) && v > 0 ? v : null;
      persistUser();
      renderSetups();
    });
  }
}

function confirmGeometry(key, geometry) {
  if (!GEOMETRIES.some((g) => g.id === geometry)) return;
  const st = state.tools.get(key);
  st.geometry = geometry;
  st.confirmed = true;
  persistUser();
  keepFocus(() => {
    renderTools();
    renderSetups();
  });
}

// A length for display. The add-in now rounds what it ships, but an older
// add-in build can still send 3.0000000000000004 for a 3 mm drill (seen on
// the first run inside Fusion, 2026-09-01), and the page owes the reader a
// clean number whatever build sent it. Three decimals is finer than any
// catalogue and keeps 3.175 intact.
function roundMm(value) {
  return Math.round(value * 1000) / 1000;
}

function toolLabel(tool) {
  const name = tool.description || tool.typeString || 'Unnamed tool';
  const parts = [name];
  if (tool.diameterMm > 0) parts.push(diameterLabel(roundMm(tool.diameterMm)));
  if (tool.flutes > 0) parts.push(`${tool.flutes} ${tool.flutes === 1 ? 'flute' : 'flutes'}`);
  const vendor = [tool.vendor, tool.productId].filter(Boolean).join(' ');
  return vendor ? `${parts.join(', ')} (${vendor})` : parts.join(', ');
}

function upcutHint(tool) {
  return tool.diameterMm > 0
    ? `Leave empty to use one tool diameter, ${roundMm(tool.diameterMm)} mm.`
    : 'Leave empty to use one tool diameter.';
}

// ---------------------------------------------------------------------------
// The setups: one section per setup, a material pick and the operation table.
// ---------------------------------------------------------------------------

function materialFor(setupId) {
  return state.materialBySetup[setupId] ?? 'mdf';
}

function presetById() {
  return state.presets.find((p) => p.id === state.machineId) ?? state.presets[0];
}

function renderSetups() {
  state.served = new Map();
  const sections = state.job.setups.map((setup, si) => {
    const matId = materialFor(setup.setupId);
    const mat = MATERIALS.find((m) => m.id === matId);
    const options = MATERIALS.map((m) =>
      `<option value="${m.id}" ${m.id === matId ? 'selected' : ''}>${escapeHtml(m.label)}</option>`).join('');
    return `<section class="setup">
      <h2>${escapeHtml(setup.name)}</h2>
      <div class="lt-field">
        <label class="lt-field__label" for="mat-${si}">Material</label>
        <select class="lt-select" id="mat-${si}" data-setup="${escapeHtml(setup.setupId)}"
                aria-describedby="mat-${si}-hint">${options}</select>
        <span class="lt-field__hint" id="mat-${si}-hint">${escapeHtml(mat.hint)}</span>
      </div>
      ${opsTable(setup)}
    </section>`;
  });
  $('setups').innerHTML = sections.join('') ||
    alertHtml('warning', 'The document has no setups.',
      'Create a setup with operations in Fusion, then refresh.', 'alert');

  for (const sel of $('setups').querySelectorAll('select[data-setup]')) {
    sel.addEventListener('change', (e) => {
      state.materialBySetup[e.target.dataset.setup] = e.target.value;
      persistDoc();
      keepFocus(renderSetups);
    });
  }
  for (const box of $('setups').querySelectorAll('input[data-finish]')) {
    box.addEventListener('change', (e) => {
      const opId = e.target.dataset.finish;
      if (e.target.checked) state.finishRows.add(opId);
      else state.finishRows.delete(opId);
      persistDoc();
      keepFocus(renderSetups);
    });
  }
  for (const box of $('setups').querySelectorAll('input[data-op]')) {
    box.addEventListener('change', (e) => {
      const opId = e.target.dataset.op;
      if (e.target.checked) state.ticked.add(opId);
      else state.ticked.delete(opId);
      renderActions();
    });
  }
  // A settings change can stop a ticked row from serving: the row loses its
  // tick box, but its id would stay in the set, and Apply would then send a
  // number this render never computed. A tick only survives while its row
  // serves (integration pass, 2026-09-01).
  for (const opId of [...state.ticked]) {
    if (!state.served.has(opId)) state.ticked.delete(opId);
  }
  renderActions();
}

function opsTable(setup) {
  const rows = setup.operations.map((op) => opRow(op, setup)).join('');
  return `<div class="lt-table-wrap">
    <table class="lt-table">
      <caption class="lt-sr-only">Operations in ${escapeHtml(setup.name)}</caption>
      <thead><tr>
        <th scope="col">Operation</th>
        <th scope="col">How the cut reads</th>
        <th scope="col">Spindle</th>
        <th scope="col">Cutting feed</th>
        <th scope="col">Chip</th>
        <th scope="col">What sets the feed</th>
        <th scope="col">Apply</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

// One operation row. Suppressed rows are panel state and never reach
// mapOperation. An unconfirmed tool serves nothing: a number computed from a
// guess could reach a spindle. Refused, blocked, unsupported and unreadable
// rows show the reason and cannot be ticked (decision A5).
function opRow(op, setup) {
  if (op.suppressed) {
    return reasonRow(op, 'suppressed', 'Suppressed in Fusion. The panel leaves it untouched.', '');
  }
  // A row without an identity serves nothing and cannot be ticked: Apply
  // could not address it (protocol.md, 2026-09-01).
  if (op.opId === null) {
    return reasonRow(op, 'refused',
      'The snapshot did not carry an identity for this operation, so Apply cannot address it.', '');
  }

  const finishable = op.strategy === 'contour2d';
  const finishToggle = finishable
    ? `<label class="lt-check finish-check">
        <input type="checkbox" id="finish-${escapeHtml(op.opId)}" data-finish="${escapeHtml(op.opId)}"
               ${state.finishRows.has(op.opId) ? 'checked' : ''}>
        <span>Finish pass</span>
      </label>`
    : '';

  const tool = state.tools.get(state.toolKeyByOp.get(op.opId));
  // A drill, a ball-nose or a chamfer tool takes no geometry question
  // (2026-09-01). Its row refuses with the strategy's own reason through
  // mapOperation, and a routing strategy run with such a tool refuses here,
  // because the charts cover router bits only and calculate() has no tool
  // type to serve.
  const routerBit = !tool || tool.kind == null || tool.kind === 'router';
  if (routerBit && (!tool || !tool.confirmed || !tool.geometry)) {
    return reasonRow(op, 'confirm', 'Confirm the tool geometry first, in the tools section above.', finishToggle);
  }
  if (!routerBit) {
    const probe = mapOperation(op, { toolType: null, finishing: false });
    const reason = probe.status === 'mapped'
      ? `This operation runs a ${(KIND_NOTE[tool.kind]?.label ?? 'non-router').toLowerCase()} on a routing strategy. The charts cover router bits only.`
      : probe.reason;
    return reasonRow(op, probe.status === 'mapped' ? 'refused' : probe.status, reason, finishToggle);
  }

  const mapped = mapOperation(op, {
    toolType: tool.geometry,
    upcutLengthMm: tool.upcutLengthMm ?? undefined,
    finishing: state.finishRows.has(op.opId),
  });
  if (mapped.status !== 'mapped') {
    return reasonRow(op, mapped.status, mapped.reason, finishToggle);
  }

  const result = calculate(rowInput(setup, mapped.calc), state.data);
  if (result.status === 'refused') {
    return reasonRow(op, 'refused', result.refusal.reason, finishToggle, mapped.reading);
  }
  if (result.status === 'blocked') {
    return reasonRow(op, 'blocked', result.block.reason, finishToggle, mapped.reading);
  }

  // The row renders from the rounded values Apply will send, never from the
  // raw outputs: what the user reads is what Fusion receives (2026-09-01).
  const rounded = roundedOutputs(result.outputs, mapped.calc.flutesTotal);
  state.served.set(op.opId, { result, rounded });
  const chips = buildChips(result).map((c) =>
    badgeHtml(CHIP_VARIANT[c.level], STATUS_GLYPH[CHIP_VARIANT[c.level]], c.text)).join('');
  return `<tr class="has-chips">
    <th scope="row">${escapeHtml(op.name)}</th>
    <td><span class="op-reading">${escapeHtml(mapped.reading)}</span>${finishToggle}</td>
    <td class="val">${pairCell(rpmPair(rounded.rpm))}</td>
    <td class="val">${pairCell(feedPair(rounded.cuttingMmMin))}</td>
    <td class="val">${pairCell(fzPair(rounded.feedPerToothMm))}</td>
    <td>${escapeHtml(CAP_LABELS[result.limit.binding] ?? result.limit.binding)}</td>
    <td>
      <label class="lt-check">
        <input type="checkbox" id="tick-${escapeHtml(op.opId)}" data-op="${escapeHtml(op.opId)}"
               aria-label="Apply to ${escapeHtml(op.name)}"
               ${state.ticked.has(op.opId) ? 'checked' : ''}>
      </label>
    </td>
  </tr>
  <tr class="op-chips"><td colspan="7"><div class="lt-row">${chips}</div></td></tr>`;
}

function reasonRow(op, stateKey, reason, finishToggle, reading = null) {
  const b = ROW_BADGE[stateKey];
  return `<tr>
    <th scope="row">${escapeHtml(op.name)}</th>
    <td colspan="5">
      <div class="op-state">
        ${badgeHtml(b.variant, b.glyph, b.word)}
        ${reading ? `<span class="op-reading">${escapeHtml(reading)}</span>` : ''}
        <span class="op-reason">${escapeHtml(reason)}</span>
        ${finishToggle}
      </div>
    </td>
    <td></td>
  </tr>`;
}

// The calculate() input: the mapped calc fields plus panel state. The mapping
// module owns the cut geometry and the direction. The panel owns material,
// machine, rpm, profile and first cut (protocol.md module interfaces).
function rowInput(setup, calc) {
  const mat = MATERIALS.find((m) => m.id === materialFor(setup.setupId));
  return {
    material: mat.kcMaterial,
    materials: mat.data,
    materialsFallback: mat.fallback,
    toolType: calc.toolType,
    diameterMm: calc.diameterMm,
    thicknessMm: calc.apMm,
    apMm: calc.apMm,
    aeMm: calc.aeMm ?? undefined,
    profile: calc.profileOverride ?? state.profile,
    firstCut: state.firstCut,
    machine: presetById().machine,
    rpm: state.rpm,
    flutesTotal: calc.flutesTotal,
    direction: calc.direction ?? undefined,
    upcutLengthMm: calc.upcutLengthMm ?? undefined,
  };
}

// The display pairs already carry both unit systems. The document's unit
// leads: a user working in inches reads the inch value first, with the
// metric value under it, and the reverse for a metric document.
function pairCell(pair) {
  const inchFirst = state.job?.documentUnits === 'in' && pair.imperial;
  const first = inchFirst ? pair.imperial : pair.metric;
  const second = inchFirst ? pair.metric : pair.imperial;
  return `<span class="val-primary">${escapeHtml(first)}</span>` +
    (second ? `<span class="val-secondary">${escapeHtml(second)}</span>` : '');
}

// ---------------------------------------------------------------------------
// Apply and the two-stage report.
// ---------------------------------------------------------------------------

function renderActions() {
  // The actions row renders on every screen that has a bridge, the failure
  // screens included: Refresh is the way out of a broken snapshot, so no
  // failure may dead-end the panel (2026-09-01).
  if (!state.bridge) { $('actions').innerHTML = ''; return; }
  const n = state.ticked.size;
  const disabled = !state.job || state.tooOld || state.applying || n === 0;
  const label = state.applying ? 'Applying…'
    : n === 0 ? 'Apply the ticked rows'
      : `Apply ${n} ticked ${n === 1 ? 'row' : 'rows'}`;
  $('actions').innerHTML = `<div class="lt-form-actions">
    <button type="button" class="lt-btn lt-btn--secondary" id="refresh">Refresh from Fusion</button>
    <button type="button" class="lt-btn lt-btn--primary" id="apply" ${disabled ? 'disabled' : ''}>${escapeHtml(label)}</button>
  </div>`;
  $('refresh').addEventListener('click', () => send(makeRefresh()));
  $('apply').addEventListener('click', () => {
    state.applying = true;
    state.report = null;
    state.regen.clear();
    send(makeApply(state.job.jobId, applyRows()));
    renderActions();
    renderReport();
  });
}

function renderReport() {
  if (!state.report) {
    $('report').innerHTML = state.applying
      ? alertHtml('info', 'Writing the ticked rows in Fusion.')
      : '';
    return;
  }
  if (state.report.stale) {
    $('report').innerHTML = `<h2>Write report</h2>` + alertHtml('warning',
      'The document changed before the write, so nothing was written.',
      'The rows now on screen come from the fresh snapshot. Tick and apply again.');
    return;
  }

  const rows = state.report.rows;
  const undo = state.report.undoHint ?? '';
  const inconsistent = rows.filter((r) => r.status === 'inconsistent');
  const written = rows.filter((r) => r.status === 'written').length;

  // The inconsistent case renders loudest: a write failed after another
  // write in the same operation succeeded, so a new spindle speed can sit
  // against an old feed, which is a dangerous chip load (protocol.md).
  const banner = inconsistent.length
    ? alertHtml('danger',
      `${inconsistent.length} ${inconsistent.length === 1 ? 'operation is' : 'operations are'} inconsistent. Undo now.`,
      `A write failed after another write in the same operation succeeded, so the spindle speed and the feed can disagree on the machine. ${undo}`)
    : alertHtml(written === rows.length ? 'success' : 'warning',
      `${written} of ${rows.length} ${rows.length === 1 ? 'row' : 'rows'} written.`, undo || null);

  const lines = rows.map((r) => {
    const b = REPORT_BADGE[r.status] ?? { variant: 'info', glyph: 'lt-ic-info', word: r.status };
    const regen = state.regen.get(r.opId);
    const regenBadge = regen == null ? ''
      : regen.status === 'ok'
        ? badgeHtml('success', 'lt-ic-success', 'Toolpath regenerated')
        : badgeHtml('warning', 'lt-ic-warning', `Regeneration ${regen.status}`) +
          (regen.reason ? `<span class="report-reason">${escapeHtml(regen.reason)}</span>` : '');
    return `<div class="report-row${r.status === 'inconsistent' ? ' is-inconsistent' : ''}">
      ${badgeHtml(b.variant, b.glyph, b.word)}
      <span class="report-name">${escapeHtml(opName(r.opId))}</span>
      ${r.reason ? `<span class="report-reason">${escapeHtml(r.reason)}</span>` : ''}
      ${regenBadge}
    </div>`;
  }).join('');

  $('report').innerHTML = `<h2>Write report</h2>${banner}<div class="report-rows">${lines}</div>`;
}

function opName(opId) {
  for (const setup of state.job?.setups ?? []) {
    for (const op of setup.operations) {
      if (op.opId === opId) return op.name;
    }
  }
  return opId;
}

// ---------------------------------------------------------------------------
// Small shared helpers, following js/ui/app.js.
// ---------------------------------------------------------------------------

// A banner, not a toast: every message here stays true until the state
// changes. Banners inserted outside the live report region pass a role, so
// they announce. Banners inside it pass none, or they would announce twice.
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

// Every badge carries a glyph and words as well as its colour: around 8% of
// men have red-green colour vision deficiency, and this panel's readers are
// mostly men on a shop floor.
function badgeHtml(variant, glyph, text) {
  return `<span class="lt-badge lt-badge--${variant}">` +
    `<svg aria-hidden="true" focusable="false"><use href="#${glyph}"/></svg>` +
    `${escapeHtml(text)}</span>`;
}

// A re-render replaces the control the user is holding. Re-focusing the same
// id keeps the keyboard where the user left it.
function keepFocus(render) {
  const id = document.activeElement?.id;
  render();
  if (id) document.getElementById(id)?.focus();
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
