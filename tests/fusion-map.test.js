// Fusion mapping policy (fusion-addin/protocol.md, 2026-09-01): hand-written
// operations in the job message shape, one per row of the mapping table,
// plus the direction readings, the refusal wording and the null-fact
// refusals. FM21 feeds a mapped result into the real core with the real
// data files, to prove the field names line up. FM29 pins that every
// unreadable reason names the values the add-in read, in millimetres to one
// decimal, so a screenshot of a refused row diagnoses itself (2026-09-01).

import { test, assert, approx } from './helpers.js';
import { loadData } from './load-node.js';
import { calculate } from '../js/core/calculate.js';
import { calculateDrilling } from '../js/core/drilling.js';
import { mapOperation } from '../js/fusion/map-operation.js';
import { readFacts } from '../js/fusion/present.js';

const data = loadData();

// beta: true throughout this file, which pins the mapping as it is with the
// panel's beta tick on (Scott's ruling, 2026-09-24). The tick off is the live
// mapping of commit 1e6c265, pinned in tests/fusion-beta.test.js.
const CHOICES = { toolType: 'upcut', upcutLengthMm: null, finishing: false, beta: true };

// One operation in the exact protocol.md shape. tool, params and heights
// merge over the base per level, so a test names only what it changes.
function op(strategy, { tool = {}, params = {}, heights = {} } = {}) {
  return {
    opId: 'op-1',
    name: 'Op1',
    strategy,
    suppressed: false,
    isValid: true,
    hasToolpath: true,
    tool: {
      typeString: 'flat end mill', diameterMm: 12.7, cornerRadiusMm: 0,
      flutes: 2, fluteLengthMm: 32, shoulderLengthMm: 36,
      vendor: 'Onsrud', productId: '60-123', description: '1/2 upcut 2FL', comment: '',
      ...tool,
    },
    params: {
      stepdownMm: null, doMultipleDepths: false, stepoverMm: null,
      optimalLoadMm: null, stockToLeaveMm: 0, verticalStockToLeaveMm: 0,
      finishing: { enabled: false, stepoverMm: null, passes: null },
      direction: null, compensation: 'left', rampAngleDeg: 4,
      ...params,
    },
    heights: {
      top: { mode: 'from stock top', offsetMm: 0, zMm: 18 },
      bottom: { mode: 'from stock bottom', offsetMm: 0, zMm: 0 },
      ...heights,
    },
  };
}

