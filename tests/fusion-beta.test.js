// The Fusion panel's beta tick (Scott's ruling, 2026-09-24). The ball nose,
// the bull nose and 3D surfacing arrived in commit bc85559 and had never been
// live; they go live behind the tick, off by default. With it off the panel
// must map every operation exactly as the live site did at commit 1e6c265:
// the same status and the same words. With it on, nothing changes from the
// mapping fusion-map.test.js pins (every test there passes beta: true).
//
// FB1 proves the stable mapping IS 1e6c265's code, not a reconstruction. The
// others pin its answers in words written out here, copied from that commit,
// so a change to either side is caught by a test that does not lean on the
// code it checks.

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './helpers.js';
import { loadData } from './load-node.js';
import { mapOperation } from '../js/fusion/map-operation.js';
import { identifyTool, stableToolKind } from '../js/fusion/tool-identity.js';

const here = dirname(fileURLToPath(import.meta.url));
const chiploads = loadData().chiploads;

// The words 1e6c265 refused a 3D surfacing strategy with.
const SURFACING_REASON = 'No published chart covers 3D surfacing yet. The data arrives from research.';

// 1e6c265's set of 3D surfacing strategies, and the strategies beta reads as
// surfacing that 1e6c265 did not know, which it refused as having no chart.
const STABLE_SURFACING = [
  'parallel', 'scallop', 'contour', 'pocket_clearing', 'ramp', 'spiral',
  'radial', 'morph', 'flat', 'horizontal', 'pencil', 'steep_and_shallow',
  'project', 'swarf', 'blend', 'morphed_spiral',
];
const BETA_ONLY_SURFACING = ['flow', 'flow2', 'corner', 'geodesic', 'contour3d', 'inclined_walls', 'chamfer'];

const TOOLS = {
  flat: { typeString: 'flat end mill', diameterMm: 12.7, cornerRadiusMm: 0, flutes: 2 },
  ball: { typeString: 'ball end mill', diameterMm: 8, cornerRadiusMm: 4, flutes: 2 },
  bull: { typeString: 'bull nose end mill', diameterMm: 12.7, cornerRadiusMm: 1.5, flutes: 2 },
  taper: { typeString: 'tapered mill', diameterMm: 6.35, cornerRadiusMm: 3.175, flutes: 2 },
};

function op(strategy, { tool = TOOLS.flat, params = {} } = {}) {
  return {
    opId: 'op-1', name: 'Op1', strategy, suppressed: false, isValid: true, hasToolpath: true,
    tool: { fluteLengthMm: 32, shoulderLengthMm: 36, vendor: '', productId: '', description: '', comment: '', ...tool },
    params: {
      stepdownMm: 6, doMultipleDepths: true, stepoverMm: 1.2, optimalLoadMm: 3,
      stockToLeaveMm: 0, verticalStockToLeaveMm: 0,
      finishing: { enabled: false, stepoverMm: null, passes: null },
      direction: null, compensation: 'left', rampAngleDeg: 4,
      ...params,
    },
    heights: {
      top: { mode: 'from stock top', offsetMm: 0, zMm: 18 },
      bottom: { mode: 'from stock bottom', offsetMm: 0, zMm: 0 },
    },
  };
}

// The panel's two calls: a confirmed router bit, and the probe it makes for a
// tool that is not a router bit.
const ROUTER = { toolType: 'upcut', upcutLengthMm: null, finishing: false };
const PROBE = { toolType: null, finishing: false };

test('FB1', 'the stable mapping is 1e6c265\'s map-operation.js, byte for byte', () => {
  // The git blob id of js/fusion/map-operation.js at commit 1e6c265, from
  // `git rev-parse 1e6c265:js/fusion/map-operation.js`. A checkout with
  // Windows line endings is read back to the LF git stores.
  const text = readFileSync(join(here, '..', 'js', 'fusion', 'map-operation-stable.js'), 'utf8').replace(/\r\n/g, '\n');
  const body = Buffer.from(text, 'utf8');
  const id = createHash('sha1').update(`blob ${body.length}\0`).update(body).digest('hex');
  assert(id === '5af72225f2ef1ae253cdfde1b43e739bfa9ae0c7', `map-operation-stable.js has changed (blob ${id}); it must stay 1e6c265's file`);
});

test('FB2', 'beta off: every 3D surfacing strategy refuses with 1e6c265\'s words, whatever the tool', () => {
  for (const choices of [{ ...ROUTER, beta: false }, { ...PROBE, beta: false }, ROUTER, PROBE]) {
    for (const tool of Object.values(TOOLS)) {
      for (const strategy of STABLE_SURFACING) {
        const m = mapOperation(op(strategy, { tool }), choices);
        assert(m.status === 'unsupported' && m.reason === SURFACING_REASON,
          `${strategy} with a ${tool.typeString}, beta ${choices.beta}: ${m.status} — ${m.reason}`);
      }
      for (const strategy of BETA_ONLY_SURFACING) {
        const m = mapOperation(op(strategy, { tool }), choices);
        assert(m.status === 'unsupported'
          && m.reason === `No published chart covers the ${strategy} strategy. The calculator gives no number without a source.`,
          `${strategy} with a ${tool.typeString}, beta ${choices.beta}: ${m.status} — ${m.reason}`);
      }
    }
  }
});

