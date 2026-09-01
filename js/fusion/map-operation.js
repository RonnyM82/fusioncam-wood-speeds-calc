// js/fusion/map-operation.js — turns one raw operation from the add-in job
// message into the calculator's input plus a reading line, or refuses it
// with a reason. The policy is the mapping table in fusion-addin/protocol.md
// (2026-09-01), followed exactly. The module is pure, and the fence in
// tests/run.js holds it there: no DOM, no I/O, no clock, no randomness.
//
// Three rules govern every branch (protocol.md, 2026-09-01):
// 1. Never invent a value. A null raw fact the policy needs makes the
//    operation unreadable, with a sentence that names the missing fact.
// 2. Never touch material, machine, rpm or profile. Those are panel state.
//    profileOverride is the one exception: "finishing" on a marked finish
//    row, null otherwise.
// 3. A strategy with no published data is unsupported, with the reason.

// contour2d, pocket2d and slot cut a full-width slot: the width of cut is
// the tool diameter. Every pocket level starts as a slot, so the slot
// number serves the whole level.
const SLOT_STRATEGIES = new Set(['contour2d', 'pocket2d', 'slot']);

// adaptive2d and adaptive use the programmed optimal load as the width of
// cut. This is the one case where chip-thinning compensation does real work.
const ADAPTIVE_STRATEGIES = new Set(['adaptive2d', 'adaptive']);

// The named 3D surfacing strategies. adaptive is absent on purpose: 3D
// adaptive serves, with the optimal load as its width like adaptive2d.
// The depth rules differ (2026-09-01): adaptive2d gates on the
// multiple-depths box, while the 3D adaptive always takes the stepdown.
// Note that contour here is the 3D strategy, not contour2d.
const SURFACING_3D = new Set([
  'parallel', 'scallop', 'contour', 'pocket_clearing', 'ramp', 'spiral',
  'radial', 'morph', 'flat', 'horizontal', 'pencil', 'steep_and_shallow',
  'project', 'swarf', 'blend', 'morphed_spiral',
]);

const DRILL_REASON = 'Drilling charts are pending research. The add-in leaves drills untouched until that data lands.';
const SURFACING_REASON = 'No published chart covers 3D surfacing yet. The data arrives from research.';

// op is the job message operation shape in fusion-addin/protocol.md.
// choices is { toolType, upcutLengthMm, finishing }: the user-confirmed tool
// geometry, the confirmed up-cut length, and the finish-row mark.
export function mapOperation(op, choices = {}) {
  const strategy = op.strategy;
  if (strategy == null) {
    return { status: 'unreadable', reason: 'The add-in could not read the strategy.' };
  }
  if (strategy === 'drill') {
    return { status: 'unsupported', reason: DRILL_REASON };
  }
  if (SURFACING_3D.has(strategy)) {
    return { status: 'unsupported', reason: SURFACING_REASON };
  }
  if (!SLOT_STRATEGIES.has(strategy) && !ADAPTIVE_STRATEGIES.has(strategy)) {
    return {
      status: 'unsupported',
      reason: `No published chart covers the ${strategy} strategy. The calculator gives no number without a source.`,
    };
  }

  const tool = op.tool ?? {};
  if (tool.diameterMm == null) {
    return { status: 'unreadable', reason: 'The add-in could not read the tool diameter.' };
  }
  if (tool.flutes == null) {
    return { status: 'unreadable', reason: 'The add-in could not read the flute count.' };
  }

  const depth = readDepth(op);
  if (!depth.ok) {
    return { status: 'unreadable', reason: depth.reason };
  }

  // The finish mark applies to a 2D contour wall skim only (protocol.md
  // table row "contour2d marked finish"). The width of cut is null on
  // purpose: the core then assumes the published 1 mm skim from rules.json.
  const finishing = choices.finishing === true && strategy === 'contour2d';

  let aeMm;
  if (finishing) {
    aeMm = null;
  } else if (ADAPTIVE_STRATEGIES.has(strategy)) {
    if (op.params?.optimalLoadMm == null) {
      return { status: 'unreadable', reason: 'The add-in could not read the optimal load for this adaptive operation.' };
    }
    aeMm = op.params.optimalLoadMm;
  } else {
    aeMm = tool.diameterMm;
  }

  const dir = readDirection(op);
  if (!dir.ok) {
    return { status: 'unreadable', reason: dir.reason };
  }
  const reading = buildReading(strategy, depth, aeMm, finishing, dir.note);

  return {
    status: 'mapped',
    calc: {
      toolType: choices.toolType ?? null,
      diameterMm: tool.diameterMm,
      flutesTotal: tool.flutes,
      apMm: depth.apMm,
      aeMm,
      direction: dir.direction,
      upcutLengthMm: choices.upcutLengthMm ?? null,
      profileOverride: finishing ? 'finishing' : null,
    },
    reading,
  };
}

