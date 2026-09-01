// js/fusion/present.js — the pure presentation helpers the Fusion panel's
// operation cards need: the strategy label under a name, the chip triage
// that keeps a card to three chips, and the facts clause an unreadable card
// prints so a screenshot shows what the add-in sent. The module is pure, and
// the fence in tests/run.js holds it there: no DOM, no I/O, no clock.

// One short label per strategy, in the words a machinist uses in Fusion.
export const STRATEGY_LABELS = {
  contour2d: '2D contour',
  pocket2d: '2D pocket',
  slot: 'Slot',
  adaptive2d: '2D adaptive',
  adaptive: '3D adaptive',
  drill: 'Drill',
  parallel: 'Parallel',
  scallop: 'Scallop',
  contour: '3D contour',
  pocket_clearing: 'Pocket clearing',
  ramp: 'Ramp',
  spiral: 'Spiral',
  radial: 'Radial',
  morph: 'Morph',
  flat: 'Flat',
  horizontal: 'Horizontal',
  pencil: 'Pencil',
  steep_and_shallow: 'Steep and shallow',
  project: 'Project',
  swarf: 'Swarf',
  blend: 'Blend',
  morphed_spiral: 'Morphed spiral',
};

// An unknown strategy passes through as the raw string, so the card still
// says what Fusion called it. A null strategy was not read.
export function strategyLabel(strategy) {
  if (strategy == null) return 'Strategy not read';
  return STRATEGY_LABELS[strategy] ?? String(strategy);
}

// Chip triage. Every hot chip in buildChips() order, then every warm, then
// every cool, stopping at max. Info chips never make the top three: they
// live in the full list under the toggle. hiddenHot counts the hot chips
// that did not fit, so the summary can say how many still need action.
const LEVEL_ORDER = ['hot', 'warm', 'cool'];

export function pickChips(chips, max = 3) {
  const shown = [];
  for (const level of LEVEL_ORDER) {
    for (const chip of chips) {
      if (shown.length >= max) break;
      if (chip.level === level) shown.push(chip);
    }
  }
  const hidden = chips.filter((chip) => !shown.includes(chip));
  const hiddenHot = hidden.filter((chip) => chip.level === 'hot').length;
  return { shown, hidden, hiddenHot };
}

// Three decimals, trailing zeros trimmed: finer than any catalogue, and
// 3.175 stays intact (the js/ui/fusion-panel.js roundMm rule).
function mmText(value) {
  return String(Math.round(value * 1000) / 1000);
}

// Where a height came from, when Fusion took it from the selected geometry
// and the add-in resolved it there (protocol.md heights, 2026-09-02). A
// height Fusion resolved itself carries no suffix. A null in one of these
// modes names the mode, so the clause shows that the selection did not
// read, not the dialog.
const HEIGHT_SOURCE_WORDS = {
  'from contour': 'from the contour',
  'from hole top': 'from the hole',
  'from hole bottom': 'from the hole',
  'from point': 'from the point',
};

function heightFact(label, height) {
  const mode = height?.mode;
  if (height?.zMm == null) {
    return mode != null && HEIGHT_SOURCE_WORDS[mode] ? `${label} not read (${mode})` : `${label} not read`;
  }
  const from = height.zSource === 'geometry' && HEIGHT_SOURCE_WORDS[mode] ? ` ${HEIGHT_SOURCE_WORDS[mode]}` : '';
  return `${label} ${mmText(height.zMm)} mm${from}`;
}

// One clause naming what the add-in sent for this operation, so a screenshot
// of an unreadable card is enough to diagnose it. A null reads "not read",
// never a guess. Example:
//   Read: top 0 mm, bottom 0 mm, stepdown off, diameter 12 mm, 2 flutes.
export function readFacts(op) {
  const p = op.params ?? {};
  const tool = op.tool ?? {};
  const parts = [];
  parts.push(heightFact('top', op.heights?.top));
  parts.push(heightFact('bottom', op.heights?.bottom));
  // A drill has no stepdown, no flute count in its chart and no width of
  // cut: the clause names the hole and the drill (2026-09-02).
  if (op.strategy === 'drill') {
    parts.push(tool.diameterMm == null ? 'diameter not read' : `diameter ${mmText(tool.diameterMm)} mm`);
    return `Read: ${parts.join(', ')}.`;
  }
  if (op.strategy === 'adaptive' || p.doMultipleDepths === true) {
    parts.push(p.stepdownMm == null ? 'stepdown not read' : `stepdown ${mmText(p.stepdownMm)} mm`);
  } else if (p.doMultipleDepths === false) {
    parts.push('stepdown off');
  } else {
    parts.push('multiple depths not read');
  }
  parts.push(tool.diameterMm == null ? 'diameter not read' : `diameter ${mmText(tool.diameterMm)} mm`);
  parts.push(tool.flutes == null ? 'flutes not read' : `${tool.flutes} ${tool.flutes === 1 ? 'flute' : 'flutes'}`);
  if (op.strategy === 'adaptive2d' || op.strategy === 'adaptive') {
    parts.push(p.optimalLoadMm == null ? 'optimal load not read' : `optimal load ${mmText(p.optimalLoadMm)} mm`);
  }
  if (p.direction != null) parts.push(`direction ${p.direction}`);
  if (p.compensation != null) parts.push(`compensation ${p.compensation}`);
  return `Read: ${parts.join(', ')}.`;
}

