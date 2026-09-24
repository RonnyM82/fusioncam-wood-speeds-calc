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

// The tool kind and the ball geometry test live in tool-identity.js, which
// carries the same purity fence. The mapping reads them rather than repeating
// the type-string list, so the kinds cannot drift apart (2026-09-02).
import { toolKind, isRoundEndedTool } from './tool-identity.js';

// THE BETA SWITCH (Scott's ruling, 2026-09-24). The ball nose, the bull nose
// and 3D surfacing arrived in commit bc85559 and had never been live. They go
// live behind a beta switch, off by default, and with it off the panel maps
// every operation exactly as the live site did at commit 1e6c265: the same
// status and the same refusal words, 3D surfacing refused outright, a ball on
// a 2D strategy handed back for the panel to refuse, Flat and Horizontal
// refused as surfacing. map-operation-stable.js is that commit's
// map-operation.js, byte for byte (tests/fusion-beta.test.js checks its git
// blob id against 1e6c265's), so beta off is that code rather than a
// reconstruction of it. Promoting a feature out of beta is Scott's call; when
// he makes it, this delegation and the stable copy go.
import { mapOperation as mapOperationStable } from './map-operation-stable.js';

// contour2d, pocket2d and slot cut a full-width slot: the width of cut is
// the tool diameter. Every pocket level starts as a slot, so the slot
// number serves the whole level.
const SLOT_STRATEGIES = new Set(['contour2d', 'pocket2d', 'slot']);

// adaptive2d and adaptive use the programmed optimal load as the width of
// cut. This is the one case where chip-thinning compensation does real work.
const ADAPTIVE_STRATEGIES = new Set(['adaptive2d', 'adaptive']);

// The 3D surfacing strategies, and where each one states its cut.
//
// Read firsthand through the Fusion API on 2026-09-03, and corrected twice the
// same day as Scott read each table. Three sources: Operations.
// compatibleStrategies for the real ids, createInput(strategy).parameters for
// what each one states, and OperationStrategy.description, which is Fusion's
// own sentence about what the strategy is for.
//
// The description and the parameters are the evidence, NOT the is3DStrategy
// flag.
//
// Autodesk's post-processor API has the classification this wants, and states
// it properly: Section.checkGroup(groups) tests a section against a documented
// set that includes STRATEGY_2D, STRATEGY_3D, STRATEGY_MULTIAXIS,
// STRATEGY_SURFACE, STRATEGY_ROUGHING and STRATEGY_FINISHING
// (cam.autodesk.com/posts/reference/classSection.html, read 2026-09-03 on
// Scott's pointer). The design-time API exposes only a subset of those bits:
// OperationStrategy carries is2DStrategy, is3DStrategy, isFinishingStrategy,
// isMillingStrategy, isRotaryStrategy, isTurningStrategy, isDrillingStrategy,
// isCuttingStrategy, isAdditiveStrategy and isSupportStrategy, and no
// checkGroup, no multi-axis bit, no surface bit and no roughing bit. Probed
// firsthand: hasattr is false for every one of those names.
//
// So is3DStrategy is one bit of a wider grouping with the useful neighbours
// missing, and on its own it misreads this question. It reports false for
// geodesic, whose own description is "Creates a finishing operation to machine
// freeform surfaces and undercuts. Choose between a Blend type or Scallop type
// toolpath", which is surfacing work by any reading. The Flow description says
// plainly that "Flow is a 3-axis strategy by default, but multi-axis mode can
// be enabled", so multi-axis support is something most of these carry and is
// not what puts one in or out (Scott, 2026-09-03).
//
// Reaching the post groups needs a generated toolpath and a post-processor
// run. The panel does neither. If that ever changes, checkGroup is the
// definitive answer and this list should come from it.
//
// What IS out of scope is a strategy whose own description calls it a
// multi-axis strategy, because a three-axis nesting router cannot run one and
// because the cut is not a ball walking a surface: swarf machines "with the
// side of the tool", multi-axis contour and morph machine "with the tip of
// the tool" under lead, lag and sideways tilt, multi-axis finishing is for
// barrel tools, deburr is corner deburring, and the rotary family turns the
// part.
//
// Three families, and the difference is not cosmetic:
//   width from the stepover  - the finishing raster. Some carry an optional
//                              stepdown and some carry no stepdown at all.
//   width from the stepdown  - a Z-level pass. Fusion states no stepover for
//                              one, so the stepdown serves as the width of
//                              cut (Scott, 2026-09-03). It reads true on the
//                              steep walls these strategies are built for and
//                              understates a shallow surface, where the same
//                              stepdown engages far more of the tool.
//   neither readable         - project states its width as angularStepover
//                              and projectionStepover, which the add-in does
//                              not read, so it refuses.
//
// The set is Fusion's own is3DStrategy AND isFinishingStrategy, read off
// OperationStrategy, plus geodesic, which fails the 3D flag and is surfacing
// work by its own description (Scott, 2026-09-03). adaptive and
// pocket_clearing are the two that report 3D and NOT finishing: they are the
// 3D roughing strategies and they serve through the ordinary path.
const SURFACING_WIDTH_FROM_STEPOVER = new Set([
  'parallel', 'scallop', 'pencil', 'spiral', 'morphed_spiral', 'morph',
  'steep_and_shallow', 'blend', 'flow', 'flow2', 'corner', 'geodesic',
  'flat', 'horizontal',
]);