// Depth of cut (protocol.md, corrected 2026-09-01). Every levelled 2D
// strategy (contour2d, pocket2d, adaptive2d, slot) gates on
// doMultipleDepths: the stepdown serves only when the box is on, because
// Fusion keeps a stale stepdown value in the dialog when the box is off.
// With the box off the cut takes the resolved top height minus the
// resolved bottom height in one pass, and that depth must be positive.
// A null doMultipleDepths is unreadable, never read as false, because a
// stale stepdown served as a pass depth understates the cut. The 3D
// adaptive has no such box: its stepdown is always active, and a null
// stepdownMm is unreadable.
function readDepth(op) {
  const p = op.params ?? {};
  const totalMm = totalDepthMm(op);
  if (op.strategy === 'adaptive') {
    if (p.stepdownMm == null) {
      return { ok: false, reason: 'The add-in could not read the stepdown for this 3D adaptive operation.' };
    }
    return { ok: true, apMm: p.stepdownMm, totalMm, perPass: true };
  }
  if (p.doMultipleDepths === true) {
    if (p.stepdownMm == null) {
      return { ok: false, reason: 'The add-in could not read the stepdown for this multiple-depth operation.' };
    }
    return { ok: true, apMm: p.stepdownMm, totalMm, perPass: true };
  }
  if (p.doMultipleDepths !== false) {
    return { ok: false, reason: 'The add-in could not read doMultipleDepths. The stepdown in the dialog can be stale, so the mapping does not guess the pass depth.' };
  }
  const top = op.heights?.top?.zMm ?? null;
  const bottom = op.heights?.bottom?.zMm ?? null;
  if (top == null) {
    return { ok: false, reason: 'The add-in could not read the top height.' };
  }
  if (bottom == null) {
    return { ok: false, reason: 'The add-in could not read the bottom height.' };
  }
  const d = top - bottom;
  if (!(d > 0)) {
    return { ok: false, reason: 'The top height is not above the bottom height. The cut has no positive depth.' };
  }
  return { ok: true, apMm: d, totalMm: d, perPass: false };
}

// The full depth, for the pass count in the reading line only. Null when
// either resolved height is null or the difference is not positive. The
// depth policy never leans on this value.
function totalDepthMm(op) {
  const top = op.heights?.top?.zMm;
  const bottom = op.heights?.bottom?.zMm;
  if (top == null || bottom == null) return null;
  const d = top - bottom;
  return d > 0 ? d : null;
}

// Climb or conventional (protocol.md, corrected 2026-09-01).
// params.direction wins where a strategy has it: only the 2D adaptive
// carries one. The 2D contour and the 2D pocket carry no direction. Both
// carry compensation, left or right, and the side gives the direction
// (spike-results-windows.md section 2, confirmed 2026-09-01). Left is climb
// and right is conventional. The evidence is in spike-results-windows.md
// section 3: Fusion's own help text for the parameter reads "Left (climb
// milling)" and "Right (conventional milling)", and the posted G-code of a
// left-compensated outside profile runs clockwise with a clockwise spindle,
// which is climb milling. An ambiguous setting, meaning direction "both" or
// a compensation of "both" or "center", serves the climb force model and
// the reading line says so. Climb is the conservative model: in every
// measured pair in data/kc.json the climb Ks is the higher value, so the
// climb model gives the lower power and hold-down caps. Any other non-null
// direction or compensation string is unreadable, never defaulted. A null
// direction on a strategy with no compensation stays null: the core default
// is climb, which stays correct and conservative.
const CLIMB_MODEL_NOTE = 'The ambiguous direction serves the climb force model, the conservative one.';

