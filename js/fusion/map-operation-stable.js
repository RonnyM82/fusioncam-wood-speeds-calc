// js/fusion/map-operation.js — turns one raw operation from the add-in job
// message into the calculator's input plus a reading line, or refuses it
// with a reason. The policy is the mapping table in fusion-addin/protocol.md
// (2026-09-01), followed exactly. The module is pure, and the fence in
// tests/run.js holds it there: no DOM, no I/O, no clock, no randomness.
//
// Three rules govern every branch (protocol.md, 2026-09-01):
// 1. Never invent a value. A null raw fact the policy needs makes the
//    operation unreadable, with a sentence that names the missing fact and
//    the values that were read, in millimetres to one decimal, so a
//    screenshot of the reason alone shows what Fusion sent (2026-09-01).
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

const SURFACING_REASON = 'No published chart covers 3D surfacing yet. The data arrives from research.';

// The height modes Fusion resolves from the selected geometry and never
// into its own resolved-value parameter (spike-results-windows.md section
// 12, 2026-09-02). The add-in resolves them itself and marks the source.
// When one of these arrives null, the refusal says where the value should
// have come from, so the reader knows the selection did not read, not the
// dialog.
const GEOMETRY_HEIGHT_MODES = new Set(['from contour', 'from hole top', 'from hole bottom', 'from point']);

// Fusion resolves a from-contour or from-hole height per contour or per
// hole. The add-in ships the extreme, the highest top and the lowest bottom,
// with the spread between the levels it saw (protocol.md, heights). A spread
// above a hundredth of a millimetre means the cut is not one depth, and the
// reading says the deepest serves, because that is the number the mapping
// took.
const SPREAD_NOTE = 'The selection is not all at one depth, so the deepest serves.';

