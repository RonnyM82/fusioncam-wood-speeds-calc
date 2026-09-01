// Message format between the Fusion add-in and the panel page. The shapes,
// field names and units live in fusion-addin/protocol.md, which is the single
// source of truth. This module encodes three rules from that file (2026-09-01):
//   1. Tolerant reader. A field this module does not know is never an error.
//   2. A raw fact the add-in could not read arrives as null. The null is kept.
//      No value is ever invented.
//   3. A field with the wrong type becomes null and is named in errors, so the
//      panel can refuse the affected operation with a plain sentence.
// Pure module: no I/O, no timers, no randomness. The purity fence in
// tests/run.js enforces this for the whole js/fusion/ directory.

export const PROTOCOL_VERSION = 1;

// The oldest protocol version the page still serves (protocol.md rule 3).
export const PROTOCOL_FLOOR = 1;

// Add-in builds the page refuses to Apply for, by exact version string.
// Empty today. A build joins this list when it writes wrong numbers, with the
// date and the reason in a comment beside it (protocol.md rule 4).
export const BAD_ADDIN_BUILDS = [];

// Every message type protocol version 1 defines, in both directions.
// pageError joined on 2026-09-01, inside version 1: an add-in that does not
// know the type ignores it, so adding a type never bumps the version.
const KNOWN_TYPES = [
  'hello', 'job', 'persist', 'refresh', 'apply', 'writeReport', 'regenReport',
  'pageError',
];

// True when the page can serve this protocol version (protocol.md rule 2).
export function acceptsProtocol(v) {
  return Number.isInteger(v) && v >= PROTOCOL_FLOOR && v <= PROTOCOL_VERSION;
}

// True when this add-in build is on the refusal list. Viewing still works
// for a bad build. Only Apply is refused (protocol.md rule 4).
export function isBadBuild(addinVersion) {
  return BAD_ADDIN_BUILDS.includes(addinVersion);
}

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

// Checks the fields every message must carry. Unknown extra fields are never
// an error: the tolerant-reader rule is what lets old builds keep working.
export function validateEnvelope(msg) {
  if (!isPlainObject(msg)) {
    return { ok: false, errors: ['The message is not a JSON object.'] };
  }
  const errors = [];
  if (!Number.isInteger(msg.protocol) || msg.protocol < 1) {
    errors.push('The protocol field is not a positive integer.');
  }
  if (typeof msg.type !== 'string' || !KNOWN_TYPES.includes(msg.type)) {
    errors.push('The type field is not a known message type.');
  }
  return { ok: errors.length === 0, errors };
}

// The three field readers share one rule. A missing value or a null stays
// null with no error. A value of the wrong type becomes null and the path is
// named in errors.
function readString(value, path, errors) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'string') return value;
  errors.push(`${path} is not a string.`);
  return null;
}

function readNumber(value, path, errors) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  errors.push(`${path} is not a finite number.`);
  return null;
}

function readBoolean(value, path, errors) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  errors.push(`${path} is not true or false.`);
  return null;
}

// Returns a nested object to read fields from. A missing part reads as an
// empty object, so every field inside it normalises to null with no error.
function readPart(value, path, errors) {
  if (value === undefined || value === null) return {};
  if (isPlainObject(value)) return value;
  errors.push(`${path} is not an object.`);
  return {};
}

// A missing list defaults to empty. A present non-array is an error.
function readList(value, path, errors) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  errors.push(`${path} is not an array.`);
  return [];
}

const STOCK_KEYS = [
  'xMm', 'yMm', 'zMm', 'stockTopZMm', 'stockBottomZMm',
  'modelTopZMm', 'modelBottomZMm',
];

function readStock(raw, path, errors) {
  const part = readPart(raw, path, errors);
  const stock = {};
  for (const key of STOCK_KEYS) {
    stock[key] = readNumber(part[key], `${path}.${key}`, errors);
  }
  return stock;
}