// The strategies whose compensation side gives the cut direction.
const COMPENSATION_STRATEGIES = new Set(['contour2d', 'pocket2d']);

function readDirection(op) {
  const p = op.params ?? {};
  if (p.direction === 'climb' || p.direction === 'conventional') {
    return { ok: true, direction: p.direction, note: null };
  }
  if (p.direction === 'both') {
    return { ok: true, direction: 'climb', note: `This path cuts in both directions. ${CLIMB_MODEL_NOTE}` };
  }
  if (p.direction != null) {
    return { ok: false, reason: `The add-in sent a cut direction the mapping does not recognise: "${p.direction}".` };
  }
  if (COMPENSATION_STRATEGIES.has(op.strategy)) {
    if (p.compensation === 'left') return { ok: true, direction: 'climb', note: null };
    if (p.compensation === 'right') return { ok: true, direction: 'conventional', note: null };
    // The Fusion build the spike read (2704.1.53) has no center value on
    // compensation and no both value: the choices are left and right only
    // (spike-results-windows.md section 2). The two branches stay for a
    // build that adds either, so a tolerant read never turns into a guess.
    if (p.compensation === 'center') {
      return { ok: true, direction: 'climb', note: `The tool cuts on the line. ${CLIMB_MODEL_NOTE}` };
    }
    if (p.compensation === 'both') {
      return { ok: true, direction: 'climb', note: `This path cuts in both directions. ${CLIMB_MODEL_NOTE}` };
    }
    if (p.compensation != null) {
      return { ok: false, reason: `The add-in sent a compensation the mapping does not recognise: "${p.compensation}".` };
    }
  }
  return { ok: true, direction: null, note: null };
}

// One or two short sentences a machinist can check at a glance, for
// example: "Full-width slot, 18.5 mm deep, in three passes of 9 mm."
function buildReading(strategy, depth, aeMm, finishing, note) {
  let line;
  if (finishing) {
    // The 1 mm figure mirrors finishing.skim_ae_mm in data/rules.json
    // (2026-09-01). The core owns the value. This line only states it.
    line = 'Wall finish skim. The core assumes 1 mm of stock on the wall.';
  } else if (ADAPTIVE_STRATEGIES.has(strategy)) {
    line = depth.perPass
      ? `Adaptive clearing at ${mm(aeMm)} mm width of cut, ${mm(depth.apMm)} mm deep per pass.`
      : `Adaptive clearing at ${mm(aeMm)} mm width of cut, ${mm(depth.apMm)} mm deep, in one pass.`;
  } else {
    const base = strategy === 'pocket2d' ? 'Full-width slot at each pocket level' : 'Full-width slot';
    if (!depth.perPass) {
      line = `${base}, ${mm(depth.apMm)} mm deep, in one pass.`;
    } else if (depth.totalMm != null) {
      // The epsilon keeps a float quotient a hair over a whole number
      // from adding a pass that does not exist.
      const passes = Math.ceil(depth.totalMm / depth.apMm - 1e-9);
      line = passes <= 1
        ? `${base}, ${mm(depth.totalMm)} mm deep, in one pass.`
        : `${base}, ${mm(depth.totalMm)} mm deep, in ${countWord(passes)} passes of ${mm(depth.apMm)} mm.`;
    } else {
      line = `${base}, ${mm(depth.apMm)} mm deep per pass.`;
    }
  }
  return note ? `${line} ${note}` : line;
}

// One decimal, trailing zero trimmed: 18 renders as "18", 18.5 as "18.5".
function mm(x) {
  return String(Math.round(x * 10) / 10);
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function countWord(n) {
  return n >= 1 && n <= 10 ? COUNT_WORDS[n] : String(n);
}
