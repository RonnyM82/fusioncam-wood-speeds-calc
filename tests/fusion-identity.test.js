// Fusion tool identity: key derivation and the geometry prefill guess,
// against the real chiploads.json plus small hand-built charts for the
// cases the real data cannot produce. Interface pinned in
// fusion-addin/protocol.md ("js/fusion/tool-identity.js").

import { test, assert } from './helpers.js';
import { loadData } from './load-node.js';
import { identifyTool } from '../js/fusion/tool-identity.js';

const data = loadData();
const chiploads = data.chiploads;

// The job message tool shape, with quiet defaults a test overrides.
function tool(overrides) {
  return {
    typeString: 'flat end mill',
    diameterMm: 12.7,
    cornerRadiusMm: 0,
    flutes: 2,
    fluteLengthMm: 32,
    shoulderLengthMm: 36,
    vendor: 'Onsrud',
    productId: '',
    description: '',
    comment: '',
    ...overrides,
  };
}

function pairSet(seriesMatches) {
  return new Set(seriesMatches.map((m) => `${m.vendor}|${m.series}`));
}

test('FI1', 'Onsrud compression id 60-104 guesses compression from both 60-100 families', () => {
  const r = identifyTool(tool({ vendor: 'LMT Onsrud', productId: '60-104' }), chiploads);
  assert(r.guess === 'compression', `expected compression, got ${r.guess}`);
  assert(r.guessSource === 'product_id', `expected product_id, got ${r.guessSource}`);
  const pairs = pairSet(r.seriesMatches);
  assert(pairs.has('Onsrud|60-100MW'), '60-100MW match missing');
  assert(pairs.has('Onsrud|60-100C'), '60-100C match missing');
  assert(r.seriesMatches.length === 2, `expected 2 unique matches, got ${r.seriesMatches.length}`);
  assert(r.key === 'lmt onsrud|60-104', `unexpected key ${r.key}`);
});

test('FI2', 'Onsrud finisher id 60-210 matches the 60-200 series but guesses nothing', () => {
  const r = identifyTool(tool({ productId: '60-210' }), chiploads);
  assert(r.seriesMatches.length === 1, `expected 1 match, got ${r.seriesMatches.length}`);
  assert(r.seriesMatches[0].vendor === 'Onsrud' && r.seriesMatches[0].series === '60-200', 'wrong series');
  assert(r.guess === null && r.guessSource === null, 'a finisher id must not prefill a cutting geometry');
});

test('FI3', 'id 52-240B matches the joint 52-200/57-200 row once and guesses upcut', () => {
  const r = identifyTool(tool({ productId: '52-240B' }), chiploads);
  assert(r.seriesMatches.length === 1, `expected 1 unique match, got ${r.seriesMatches.length}`);
  assert(r.seriesMatches[0].series === '52-200/57-200', `wrong series ${r.seriesMatches[0].series}`);
  assert(r.guess === 'upcut' && r.guessSource === 'product_id', 'expected upcut from the id');
});

test('FI4', 'disagreeing multi-match yields no guess', () => {
  const synthetic = {
    entries: [
      { vendor: 'Onsrud', series: '70-100', tool_geometry: 'spiral_upcut' },
      { vendor: 'Onsrud', series: '70-150', tool_geometry: 'spiral_downcut' },
    ],
  };
  const r = identifyTool(tool({ productId: '70-104' }), synthetic);
  assert(r.seriesMatches.length === 2, `expected 2 matches, got ${r.seriesMatches.length}`);
  assert(r.guess === null && r.guessSource === null, 'a split vote must not guess');
});

test('FI5', 'a matched series that maps to no tool type spoils the id guess', () => {
  const synthetic = {
    entries: [
      { vendor: 'Onsrud', series: '70-100', tool_geometry: 'spiral_upcut' },
      { vendor: 'Onsrud', series: '70-150', tool_geometry: 'finisher' },
    ],
  };
  const r = identifyTool(tool({ productId: '70-104' }), synthetic);
  assert(r.seriesMatches.length === 2, `expected 2 matches, got ${r.seriesMatches.length}`);
  assert(r.guess === null && r.guessSource === null, 'an unmapped match must veto the id guess');
});