// Chips for a drill card, from a calculateDrilling() result (2026-09-02).
// The routing chips come from js/core/diagnostics.js; the drilling core has
// no chip builder of its own, because the site renders its warnings as
// banners. A card has room for three short chips, so each warning code gets
// a short text here and keeps the core's full sentence as its detail for
// the check list. Levels follow the core's severities: danger is hot,
// warning is warm. No vendor name appears (data/schema.md, drilling
// attribution): the material factor names a material row, never a maker.
const DRILL_CHIP_TEXT = {
  drill_rpm_clamped_max: { level: 'warm', text: (r) => `Speed capped at the machine's ${rpmText(r.outputs.spindleRpm)} rpm` },
  drill_rpm_below_machine_floor: { level: 'warm', text: (r) => `Below the spindle floor, runs at ${rpmText(r.outputs.spindleRpm)} rpm` },
  drill_rpm_outside_published: { level: 'warm', text: (r) => `${rpmText(r.outputs.spindleRpm)} rpm is outside the published ${rpmText(r.meta.rpmRangeMin)} to ${rpmText(r.meta.rpmRangeMax)}` },
  drill_rpm_outside_band: { level: 'warm', text: () => 'Feed held at the edge of the published band' },
  drill_material_out_of_scope: { level: 'hot', text: () => 'Not published for this material' },
  drill_feed_below_band: { level: 'hot', text: () => 'Feed below the slowest published' },
  drill_chip_below_floor: { level: 'hot', text: () => 'Chip below the rubbing floor' },
};

// Speeds in a chip read like the stat cells: 12,000 rpm, never 12000.
function rpmText(n) {
  return Math.round(n).toLocaleString('en-NZ');
}

function firstSentence(text) {
  const cut = text.indexOf('. ');
  return cut > 0 ? text.slice(0, cut + 1) : text;
}

export function drillChips(result) {
  if (result.status !== 'ok') return [];
  const m = result.meta;
  const codes = new Set(result.warnings.map((w) => w.code));
  const chips = [];
  for (const w of result.warnings) {
    const spec = DRILL_CHIP_TEXT[w.code];
    chips.push({
      key: w.code,
      level: spec ? spec.level : (w.severity === 'danger' ? 'hot' : 'warm'),
      text: spec ? spec.text(result) : firstSentence(w.message),
      detail: w.message,
    });
  }
  // The feed per revolution against the served band. A feed the core has
  // already flagged as under the band or under the floor gets no cool chip:
  // the hot one above says it.
  if (!codes.has('drill_feed_below_band') && !codes.has('drill_chip_below_floor')) {
    chips.push({
      key: 'rev',
      level: 'cool',
      text: `Feed ${result.outputs.feedPerRevMm.toFixed(2)} mm/rev, inside the published band`,
      detail: `The published band at ${rpmText(result.outputs.spindleRpm)} rpm is ${m.bandServed.fnMin.toFixed(2)} to ${m.bandServed.fnMax.toFixed(2)} mm/rev after the material factor of ${m.materialFactor}.`,
    });
  }
  if (result.outputs.peckStepMm != null) {
    chips.push({ key: 'peck', level: 'warm', text: `Peck every ${mmText(result.outputs.peckStepMm)} mm`, detail: result.outputNotes.peck ?? '' });
  } else if (result.outputNotes.peck) {
    chips.push({ key: 'peck', level: 'cool', text: 'No clearing stroke needed', detail: result.outputNotes.peck });
  }
  for (const note of result.notes) {
    chips.push({ key: 'note', level: 'info', text: firstSentence(note), detail: note });
  }
  chips.push({ key: 'speed', level: 'info', text: `Published ${rpmText(m.rpmRangeMin)} to ${rpmText(m.rpmRangeMax)} rpm`, detail: result.outputNotes.speedRange });
  chips.push({ key: 'factor', level: 'info', text: `Material factor ${m.materialFactor}, ${m.factorMaterial}`, detail: m.chartNotes.join(' ') });
  return chips;
}