test('FB3', 'beta off: a ball or a bull nose on a 2D strategy maps with no tool type, for the panel to refuse', () => {
  // 1e6c265 handed the operation back mapped, with the tool type the caller
  // passed (null in the panel's probe) and no corner radius, and the panel
  // refused it: "This operation runs a ball-nose or form tool on a routing
  // strategy. The charts cover router bits only."
  for (const tool of [TOOLS.ball, TOOLS.bull, TOOLS.taper]) {
    const m = mapOperation(op('contour2d', { tool }), { ...PROBE, beta: false });
    assert(m.status === 'mapped', `${tool.typeString}: ${m.status} — ${m.reason}`);
    const want = {
      mode: 'rout', toolType: null, diameterMm: tool.diameterMm, flutesTotal: 2,
      apMm: 6, aeMm: tool.diameterMm, direction: 'climb', upcutLengthMm: null, profileOverride: null,
    };
    assert(JSON.stringify(m.calc) === JSON.stringify(want), `${tool.typeString}: ${JSON.stringify(m.calc)}`);
    assert(m.reading === 'Full-width slot, 18 mm deep, in three passes of 6 mm.', m.reading);
  }
  // Every one of them is the one kind the panel labels "Ball-nose or form
  // tool" and never asks a geometry question of.
  for (const typeString of ['ball end mill', 'bull nose end mill', 'tapered mill', 'tapered ball end mill', 'lollipop mill', 'dovetail mill']) {
    assert(stableToolKind(typeString) === 'ball', `${typeString}: ${stableToolKind(typeString)}`);
    const id = identifyTool({ ...TOOLS.ball, typeString, productId: '' }, chiploads, { beta: false });
    assert(id.kind === 'ball' && id.guess === null && id.guessCertain === false, `${typeString}: ${JSON.stringify(id)}`);
    const byDefault = identifyTool({ ...TOOLS.ball, typeString, productId: '' }, chiploads);
    assert(byDefault.kind === 'ball' && byDefault.guess === null, `${typeString}, beta missing: ${JSON.stringify(byDefault)}`);
  }
  assert(stableToolKind('chamfer mill') === 'chamfer' && stableToolKind('drill') === 'drill' && stableToolKind('flat end mill') === 'router', 'the other kinds');
});

test('FB4', 'beta off: a raster direction word is one 1e6c265 did not recognise', () => {
  const m = mapOperation(op('adaptive', { params: { direction: 'one way' } }), { ...ROUTER, beta: false });
  assert(m.status === 'unreadable' && m.reason === 'The add-in sent a cut direction the mapping does not recognise: "one way".', `${m.status} — ${m.reason}`);
});

test('FB5', 'beta on: the ball, the bull nose, surfacing and facing serve as they do today', () => {
  const on = { ...ROUTER, beta: true };
  const ball = mapOperation(op('parallel', { tool: TOOLS.ball, params: { stepdownMm: 0.8 } }), on);
  assert(ball.status === 'mapped' && ball.calc.toolType === 'ball' && ball.calc.aeMm === 1.2, `${ball.status} — ${ball.reason}`);
  const bull = mapOperation(op('scallop', { tool: TOOLS.bull }), on);
  assert(bull.status === 'mapped' && bull.calc.cornerRadiusMm === 1.5, `${bull.status} — ${bull.reason}`);
  const groove = mapOperation(op('contour2d', { tool: TOOLS.ball }), { ...PROBE, beta: true });
  assert(groove.status === 'mapped' && groove.calc.toolType === 'ball', `${groove.status} — ${groove.reason}`);
  const facing = mapOperation(op('flat'), on);
  assert(facing.status === 'mapped' && facing.calc.profileOverride === 'finishing', `${facing.status} — ${facing.reason}`);
  const taper = mapOperation(op('contour2d', { tool: TOOLS.taper }), { ...PROBE, beta: true });
  assert(taper.status === 'unsupported' && taper.reason.startsWith('No published chip load covers this tool shape.'), `${taper.status} — ${taper.reason}`);
  const id = identifyTool({ ...TOOLS.bull, productId: '' }, chiploads, { beta: true });
  assert(id.kind === 'bullnose' && id.guess === 'ball' && id.guessCertain === true, JSON.stringify(id));
});

test('FB6', 'a router bit on a 2D strategy maps the same with the tick on or off', () => {
  // The beta mapping adds a cornerRadiusMm of null for a flat tool, which the
  // core ignores; every other field and the reading must agree.
  for (const strategy of ['contour2d', 'pocket2d', 'slot', 'adaptive2d', 'adaptive']) {
    for (const finishing of [false, true]) {
      const o = op(strategy);
      const off = mapOperation(o, { ...ROUTER, finishing, beta: false });
      const on = mapOperation(o, { ...ROUTER, finishing, beta: true });
      assert(off.status === 'mapped' && on.status === 'mapped', `${strategy}: ${off.status} / ${on.status}`);
      assert(on.calc.cornerRadiusMm === null, `${strategy}: ${on.calc.cornerRadiusMm}`);
      const { cornerRadiusMm, ...rest } = on.calc;
      assert(JSON.stringify(rest) === JSON.stringify(off.calc) && on.reading === off.reading,
        `${strategy}, finishing ${finishing}: ${JSON.stringify(on)} vs ${JSON.stringify(off)}`);
    }
  }
});