// op is the job message operation shape in fusion-addin/protocol.md.
// choices is { toolType, upcutLengthMm, finishing }: the user-confirmed tool
// geometry, the confirmed up-cut length, and the finish-row mark.
export function mapOperation(op, choices = {}) {
  const strategy = op.strategy;
  if (strategy == null) {
    return { status: 'unreadable', reason: 'The add-in could not read the strategy.' };
  }
  if (strategy === 'drill') {
    return mapDrill(op);
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
    return { status: 'unreadable', reason: `The add-in could not read the tool diameter (flute count ${countRead(tool.flutes)}).` };
  }
  if (tool.flutes == null) {
    return { status: 'unreadable', reason: `The add-in could not read the flute count (tool diameter ${mm(tool.diameterMm)} mm).` };
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
      const depthRead = depth.perPass ? `${mm(depth.apMm)} mm per pass` : `${mm(depth.apMm)} mm in one pass`;
      return { status: 'unreadable', reason: `The add-in could not read the optimal load for this adaptive operation (tool diameter ${mm(tool.diameterMm)} mm, depth ${depthRead}).` };
    }
    aeMm = op.params.optimalLoadMm;
  } else {
    aeMm = tool.diameterMm;
  }

  const dir = readDirection(op);
  if (!dir.ok) {
    return { status: 'unreadable', reason: dir.reason };
  }
  const reading = withSpreadNote(buildReading(strategy, depth, aeMm, finishing, dir.note), op);

  // mode names the calculator this calc feeds: rout for calculate(), drill
  // for calculateDrilling() (2026-09-02). The panel switches on it.
  return {
    status: 'mapped',
    calc: {
      mode: 'rout',
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
//
// Every refusal below names the heights and the stepdown as the add-in sent
// them, so a screenshot of the reason shows what was read. The live-run
// audit (2026-09-01) found rows refused with no numbers, and nobody could
// tell whether the add-in or the job was at fault. A null reads "not read".
function readDepth(op) {
  const p = op.params ?? {};
  const totalMm = totalDepthMm(op);
  const top = op.heights?.top?.zMm ?? null;
  const bottom = op.heights?.bottom?.zMm ?? null;
  const heightsRead = `top ${mmRead(top)}, bottom ${mmRead(bottom)}`;
  if (op.strategy === 'adaptive') {
    if (p.stepdownMm == null) {
      return { ok: false, reason: `The add-in could not read the stepdown for this 3D adaptive operation (${heightsRead}).` };
    }
    return { ok: true, apMm: p.stepdownMm, totalMm, perPass: true };
  }
  if (p.doMultipleDepths === true) {
    if (p.stepdownMm == null) {
      return { ok: false, reason: `The add-in could not read the stepdown for this multiple-depth operation (${heightsRead}).` };
    }
    return { ok: true, apMm: p.stepdownMm, totalMm, perPass: true };
  }
  if (p.doMultipleDepths !== false) {
    return { ok: false, reason: `The add-in could not read doMultipleDepths (stepdown ${mmRead(p.stepdownMm)}, ${heightsRead}). The stepdown in the dialog can be stale, so the mapping does not guess the pass depth.` };
  }
  if (top == null) {
    return { ok: false, reason: `The add-in could not read the top height (bottom ${mmRead(bottom)}). The multiple-depths box is off.${heightHint(op.heights?.top)}` };
  }
  if (bottom == null) {
    return { ok: false, reason: `The add-in could not read the bottom height (top ${mmRead(top)}). The multiple-depths box is off.${heightHint(op.heights?.bottom)}` };
  }
  const d = top - bottom;
  if (!(d > 0)) {
    return { ok: false, reason: `The add-in read a top height of ${mm(top)} mm and a bottom height of ${mm(bottom)} mm, so the cut has no positive depth. The multiple-depths box is off.` };
  }
  return { ok: true, apMm: d, totalMm: d, perPass: false };
}

// A drill (2026-09-02). The drilling chart serves from the drill diameter
// and the hole depth alone: the published band is a feed per revolution
// against speed with every cutting edge already counted (data/schema.md),
// so no flute count and no width of cut enter. The depth is the resolved
// hole top minus the resolved hole bottom, the two heights Fusion takes
// from the hole faces and the add-in resolves from them (spike section 12).
// Material, machine, profile and the drill family stay panel state.
function mapDrill(op) {
  const tool = op.tool ?? {};
  const top = op.heights?.top?.zMm ?? null;
  const bottom = op.heights?.bottom?.zMm ?? null;
  const heightsRead = `top ${mmRead(top)}, bottom ${mmRead(bottom)}`;
  if (tool.diameterMm == null) {
    return { status: 'unreadable', reason: `The add-in could not read the drill diameter (${heightsRead}).` };
  }
  const d = tool.diameterMm;
  if (top == null) {
    return { status: 'unreadable', reason: `The add-in could not read the hole top (bottom ${mmRead(bottom)}, drill ${mm(d)} mm).${heightHint(op.heights?.top)}` };
  }
  if (bottom == null) {
    return { status: 'unreadable', reason: `The add-in could not read the hole bottom (top ${mm(top)} mm, drill ${mm(d)} mm).${heightHint(op.heights?.bottom)}` };
  }
  const depth = top - bottom;
  if (!(depth > 0)) {
    return { status: 'unreadable', reason: `The add-in read a hole top of ${mm(top)} mm and a hole bottom of ${mm(bottom)} mm, so the hole has no positive depth.` };
  }
  return {
    status: 'mapped',
    calc: { mode: 'drill', diameterMm: d, holeDepthMm: depth },
    reading: withSpreadNote(`${mm(d)} mm drill, hole ${mm(depth)} mm deep.`, op),
  };
}

// The sentence a null height carries when Fusion takes that height from
// the selected geometry: the value was never in the dialog to read.
function heightHint(height) {
  const mode = height?.mode;
  if (height?.zMm != null || mode == null || !GEOMETRY_HEIGHT_MODES.has(mode)) return '';
  return ` Fusion takes this height from the selected geometry (${mode}), and the add-in could not read that geometry in the setup frame.`;
}

function withSpreadNote(line, op) {
  const spread = Math.max(op.heights?.top?.zSpreadMm ?? 0, op.heights?.bottom?.zSpreadMm ?? 0);
  return spread > 0.01 ? `${line} ${SPREAD_NOTE}` : line;
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

// A read value with its unit, or "not read" for the null the add-in sends
// when it could not read a fact. The refusal sentences use these so the
// value the policy leaned on is always on screen.
function mmRead(x) {
  return x == null ? 'not read' : `${mm(x)} mm`;
}

function countRead(n) {
  return n == null ? 'not read' : String(n);
}

const COUNT_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

function countWord(n) {
  return n >= 1 && n <= 10 ? COUNT_WORDS[n] : String(n);
}
