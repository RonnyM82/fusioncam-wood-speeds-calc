// Turn the plastics read into data/plastics.json. Run it from the repository
// root after editing research/onsrud-pct19-plastics-read.json:
//
//     node tools/build-plastics.mjs
//
// Nothing here invents a number. Every chip load comes from a printed cell of
// the read, and every series fact (its name, its flutes, its cut direction and
// the page it is on) is copied from the catalogue's own contents and product
// pages, named below with the printed page. Where a printed cell is not a
// clean number it is encoded as Scott ruled, and the entry says so in
// transcription_note.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = JSON.parse(readFileSync(join(root, 'research', 'onsrud-pct19-plastics-read.json'), 'utf8'));

const EDITION = 'PCT-19';
const CATALOGUE = 'onsrud-pct19-catalogue';

// The columns of both sheets, in printed order.
const COLUMNS = ['1/16', '3/32', '1/8', '5/32', '3/16', '7/32', '1/4', '5/16', '3/8', '7/16', '1/2', '9/16', '5/8', '3/4', '7/8', '1', '1 1/8', '1 1/4', '1 1/2', '1 3/4', '2'];

function inches(col) {
  const parts = col.split(' ');
  let v = 0;
  for (const p of parts) {
    const [n, d] = p.split('/');
    v += d ? Number(n) / Number(d) : Number(n);
  }
  return v;
}