function readTool(raw, path, errors) {
  const part = readPart(raw, path, errors);
  return {
    typeString: readString(part.typeString, `${path}.typeString`, errors),
    diameterMm: readNumber(part.diameterMm, `${path}.diameterMm`, errors),
    cornerRadiusMm: readNumber(part.cornerRadiusMm, `${path}.cornerRadiusMm`, errors),
    flutes: readNumber(part.flutes, `${path}.flutes`, errors),
    fluteLengthMm: readNumber(part.fluteLengthMm, `${path}.fluteLengthMm`, errors),
    shoulderLengthMm: readNumber(part.shoulderLengthMm, `${path}.shoulderLengthMm`, errors),
    vendor: readString(part.vendor, `${path}.vendor`, errors),
    productId: readString(part.productId, `${path}.productId`, errors),
    description: readString(part.description, `${path}.description`, errors),
    comment: readString(part.comment, `${path}.comment`, errors),
  };
}

function readFinishing(raw, path, errors) {
  const part = readPart(raw, path, errors);
  return {
    enabled: readBoolean(part.enabled, `${path}.enabled`, errors),
    stepoverMm: readNumber(part.stepoverMm, `${path}.stepoverMm`, errors),
    passes: readNumber(part.passes, `${path}.passes`, errors),
  };
}

function readParams(raw, path, errors) {
  const part = readPart(raw, path, errors);
  return {
    stepdownMm: readNumber(part.stepdownMm, `${path}.stepdownMm`, errors),
    doMultipleDepths: readBoolean(part.doMultipleDepths, `${path}.doMultipleDepths`, errors),
    stepoverMm: readNumber(part.stepoverMm, `${path}.stepoverMm`, errors),
    optimalLoadMm: readNumber(part.optimalLoadMm, `${path}.optimalLoadMm`, errors),
    stockToLeaveMm: readNumber(part.stockToLeaveMm, `${path}.stockToLeaveMm`, errors),
    verticalStockToLeaveMm: readNumber(part.verticalStockToLeaveMm, `${path}.verticalStockToLeaveMm`, errors),
    finishing: readFinishing(part.finishing, `${path}.finishing`, errors),
    direction: readString(part.direction, `${path}.direction`, errors),
    compensation: readString(part.compensation, `${path}.compensation`, errors),
    rampAngleDeg: readNumber(part.rampAngleDeg, `${path}.rampAngleDeg`, errors),
  };
}

function readHeight(raw, path, errors) {
  const part = readPart(raw, path, errors);
  return {
    mode: readString(part.mode, `${path}.mode`, errors),
    offsetMm: readNumber(part.offsetMm, `${path}.offsetMm`, errors),
    zMm: readNumber(part.zMm, `${path}.zMm`, errors),
  };
}

function readHeights(raw, path, errors) {
  const part = readPart(raw, path, errors);
  return {
    top: readHeight(part.top, `${path}.top`, errors),
    bottom: readHeight(part.bottom, `${path}.bottom`, errors),
  };
}

function readCurrentFeeds(raw, path, errors) {
  const part = readPart(raw, path, errors);
  return {
    rpm: readNumber(part.rpm, `${path}.rpm`, errors),
    cuttingMmMin: readNumber(part.cuttingMmMin, `${path}.cuttingMmMin`, errors),
    plungeMmMin: readNumber(part.plungeMmMin, `${path}.plungeMmMin`, errors),
    rampMmMin: readNumber(part.rampMmMin, `${path}.rampMmMin`, errors),
    leadInMmMin: readNumber(part.leadInMmMin, `${path}.leadInMmMin`, errors),
    leadOutMmMin: readNumber(part.leadOutMmMin, `${path}.leadOutMmMin`, errors),
  };
}

function readOperation(raw, path, errors) {
  return {
    opId: readString(raw.opId, `${path}.opId`, errors),
    name: readString(raw.name, `${path}.name`, errors),
    strategy: readString(raw.strategy, `${path}.strategy`, errors),
    suppressed: readBoolean(raw.suppressed, `${path}.suppressed`, errors),
    isValid: readBoolean(raw.isValid, `${path}.isValid`, errors),
    hasToolpath: readBoolean(raw.hasToolpath, `${path}.hasToolpath`, errors),
    tool: readTool(raw.tool, `${path}.tool`, errors),
    params: readParams(raw.params, `${path}.params`, errors),
    heights: readHeights(raw.heights, `${path}.heights`, errors),
    currentFeeds: readCurrentFeeds(raw.currentFeeds, `${path}.currentFeeds`, errors),
  };
}

