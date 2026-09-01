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

const data = loadData();

const CHOICES = { toolType: 'upcut', upcutLengthMm: null, finishing: false };

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

test('FM8', '3D surfacing strategies refuse with the no-chart wording', () => {
  for (const strategy of ['parallel', 'scallop', 'morphed_spiral', 'contour']) {
    const m = mapOperation(op(strategy), CHOICES);
    assert(m.status === 'unsupported', `${strategy}: expected unsupported, got ${m.status}`);
    assert(m.reason === 'No published chart covers 3D surfacing yet. The data arrives from research.', `${strategy}: ${m.reason}`);
  }
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