// One fact per series, from the catalogue. `name` is the contents page's own
// words (printed pages 5 to 11), and `words` says the same thing in the page's
// plain English for a router series. `page` is the printed page of the
// series' product page. `kind` sorts the tools the chart ladder may show
// beside the served band from the ones it may not: a router is a flat-ended
// solid carbide cutter for profiling and pocketing, which is what the
// calculator's tool types describe. The rest are recorded and never drawn:
// an HSS tool (the calculator is for solid carbide), engraving and V tools,
// ball noses, edge profile tools and taper tools.
const SERIES = {
  '10-00': { name: 'HSS 1F "O" Flute Straight', flutes: 1, direction: 'straight', kind: 'hss', page: 14 },
  '37-00/37-20': { name: 'SC 60° and 30° Engraving Tools', flutes: null, direction: null, kind: 'engraving', page: 20 },
  '37-50': { name: 'Carbide V Bottom', flutes: null, direction: null, kind: 'engraving', page: 21 },
  '37-60': { name: 'Carbide V Bottom', flutes: null, direction: null, kind: 'engraving', page: 21 },
  '52-200B/BL': { name: 'SC 2F Spiral Upcut Ball Nose', flutes: 2, direction: 'upcut', kind: 'ball_nose', page: 39 },
  '52-600': { name: 'SC 2F Upcut "O" Flute', flutes: 2, direction: 'upcut', words: 'two-flute up-cut O-flute', kind: 'router', page: 40 },
  '52-700': { name: 'SC 2F Upcut "O" Flute', flutes: 2, direction: 'upcut', words: 'two-flute up-cut O-flute', kind: 'router', page: 41 },
  '56-000': { name: 'SC 2F Straight', flutes: 2, direction: 'straight', words: 'two-flute straight', kind: 'router', page: 43 },
  '56-000P': { name: 'SC 2F Straight', flutes: 2, direction: 'straight', words: 'two-flute straight', kind: 'router', page: 43 },
  '56-430': { name: 'SC 2F Straight "O" Flute-Metric', flutes: 2, direction: 'straight', words: 'two-flute straight O-flute', kind: 'router', page: 44 },
  '56-450': { name: 'SC 2F Straight-Metric', flutes: 2, direction: 'straight', words: 'two-flute straight', kind: 'router', page: 45 },
  '56-600': { name: 'SC 2F Straight "O" Flute', flutes: 2, direction: 'straight', words: 'two-flute straight O-flute', kind: 'router', page: 45 },
  '57-600': { name: 'SC 2F Downcut "O" Flute', flutes: 2, direction: 'downcut', words: 'two-flute down-cut O-flute', kind: 'router', page: 48 },
  // The product page offers both hands of each (printed page 49: high helix
  // and low helix hoggers, each up-cut and down-cut).
  '60-000': { name: 'SC 3F High Helix and Low Helix Chipbreaker', flutes: 3, direction: 'both', words: 'three-flute chipbreaker hogger', kind: 'router', page: 49 },
  // Printed page 54 offers it up-cut and down-cut.
  '60-200': { name: 'SC 3F Low Helix Finisher', flutes: 3, direction: 'both', words: 'three-flute low-helix finisher', kind: 'router', page: 54 },
  // Printed page 57 offers it up-cut and down-cut.
  '60-900': { name: 'SC 3F Heavy Duty Hogger', flutes: 3, direction: 'both', words: 'three-flute heavy-duty hogger', kind: 'router', page: 57 },
  '61-000P': { name: 'SC 1F "O" Flute Straight', flutes: 1, direction: 'straight', words: 'single-edge straight O-flute', kind: 'router', page: 59 },
  '61-400': { name: 'SC 1F Straight-Metric', flutes: 1, direction: 'straight', words: 'single-edge straight', kind: 'router', page: 60 },
  '62-700': { name: 'SC 1F Downcut "O" Flute', flutes: 1, direction: 'downcut', words: 'single-edge down-cut O-flute', kind: 'router', page: 61 },
  '62-750': { name: 'SC 1F Downcut "O" Flute', flutes: 1, direction: 'downcut', words: 'single-edge down-cut O-flute', kind: 'router', page: 61 },
  '62-800': { name: 'SC 1F Downcut "O" Flute-Metric', flutes: 1, direction: 'downcut', words: 'single-edge down-cut O-flute', kind: 'router', page: 61 },
  '62-850': { name: 'SC 1F Downcut "O" Flute-Metric', flutes: 1, direction: 'downcut', words: 'single-edge down-cut O-flute', kind: 'router', page: 61 },
  '63-500': { name: 'SC 1F Acrylic Tools', flutes: 1, direction: 'upcut', words: 'single-edge up-cut O-flute for acrylic', kind: 'router', page: 64 },
  '63-700': { name: 'SC 1F Upcut "O" Flute', flutes: 1, direction: 'upcut', words: 'single-edge up-cut O-flute', kind: 'router', page: 65 },
  '63-750': { name: 'SC 1F Upcut "O" Flute', flutes: 1, direction: 'upcut', words: 'single-edge up-cut O-flute', kind: 'router', page: 65 },
  '63-800': { name: 'SC 1F Upcut "O" Flute-Metric', flutes: 1, direction: 'upcut', words: 'single-edge up-cut O-flute', kind: 'router', page: 65 },
  '63-850': { name: 'SC 1F Upcut "O" Flute-Metric', flutes: 1, direction: 'upcut', words: 'single-edge up-cut O-flute', kind: 'router', page: 65 },
  // One printed row for two series: 64-000 is the down-cut Super O (printed
  // page 66) and 65-000 the up-cut one (page 67).
  '64-000/65-000': { name: 'SC 1F Downcut Super O and SC 1F Upcut Super O', flutes: 1, direction: 'both', words: 'single-edge Super O-flute, down-cut or up-cut', kind: 'router', page: 66 },
  '65-200B/65-300B': { name: 'SC 2F and 4F High Finish Ballnose', flutes: null, direction: null, kind: 'ball_nose', page: 68 },
  '66-000': { name: 'SC Edge Rounding Bits', flutes: null, direction: null, kind: 'edge_profile', page: 69 },
  '66-200': { name: 'SC Rout and Chamfer', flutes: 2, direction: null, kind: 'edge_profile', page: 70 },
  '66-300': { name: 'SC Upcut Bottom Surfacing', flutes: 2, direction: 'upcut', kind: 'edge_profile', page: 70 },
  '77-100 (DE)': { name: 'SC 2F and 3F Taper Tools', flutes: null, direction: null, kind: 'taper', page: 91 },
  '77-100 (3E)': { name: 'SC 2F and 3F Taper Tools', flutes: null, direction: null, kind: 'taper', page: 91 },
};