test('FI6', 'an entry with superseded_by set never matches', () => {
  const synthetic = {
    entries: [
      { vendor: 'Onsrud', series: '70-100', tool_geometry: 'spiral_upcut', superseded_by: 'newer' },
    ],
  };
  const r = identifyTool(tool({ productId: '70-104' }), synthetic);
  assert(r.seriesMatches.length === 0, 'superseded entries must be skipped');
  assert(r.guess === null, 'no guess without a live entry');
});

test('FI7', 'the id guess wins over a contradicting description', () => {
  const r = identifyTool(
    tool({ productId: '60-104', description: 'straight bit' }),
    chiploads,
  );
  assert(r.guess === 'compression' && r.guessSource === 'product_id', 'the id must outrank the text');
});

test('FI8', 'description word compression guesses compression', () => {
  const r = identifyTool(tool({ description: '1/2 compression 2FL' }), chiploads);
  assert(r.guess === 'compression' && r.guessSource === 'description', `got ${r.guess} from ${r.guessSource}`);
});

test('FI9', 'all three upcut forms guess upcut from the description', () => {
  for (const word of ['upcut', 'Up-Cut', 'up cut']) {
    const r = identifyTool(tool({ description: `6mm ${word} spiral` }), chiploads);
    assert(r.guess === 'upcut' && r.guessSource === 'description', `form "${word}" gave ${r.guess}`);
  }
});

test('FI10', 'all three downcut forms guess downcut from the description', () => {
  for (const word of ['downcut', 'DOWN-CUT', 'down cut']) {
    const r = identifyTool(tool({ description: `6mm ${word} spiral` }), chiploads);
    assert(r.guess === 'downcut' && r.guessSource === 'description', `form "${word}" gave ${r.guess}`);
  }
});

test('FI11', 'straight, o-flute and o flute all guess straight', () => {
  for (const word of ['straight', 'O-Flute', 'o flute']) {
    const r = identifyTool(tool({ description: `1/4 ${word} bit` }), chiploads);
    assert(r.guess === 'straight' && r.guessSource === 'description', `form "${word}" gave ${r.guess}`);
  }
});

test('FI12', 'a description naming two types guesses nothing', () => {
  const r = identifyTool(tool({ description: 'compression up-cut hybrid' }), chiploads);
  assert(r.guess === null && r.guessSource === null, 'two distinct types must cancel');
});

test('FI13', 'the comment carries the keyword when the description is empty', () => {
  const r = identifyTool(tool({ comment: 'downcut for melamine faces' }), chiploads);
  assert(r.guess === 'downcut' && r.guessSource === 'description', `got ${r.guess} from ${r.guessSource}`);
});

test('FI14', 'empty product id takes the digest key path', () => {
  const t = tool({ vendor: 'no-name', description: 'generic 12mm 2FL' });
  const r = identifyTool(t, chiploads);
  assert(/^[0-9a-f]+$/.test(r.key), `digest key must be lowercase hex, got ${r.key}`);
  assert(!r.key.includes('|'), 'digest key must not look like a vendor|id key');
  const again = identifyTool(tool({ vendor: 'no-name', description: 'generic 12mm 2FL' }), chiploads);
  assert(again.key === r.key, 'same facts must give the same key');
  const other = identifyTool(tool({ vendor: 'no-name', description: 'generic 12mm 3FL' }), chiploads);
  assert(other.key !== r.key, 'different facts must give a different key');
});

test('FI15', 'null facts still digest to a stable key', () => {
  const t = { typeString: null, diameterMm: null, flutes: null, vendor: null, productId: null, description: null, comment: null };
  const a = identifyTool(t, chiploads);
  const b = identifyTool({ ...t }, chiploads);
  assert(a.key === b.key, 'the null-fact key must be stable');
  assert(/^[0-9a-f]+$/.test(a.key), `expected a hex digest, got ${a.key}`);
  assert(a.guess === null && a.seriesMatches.length === 0, 'null facts must match and guess nothing');
});

test('FI16', 'the vendor|id key trims, collapses and lowercases', () => {
  const r = identifyTool(tool({ vendor: '  LMT   Onsrud ', productId: '  60-104 ' }), chiploads);
  assert(r.key === 'lmt onsrud|60-104', `unexpected key ${r.key}`);
  const again = identifyTool(tool({ vendor: 'lmt onsrud', productId: '60-104' }), chiploads);
  assert(again.key === r.key, 'whitespace and case must not fork the key');
});

