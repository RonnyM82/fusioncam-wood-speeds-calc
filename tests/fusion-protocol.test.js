// Fusion message-format tests, FP series. The shapes under test live in
// fusion-addin/protocol.md. The pinned message below is the committed example
// for protocol version 1.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './helpers.js';
import {
  PROTOCOL_VERSION, PROTOCOL_FLOOR, BAD_ADDIN_BUILDS,
  acceptsProtocol, isBadBuild, validateEnvelope, readJob,
  makeHello, makePersist, makeRefresh, makeApply, makePageError,
} from '../js/fusion/protocol.js';

// The committed example job message for protocol version 1. It must never
// change: it pins the wire format, so a change here means the format broke.
// A new protocol version adds a new pinned example beside this one instead
// (fusion-addin/protocol.md, versioning rule 2).
const PINNED_V1_JOB = {
  protocol: 1,
  type: 'job',
  jobId: '3',
  addinVersion: '0.1.0',
  fusionVersion: '2.0.20250',
  documentUnits: 'mm',
  documentName: 'doc-1',
  memory: { docBlob: null, userBlob: null },
  setups: [
    {
      setupId: 's1',
      name: 'Setup1',
      stock: {
        xMm: 2400, yMm: 1200, zMm: 18,
        stockTopZMm: 18, stockBottomZMm: 0,
        modelTopZMm: 18, modelBottomZMm: 0,
      },
      operations: [
        {
          opId: 'op-12',
          name: '2D Contour1',
          strategy: 'contour2d',
          suppressed: false,
          isValid: true,
          hasToolpath: true,
          tool: {
            typeString: 'flat end mill',
            diameterMm: 12.7,
            cornerRadiusMm: 0,
            flutes: 2,
            fluteLengthMm: 32,
            shoulderLengthMm: 36,
            vendor: 'Onsrud',
            productId: '60-123',
            description: '1/2 compression 2FL',
            comment: '',
          },
          params: {
            stepdownMm: 9,
            doMultipleDepths: true,
            stepoverMm: null,
            optimalLoadMm: null,
            stockToLeaveMm: 0,
            verticalStockToLeaveMm: 0,
            finishing: { enabled: false, stepoverMm: null, passes: null },
            direction: null,
            compensation: 'left',
            rampAngleDeg: 4,
          },
          heights: {
            top: { mode: 'from stock top', offsetMm: 0, zMm: 18 },
            bottom: { mode: 'from stock bottom', offsetMm: -0.5, zMm: -0.5 },
          },
          currentFeeds: {
            rpm: 18000, cuttingMmMin: 5000, plungeMmMin: 1000,
            rampMmMin: 1000, leadInMmMin: 5000, leadOutMmMin: 5000,
          },
        },
      ],
    },
  ],
};

test('FP1', 'protocol constants: version 1, floor 1, no bad builds yet', () => {
  assert(PROTOCOL_VERSION === 1, 'PROTOCOL_VERSION must be 1');
  assert(PROTOCOL_FLOOR === 1, 'PROTOCOL_FLOOR must be 1');
  assert(Array.isArray(BAD_ADDIN_BUILDS), 'BAD_ADDIN_BUILDS must be an array');
  assert(BAD_ADDIN_BUILDS.length === 0, 'BAD_ADDIN_BUILDS must be empty today');
});

test('FP2', 'acceptsProtocol at the floor, below, above, and non-integers', () => {
  assert(acceptsProtocol(PROTOCOL_FLOOR) === true, 'the floor version must be accepted');
  assert(acceptsProtocol(PROTOCOL_VERSION) === true, 'the current version must be accepted');
  assert(acceptsProtocol(PROTOCOL_FLOOR - 1) === false, 'below the floor must be refused');
  assert(acceptsProtocol(PROTOCOL_VERSION + 1) === false, 'above the current version must be refused');
  assert(acceptsProtocol(1.5) === false, 'a fraction must be refused');
  assert(acceptsProtocol('1') === false, 'a string must be refused');
  assert(acceptsProtocol(null) === false, 'null must be refused');
  assert(acceptsProtocol(undefined) === false, 'a missing value must be refused');
});

