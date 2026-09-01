// Tool identity and geometry prefill for the Fusion panel. The interface is
// pinned in fusion-addin/protocol.md ("js/fusion/tool-identity.js"). Pure:
// no I/O, no globals, no clock, no randomness. The fence in tests/run.js
// enforces this for the whole js/fusion/ directory.
//
// The guess only prefills the pick in the panel. The user's confirmation
// makes it real (decision A3, 2026-09-01). Matching is conservative by
// design: when the strings do not agree, the answer is no guess, never a
// plausible one, because a wrong prefill invites a wrong confirmation.

// Geometry classes from chiploads.json that map onto the four confirmable
// tool types. Every class absent here (finisher, chipbreaker_finisher, the
// hoggers, unspecified) maps to nothing on purpose: a finisher id must not
// prefill a cutting geometry (2026-09-01).
const GEOMETRY_TO_TYPE = {
  spiral_upcut: 'upcut',
  spiral_downcut: 'downcut',
  compression_spiral: 'compression',
  compression_chipbreaker_finisher: 'compression',
  straight: 'straight',
  straight_o_flute: 'straight',
};

// Keyword forms for the description fallback. All matching runs on
// lowercased text, so the patterns stay lowercase. Word boundaries stop
// "cutter" or "downstream" from matching.
const TYPE_PATTERNS = [
  { type: 'compression', re: /\bcompression\b/ },
  { type: 'upcut', re: /\bup[\s-]?cut\b/ },
  { type: 'downcut', re: /\bdown[\s-]?cut\b/ },
  { type: 'straight', re: /\bstraight\b|\bo[\s-]flute\b/ },
];

// A family prefix is everything up to and including the first digit after
// the first dash. "60-104" gives "60-1", so it matches "60-100MW" and
// "60-100C". "52-240B" gives "52-2", so it matches "52-200". An id with no
// dash, or no digit after the dash, has no prefix and matches nothing.
const FAMILY_PREFIX = /^[^-]+-[^0-9]*[0-9]/;

// Trim, collapse internal whitespace runs to one space, and tolerate null.
// Fusion tool-library strings carry stray spaces, and a stray space must
// not fork a tool's remembered identity.
function collapse(s) {
  return typeof s === 'string' ? s.trim().replace(/\s+/g, ' ') : '';
}

// djb2 (xor variant), rendered as eight hex digits. Stability is the whole
// point: the key names the tool in the stored user choices, so the same
// strings must always give the same key.
function djb2Hex(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i += 1) {
    h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function toolKey(rawTool) {
  const vendor = collapse(rawTool.vendor).toLowerCase();
  const productId = collapse(rawTool.productId).toLowerCase();
  if (productId !== '') {
    return `${vendor}|${productId}`;
  }
  // No product id: digest the raw facts that describe the tool. A null
  // fact digests as an empty slot, so a library that omits a field still
  // yields a stable key.
  const parts = [
    collapse(rawTool.typeString),
    rawTool.diameterMm == null ? '' : String(rawTool.diameterMm),
    rawTool.flutes == null ? '' : String(rawTool.flutes),
    collapse(rawTool.description),
  ];
  return djb2Hex(parts.join('|').toLowerCase());
}

function familyPrefix(id) {
  const m = FAMILY_PREFIX.exec(id);
  return m ? m[0] : null;
}

// The tool library may say "LMT Onsrud" where the chart says "Onsrud", so
// either string containing the other counts as the same vendor. An empty
// vendor on either side matches nothing, because an empty string is a
// substring of everything.
function sameVendor(toolVendor, entryVendor) {
  if (toolVendor === '' || entryVendor === '') return false;
  return toolVendor.includes(entryVendor) || entryVendor.includes(toolVendor);
}

// Walk the chart entries once. Returns the unique { vendor, series } pairs
// the product id matches, plus the tool-type guess those matches agree on,
// or null when they disagree or none of their geometry classes maps.
function matchSeries(rawTool, chiploads) {
  const toolVendor = collapse(rawTool.vendor).toLowerCase();
  const productId = collapse(rawTool.productId).toLowerCase();
  const prefix = productId === '' ? null : familyPrefix(productId);
  const matches = [];
  if (prefix === null || toolVendor === '') {
    return { matches, idGuess: null };
  }

  const entries = chiploads && Array.isArray(chiploads.entries) ? chiploads.entries : [];
  const seenPairs = new Set();
  const mappedTypes = new Set();
  let unmappedMatch = false;

  for (const entry of entries) {
    if (entry.superseded_by) continue;
    if (typeof entry.series !== 'string' || entry.series === '') continue;
    if (!sameVendor(toolVendor, collapse(entry.vendor).toLowerCase())) continue;

    // A series string like "52-200/57-200" is a slash-joined list of
    // part-number families that share one chart row (data/schema.md).
    const families = entry.series.split('/');
    const hit = families.some(
      (family) => familyPrefix(collapse(family).toLowerCase()) === prefix,
    );
    if (!hit) continue;

    const pairKey = `${entry.vendor}|${entry.series}`;
    if (!seenPairs.has(pairKey)) {
      seenPairs.add(pairKey);
      matches.push({ vendor: entry.vendor, series: entry.series });
    }

    const type = GEOMETRY_TO_TYPE[entry.tool_geometry];
    if (type) mappedTypes.add(type);
    else unmappedMatch = true;
  }

  // Every matched series must map, and all to the same type. A finisher in
  // the matches, or a split vote, means the id proves nothing.
  const idGuess = !unmappedMatch && mappedTypes.size === 1 ? [...mappedTypes][0] : null;
  return { matches, idGuess };
}

// The description fallback reads the free text only when the product id
// gave nothing. Two distinct types in the text cancel each other: a
// "compression up-cut" description guesses nothing.
function guessFromText(rawTool) {
  const text = `${collapse(rawTool.description)} ${collapse(rawTool.comment)}`.toLowerCase();
  const hits = new Set();
  for (const p of TYPE_PATTERNS) {
    if (p.re.test(text)) hits.add(p.type);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

// rawTool is the job message tool shape in fusion-addin/protocol.md.
// Returns { key, guess, guessSource, seriesMatches }.
export function identifyTool(rawTool, chiploads) {
  const { matches, idGuess } = matchSeries(rawTool, chiploads);

  let guess = null;
  let guessSource = null;
  if (idGuess) {
    guess = idGuess;
    guessSource = 'product_id';
  } else {
    const textGuess = guessFromText(rawTool);
    if (textGuess) {
      guess = textGuess;
      guessSource = 'description';
    }
  }

  return { key: toolKey(rawTool), guess, guessSource, seriesMatches: matches };
}