test('FI17', 'a missing vendor matches no series even with a plausible id', () => {
  const r = identifyTool(tool({ vendor: '', productId: '60-104' }), chiploads);
  assert(r.seriesMatches.length === 0, 'an empty vendor must match nothing');
  assert(r.guess === null, 'no guess without a vendor to match on');
  assert(r.key === '|60-104', `unexpected key ${r.key}`);
});

// The tool kind comes from Fusion's own type string (2026-09-01). Only a
// router bit takes the geometry question; a drill or a ball-nose asked for a
// spiral direction was the wrong question on the first run inside Fusion.
test('FI18', 'a drill is kind drill, guesses a drill family from its description and never a geometry', () => {
  // The drilling charts landed on 2026-09-02, so a drill's one question is
  // its family. A brad point is the cabinetmaker's dowel drill, and the
  // router word beside it changes nothing.
  const r = identifyTool(tool({ typeString: 'drill', description: '3dia Brad Point compression', vendor: 'Heliner', productId: '' }), chiploads);
  assert(r.kind === 'drill', `expected kind drill, got ${r.kind}`);
  assert(r.guess === 'dowel' && r.guessSource === 'description', `expected dowel from the description, got ${r.guess} from ${r.guessSource}`);
  const spot = identifyTool(tool({ typeString: 'spot drill', productId: '' }), chiploads);
  assert(spot.kind === 'drill', 'a spot drill is a drill');
  assert(spot.guess === null && spot.guessSource === null, 'a drill with no family word guesses nothing');
});

test('FI19', 'a ball-nose or bull-nose is kind ball, a chamfer mill is kind chamfer', () => {
  const ball = identifyTool(tool({ typeString: 'ball end mill', description: '9.5dia Bullnose up cut', productId: '' }), chiploads);
  assert(ball.kind === 'ball', `expected kind ball, got ${ball.kind}`);
  assert(ball.guess === null, 'a ball-nose must carry no geometry guess');
  const bull = identifyTool(tool({ typeString: 'bull nose end mill', productId: '' }), chiploads);
  assert(bull.kind === 'ball', 'a bull nose is kind ball');
  const chamfer = identifyTool(tool({ typeString: 'chamfer mill', productId: '' }), chiploads);
  assert(chamfer.kind === 'chamfer', `expected kind chamfer, got ${chamfer.kind}`);
});

test('FI20', 'a flat end mill, an empty type and an unknown type are kind router and still guess', () => {
  for (const typeString of ['flat end mill', '', null, 'some future type']) {
    const r = identifyTool(tool({ typeString, description: 'compression 2FL', productId: '' }), chiploads);
    assert(r.kind === 'router', `expected kind router for ${JSON.stringify(typeString)}, got ${r.kind}`);
    assert(r.guess === 'compression', `a router bit keeps its description guess for ${JSON.stringify(typeString)}`);
  }
});

test('FI21', 'drill family words: hinge, through, dowel, twist; two families cancel; a router bit never takes one', () => {
  const cases = [
    ['35 mm hinge drill', 'hinge'],
    ['Hinge cup boring bit', 'hinge'],
    ['8 mm through hole drill', 'through'],
    ['5mm thru drill', 'through'],
    ['dowel drill 8mm', 'dowel'],
    ['twist drill 3 mm', 'twist'],
    ['jobber drill', 'twist'],
  ];
  for (const [description, family] of cases) {
    const r = identifyTool(tool({ typeString: 'drill', description, productId: '' }), chiploads);
    assert(r.guess === family && r.guessSource === 'description', `"${description}" gave ${r.guess} from ${r.guessSource}`);
  }
  const two = identifyTool(tool({ typeString: 'drill', description: 'through dowel drill', productId: '' }), chiploads);
  assert(two.guess === null && two.guessSource === null, 'two families in one description must cancel');
  const router = identifyTool(tool({ description: 'hinge compression cutter', productId: '' }), chiploads);
  assert(router.kind === 'router' && router.guess === 'compression', 'a router bit reads its geometry, never a drill family');
  const ball = identifyTool(tool({ typeString: 'ball end mill', description: 'hinge', productId: '' }), chiploads);
  assert(ball.guess === null, 'a ball-nose takes no guess of either kind');
});