const SURFACING_WIDTH_FROM_STEPDOWN = new Set([
  'contour3d', 'ramp', 'inclined_walls', 'radial',
]);

const SURFACING_NO_WIDTH = new Set(['project', 'chamfer']);

export const SURFACING_3D = new Set([
  ...SURFACING_WIDTH_FROM_STEPOVER,
  ...SURFACING_WIDTH_FROM_STEPDOWN,
  ...SURFACING_NO_WIDTH,
]);

// The strategies that state a depth of cut of their own. Everything else in
// the surfacing set states none, and a pass with no stated depth still serves:
// the feed comes from the chip load and the width of cut, and the checks that
// need a depth are skipped and say so (Scott, 2026-09-03).
const SURFACING_HAS_STEPDOWN = new Set([
  'parallel', 'spiral', 'morphed_spiral', 'morph', 'steep_and_shallow',
  'flat', 'horizontal',
]);

// Flat and Horizontal are 3D finishing strategies that machine flat areas, so
// the tool cuts on its full diameter and the pass is facing work, not a ball
// walking a curved surface (Scott, 2026-09-03). Fusion's own descriptions
// agree: Flat "automatically detects all the flat areas of a part", Horizontal
// "automatically detects all the flat areas of the part and clears them with
// an offsetting path". They serve through the ordinary routing path with the
// Finishing profile, on whatever tool geometry the user confirmed, because a
// flat or a bull nose tool is what runs them. The width of cut is the
// stepover, not a full slot and not the 1 mm wall skim.
const FACING_STRATEGIES = new Set(['flat', 'horizontal']);