test('FP3', 'isBadBuild matches the list by exact version string', () => {
  assert(isBadBuild('0.1.0') === false, 'a build not on the list is not bad');
  assert(isBadBuild(undefined) === false, 'a missing version is not bad');
  // Prove the mechanism against a temporary entry, then restore the list.
  BAD_ADDIN_BUILDS.push('0.0.9');
  try {
    assert(isBadBuild('0.0.9') === true, 'a listed build must be refused');
    assert(isBadBuild('0.0.9 ') === false, 'the match must be exact, never fuzzy');
  } finally {
    BAD_ADDIN_BUILDS.pop();
  }
  assert(isBadBuild('0.0.9') === false, 'the list is restored after the test');
});

test('FP4', 'validateEnvelope accepts a minimal envelope of every known type', () => {
  const types = ['hello', 'job', 'persist', 'refresh', 'apply', 'writeReport', 'regenReport', 'pageError'];
  for (const type of types) {
    const r = validateEnvelope({ protocol: 1, type });
    assert(r.ok === true, `type "${type}" must be accepted`);
    assert(r.errors.length === 0, `type "${type}" must produce no errors`);
  }
});

test('FP5', 'validateEnvelope rejects bad protocols, bad types and non-objects', () => {
  const bad = [
    [null, 'null'],
    ['job', 'a bare string'],
    [[], 'an array'],
    [{}, 'an empty object'],
    [{ type: 'job' }, 'a missing protocol'],
    [{ protocol: 0, type: 'job' }, 'protocol zero'],
    [{ protocol: -1, type: 'job' }, 'a negative protocol'],
    [{ protocol: 1.5, type: 'job' }, 'a fractional protocol'],
    [{ protocol: '1', type: 'job' }, 'a string protocol'],
    [{ protocol: 1 }, 'a missing type'],
    [{ protocol: 1, type: 'jobs' }, 'an unknown type'],
    [{ protocol: 1, type: 7 }, 'a numeric type'],
  ];
  for (const [msg, label] of bad) {
    const r = validateEnvelope(msg);
    assert(r.ok === false, `${label} must be rejected`);
    assert(r.errors.length >= 1, `${label} must name at least one error`);
  }
  const both = validateEnvelope({});
  assert(both.errors.length === 2, 'an empty object fails on both protocol and type');
});

test('FP6', 'tolerant reader: unknown fields are never an error', () => {
  const env = validateEnvelope({
    protocol: 1, type: 'hello', pageBuild: '2026-09-01',
    futureField: { anything: true },
  });
  assert(env.ok === true, 'an envelope with unknown fields must pass');

  const msg = structuredClone(PINNED_V1_JOB);
  msg.futureField = 'from a newer add-in';
  msg.setups[0].futureSetupField = 42;
  msg.setups[0].operations[0].futureOpField = [1, 2, 3];
  msg.setups[0].operations[0].tool.futureToolField = { nested: true };
  const r = readJob(msg);
  assert(r.ok === true, 'a job with unknown fields must read cleanly');
  assert(r.errors.length === 0, 'unknown fields must produce no errors');
  assert(!('futureField' in r.job), 'unknown fields do not enter the normalised job');
  assert(!('futureOpField' in r.job.setups[0].operations[0]),
    'unknown operation fields do not enter the normalised job');
});

