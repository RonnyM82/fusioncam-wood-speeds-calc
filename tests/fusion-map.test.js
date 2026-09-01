// Fusion mapping policy (fusion-addin/protocol.md, 2026-09-01): hand-written
// operations in the job message shape, one per row of the mapping table,
// plus the direction readings, the refusal wording and the null-fact
// refusals. FM21 feeds a mapped result into the real core with the real
// data files, to prove the field names line up.

import { test, assert, approx } from './helpers.js';
import { loadData } from './load-node.js';
import { calculate } from '../js/core/calculate.js';
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

test('FM7', 'drill refuses with the pending-research wording', () => {
  const m = mapOperation(op('drill'), CHOICES);
  assert(m.status === 'unsupported', `expected unsupported, got ${m.status}`);
  assert(m.reason === 'Drilling charts are pending research. The add-in leaves drills untouched until that data lands.', m.reason);
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

test('FM19', 'a depth that is not positive is unreadable', () => {
  const m = mapOperation(op('contour2d', {
    heights: {
      top: { mode: 'from stock bottom', offsetMm: 0, zMm: 0 },
      bottom: { mode: 'from stock top', offsetMm: 0, zMm: 18 },
    },
  }), CHOICES);
  assert(m.status === 'unreadable', `expected unreadable, got ${m.status}`);
  assert(m.reason.includes('positive depth'), m.reason);
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
