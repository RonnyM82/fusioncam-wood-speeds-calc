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

// The drill families for a drill's prefill, by the ids js/ui/drill-tables.js
// DRILL_TOOLS uses (2026-09-02). A brad point is the cabinetmaker's dowel
// drill: a centre point and two spurs, the geometry the dowel-drill pages
// draw, so the word prefills that family. Two families in one description
// cancel to no guess, as with the router words.
const DRILL_PATTERNS = [
  { type: 'hinge', re: /\bhinge\b|\bcup\b/ },
  { type: 'through', re: /\bthrough\b|\bthru\b/ },
  { type: 'dowel', re: /\bdowel\b|\bbrad\b/ },
  { type: 'twist', re: /\btwist\b|\bjobber\b/ },
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
function guessFromText(rawTool, patterns) {
  const text = `${collapse(rawTool.description)} ${collapse(rawTool.comment)}`.toLowerCase();
  const hits = new Set();
  for (const p of patterns) {
    if (p.re.test(text)) hits.add(p.type);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

// The tool kind, from Fusion's own tool type string (spike-results-windows.md
// section 4: "flat end mill", "ball end mill", "drill" were read on the test
// file inside Fusion; the tool library schema names the rest). The geometry question,
// up-cut or down-cut or compression or straight, is a router-bit question.
// A drill is a drill and a ball-nose is 3D tooling, and asking either for a
// spiral direction is wrong (Scott, 2026-09-01, first run inside Fusion).
//   router:  flat end mill, and any type the list does not name, because a
//            router bit is the only kind the charts serve today
//   drill:   drill, spot drill, centre drill, counter bore, counter sink,
//            reamer, tap, bore bar
//   ball:    ball end mill, bull nose end mill, lollipop mill, radius mill,
//            form mill, tapered mill, dovetail mill, slot mill, thread mill
//   chamfer: chamfer mill, engrave chamfer mill
export function toolKind(typeString) {
  const t = String(typeString ?? '').trim().toLowerCase();
  if (!t) return 'router';
  if (/\b(drill|counter bore|counter sink|reamer|tap|bore bar)\b/.test(t)) return 'drill';
  if (/\b(ball end mill|bull nose end mill|lollipop|radius mill|form mill|tapered mill|dovetail|slot mill|thread mill)\b/.test(t)) return 'ball';
  if (/\bchamfer\b/.test(t)) return 'chamfer';
  return 'router';
}

// rawTool is the job message tool shape in fusion-addin/protocol.md.
// Returns { key, kind, guess, guessSource, seriesMatches }. The guess
// prefills the one question the tool takes: a geometry for a router bit
// (upcut, downcut, compression, straight), a family for a drill (dowel,
// through, hinge, twist; 2026-09-02), nothing for the other kinds.
export function identifyTool(rawTool, chiploads) {
  const kind = toolKind(rawTool?.typeString);
  const { matches, idGuess } = matchSeries(rawTool, chiploads);

  // The series matches return for every kind: the match is a fact about
  // the tool, not a pick.
  let guess = null;
  let guessSource = null;
  if (kind === 'router') {
    if (idGuess) {
      guess = idGuess;
      guessSource = 'product_id';
    } else {
      const textGuess = guessFromText(rawTool, TYPE_PATTERNS);
      if (textGuess) {
        guess = textGuess;
        guessSource = 'description';
      }
    }
  } else if (kind === 'drill') {
    // No chart row names a drill by product id yet, so the description is
    // the one source for a drill's family.
    const textGuess = guessFromText(rawTool, DRILL_PATTERNS);
    if (textGuess) {
      guess = textGuess;
      guessSource = 'description';
    }
  }

  return { key: toolKey(rawTool), kind, guess, guessSource, seriesMatches: matches };
}