test('FP7', 'readJob normalises the pinned version 1 example exactly', () => {
  const r = readJob(PINNED_V1_JOB);
  assert(r.ok === true, 'the pinned example must read cleanly');
  assert(r.errors.length === 0, 'the pinned example must produce no errors');
  const job = r.job;
  assert(job.protocol === 1, 'protocol carries through');
  assert(job.jobId === '3', 'jobId carries through');
  assert(job.addinVersion === '0.1.0', 'addinVersion carries through');
  assert(job.documentUnits === 'mm', 'documentUnits carries through');
  assert(job.memory.docBlob === null && job.memory.userBlob === null,
    'null blobs stay null');
  assert(job.setups.length === 1, 'one setup');
  const setup = job.setups[0];
  assert(setup.setupId === 's1', 'setupId carries through');
  assert(setup.stock.xMm === 2400 && setup.stock.zMm === 18, 'stock numbers carry through');
  assert(setup.operations.length === 1, 'one operation');
  const op = setup.operations[0];
  assert(op.opId === 'op-12' && op.strategy === 'contour2d', 'operation identity carries through');
  assert(op.suppressed === false && op.isValid === true && op.hasToolpath === true,
    'operation flags carry through');
  assert(op.tool.diameterMm === 12.7 && op.tool.flutes === 2, 'tool numbers carry through');
  assert(op.tool.productId === '60-123', 'tool product id carries through');
  assert(op.params.stepdownMm === 9 && op.params.doMultipleDepths === true,
    'depth parameters carry through');
  assert(op.params.stepoverMm === null && op.params.optimalLoadMm === null,
    'a null a strategy does not have stays null');
  assert(op.params.direction === null && op.params.compensation === 'left',
    'direction stays null and compensation carries through');
  assert(op.params.finishing.enabled === false && op.params.finishing.passes === null,
    'finishing settings carry through');
  assert(op.heights.top.zMm === 18 && op.heights.bottom.zMm === -0.5,
    'resolved heights carry through');
  assert(op.heights.bottom.mode === 'from stock bottom', 'raw height modes carry through');
  assert(op.currentFeeds.rpm === 18000 && op.currentFeeds.cuttingMmMin === 5000,
    'current feeds carry through');
});

test('FP8', 'readJob refuses garbage without throwing', () => {
  for (const [msg, label] of [
    [null, 'null'],
    ['job', 'a bare string'],
    [{}, 'an empty object'],
    [[], 'an array'],
    [{ protocol: 1, type: 'hello' }, 'a message of another type'],
  ]) {
    const r = readJob(msg);
    assert(r.ok === false, `${label} must not read as a job`);
    assert(r.job === null, `${label} must yield no job`);
    assert(r.errors.length >= 1, `${label} must name at least one error`);
  }
});

test('FP9', 'readJob turns a wrong-typed field into null and names it', () => {
  const msg = structuredClone(PINNED_V1_JOB);
  msg.setups[0].operations[0].tool.diameterMm = '12.7';
  msg.setups[0].operations[0].currentFeeds.rpm = 'fast';
  const r = readJob(msg);
  assert(r.ok === false, 'a wrong-typed field must mark the read not ok');
  assert(r.job !== null, 'the rest of the job is still returned');
  const op = r.job.setups[0].operations[0];
  assert(op.tool.diameterMm === null, 'the string diameter becomes null, never a number');
  assert(op.currentFeeds.rpm === null, 'the string rpm becomes null');
  assert(op.tool.flutes === 2, 'the neighbouring fields survive');
  assert(r.errors.some((e) => e.includes('diameterMm')), 'the error names the diameter field');
  assert(r.errors.some((e) => e.includes('rpm')), 'the error names the rpm field');
});

test('FP10', 'readJob fills missing optionals with null and empty lists', () => {
  const r = readJob({ protocol: 1, type: 'job', jobId: '1' });
  assert(r.ok === true, 'missing optional fields are not errors');
  assert(r.job.addinVersion === null && r.job.documentName === null,
    'missing strings become null');
  assert(r.job.memory.docBlob === null && r.job.memory.userBlob === null,
    'a missing memory part becomes null blobs');
  assert(Array.isArray(r.job.setups) && r.job.setups.length === 0,
    'a missing setups list defaults to empty');

  const bare = readJob({
    protocol: 1, type: 'job', jobId: '2', setups: [{ setupId: 's1' }],
  });
  assert(bare.ok === true, 'a bare setup is not an error');
  assert(bare.job.setups[0].operations.length === 0,
    'a missing operations list defaults to empty');
  assert(bare.job.setups[0].stock.xMm === null,
    'a missing stock part becomes null numbers');
});

test('FP11', 'makeHello, makePersist and makeRefresh carry the exact shapes', () => {
  const hello = makeHello('2026-09-01');
  assert(hello.protocol === 1 && hello.type === 'hello', 'hello envelope');
  assert(hello.pageBuild === '2026-09-01', 'hello carries the page build');
  assert(Object.keys(hello).length === 3, 'hello carries exactly three fields');

  const persist = makePersist('user', '{"tools":{}}');
  assert(persist.protocol === 1 && persist.type === 'persist', 'persist envelope');
  assert(persist.scope === 'user' && persist.blob === '{"tools":{}}',
    'persist carries the scope and the verbatim blob');
  assert(Object.keys(persist).length === 4, 'persist carries exactly four fields');

  const refresh = makeRefresh();
  assert(refresh.protocol === 1 && refresh.type === 'refresh', 'refresh envelope');
  assert(Object.keys(refresh).length === 2, 'refresh carries exactly two fields');
});

