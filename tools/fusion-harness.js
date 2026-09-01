// Dev-only fake add-in bridge for fusion.html?harness=1. It stands in for
// Fusion's palette messaging, so the whole panel runs under tools/serve.js in
// an ordinary browser (build phase 2 of the add-in plan). Every shape below
// follows fusion-addin/protocol.md exactly. The setup and operation names
// read like a real cabinet job on purpose, in the case a user types them,
// and one name is a deliberate 60 characters long, so the panel is judged on
// the names it will meet (the live-run audit, 2026-09-01). The document
// name, the tool descriptions and the write reasons still say "harness", so
// a screenshot can never pass for a real job.
//
// It answers:
//   hello   -> a job message after a short delay
//   refresh -> the same document under a new jobId
//   persist -> an echo to the console (the real add-in stores the blob)
//   apply   -> a writeReport after a short delay, with the statuses cycling
//              written, failed, inconsistent, skipped_changed over the sent
//              rows, then a regenReport after a longer delay
//
// It never touches the page's DOM. It only calls the same handler Fusion
// would call: window.fusionJavaScriptHandler.handle(type, json).

const PROTOCOL = 1;

let jobSerial = 0;

// Every raw fact the add-in could not read is null, never omitted and never
// guessed (protocol.md). These helpers write the full shape once.
function makeTool(overrides) {
  return {
    typeString: 'flat end mill',
    diameterMm: null,
    cornerRadiusMm: 0,
    flutes: null,
    fluteLengthMm: null,
    shoulderLengthMm: null,
    vendor: '',
    productId: null,
    description: '',
    comment: '',
    ...overrides,
  };
}

function makeParams(overrides) {
  return {
    stepdownMm: null,
    doMultipleDepths: false,
    stepoverMm: null,
    optimalLoadMm: null,
    stockToLeaveMm: 0,
    verticalStockToLeaveMm: 0,
    finishing: { enabled: false, stepoverMm: null, passes: null },
    direction: null,
    compensation: null,
    rampAngleDeg: null,
    ...overrides,
  };
}

function makeHeights(topZMm, bottomZMm, bottomOffsetMm = bottomZMm) {
  return {
    top: { mode: 'from stock top', offsetMm: 0, zMm: topZMm },
    bottom: { mode: 'from stock bottom', offsetMm: bottomOffsetMm, zMm: bottomZMm },
  };
}

function makeFeeds() {
  return {
    rpm: 18000, cuttingMmMin: 5000, plungeMmMin: 1000,
    rampMmMin: 1000, leadInMmMin: 5000, leadOutMmMin: 5000,
  };
}

function makeStock() {
  return {
    xMm: 2400, yMm: 1200, zMm: 18,
    stockTopZMm: 18, stockBottomZMm: 0,
    modelTopZMm: 18, modelBottomZMm: 0,
  };
}

// A tool with a product id: the identity key comes from vendor and product
// number, and the guess can come from the product id.
const TOOL_COMPRESSION = makeTool({
  diameterMm: 12.7, flutes: 2, fluteLengthMm: 32, shoulderLengthMm: 36,
  vendor: 'Onsrud', productId: '60-123',
  description: 'Harness tool: 1/2 in compression 2FL',
});

// No product id: the guess must come from the description words.
const TOOL_DOWNCUT = makeTool({
  diameterMm: 12, flutes: 2, fluteLengthMm: 35, shoulderLengthMm: 40,
  description: 'Harness tool: 12 mm down-cut spiral, no product id',
});

// No product id and nothing to guess from: the panel must ask.
const TOOL_PLAIN = makeTool({
  diameterMm: 6, flutes: 1, fluteLengthMm: 20, shoulderLengthMm: 25,
  description: 'Harness tool: 6 mm cutter, nothing to guess from',
});

const TOOL_DRILL = makeTool({
  typeString: 'drill', diameterMm: 5, flutes: 2, fluteLengthMm: 40, shoulderLengthMm: 45,
  description: 'Harness tool: 5 mm drill',
});

const TOOL_BALL = makeTool({
  typeString: 'ball end mill', diameterMm: 8, cornerRadiusMm: 4, flutes: 2,
  fluteLengthMm: 24, shoulderLengthMm: 30,
  description: 'Harness tool: 8 mm ball nose',
});