// The material picks and the family each belongs to (Scott, 2026-09-24).
// Acrylic is two picks because cast and extruded acrylic sit in different
// families.
const PICKS = {
  soft_plastic: [
    ['abs', 'ABS'],
    ['polycarbonate', 'Polycarbonate'],
    ['polyethylene', 'Polyethylene'],
    ['hdpe', 'HDPE'],
    ['uhmw', 'UHMW'],
    ['polypropylene', 'Polypropylene'],
    ['polystyrene', 'Polystyrene / HIPS'],
    ['petg', 'PETG'],
    ['acrylic_extruded', 'Acrylic, extruded'],
  ],
  hard_plastic: [
    ['acrylic_cast', 'Acrylic, cast'],
    ['nylon', 'Nylon'],
    ['pvc_rigid', 'Rigid PVC'],
    ['acetal', 'Acetal / Delrin'],
    ['phenolic', 'Phenolic'],
  ],
};

// Parse one printed band. A value printed without its decimal point ("006")
// is read as thousandths, Scott's ruling for the 56-000 and 56-000P cells at
// 3/16 in on the hard sheet. A stray space is dropped. Returns the numbers and
// what, if anything, was mended.
function parseBand(printed) {
  const mended = [];
  const clean = printed.replace(/\s+/g, '');
  if (clean !== printed) mended.push('A space inside the printed band is dropped');
  const halves = clean.split('-');
  if (halves.length !== 2) throw new Error(`cannot read the band "${printed}"`);
  const vals = halves.map((h) => {
    if (/^\.\d{3}$/.test(h)) return Number(`0${h}`);
    if (/^\d{3}$/.test(h)) {
      mended.push(`"${h}" is printed without its decimal point and is read as .${h}`);
      return Number(`0.${h}`);
    }
    throw new Error(`cannot read "${h}" in "${printed}"`);
  });
  if (!(vals[0] <= vals[1])) throw new Error(`the band "${printed}" runs high to low`);
  return { min: vals[0], max: vals[1], mended };
}

const round = (x, dp) => Number(x.toFixed(dp));

function entriesFor(family, sheet, sourceKey) {
  const starred = new Set(sheet.rows.filter((r) => r.series.endsWith('*')).map((r) => r.series));
  const rpmFootnote = sheet.footnotes.find((f) => /12,500 RPM/.test(f)) ?? null;
  if (starred.size && !rpmFootnote) throw new Error(`${family}: starred series with no footnote`);
  const out = [];
  for (const row of sheet.rows) {
    const series = row.series.replace(/\*$/, '');
    if (!SERIES[series]) throw new Error(`${family}: no catalogue facts for series ${series}`);
    const cols = Object.keys(row.cells).sort((a, b) => COLUMNS.indexOf(a) - COLUMNS.indexOf(b));
    for (const col of cols) {
      if (!COLUMNS.includes(col)) throw new Error(`${family} ${series}: unknown column ${col}`);
      const printed = row.cells[col];
      const band = parseBand(printed);
      const dIn = inches(col);
      const e = {
        source: sourceKey,
        vendor: 'Onsrud',
        edition: EDITION,
        page: sheet.page,
        family,
        series,
        series_printed: row.series,
        cut_printed: row.cut,
        doc_basis: row.cut === '1 x D' ? '1xD' : 'varies',
        diameter_printed: col,
        diameter_in: round(dIn, 6),
        diameter_mm: round(dIn * 25.4, 5),
        fz_min_in: band.min,
        fz_max_in: band.max,
        printed,
        data_class: 'vendor',
      };
      if (starred.has(row.series)) e.rpm_max = { rpm: 12500, printed: rpmFootnote };
      if (band.mended.length) e.transcription_note = `${band.mended.join('. ')}.`;
      out.push(e);
    }
  }
  return out;
}

const softSource = 'onsrud-pct19-soft-plastic';
const hardSource = 'onsrud-pct19-hard-plastic';

const entries = [
  ...entriesFor('soft_plastic', read.soft, softSource),
  ...entriesFor('hard_plastic', read.hard, hardSource),
];

function printedTable(sheet) {
  return { below_half_in: sheet.good_better_best.below_half, half_in_and_up: sheet.good_better_best.half_and_up };
}

function bestFor(sheet, application, half) {
  const table = half ? sheet.good_better_best.half_and_up : sheet.good_better_best.below_half;
  const row = table.find((r) => r.application === application);
  return row ? row.best : null;
}

const DEPTH = { '1xD': 1, '2xD': 0.75, '3xD': 0.5 };