test('FM1', 'contour2d single depth: full-width slot at the full depth', () => {
  // The stepdown is still set in the dialog, but multiple depths is off,
  // so the cut takes the full depth in one pass.
  const m = mapOperation(op('contour2d', { params: { stepdownMm: 9, doMultipleDepths: false } }), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  approx(m.calc.apMm, 18, { abs: 1e-9 });
  approx(m.calc.aeMm, 12.7, { abs: 1e-9 });
  assert(m.calc.direction === 'climb', `left compensation must read as climb, got ${m.calc.direction}`);
  assert(m.calc.profileOverride === null, 'no finish mark, so no profile override');
  assert(m.reading === 'Full-width slot, 18 mm deep, in one pass.', m.reading);
});

test('FM2', 'contour2d multiple depths: stepdown serves, pass count in the reading', () => {
  const m = mapOperation(op('contour2d', {
    params: { stepdownMm: 9, doMultipleDepths: true },
    heights: { top: { mode: 'from stock top', offsetMm: 0.5, zMm: 18.5 } },
  }), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  approx(m.calc.apMm, 9, { abs: 1e-9 });
  assert(m.reading === 'Full-width slot, 18.5 mm deep, in three passes of 9 mm.', m.reading);
});

test('FM3', 'pocket2d multiple depths: full width, stepdown serves, compensation reads', () => {
  // The doMultipleDepths gate applies to every levelled 2D strategy
  // (corrected 2026-09-01): the stepdown serves only when the box is on.
  // The pocket carries compensation like the contour (spike section 2,
  // 2026-09-01), so the base left reads as climb here too.
  const m = mapOperation(op('pocket2d', { params: { stepdownMm: 6, doMultipleDepths: true } }), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  approx(m.calc.apMm, 6, { abs: 1e-9 });
  approx(m.calc.aeMm, 12.7, { abs: 1e-9 });
  assert(m.calc.direction === 'climb', `left compensation on a pocket must read as climb, got ${m.calc.direction}`);
  assert(m.reading === 'Full-width slot at each pocket level, 18 mm deep, in three passes of 6 mm.', m.reading);
  const bare = mapOperation(op('pocket2d', { params: { stepdownMm: 6, doMultipleDepths: true, compensation: null } }), CHOICES);
  assert(bare.calc.direction === null, 'a null compensation on a pocket stays null, never guessed');
});

test('FM4', 'adaptive2d: optimal load is the width of cut', () => {
  const m = mapOperation(op('adaptive2d', {
    params: { optimalLoadMm: 2.5, stepdownMm: 12, doMultipleDepths: true },
    heights: { bottom: { mode: 'from stock bottom', offsetMm: 0, zMm: 6 } },
  }), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  approx(m.calc.aeMm, 2.5, { abs: 1e-9 });
  approx(m.calc.apMm, 12, { abs: 1e-9 });
  assert(m.reading === 'Adaptive clearing at 2.5 mm width of cut, 12 mm deep per pass.', m.reading);
});

test('FM5', 'adaptive (3D) maps like adaptive2d and is never refused as 3D', () => {
  const m = mapOperation(op('adaptive', { params: { optimalLoadMm: 3, stepdownMm: 10 } }), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  approx(m.calc.aeMm, 3, { abs: 1e-9 });
  approx(m.calc.apMm, 10, { abs: 1e-9 });
});

test('FM6', 'slot: full width, heights depth with the box off, stepdown with it on', () => {
  const single = mapOperation(op('slot', {
    heights: { top: { mode: 'from stock top', offsetMm: 0, zMm: 12 } },
  }), CHOICES);
  assert(single.status === 'mapped', `expected mapped, got ${single.status}: ${single.reason}`);
  approx(single.calc.apMm, 12, { abs: 1e-9 });
  approx(single.calc.aeMm, 12.7, { abs: 1e-9 });
  const stepped = mapOperation(op('slot', { params: { stepdownMm: 5, doMultipleDepths: true } }), CHOICES);
  approx(stepped.calc.apMm, 5, { abs: 1e-9 });
});

// One height Fusion takes from the selected geometry, as the add-in ships it
// after resolving it in the setup frame (protocol.md heights, 2026-09-02).
function geometry(mode, zMm, spreadMm = 0) {
  return { mode, offsetMm: 0, zMm, zSource: zMm == null ? null : 'geometry', zSpreadMm: zMm == null ? null : spreadMm };
}

// A drill operation: a 5 mm drill and a 13 mm hole from the hole faces.
function drillOp({ tool = {}, heights = {} } = {}) {
  return op('drill', {
    tool: { typeString: 'drill', diameterMm: 5, flutes: 2, ...tool },
    heights: { top: geometry('from hole top', 18), bottom: geometry('from hole bottom', 5), ...heights },
  });
}

test('FM7', 'drill maps to the drilling calc from the diameter and the resolved hole', () => {
  // The drilling charts landed (2026-09-02). Fusion takes a drill's heights
  // from the hole faces and the add-in resolves them there; the depth is
  // the hole top minus the hole bottom. No flute count enters the calc: the
  // published band counts every cutting edge (data/schema.md).
  const m = mapOperation(drillOp(), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  assert(m.calc.mode === 'drill', `expected mode drill, got ${m.calc.mode}`);
  approx(m.calc.diameterMm, 5, { abs: 1e-9 });
  approx(m.calc.holeDepthMm, 13, { abs: 1e-9 });
  assert(m.reading === '5 mm drill, hole 13 mm deep.', m.reading);
  assert(!('toolType' in m.calc) && !('flutesTotal' in m.calc) && !('aeMm' in m.calc), 'a drill calc carries no router field');
});

test('FM8', 'a 3D surfacing strategy refuses every tool that is not a full-radius ball, and names what it read', () => {
  // Until 2026-09-02 every 3D strategy refused outright. The ball nose chart
  // now serves one tool shape, so the refusal moved from the strategy to the
  // tool, and it prints the two measurements that decided it.
  for (const strategy of ['parallel', 'scallop', 'morphed_spiral', 'contour3d']) {
    const m = mapOperation(op(strategy), CHOICES);
    assert(m.status === 'unsupported', `${strategy}: expected unsupported, got ${m.status}`);
    assert(m.reason.startsWith('No published chip load covers this tool shape.'), `${strategy}: ${m.reason}`);
    // The sentence must never imply a chart exists for a surfacing pass.
    // None does, and the corrected wording says the chart's condition
    // instead (2026-09-03).
    assert(m.reason.includes('published for a cut one tool diameter deep'),
      `${strategy}: the reason must state what the chart is published for: ${m.reason}`);
    assert(!/covers .*on a 3D surfacing pass/.test(m.reason),
      `${strategy}: no sentence may imply a chart covers a surfacing pass: ${m.reason}`);
    assert(m.reason.includes('flat end mill') && m.reason.includes('corner radius 0 mm'),
      `${strategy}: the reason must name the tool type and the corner radius it read: ${m.reason}`);
  }
  // A corner radius past half the diameter is a bad reading, not a tool.
  const over = mapOperation(ballOp('parallel', { tool: { cornerRadiusMm: 8 } }), CHOICES);
  assert(over.status === 'unsupported', `a corner past a full radius must refuse, got ${over.status}`);
  assert(over.reason.includes('corner radius 8 mm'), `the reason must name the radius: ${over.reason}`);
  // A tapered ball: Fusion types it as a taper mill, so the kind alone stops it.
  const taper = mapOperation(ballOp('parallel', { tool: { typeString: 'tapered mill', diameterMm: 6.35, cornerRadiusMm: 3.175 } }), CHOICES);
  assert(taper.status === 'unsupported', `a tapered mill must refuse, got ${taper.status}`);
  assert(taper.reason.includes('tapered mill'), `the reason must name the type: ${taper.reason}`);
});

// A full-radius ball on a 3D surfacing pass, the shape every FM34-onward test
// starts from: 8 mm ball, 4 mm corner radius, 1.2 mm stepover, 0.8 stepdown.
function ballOp(strategy = 'parallel', { tool = {}, params = {} } = {}) {
  return op(strategy, {
    tool: { typeString: 'ball end mill', diameterMm: 8, cornerRadiusMm: 4, flutes: 2, ...tool },
    params: { stepoverMm: 1.2, stepdownMm: 0.8, doMultipleDepths: true, direction: 'one way', ...params },
  });
}

test('FM34', 'a surfacing pass takes its width of cut from whichever parameter the strategy states', () => {
  // Read firsthand through the Fusion API on 2026-09-03. A scallop or a
  // pencil pass carries a stepover and no stepdown anywhere. A 3D contour or
  // a ramp carries a stepdown and no stepover, and the stepdown then serves
  // as the width of cut (Scott's call): it reads true on the steep walls
  // those strategies are built for.
  for (const strategy of ['parallel', 'scallop', 'morph', 'steep_and_shallow', 'blend', 'pencil', 'flow2', 'geodesic']) {
    const m = mapOperation(ballOp(strategy), CHOICES);
    assert(m.status === 'mapped', `${strategy}: expected mapped, got ${m.status} — ${m.reason}`);
    assert(m.calc.toolType === 'ball', `${strategy}: got tool type ${m.calc.toolType}`);
    assert(m.calc.aeMm === 1.2, `${strategy}: the stepover is the width of cut, got ${m.calc.aeMm}`);
    assert(m.reading.includes('1.2 mm stepover as the width of cut'), `${strategy}: ${m.reading}`);
  }
  // Only the strategies that state a stepdown carry a depth of cut.
  const withDepth = mapOperation(ballOp('parallel'), CHOICES);
  assert(withDepth.calc.apMm === 0.8, `a parallel states a stepdown, got ${withDepth.calc.apMm}`);
  const noDepth = mapOperation(ballOp('scallop'), CHOICES);
  assert(noDepth.calc.apMm === null, `a scallop states no stepdown at all, got ${noDepth.calc.apMm}`);
  assert(noDepth.reading.includes('states no depth of cut'), `the reading must say so: ${noDepth.reading}`);
  // A Z-level pass spends its stepdown as the width and states no depth.
  for (const strategy of ['contour3d', 'ramp', 'radial', 'inclined_walls']) {
    const m = mapOperation(ballOp(strategy), CHOICES);
    assert(m.status === 'mapped', `${strategy}: expected mapped, got ${m.status} — ${m.reason}`);
    assert(m.calc.aeMm === 0.8, `${strategy}: the stepdown is the width, got ${m.calc.aeMm}`);
    assert(m.calc.apMm === null, `${strategy}: the stepdown is spent on the width, got ${m.calc.apMm}`);
    assert(m.reading.includes('0.8 mm stepdown as the width of cut'), `${strategy}: ${m.reading}`);
  }
  // Fusion calls the 3D contour "contour3d". The old list said "contour",
  // which Fusion never sends, so a real 3D contour never matched.
  assert(mapOperation(ballOp('contour'), CHOICES).reason.includes('contour'),
    'a strategy id Fusion does not send must fall through to the unknown-strategy refusal');
  // project states its width in parameters the add-in does not read.
  const proj = mapOperation(ballOp('project'), CHOICES);
  assert(proj.status === 'unsupported', `project: expected unsupported, got ${proj.status}`);
  assert(proj.reason.includes('no width of cut'), `project: ${proj.reason}`);
  // Scope comes from Fusion's own description of each strategy, not from its
  // is3DStrategy flag, which reports false for geodesic even though geodesic
  // "machines freeform surfaces and undercuts" and reports true for the
  // facing strategies. A strategy whose description calls it a multi-axis
  // strategy is out: a three-axis nesting router cannot run one, and the cut
  // is the side or the tilted tip of the tool, not a ball walking a surface.
  for (const strategy of ['swarf', 'deburr', 'multi_axis_contour', 'rotary_finishing', 'multi_axis_morph']) {
    const m = mapOperation(ballOp(strategy), CHOICES);
    assert(m.status === 'unsupported', `${strategy}: expected unsupported, got ${m.status}`);
    assert(m.reason.includes(strategy), `${strategy}: the reason must name the strategy: ${m.reason}`);
  }
  // corner is 3D finishing and it states four stepovers, steep and shallow
  // by constant and by maximum. The add-in reads the largest live one,
  // because a wider cut thins the chip less and so serves the lower feed.
  const corner = mapOperation(ballOp('corner', { params: { stepoverMm: 0.9, stepoverParam: 'shallowRestMaximumStepover' } }), CHOICES);
  assert(corner.status === 'mapped', `corner: expected mapped, got ${corner.status} — ${corner.reason}`);
  assert(corner.calc.aeMm === 0.9, `corner: got ${corner.calc.aeMm}`);
  assert(corner.calc.apMm === null, 'corner states no stepdown');
});

test('FM35', 'a surfacing pass never guesses the stepover or the stepdown', () => {
  const noStepover = mapOperation(ballOp('parallel', { params: { stepoverMm: null } }), CHOICES);
  assert(noStepover.status === 'unreadable', `expected unreadable, got ${noStepover.status}`);
  assert(noStepover.reason.includes('stepover') && noStepover.reason.includes('8 mm'),
    `the reason must name the missing fact and what it read: ${noStepover.reason}`);
  assert(noStepover.reason.includes('greyed-out'), `and must say what a greyed-out control means: ${noStepover.reason}`);
  // A null stepdown on a strategy that states one is not a refusal any more:
  // the add-in ships null for a greyed-out control, and a parallel with
  // Multiple Depths off is a single pass with no depth (2026-09-03).
  const noStepdown = mapOperation(ballOp('parallel', { params: { stepdownMm: null } }), CHOICES);
  assert(noStepdown.status === 'mapped', `expected mapped, got ${noStepdown.status} — ${noStepdown.reason}`);
  assert(noStepdown.calc.apMm === null, 'no stepdown means no depth of cut, not a refusal');
  for (const bad of [{ stepoverMm: 0 }, { stepoverMm: -1 }]) {
    const m = mapOperation(ballOp('parallel', { params: bad }), CHOICES);
    assert(m.status === 'unreadable', `${JSON.stringify(bad)}: expected unreadable, got ${m.status}`);
  }
  const zeroWidth = mapOperation(ballOp('contour3d', { params: { stepdownMm: 0 } }), CHOICES);
  assert(zeroWidth.status === 'unreadable', 'a Z-level pass with no stepdown has no width of cut');
  const noFlutes = mapOperation(ballOp('parallel', { tool: { flutes: null } }), CHOICES);
  assert(noFlutes.status === 'unreadable', 'the ball chart is a chip load per tooth, so the flute count is required');
});

test('FM37', 'a greyed-out control reads as not set, and a single-pass finish still serves', () => {
  // Fusion greys a parameter out when the switch in front of it is off, and
  // the reading then reports 0.0 while the expression holds the last value
  // the dialog showed. Read inside Fusion on 2026-09-03: a 3D parallel with
  // Multiple Depths off reports maximumStepdown value 0.0, expression
  // "1.0mm", isEnabled False. The add-in now ships null for that, so the
  // mapping never sees the stale number and a single-pass finish, which is
  // the normal case, serves with no depth of cut.
  const single = mapOperation(ballOp('parallel', { params: { stepdownMm: null, doMultipleDepths: false } }), CHOICES);
  assert(single.status === 'mapped', `expected mapped, got ${single.status} — ${single.reason}`);
  assert(single.calc.apMm === null, `expected no depth of cut, got ${single.calc.apMm}`);
  assert(single.calc.aeMm === 1.2, 'the stepover still sets the width of cut');
  assert(single.reading.includes('states no depth of cut'), `the reading must say so: ${single.reading}`);
  assert(readFacts(ballOp('parallel', { params: { stepdownMm: null } })).includes('stepdown not read'),
    'the facts clause must show the stepdown did not read');
});

test('FM38', 'a tool shape no chart covers refuses on a 2D strategy too, not only on a surfacing pass', () => {
  // Until 2026-09-03 a bull nose that Fusion types as a ball end mill fell
  // through the 2D path and was served whatever geometry the caller passed.
  // The Windows spike found Fusion's own library typing a tool named
  // "9.5dia Bullnose" as a ball end mill, so this is a real tool.
  const form = { typeString: 'dovetail mill', diameterMm: 12.7, cornerRadiusMm: 0, flutes: 2 };
  for (const strategy of ['contour2d', 'pocket2d', 'slot', 'adaptive2d']) {
    const m = mapOperation(op(strategy, {
      tool: form,
      params: { stepdownMm: 6, doMultipleDepths: true, optimalLoadMm: 3 },
    }), CHOICES);
    assert(m.status === 'unsupported', `${strategy}: a form tool must refuse, got ${m.status} with toolType ${m.calc?.toolType}`);
    assert(m.reason.includes('dovetail mill'), `${strategy}: the reason must name the tool: ${m.reason}`);
  }
  // A bull nose serves on a 2D strategy too, at its corner diameter.
  const bull = mapOperation(op('contour2d', {
    tool: { typeString: 'bull nose end mill', diameterMm: 12.7, cornerRadiusMm: 1.5, flutes: 2 },
    params: { stepdownMm: 6, doMultipleDepths: true },
  }), CHOICES);
  assert(bull.status === 'mapped', `a bull nose must map, got ${bull.status} — ${bull.reason}`);
  assert(bull.calc.toolType === 'ball' && bull.calc.cornerRadiusMm === 1.5,
    `the corner radius must ride through: ${JSON.stringify(bull.calc)}`);
  // A full-radius ball on a 2D strategy is the cut the chart IS published for,
  // and its own geometry decides the type whatever the caller passes.
  const ball = mapOperation(op('contour2d', {
    tool: { typeString: 'ball end mill', diameterMm: 12.7, cornerRadiusMm: 6.35, flutes: 2 },
    params: { stepdownMm: 6, doMultipleDepths: true },
  }), CHOICES);
  assert(ball.status === 'mapped', `a full-radius ball on a contour must serve, got ${ball.status}`);
  assert(ball.calc.toolType === 'ball', `the tool's own geometry decides the type, got ${ball.calc.toolType}`);
  assert(ball.calc.aeMm === 12.7, 'a 2D contour with a ball is a full-width groove, which is the chart condition');
  // A chamfer or form tool refuses the same way, and the panel prints that
  // reason directly (it probes with toolType null).
  const chamfer = mapOperation(op('contour2d', {
    tool: { typeString: 'chamfer mill', diameterMm: 12.7, cornerRadiusMm: 0, flutes: 2 },
    params: { stepdownMm: 6, doMultipleDepths: true },
  }), { toolType: null, finishing: false, beta: true });
  assert(chamfer.status === 'unsupported', `a chamfer mill must refuse, got ${chamfer.status}`);
  assert(chamfer.reason.includes('chamfer mill'), `the reason must name the tool: ${chamfer.reason}`);
});

test('FM36', 'the 3D parallel direction words all read as ambiguous and serve the climb model', () => {
  // Fusion gives the parallel "one way", "other way" and "both ways" (spike
  // section 2). A raster pass climbs on one side of a ridge and cuts
  // conventionally on the other, so none of the three is a cut direction.
  for (const direction of ['one way', 'other way', 'both ways']) {
    const m = mapOperation(ballOp('parallel', { params: { direction } }), CHOICES);
    assert(m.status === 'mapped', `${direction}: expected mapped, got ${m.status} — ${m.reason}`);
    assert(m.calc.direction === 'climb', `${direction}: the conservative model is climb, got ${m.calc.direction}`);
    assert(m.reading.includes('both directions'), `${direction}: the reading must say so: ${m.reading}`);
  }
  const odd = mapOperation(ballOp('parallel', { params: { direction: 'sideways' } }), CHOICES);
  assert(odd.status === 'unreadable', 'an unrecognised direction is still unreadable, never defaulted');
});

test('FM9', 'an unknown strategy refuses and is named in the reason', () => {
  const m = mapOperation(op('engrave2d'), CHOICES);
  assert(m.status === 'unsupported', `expected unsupported, got ${m.status}`);
  assert(m.reason.includes('engrave2d'), `the reason must name the strategy: ${m.reason}`);
});

test('FM10', 'a finish-marked contour2d serves the null width and the finishing override', () => {
  const m = mapOperation(op('contour2d'), { ...CHOICES, finishing: true });
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  assert(m.calc.aeMm === null, 'the finish width must stay null so the core assumes the skim');
  assert(m.calc.profileOverride === 'finishing', `expected the finishing override, got ${m.calc.profileOverride}`);
  assert(m.reading === 'Wall finish skim. The core assumes 1 mm of stock on the wall.', m.reading);
});

test('FM11', 'params.direction wins over compensation', () => {
  const m = mapOperation(op('contour2d', { params: { direction: 'conventional', compensation: 'left' } }), CHOICES);
  assert(m.calc.direction === 'conventional', `expected conventional, got ${m.calc.direction}`);
});

test('FM12', 'compensation left reads as climb, right as conventional', () => {
  const left = mapOperation(op('contour2d', { params: { compensation: 'left' } }), CHOICES);
  assert(left.calc.direction === 'climb', `left: got ${left.calc.direction}`);
  const right = mapOperation(op('contour2d', { params: { compensation: 'right' } }), CHOICES);
  assert(right.calc.direction === 'conventional', `right: got ${right.calc.direction}`);
});

test('FM13', 'centre compensation serves climb and says the tool cuts on the line', () => {
  // Corrected 2026-09-01: the ambiguous cases serve the climb force
  // model, the conservative one. In every measured pair in kc.json the
  // climb Ks is higher, so climb gives the lower power and hold-down caps.
  const m = mapOperation(op('contour2d', { params: { compensation: 'center' } }), CHOICES);
  assert(m.calc.direction === 'climb', `expected climb, got ${m.calc.direction}`);
  assert(m.reading.includes('The tool cuts on the line.'), m.reading);
  assert(m.reading.includes('climb force model, the conservative one'), m.reading);
});

test('FM14', 'both-ways compensation serves climb and the reading names the force model', () => {
  const m = mapOperation(op('contour2d', { params: { compensation: 'both' } }), CHOICES);
  assert(m.calc.direction === 'climb', `expected climb, got ${m.calc.direction}`);
  assert(m.reading.includes('both directions'), m.reading);
  assert(m.reading.includes('climb force model, the conservative one'), m.reading);
});

test('FM15', 'a null tool diameter is unreadable and named', () => {
  const m = mapOperation(op('contour2d', { tool: { diameterMm: null } }), CHOICES);
  assert(m.status === 'unreadable', `expected unreadable, got ${m.status}`);
  assert(m.reason.includes('tool diameter'), m.reason);
});

test('FM16', 'a null flute count is unreadable and named', () => {
  const m = mapOperation(op('contour2d', { tool: { flutes: null } }), CHOICES);
  assert(m.status === 'unreadable', `expected unreadable, got ${m.status}`);
  assert(m.reason.includes('flute count'), m.reason);
});

test('FM17', 'a null optimal load on adaptive is unreadable and named', () => {
  const m = mapOperation(op('adaptive', { params: { optimalLoadMm: null, stepdownMm: 10 } }), CHOICES);
  assert(m.status === 'unreadable', `expected unreadable, got ${m.status}`);
  assert(m.reason.includes('optimal load'), m.reason);
});

test('FM18', 'missing heights with no stepdown are unreadable and named', () => {
  const noTop = mapOperation(op('contour2d', {
    heights: { top: { mode: 'from stock top', offsetMm: 0, zMm: null } },
  }), CHOICES);
  assert(noTop.status === 'unreadable', `expected unreadable, got ${noTop.status}`);
  assert(noTop.reason.includes('top height'), noTop.reason);
  const noBottom = mapOperation(op('contour2d', {
    heights: { bottom: { mode: 'from stock bottom', offsetMm: 0, zMm: null } },
  }), CHOICES);
  assert(noBottom.status === 'unreadable', `expected unreadable, got ${noBottom.status}`);
  assert(noBottom.reason.includes('bottom height'), noBottom.reason);
});

test('FM19', 'a depth that is not positive is unreadable and names both heights', () => {
  const m = mapOperation(op('contour2d', {
    heights: {
      top: { mode: 'from stock bottom', offsetMm: 0, zMm: 0 },
      bottom: { mode: 'from stock top', offsetMm: 0, zMm: 18 },
    },
  }), CHOICES);
  assert(m.status === 'unreadable', `expected unreadable, got ${m.status}`);
  assert(m.reason === 'The add-in read a top height of 0 mm and a bottom height of 18 mm, so the cut has no positive depth. The multiple-depths box is off.', m.reason);
});

test('FM20', 'multiple depths with a null stepdown is unreadable and named', () => {
  const m = mapOperation(op('contour2d', { params: { doMultipleDepths: true, stepdownMm: null } }), CHOICES);
  assert(m.status === 'unreadable', `expected unreadable, got ${m.status}`);
  assert(m.reason.includes('stepdown'), m.reason);
});

test('FM21', 'a mapped contour feeds calculate() and the field names line up', () => {
  const m = mapOperation(op('contour2d', { params: { doMultipleDepths: true, stepdownMm: 9 } }), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  // The panel supplies material, machine, rpm and profile. The mapped calc
  // object spreads in as-is, so a renamed field fails here, not in Fusion.
  const r = calculate({
    material: 'mdf',
    rpm: 18000,
    profile: 'standard',
    firstCut: false,
    machine: { spindleKw: 10, breakpointRpm: 12000, feedMaxMmMin: 30000, accelMs2: 3 },
    ...m.calc,
  }, data);
  assert(r.status === 'ok', `expected ok, got ${r.status}: ${JSON.stringify(r.refusal ?? r.block ?? null)}`);
  approx(r.meta.apMm, 9, { abs: 1e-9 });
  approx(r.meta.aeMm, 12.7, { abs: 1e-9 });
  assert(r.meta.zEff === 2, `flute count did not carry through, got ${r.meta.zEff}`);
  assert(r.outputs.cuttingFeedMmMin > 0, 'no feed served');
});

test('FM22', 'pocket2d with multiple depths off takes the heights depth in one pass', () => {
  // Fusion keeps a stale stepdown in the dialog when the box is off
  // (corrected 2026-09-01), so the set value must not serve.
  const m = mapOperation(op('pocket2d', { params: { stepdownMm: 6, doMultipleDepths: false } }), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  approx(m.calc.apMm, 18, { abs: 1e-9 });
  assert(m.reading === 'Full-width slot at each pocket level, 18 mm deep, in one pass.', m.reading);
});

test('FM23', 'a null doMultipleDepths is unreadable on every levelled 2D strategy', () => {
  for (const strategy of ['contour2d', 'pocket2d', 'adaptive2d', 'slot']) {
    const m = mapOperation(op(strategy, {
      params: { doMultipleDepths: null, stepdownMm: 9, optimalLoadMm: 2.5 },
    }), CHOICES);
    assert(m.status === 'unreadable', `${strategy}: expected unreadable, got ${m.status}`);
    assert(m.reason.includes('doMultipleDepths'), `${strategy}: the reason must name doMultipleDepths: ${m.reason}`);
  }
});

test('FM24', 'adaptive (3D) with a null stepdown is unreadable and named', () => {
  // The 3D adaptive has no doMultipleDepths box: its stepdown is always
  // active, so a null stepdown is a missing fact, not a full-depth cut.
  const m = mapOperation(op('adaptive', { params: { optimalLoadMm: 3, stepdownMm: null } }), CHOICES);
  assert(m.status === 'unreadable', `expected unreadable, got ${m.status}`);
  assert(m.reason.includes('stepdown'), m.reason);
});

test('FM25', 'direction both on a slot serves climb and the reading names the force model', () => {
  const m = mapOperation(op('slot', { params: { direction: 'both' } }), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  assert(m.calc.direction === 'climb', `expected climb, got ${m.calc.direction}`);
  assert(m.reading.includes('both directions'), m.reading);
  assert(m.reading.includes('climb force model, the conservative one'), m.reading);
});

test('FM26', 'an unrecognised direction or compensation string is unreadable and named', () => {
  const d = mapOperation(op('slot', { params: { direction: 'trochoidal' } }), CHOICES);
  assert(d.status === 'unreadable', `direction: expected unreadable, got ${d.status}`);
  assert(d.reason.includes('trochoidal'), `the reason must name the value: ${d.reason}`);
  const c = mapOperation(op('contour2d', { params: { compensation: 'wear' } }), CHOICES);
  assert(c.status === 'unreadable', `compensation: expected unreadable, got ${c.status}`);
  assert(c.reason.includes('wear'), `the reason must name the value: ${c.reason}`);
});

test('FM27', 'pocket2d compensation left is climb and right is conventional', () => {
  // The 2D pocket has no direction parameter. It carries compensation, left
  // or right, exactly like the 2D contour (spike-results-windows.md section
  // 2, confirmed 2026-09-01). Left is the climb side (section 3).
  const left = mapOperation(op('pocket2d', { params: { compensation: 'left' } }), CHOICES);
  assert(left.status === 'mapped', `left: expected mapped, got ${left.status}: ${left.reason}`);
  assert(left.calc.direction === 'climb', `left: expected climb, got ${left.calc.direction}`);
  const right = mapOperation(op('pocket2d', { params: { compensation: 'right' } }), CHOICES);
  assert(right.status === 'mapped', `right: expected mapped, got ${right.status}: ${right.reason}`);
  assert(right.calc.direction === 'conventional', `right: expected conventional, got ${right.calc.direction}`);
  // A slot has neither parameter, so its compensation is never read.
  const slot = mapOperation(op('slot', { params: { compensation: 'right' } }), CHOICES);
  assert(slot.calc.direction === null, `slot: compensation must not read, got ${slot.calc.direction}`);
});

test('FM28', 'pocket2d with an unrecognised direction string is unreadable and named', () => {
  // A direction the mapping does not know is never defaulted, on a pocket as
  // on every other strategy, and it wins over a good compensation.
  const m = mapOperation(op('pocket2d', { params: { direction: 'spiral', compensation: 'left' } }), CHOICES);
  assert(m.status === 'unreadable', `expected unreadable, got ${m.status}`);
  assert(m.reason.includes('spiral'), `the reason must name the value: ${m.reason}`);
  const c = mapOperation(op('pocket2d', { params: { compensation: 'wear' } }), CHOICES);
  assert(c.status === 'unreadable', `compensation: expected unreadable, got ${c.status}`);
  assert(c.reason.includes('wear'), `the reason must name the value: ${c.reason}`);
});

test('FM29', 'every unreadable reason names the values it read, in millimetres to one decimal', () => {
  // The live-run audit (2026-09-01) found rows refused with a sentence and
  // no numbers, so nobody could tell what the add-in had read. The case it
  // reproduced: the multiple-depths box off and both resolved heights at
  // the same level, on a 2D adaptive and on a slot. The policy is right to
  // refuse (protocol.md depth rule); the sentence must show the heights.
  for (const strategy of ['adaptive2d', 'slot']) {
    const m = mapOperation(op(strategy, {
      params: { doMultipleDepths: false, optimalLoadMm: 2.5 },
      heights: {
        top: { mode: 'from stock top', offsetMm: 0, zMm: 0 },
        bottom: { mode: 'from stock top', offsetMm: 0, zMm: 0 },
      },
    }), CHOICES);
    assert(m.status === 'unreadable', `${strategy}: expected unreadable, got ${m.status}`);
    assert(m.reason === 'The add-in read a top height of 0 mm and a bottom height of 0 mm, so the cut has no positive depth. The multiple-depths box is off.', `${strategy}: ${m.reason}`);
  }
  // A stepdown the add-in could not read on a multiple-depth operation, with
  // the WCS at the stock top: the two heights it did read are named.
  const stepdown = mapOperation(op('contour2d', {
    params: { doMultipleDepths: true, stepdownMm: null },
    heights: {
      top: { mode: 'from stock top', offsetMm: 0, zMm: 0 },
      bottom: { mode: 'from stock bottom', offsetMm: -0.5, zMm: -20.5 },
    },
  }), CHOICES);
  assert(stepdown.reason === 'The add-in could not read the stepdown for this multiple-depth operation (top 0 mm, bottom -20.5 mm).', stepdown.reason);
  // One decimal, and a null height reads as "not read", never as a number.
  const rounded = mapOperation(op('contour2d', {
    params: { doMultipleDepths: true, stepdownMm: null },
    heights: {
      top: { mode: 'from stock top', offsetMm: 0, zMm: 18.26 },
      bottom: { mode: 'from stock bottom', offsetMm: 0, zMm: null },
    },
  }), CHOICES);
  assert(rounded.reason.includes('(top 18.3 mm, bottom not read)'), rounded.reason);
  const adaptive3d = mapOperation(op('adaptive', { params: { optimalLoadMm: 3, stepdownMm: null } }), CHOICES);
  assert(adaptive3d.reason.includes('(top 18 mm, bottom 0 mm)'), adaptive3d.reason);
  const box = mapOperation(op('pocket2d', { params: { doMultipleDepths: null, stepdownMm: 9 } }), CHOICES);
  assert(box.reason.includes('(stepdown 9 mm, top 18 mm, bottom 0 mm)'), box.reason);
  const noTop = mapOperation(op('contour2d', {
    heights: { top: { mode: 'from stock top', offsetMm: 0, zMm: null } },
  }), CHOICES);
  assert(noTop.reason.includes('(bottom 0 mm)') && noTop.reason.includes('multiple-depths box is off'), noTop.reason);
  const noBottom = mapOperation(op('contour2d', {
    heights: { bottom: { mode: 'from stock bottom', offsetMm: 0, zMm: null } },
  }), CHOICES);
  assert(noBottom.reason.includes('(top 18 mm)'), noBottom.reason);
  const load = mapOperation(op('adaptive', { params: { optimalLoadMm: null, stepdownMm: 10 } }), CHOICES);
  assert(load.reason.includes('tool diameter 12.7 mm') && load.reason.includes('depth 10 mm per pass'), load.reason);
  const flutes = mapOperation(op('contour2d', { tool: { flutes: null } }), CHOICES);
  assert(flutes.reason.includes('(tool diameter 12.7 mm)'), flutes.reason);
  const diameter = mapOperation(op('contour2d', { tool: { diameterMm: null } }), CHOICES);
  assert(diameter.reason.includes('(flute count 2)'), diameter.reason);
});

test('FM30', 'a drill with a missing fact is unreadable and names what it read', () => {
  const noDiameter = mapOperation(drillOp({ tool: { diameterMm: null } }), CHOICES);
  assert(noDiameter.status === 'unreadable', `expected unreadable, got ${noDiameter.status}`);
  assert(noDiameter.reason.includes('drill diameter') && noDiameter.reason.includes('(top 18 mm, bottom 5 mm)'), noDiameter.reason);
  // A null height in a geometry mode names the mode: the value was never
  // in the dialog, Fusion takes it from the selection.
  const noTop = mapOperation(drillOp({ heights: { top: geometry('from hole top', null) } }), CHOICES);
  assert(noTop.status === 'unreadable', `expected unreadable, got ${noTop.status}`);
  assert(noTop.reason.includes('hole top') && noTop.reason.includes('(bottom 5 mm, drill 5 mm)'), noTop.reason);
  assert(noTop.reason.includes('from hole top') && noTop.reason.includes('selected geometry'), noTop.reason);
  const noBottom = mapOperation(drillOp({ heights: { bottom: geometry('from hole bottom', null) } }), CHOICES);
  assert(noBottom.status === 'unreadable', `expected unreadable, got ${noBottom.status}`);
  assert(noBottom.reason.includes('hole bottom') && noBottom.reason.includes('(top 18 mm, drill 5 mm)'), noBottom.reason);
  const upsideDown = mapOperation(drillOp({ heights: { top: geometry('from hole top', 5), bottom: geometry('from hole bottom', 18) } }), CHOICES);
  assert(upsideDown.status === 'unreadable', `expected unreadable, got ${upsideDown.status}`);
  assert(upsideDown.reason === 'The add-in read a hole top of 5 mm and a hole bottom of 18 mm, so the hole has no positive depth.', upsideDown.reason);
});

test('FM31', 'a spread of levels in the selection adds the deepest-serves note, and nothing else does', () => {
  const note = 'The selection is not all at one depth, so the deepest serves.';
  const holes = mapOperation(drillOp({ heights: { bottom: geometry('from hole bottom', 5, 3) } }), CHOICES);
  assert(holes.status === 'mapped', `expected mapped, got ${holes.status}: ${holes.reason}`);
  assert(holes.reading === `5 mm drill, hole 13 mm deep. ${note}`, holes.reading);
  const pocket = mapOperation(op('pocket2d', {
    params: { doMultipleDepths: false },
    heights: { bottom: geometry('from contour', 6, 2) },
  }), CHOICES);
  assert(pocket.status === 'mapped', `expected mapped, got ${pocket.status}: ${pocket.reason}`);
  approx(pocket.calc.apMm, 12, { abs: 1e-9 });
  assert(pocket.reading.endsWith(note), pocket.reading);
  const flat = mapOperation(op('pocket2d', { params: { doMultipleDepths: false }, heights: { bottom: geometry('from contour', 6) } }), CHOICES);
  assert(!flat.reading.includes(note), `a spread of zero adds no note: ${flat.reading}`);
  // An older add-in sends no spread at all, and the reading stays as it was.
  const older = mapOperation(op('pocket2d', { params: { doMultipleDepths: false } }), CHOICES);
  assert(!older.reading.includes(note), `a null spread adds no note: ${older.reading}`);
});

test('FM32', 'a mapped drill feeds calculateDrilling() and the field names line up', () => {
  const m = mapOperation(drillOp(), CHOICES);
  assert(m.status === 'mapped', `expected mapped, got ${m.status}: ${m.reason}`);
  // The panel supplies the drill type, the material, the profile, the
  // drill-bank tick and the machine. The mapped calc spreads in as-is, so
  // a renamed field fails here, not in Fusion.
  const r = calculateDrilling({
    drillType: 'dowel_drill_hw_tipped',
    material: 'mdf',
    profile: 'standard',
    drillBank: false,
    machine: { spindleKw: 10, breakpointRpm: 12000, rpmMax: 24000, rpmMin: 1000, feedMaxMmMin: 30000 },
    ...m.calc,
  }, data);
  assert(r.status === 'ok', `expected ok, got ${r.status}: ${JSON.stringify(r.refusal ?? r.block ?? null)}`);
  approx(r.meta.dMm, 5, { abs: 1e-9 });
  approx(r.meta.holeDepthMm, 13, { abs: 1e-9 });
  assert(r.outputs.plungeFeedMmMin > 0 && r.outputs.spindleRpm > 0, 'no plunge feed or speed served');
});

test('FM33', 'a routing calc names its mode, and an unresolved geometry-mode height names the mode in its refusal', () => {
  const plain = mapOperation(op('contour2d'), CHOICES);
  assert(plain.status === 'mapped' && plain.calc.mode === 'rout', `expected mode rout, got ${plain.calc?.mode}`);
  // The live-run case of 2026-09-02: a slot on a selected floor face, box
  // off. The first add-in build shipped 0 for that bottom; a build that
  // cannot resolve the geometry ships null, and the refusal must say the
  // height lives in the selection, not in the dialog.
  const slot = mapOperation(op('slot', { heights: { bottom: geometry('from contour', null) } }), CHOICES);
  assert(slot.status === 'unreadable', `expected unreadable, got ${slot.status}`);
  assert(slot.reason.includes('bottom height') && slot.reason.includes('(top 18 mm)'), slot.reason);
  assert(slot.reason.includes('from contour') && slot.reason.includes('selected geometry'), slot.reason);
  // A resolved geometry bottom serves the depth like any other.
  const served = mapOperation(op('slot', { heights: { bottom: geometry('from contour', -7) } }), CHOICES);
  assert(served.status === 'mapped', `expected mapped, got ${served.status}: ${served.reason}`);
  approx(served.calc.apMm, 25, { abs: 1e-9 });
});

test('FM39', 'flat and horizontal are facing work and serve the Finishing profile on the confirmed tool', () => {
  // Fusion classes both as 3D finishing, and both "automatically detect all
  // the flat areas of the part" in its own words. On a flat area the tool
  // cuts on its full diameter, so it is facing work run with a flat or bull
  // nose tool, not a ball walking a curved surface (Scott, 2026-09-03).
  for (const strategy of ['flat', 'horizontal']) {
    const m = mapOperation(op(strategy, {
      params: { stepoverMm: 4.2, stepdownMm: null, doMultipleDepths: false },
    }), CHOICES);
    assert(m.status === 'mapped', `${strategy}: expected mapped, got ${m.status} — ${m.reason}`);
    assert(m.calc.profileOverride === 'finishing', `${strategy}: this is the pass that leaves the face, got ${m.calc.profileOverride}`);
    assert(m.calc.toolType === 'upcut', `${strategy}: the user's confirmed geometry serves, got ${m.calc.toolType}`);
    assert(m.calc.aeMm === 4.2, `${strategy}: the stepover is the width of cut, got ${m.calc.aeMm}`);
    assert(m.calc.apMm === null, `${strategy}: no stepdown set means no depth of cut, got ${m.calc.apMm}`);
    assert(m.reading.includes('Finishing pass over the flat areas'), `${strategy}: ${m.reading}`);
  }
  // Fusion computes the horizontal stepover itself unless Manual Stepover is
  // on, and a greyed-out control now arrives as null, so it refuses and says
  // why rather than guessing a width that sets the whole feed.
  const auto = mapOperation(op('horizontal', { params: { stepoverMm: null } }), CHOICES);
  assert(auto.status === 'unreadable', `expected unreadable, got ${auto.status}`);
  assert(auto.reason.includes('manual stepover box'), `the reason must say what to turn on: ${auto.reason}`);
  // A ball nose on a flat area refuses in the core: no finisher chart covers
  // one. The mapping still maps it, and the core carries the reason.
  const ball = mapOperation(op('flat', {
    tool: { typeString: 'ball end mill', diameterMm: 12.7, cornerRadiusMm: 6.35, flutes: 2 },
    params: { stepoverMm: 2 },
  }), CHOICES);
  assert(ball.status === 'mapped' && ball.calc.toolType === 'ball', 'a ball maps, and the core refuses the profile');
  const r = calculate({
    material: 'mdf', materials: ['mdf'], ...ball.calc, profile: 'finishing', thicknessMm: 18, rpm: 18000,
    firstCut: false, machine: { spindleKw: 10, breakpointRpm: 12000, feedMaxMmMin: 30000, accelMs2: 3, vacuum: { mu: 0.4, dPkPa: 5 } },
  }, data);
  assert(r.status === 'refused' && /No finisher chart covers a ball nose/.test(r.refusal.reason), `${r.status}: ${r.refusal?.reason}`);
});

test('FM40', 'a bull nose reads the ball chart at its corner, and its scallop comes off the corner', () => {
  // No maker publishes a chip load for a bull nose in wood, so the ball chart
  // is borrowed and indexed on the CORNER diameter, which is what cuts on a
  // surfacing pass and which reads the lower published chip (Scott,
  // 2026-09-03). The borrow is recorded in the chart notes and renders
  // nowhere.
  const bull = mapOperation(ballOp('scallop', {
    tool: { typeString: 'bull nose end mill', diameterMm: 12.7, cornerRadiusMm: 1.5, flutes: 2 },
    params: { stepoverMm: 1.27 },
  }), CHOICES);
  assert(bull.status === 'mapped', `expected mapped, got ${bull.status} — ${bull.reason}`);
  assert(bull.calc.cornerRadiusMm === 1.5, `got ${bull.calc.cornerRadiusMm}`);
  const machine = { spindleKw: 10, breakpointRpm: 12000, feedMaxMmMin: 30000, accelMs2: 3, vacuum: { mu: 0.4, dPkPa: 5 } };
  const r = calculate({ material: 'mdf', materials: ['mdf'], ...bull.calc, thicknessMm: 18, rpm: 18000, profile: 'standard', firstCut: false, machine }, data);
  assert(r.status === 'ok', `expected ok, got ${r.status}: ${r.refusal?.reason}`);
  assert(r.meta.bullNose === true, 'the result must record that this is a bull nose');
  approx(r.meta.cuttingDiameterMm, 3.0, { abs: 1e-9 });
  // The ridge comes off the 1.5 mm corner, not off a 6.35 mm ball radius.
  approx(r.outputs.scallopHeightMm, 1.5 - Math.sqrt(1.5 * 1.5 - (1.27 / 2) * (1.27 / 2)), { abs: 1e-9 });
  assert(r.outputs.scallopHeightMm > 0.13, `a bull nose ridge is far coarser than a ball's, got ${r.outputs.scallopHeightMm}`);
  // The borrow is on the record and never on the page.
  assert(r.meta.chartNotes.some((n) => /bull nose/.test(n) && /corner diameter/.test(n)), 'the borrow must be recorded');
  assert(!r.notes.some((n) => /bull nose/.test(n)), 'and it must not render');
  // A ball of the same diameter reads the chart at 12.7 mm and is smoother.
  const ballR = calculate({
    material: 'mdf', materials: ['mdf'], toolType: 'ball', diameterMm: 12.7, cornerRadiusMm: 6.35,
    apMm: null, aeMm: 1.27, thicknessMm: 18, rpm: 18000, flutesTotal: 2, profile: 'standard', firstCut: false, machine,
  }, data);
  approx(ballR.meta.cuttingDiameterMm, 12.7, { abs: 1e-9 });
  assert(ballR.outputs.scallopHeightMm < r.outputs.scallopHeightMm / 4,
    'the same stepover on a full ball leaves a far finer ridge');
  assert(ballR.meta.bullNose === false, 'a full radius is a ball, not a bull nose');
});