function makeJob() {
  jobSerial += 1;
  return {
    protocol: PROTOCOL,
    type: 'job',
    jobId: String(jobSerial),
    addinVersion: '0.1.0',
    fusionVersion: '2.0.harness',
    documentUnits: 'mm',
    documentName: 'Harness sample document',
    memory: { docBlob: null, userBlob: null },
    setups: [
      {
        setupId: 'harness-s1',
        name: 'Sheet 1 - 18 mm MDF',
        stock: makeStock(),
        operations: [
          {
            opId: 'harness-op-1', name: 'Outside profile',
            strategy: 'contour2d', suppressed: false, isValid: true, hasToolpath: true,
            tool: TOOL_COMPRESSION,
            params: makeParams({ stepdownMm: 9, doMultipleDepths: true, compensation: 'left', rampAngleDeg: 4 }),
            heights: makeHeights(18, -0.5),
            currentFeeds: makeFeeds(),
          },
          {
            // The deliberate 60-character name: the panel must wrap it
            // without truncation and without a horizontal scroll.
            opId: 'harness-op-2', name: 'Drawer fronts outside profile, one pass, 12 mm down-cut tool',
            strategy: 'contour2d', suppressed: false, isValid: true, hasToolpath: true,
            tool: TOOL_DOWNCUT,
            params: makeParams({ doMultipleDepths: false, compensation: 'left', rampAngleDeg: 4 }),
            heights: makeHeights(18, -0.5),
            currentFeeds: makeFeeds(),
          },
          {
            opId: 'harness-op-3', name: 'Shelf pockets',
            strategy: 'pocket2d', suppressed: false, isValid: true, hasToolpath: true,
            tool: TOOL_DOWNCUT,
            params: makeParams({ stepdownMm: 6, doMultipleDepths: true, stepoverMm: 6, rampAngleDeg: 2 }),
            heights: makeHeights(18, 6, 6),
            currentFeeds: makeFeeds(),
          },
          {
            opId: 'harness-op-4', name: 'Adaptive clear',
            strategy: 'adaptive2d', suppressed: false, isValid: true, hasToolpath: true,
            tool: TOOL_PLAIN,
            params: makeParams({ stepdownMm: 12, doMultipleDepths: true, optimalLoadMm: 2.4, direction: 'climb', rampAngleDeg: 2 }),
            heights: makeHeights(18, 0, 0),
            currentFeeds: makeFeeds(),
          },
        ],
      },
      {
        setupId: 'harness-s2',
        name: 'Sheet 2 - 18 mm MDF',
        stock: makeStock(),
        operations: [
          {
            opId: 'harness-op-5', name: 'Door slot',
            strategy: 'slot', suppressed: false, isValid: true, hasToolpath: true,
            tool: TOOL_DOWNCUT,
            params: makeParams({ stepdownMm: 6, doMultipleDepths: true, direction: 'both' }),
            heights: makeHeights(18, 9, 9),
            currentFeeds: makeFeeds(),
          },
          {
            opId: 'harness-op-6', name: 'Hinge holes',
            strategy: 'drill', suppressed: false, isValid: true, hasToolpath: true,
            tool: TOOL_DRILL,
            params: makeParams({}),
            heights: makeHeights(18, -1, -1),
            currentFeeds: makeFeeds(),
          },
          {
            opId: 'harness-op-7', name: 'Parallel finish',
            strategy: 'parallel', suppressed: false, isValid: true, hasToolpath: true,
            tool: TOOL_BALL,
            params: makeParams({ stepoverMm: 1.2 }),
            heights: makeHeights(18, 4, 4),
            currentFeeds: makeFeeds(),
          },
          {
            opId: 'harness-op-8', name: 'Outside profile, old version',
            strategy: 'contour2d', suppressed: true, isValid: true, hasToolpath: false,
            tool: TOOL_COMPRESSION,
            params: makeParams({ stepdownMm: 9, doMultipleDepths: true, compensation: 'left', rampAngleDeg: 4 }),
            heights: makeHeights(18, -0.5),
            currentFeeds: makeFeeds(),
          },
        ],
      },
    ],
  };
}

// The write statuses cycle over the sent rows, so ticking four or more rows
// shows every report state at once: written, failed, inconsistent,
// skipped_changed.
const WRITE_STATUSES = ['written', 'failed', 'inconsistent', 'skipped_changed'];
const WRITE_REASONS = {
  failed: 'Harness: Fusion refused the parameter write.',
  inconsistent: 'Harness: the feed write failed after the spindle write succeeded.',
  skipped_changed: 'the operation changed after the snapshot',
};

export function createHarnessBridge() {
  const deliver = (msg, delayMs) => {
    setTimeout(() => {
      const handler = window.fusionJavaScriptHandler;
      if (handler) handler.handle(msg.type, JSON.stringify(msg));
    }, delayMs);
  };

  return {
    fusionSendData(type, json) {
      const msg = JSON.parse(json);
      if (type === 'hello') {
        deliver(makeJob(), 150);
      } else if (type === 'refresh') {
        deliver(makeJob(), 200);
      } else if (type === 'persist') {
        console.log('[fusion-harness] persist', msg.scope, msg.blob);
      } else if (type === 'apply') {
        const rows = (msg.rows ?? []).map((r, i) => {
          const status = WRITE_STATUSES[i % WRITE_STATUSES.length];
          return status === 'written'
            ? { opId: r.opId, status }
            : { opId: r.opId, status, reason: WRITE_REASONS[status] };
        });
        deliver({
          protocol: PROTOCOL, type: 'writeReport', jobId: msg.jobId, stale: false,
          undoHint: 'One undo step reverses every write.', rows,
        }, 600);
        // Only written rows regenerate, matching the real add-in: an
        // inconsistent row failed one of its writes and Fusion does not
        // regenerate it (2026-09-01).
        const regenRows = rows
          .filter((r) => r.status === 'written')
          .map((r) => ({ opId: r.opId, status: 'ok' }));
        if (regenRows.length) {
          deliver({ protocol: PROTOCOL, type: 'regenReport', jobId: msg.jobId, rows: regenRows }, 2000);
        }
      }
    },
  };
}