function family(sheet, sourceKey, label, defect) {
  return {
    label,
    source: sourceKey,
    edition: EDITION,
    page: sheet.page,
    tool_recommendations: printedTable(sheet),
    // The calculator serves the Best single-pass series: the maker's own first
    // choice, one named tool behind every number (Scott approved, 2026-09-24).
    // At exactly 1/2 in the "1/2 and up" series serves, because the sheet
    // splits the two tables "< 1/2" and "≥ 1/2".
    serving: {
      rule: 'best_single_pass',
      split_in: 0.5,
      below_split: bestFor(sheet, 'Single Pass', false),
      at_or_above_split: bestFor(sheet, 'Single Pass', true),
    },
    // The Finishing profile serves the low edge of the 60-200 row. The hard
    // sheet names 60-200 as its Best finishing tool at every size. The soft
    // sheet names no finishing tool, but prints a 60-200 row of its own, and
    // that row serves: the same tool, the sheet's own numbers for the
    // material (Scott asked for Finishing to be done, 2026-09-24).
    finishing: {
      series: '60-200',
      printed_as_finishing: bestFor(sheet, 'Finishing', false) === '60-200' && bestFor(sheet, 'Finishing', true) === '60-200',
    },
    depth_derating: { ...DEPTH, printed: sheet.depth_of_cut },
    formulas_printed: [
      'Chip Load = Feed Rate / (RPM x # of cutting edges)',
      'Feed Rate = RPM x # of cutting edges x chip load',
      'Speed (RPM) = Feed Rate / (# of cutting edges x chip load)',
    ],
    note_printed: sheet.note,
    defect,
    picks: PICKS[sourceKey === softSource ? 'soft_plastic' : 'hard_plastic'].map(([id, pickLabel]) => ({ id, label: pickLabel })),
  };
}

const out = {
  schema_version: '1.0',
  about: 'Chip loads for soft and hard plastic, from the two Onsrud plastics sheets of catalogue PCT-19, one entry per printed cell, in the units printed (inches per tooth, inch diameters). The calculator converts to millimetres at run time, so this file holds only what the sheets print. Built by tools/build-plastics.mjs from research/onsrud-pct19-plastics-read.json. Kept apart from chiploads.json so the wood selection code never sees a plastic row. data/schema.md records the rules.',
  units: { chip_load: 'in/tooth, as printed', diameter: 'in, as printed; diameter_mm is diameter_in x 25.4' },
  sources: {
    [softSource]: {
      document: 'LMT Onsrud Production Cutting Tools Catalog PCT-19 (2019), Soft Plastic Cutting Data Recommendations, page 120',
      file: 'research/sources/Soft Plastic.pdf',
      edition: EDITION,
      page: 120,
      retrieved: '2026-09-24',
    },
    [hardSource]: {
      document: 'LMT Onsrud Production Cutting Tools Catalog PCT-19 (2019), Hard Plastic Cutting Data Recommendations, page 121',
      file: 'research/sources/Hard Plastic.pdf',
      edition: EDITION,
      page: 121,
      retrieved: '2026-09-24',
    },
    [CATALOGUE]: {
      document: 'LMT Onsrud Production Cutting Tools Catalog PCT-19 (2019): the contents on printed pages 5 to 11 for each series name, and each series product page for its flutes and hands',
      file: 'research/sources/LMT Onsrud Product Cutting Tools Catalog PCT-19.pdf',
      edition: EDITION,
      retrieved: '2026-09-24',
    },
  },
  families: {
    soft_plastic: family(read.soft, softSource, 'soft plastic', 'knife marks'),
    hard_plastic: family(read.hard, hardSource, 'hard plastic', 'cratering'),
  },
  series: Object.fromEntries(Object.entries(SERIES).map(([k, v]) => [k, { ...v, source: CATALOGUE, edition: EDITION }])),
  entries,
};

writeFileSync(join(root, 'data', 'plastics.json'), `${JSON.stringify(out, null, 1)}\n`);
console.log(`data/plastics.json: ${entries.length} entries (${entries.filter((e) => e.family === 'soft_plastic').length} soft, ${entries.filter((e) => e.family === 'hard_plastic').length} hard)`);