test('FP12', 'makeApply round-trips through validateEnvelope', () => {
  const rows = [
    {
      opId: 'op-12',
      rpm: 18000,
      cuttingMmMin: 4390,
      feedPerToothMm: 0.122,
      plungeMmMin: 1463,
      rampMmMin: 1463,
      leadInMmMin: 4390,
      leadOutMmMin: 4390,
    },
  ];
  const apply = makeApply('3', rows);
  const r = validateEnvelope(apply);
  assert(r.ok === true, 'an apply message must validate');
  assert(r.errors.length === 0, 'an apply message must produce no errors');
  assert(apply.protocol === 1 && apply.type === 'apply', 'apply envelope');
  assert(apply.jobId === '3', 'apply names the snapshot it refers to');
  assert(apply.rows.length === 1 && apply.rows[0].opId === 'op-12',
    'apply carries the rows untouched');
  assert(apply.rows[0].rpm === 18000 && apply.rows[0].feedPerToothMm === 0.122,
    'apply carries both feed forms and the spindle speed');
  assert(Object.keys(apply).length === 4, 'apply carries exactly four fields');
});

test('FP13', 'makePageError carries the exact shape and round-trips validateEnvelope', () => {
  const reason = 'The data failed its integrity check: a chip load is negative.';
  const msg = makePageError(reason);
  assert(msg.protocol === 1 && msg.type === 'pageError', 'pageError envelope');
  assert(msg.reason === reason, 'pageError carries the reason verbatim');
  assert(Object.keys(msg).length === 3, 'pageError carries exactly three fields');
  const r = validateEnvelope(msg);
  assert(r.ok === true, 'a pageError message must validate');
  assert(r.errors.length === 0, 'a pageError message must produce no errors');
});

test('FP14', 'registering pageError leaves the tolerance rules intact', () => {
  // The tolerant-reader rule holds for the new type: unknown fields are
  // never an error (protocol versioning rule 1).
  const withUnknown = validateEnvelope({
    protocol: 1, type: 'pageError', reason: 'x', futureField: { anything: true },
  });
  assert(withUnknown.ok === true, 'unknown fields on a pageError are never an error');
  assert(withUnknown.errors.length === 0, 'unknown fields produce no errors');
  // The type fence did not loosen: a type no side registered is still
  // refused at the envelope, exactly as FP5 pins for the older types.
  const unknownType = validateEnvelope({ protocol: 1, type: 'pageErrors' });
  assert(unknownType.ok === false, 'an unregistered type is still refused');
});

test('FP15', 'every cache-bust ?v= in fusion.html equals PAGE_BUILD in fusion-panel.js', () => {
  // The Fusion palette browser serves a stale cached copy after an update
  // (spike-results-windows.md section 11, item 6), so every stylesheet and
  // script address in fusion.html carries ?v=<PAGE_BUILD>. PAGE_BUILD also
  // rides the hello message, so one string names the page both ways. A bump
  // in one place without the other fails here, not in Fusion.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const page = readFileSync(join(root, 'fusion.html'), 'utf8');
  const panel = readFileSync(join(root, 'js', 'ui', 'fusion-panel.js'), 'utf8');
  const build = panel.match(/^const PAGE_BUILD = '([^']+)';/m);
  assert(build !== null, 'fusion-panel.js must declare PAGE_BUILD as a single-quoted string');
  // Only the addresses count: the comment above the links names the pattern
  // in words, not a build.
  const links = [...page.matchAll(/<(?:link[^>]*href|script[^>]*src)="([^"]+)"/g)].map((m) => m[1]);
  assert(links.length >= 5, `fusion.html must link its stylesheets and its scripts, found ${links.length}`);
  for (const href of links) {
    const v = href.match(/\?v=([^&]+)$/);
    assert(v !== null, `${href} carries no cache-bust query`);
    assert(v[1] === build[1], `${href} carries ?v=${v[1]} but PAGE_BUILD is ${build[1]}`);
  }
});
