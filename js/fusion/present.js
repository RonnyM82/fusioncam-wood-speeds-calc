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

// One clause naming what the add-in sent for this operation, so a screenshot
// of an unreadable card is enough to diagnose it. A null reads "not read",
// never a guess. Example:
//   Read: top 0 mm, bottom 0 mm, stepdown off, diameter 12 mm, 2 flutes.
export function readFacts(op) {
  const p = op.params ?? {};
  const tool = op.tool ?? {};
  const top = op.heights?.top?.zMm ?? null;
  const bottom = op.heights?.bottom?.zMm ?? null;
  const parts = [];
  parts.push(top == null ? 'top not read' : `top ${mmText(top)} mm`);
  parts.push(bottom == null ? 'bottom not read' : `bottom ${mmText(bottom)} mm`);
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