// One refusal sentence for a tool shape with no chart, on any strategy. An
// earlier draft read "No published chart covers this tool on a 3D surfacing
// pass. The ball nose chart covers a full-radius ball nose...", and read
// together those two sentences claim a chart IS published for a surfacing
// pass with the right tool. None is: every ball chart found states one
// condition, a cut one tool diameter deep (corrected 2026-09-03).
const TOOL_SHAPE_REASON = 'No published chip load covers this tool shape. The one ball chart covers a full-radius ball nose in softwood, hardwood and MDF, and it is published for a cut one tool diameter deep.';

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
// choices is { toolType, upcutLengthMm, finishing, beta }: the user-confirmed
// tool geometry, the confirmed up-cut length, the finish-row mark, and the
// panel's beta tick.
//
// A missing beta means OFF, on purpose. The panel always passes it, so the
// default only decides what a caller that forgets it gets, and that should
// be the behaviour that has been live and proven, never the newer numbers.
// A caller has to ask for beta by name to reach them.
export function mapOperation(op, choices = {}) {
  if (choices.beta !== true) {
    return mapOperationStable(op, choices);
  }
  const strategy = op.strategy;
  if (strategy == null) {
    return { status: 'unreadable', reason: 'The add-in could not read the strategy.' };
  }
  if (strategy === 'drill') {
    return mapDrill(op);
  }
  if (SURFACING_3D.has(strategy)) {
    // The scope rule (Scott, 2026-09-03): a 3D finishing strategy plus a
    // round-ended tool is a surfacing calculation. Flat and Horizontal are in
    // the set and they machine flat areas, so a flat or bull-ended router bit
    // running one of them is facing work and takes the routing charts with the
    // Finishing profile instead. Every other tool on a surfacing strategy
    // refuses, because no chart covers its shape.
    if (isServableBall(op.tool ?? {})) {
      return mapSurfacing(op);
    }
    if (FACING_STRATEGIES.has(strategy)) {
      return mapFacing(op, choices);
    }
    return { status: 'unsupported', reason: toolShapeReason(op.tool ?? {}) };
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

  // A ball nose on a 2D strategy is the cut the ball chart is published for
  // (2026-09-02). A contour, a slot or a pocket level with a ball is a
  // full-width groove with a round bottom, which is exactly the chart's
  // stated condition of a cut one tool diameter deep and full width. The
  // tool's own geometry decides the type, so the panel asks nothing and the
  // user's spiral-direction answer, which a ball does not have, never
  // reaches the core.
  const ballNose = isServableBall(tool);
  // A tool the charts do not cover refuses here too, not only on a surfacing
  // strategy (corrected 2026-09-03). Without this a bull nose that Fusion
  // types as a ball end mill fell through to whatever geometry the caller
  // passed and was served a flat router chip load on a contour or a slot.
  if (!ballNose && toolKind(tool.typeString) !== 'router') {
    return { status: 'unsupported', reason: toolShapeReason(tool) };
  }
  const toolType = ballNose ? 'ball' : (choices.toolType ?? null);
  if (toolType == null) {
    // Guard, not policy. The panel confirms a router bit's geometry before it
    // reaches here, but a headless caller could skip that, and an unknown
    // tool type throws inside the chip-load selector rather than refusing.
    return { status: 'unreadable', reason: 'No tool geometry was confirmed for this operation, so the calculator has no chart to read.' };
  }

  // The finish mark applies to a 2D contour wall skim only (protocol.md
  // table row "contour2d marked finish"). The width of cut is null on
  // purpose: the core then assumes the published 1 mm skim from rules.json.
  // A ball nose never takes it: no finisher chart covers a ball, so the core
  // refuses that profile and the mark would turn a served row into a refusal.
  const finishing = choices.finishing === true && strategy === 'contour2d' && !ballNose;

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
      toolType,
      diameterMm: tool.diameterMm,
      cornerRadiusMm: ballNose ? tool.cornerRadiusMm : null,
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

// The tool shapes the surfacing path covers: a ball, or a bull nose (Scott,
// 2026-09-03). Fusion must name it as one AND the measurements must agree,
// because its own library types tools loosely. A bull nose reads the ball
// chart at its corner diameter, which the core does from cornerRadiusMm.
function isServableBall(tool) {
  const kind = toolKind(tool?.typeString);
  return (kind === 'ball' || kind === 'bullnose') && isRoundEndedTool(tool);
}

// One refusal sentence for every tool shape with no chart, on any strategy,
// carrying the three values that decided it so a screenshot diagnoses itself
// (protocol.md rule 1).
function toolShapeReason(tool) {
  const type = tool?.typeString == null ? 'not read' : `"${tool.typeString}"`;
  return `${TOOL_SHAPE_REASON} The add-in read tool type ${type}, diameter ${mmRead(tool?.diameterMm)}, corner radius ${mmRead(tool?.cornerRadiusMm)}.`;
}

// A 3D surfacing pass with a ball nose (2026-09-02). The width of cut is the
// stepover and the depth of cut is the stepdown, both read straight from the
// operation. Neither is ever defaulted: a 3D pass has no full-slot fallback
// to fall back to, and a guessed stepover would set the whole feed.
//
// The tool test is geometric, not a name. isFullRadiusBall compares the
// corner radius against half the diameter, because Fusion's own library types
// tools loosely and the served chart is for a full round tip alone.
//
// The flute count is required, unlike a drill: the ball chart publishes a
// chip load per tooth, so the feed depends on it.
function mapSurfacing(op) {
  const tool = op.tool ?? {};
  const p = op.params ?? {};
  const strategy = op.strategy;
  if (!isServableBall(tool)) {
    return { status: 'unsupported', reason: toolShapeReason(tool) };
  }
  if (tool.diameterMm == null) {
    return { status: 'unreadable', reason: `The add-in could not read the tool diameter (flute count ${countRead(tool.flutes)}).` };
  }
  if (tool.flutes == null) {
    return { status: 'unreadable', reason: `The add-in could not read the flute count (tool diameter ${mm(tool.diameterMm)} mm).` };
  }
  if (SURFACING_NO_WIDTH.has(strategy)) {
    return { status: 'unsupported', reason: `The ${strategy} strategy states no width of cut, and the width of cut is what sets the feed. The calculator gives no number without one.` };
  }

  // Where the width comes from, and what it is called on the page.
  const fromStepdown = SURFACING_WIDTH_FROM_STEPDOWN.has(strategy);
  const aeMm = fromStepdown ? p.stepdownMm : p.stepoverMm;
  const widthWord = fromStepdown ? 'stepdown' : 'stepover';
  if (aeMm == null) {
    return { status: 'unreadable', reason: `The add-in could not read the ${widthWord} for this ${strategy} operation (tool diameter ${mm(tool.diameterMm)} mm). The ${widthWord} sets the whole feed on a surfacing pass, so the mapping does not guess it. A greyed-out control in Fusion reads as not set.` };
  }
  if (!(aeMm > 0)) {
    return { status: 'unreadable', reason: `The add-in read a ${widthWord} of ${mm(aeMm)} mm, so the pass has no width of cut.` };
  }

  // The depth. A strategy with no stepdown states none, and one whose
  // stepdown is the width has already spent it. apMm null means "not stated"
  // to the core, which then serves the feed and skips the power and hold-down
  // checks rather than inventing a depth.
  const hasDepth = SURFACING_HAS_STEPDOWN.has(strategy) && !fromStepdown;
  const apMm = hasDepth && p.stepdownMm > 0 ? p.stepdownMm : null;

  const dir = readDirection(op);
  if (!dir.ok) {
    return { status: 'unreadable', reason: dir.reason };
  }
  const depthWord = apMm == null
    ? 'The toolpath states no depth of cut.'
    : `${mm(apMm)} mm stepdown.`;
  // Where the width came from, in Fusion's own parameter name, when the
  // add-in said. A corner pass states four stepovers and the add-in takes
  // the largest live one, so the reading has to say which (2026-09-03).
  const widthFrom = p.stepoverParam && !fromStepdown ? ` Fusion states it as ${p.stepoverParam}.` : '';
  const reading = [
    `Ball nose surfacing, ${mm(aeMm)} mm ${widthWord} as the width of cut.${widthFrom}`,
    depthWord,
    dir.note,
  ].filter(Boolean).join(' ');
  return {
    status: 'mapped',
    calc: {
      mode: 'rout',
      toolType: 'ball',
      diameterMm: tool.diameterMm,
      // The corner radius is what the core indexes the chart on: half the
      // diameter is a ball, less than that is a bull nose (2026-09-03).
      cornerRadiusMm: tool.cornerRadiusMm,
      flutesTotal: tool.flutes,
      apMm,
      aeMm,
      direction: dir.direction,
      upcutLengthMm: null,
      profileOverride: null,
    },
    reading,
  };
}

// Flat and Horizontal (2026-09-03). A finishing pass over the flat areas of a
// part, run with a flat or a bull nose tool, so the routing charts serve it
// and the Finishing profile is the right one: this is the cut that follows a
// rougher and leaves the face. The width of cut is the stepover. The depth is
// the stepdown when the strategy states one, and null when it does not, which
// is the same rule the surfacing path uses.
//
// A ball nose on one of these refuses in the core, because no finisher chart
// covers a ball nose. That refusal is correct and it already says so.
function mapFacing(op, choices) {
  const tool = op.tool ?? {};
  const p = op.params ?? {};
  const strategy = op.strategy;
  if (tool.diameterMm == null) {
    return { status: 'unreadable', reason: `The add-in could not read the tool diameter (flute count ${countRead(tool.flutes)}).` };
  }
  if (tool.flutes == null) {
    return { status: 'unreadable', reason: `The add-in could not read the flute count (tool diameter ${mm(tool.diameterMm)} mm).` };
  }
  const kind = toolKind(tool.typeString);
  const ballNose = isServableBall(tool);
  if (!ballNose && kind !== 'router') {
    return { status: 'unsupported', reason: toolShapeReason(tool) };
  }
  const toolType = ballNose ? 'ball' : (choices.toolType ?? null);
  if (toolType == null) {
    return { status: 'unreadable', reason: 'No tool geometry was confirmed for this operation, so the calculator has no chart to read.' };
  }
  if (p.stepoverMm == null) {
    return { status: 'unreadable', reason: `The add-in could not read the stepover for this ${strategy} operation (tool diameter ${mm(tool.diameterMm)} mm). Fusion sets the stepover itself unless the manual stepover box is on, and a greyed-out control reads as not set, so the mapping does not guess it.` };
  }
  if (!(p.stepoverMm > 0)) {
    return { status: 'unreadable', reason: `The add-in read a stepover of ${mm(p.stepoverMm)} mm, so the pass has no width of cut.` };
  }
  const apMm = p.stepdownMm > 0 ? p.stepdownMm : null;
  const dir = readDirection(op);
  if (!dir.ok) {
    return { status: 'unreadable', reason: dir.reason };
  }
  const depthWord = apMm == null
    ? 'The toolpath states no depth of cut.'
    : `${mm(apMm)} mm stepdown.`;
  return {
    status: 'mapped',
    calc: {
      mode: 'rout',
      toolType,
      diameterMm: tool.diameterMm,
      cornerRadiusMm: ballNose ? tool.cornerRadiusMm : null,
      flutesTotal: tool.flutes,
      apMm,
      aeMm: p.stepoverMm,
      direction: dir.direction,
      upcutLengthMm: choices.upcutLengthMm ?? null,
      profileOverride: 'finishing',
    },
    reading: [
      `Finishing pass over the flat areas, ${mm(p.stepoverMm)} mm stepover as the width of cut.`,
      depthWord,
      dir.note,
    ].filter(Boolean).join(' '),
  };
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

// The 3D parallel carries its own direction vocabulary, "one way", "other
// way" and "both ways", read inside Fusion on 2026-09-01 (spike section 2).
// None of the three names climb or conventional, and none can: a raster pass
// over a surface climbs on one side of a ridge and cuts conventionally on the
// other, and reverses again at every grain reversal it crosses. All three are
// therefore ambiguous, which serves the climb force model, the conservative
// one, exactly as "both" already does.
const RASTER_DIRECTIONS = new Set(['one way', 'other way', 'both ways']);
const RASTER_NOTE = 'A raster pass over a surface cuts in both directions.';

function readDirection(op) {
  const p = op.params ?? {};
  if (p.direction === 'climb' || p.direction === 'conventional') {
    return { ok: true, direction: p.direction, note: null };
  }
  if (RASTER_DIRECTIONS.has(p.direction)) {
    return { ok: true, direction: 'climb', note: `${RASTER_NOTE} ${CLIMB_MODEL_NOTE}` };
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