function readSetup(raw, path, errors) {
  const operations = [];
  const rawOps = readList(raw.operations, `${path}.operations`, errors);
  for (let i = 0; i < rawOps.length; i++) {
    const opPath = `${path}.operations[${i}]`;
    if (!isPlainObject(rawOps[i])) {
      errors.push(`${opPath} is not an object.`);
      continue;
    }
    operations.push(readOperation(rawOps[i], opPath, errors));
  }
  return {
    setupId: readString(raw.setupId, `${path}.setupId`, errors),
    name: readString(raw.name, `${path}.name`, errors),
    stock: readStock(raw.stock, `${path}.stock`, errors),
    operations,
  };
}

// Normalises a job message into the safe internal shape the panel renders
// from. Every optional field missing becomes null. The setups and operations
// lists default to empty. A field with the wrong type becomes null and is
// named in errors. This function never throws on malformed input: ok is
// false when anything was wrong, and job is still returned whenever the
// message was structurally a job.
export function readJob(msg) {
  if (!isPlainObject(msg)) {
    return { ok: false, job: null, errors: ['The message is not a JSON object.'] };
  }
  if (msg.type !== 'job') {
    return { ok: false, job: null, errors: ['The message type is not job.'] };
  }
  const errors = [];
  const protocol = Number.isInteger(msg.protocol) && msg.protocol >= 1 ? msg.protocol : null;
  if (protocol === null) {
    errors.push('The protocol field is not a positive integer.');
  }
  const memory = readPart(msg.memory, 'memory', errors);
  const setups = [];
  const rawSetups = readList(msg.setups, 'setups', errors);
  for (let i = 0; i < rawSetups.length; i++) {
    const setupPath = `setups[${i}]`;
    if (!isPlainObject(rawSetups[i])) {
      errors.push(`${setupPath} is not an object.`);
      continue;
    }
    setups.push(readSetup(rawSetups[i], setupPath, errors));
  }
  const job = {
    // The add-in's own version, kept so the page can answer in kind
    // (protocol.md rule 2).
    protocol,
    jobId: readString(msg.jobId, 'jobId', errors),
    addinVersion: readString(msg.addinVersion, 'addinVersion', errors),
    fusionVersion: readString(msg.fusionVersion, 'fusionVersion', errors),
    documentUnits: readString(msg.documentUnits, 'documentUnits', errors),
    documentName: readString(msg.documentName, 'documentName', errors),
    memory: {
      docBlob: readString(memory.docBlob, 'memory.docBlob', errors),
      userBlob: readString(memory.userBlob, 'memory.userBlob', errors),
    },
    setups,
  };
  return { ok: errors.length === 0, job, errors };
}

// The four builders return plain envelopes, shaped exactly as protocol.md
// shows. Only version 1 exists today, so every outgoing message carries
// PROTOCOL_VERSION. Down-converters arrive with protocol version 2
// (protocol.md rule 2).

export function makeHello(pageBuild) {
  return { protocol: PROTOCOL_VERSION, type: 'hello', pageBuild };
}

export function makePersist(scope, blob) {
  return { protocol: PROTOCOL_VERSION, type: 'persist', scope, blob };
}

export function makeRefresh() {
  return { protocol: PROTOCOL_VERSION, type: 'refresh' };
}

export function makeApply(jobId, rows) {
  return { protocol: PROTOCOL_VERSION, type: 'apply', jobId, rows };
}

// The page loaded but cannot serve: its data files failed to load or failed
// validation. Without this message the add-in's hello timeout misreads a data
// failure as no internet. The add-in shows the carried reason instead of the
// offline message (protocol.md, added 2026-09-01).
export function makePageError(reason) {
  return { protocol: PROTOCOL_VERSION, type: 'pageError', reason };
}
