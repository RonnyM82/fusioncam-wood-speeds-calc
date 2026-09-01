// Pins for js/fusion/present.js, the pure presentation helpers behind the
// panel's operation cards (2026-09-01). The chip triage is the one that
// matters: a card shows at most three chips, hot first, and the count of
// hidden hot chips drives the "n more need action" wording, so a wrong pick
// here hides a fault behind a toggle.

import { test, assert } from './helpers.js';
import { strategyLabel, pickChips, readFacts, STRATEGY_LABELS } from '../js/fusion/present.js';

test('FR1', 'strategy labels: known ids get words, unknown ids pass through, null says not read', () => {
  assert(strategyLabel('contour2d') === '2D contour', `got ${strategyLabel('contour2d')}`);
  assert(strategyLabel('drill') === 'Drill', 'drill label');
  assert(strategyLabel('some_future_strategy') === 'some_future_strategy', 'unknown ids pass through unchanged');
  assert(strategyLabel(null) === 'Strategy not read', 'a null strategy says it was not read');
  for (const [id, label] of Object.entries(STRATEGY_LABELS)) {
    assert(label === label.trim() && label.length > 0, `label for ${id} is empty or padded`);
  }
});

test('FR2', 'chip triage shows at most three, hot before warm before cool, and counts the hidden hot ones', () => {
  const chips = [
    { key: 'a', level: 'cool', text: 'a' },
    { key: 'b', level: 'warm', text: 'b' },
    { key: 'c', level: 'hot', text: 'c' },
    { key: 'd', level: 'info', text: 'd' },
    { key: 'e', level: 'hot', text: 'e' },
    { key: 'f', level: 'hot', text: 'f' },
    { key: 'g', level: 'hot', text: 'g' },
  ];
  const r = pickChips(chips);
  assert(r.shown.length === 3, `expected 3 shown, got ${r.shown.length}`);
  assert(r.shown.map((c) => c.key).join('') === 'cef', `hot chips first, in order: got ${r.shown.map((c) => c.key).join('')}`);
  assert(r.hidden.length === 4, `expected 4 hidden, got ${r.hidden.length}`);
  assert(r.hiddenHot === 1, `one hot chip did not fit, got ${r.hiddenHot}`);
  assert(!r.shown.some((c) => c.level === 'info'), 'info chips never make the top three');
});

test('FR3', 'chip triage with few chips shows them all and hides nothing', () => {
  const chips = [
    { key: 'a', level: 'cool', text: 'a' },
    { key: 'b', level: 'info', text: 'b' },
  ];
  const r = pickChips(chips);
  assert(r.shown.length === 1 && r.shown[0].key === 'a', 'the one cool chip shows');
  assert(r.hidden.length === 1 && r.hidden[0].key === 'b', 'the info chip waits under the toggle');
  assert(r.hiddenHot === 0, 'no hot chip hidden');
  const none = pickChips([]);
  assert(none.shown.length === 0 && none.hidden.length === 0 && none.hiddenHot === 0, 'empty in, empty out');
});

test('FR4', 'the facts clause names every value read and says not read for a null', () => {
  const op = {
    strategy: 'adaptive2d',
    tool: { diameterMm: 12, flutes: 2 },
    params: { doMultipleDepths: false, stepdownMm: 6, optimalLoadMm: 4.8, direction: 'climb', compensation: null },
    heights: { top: { zMm: 0 }, bottom: { zMm: 0 } },
  };
  const s = readFacts(op);
  assert(s === 'Read: top 0 mm, bottom 0 mm, stepdown off, diameter 12 mm, 2 flutes, optimal load 4.8 mm, direction climb.', `got: ${s}`);
  const nulls = readFacts({ strategy: 'contour2d', tool: {}, params: {}, heights: {} });
  assert(nulls === 'Read: top not read, bottom not read, multiple depths not read, diameter not read, flutes not read.', `got: ${nulls}`);
  const stepped = readFacts({ strategy: 'slot', tool: { diameterMm: 3.175, flutes: 1 }, params: { doMultipleDepths: true, stepdownMm: 2.5 }, heights: { top: { zMm: 18 }, bottom: { zMm: -0.5 } } });
  assert(stepped === 'Read: top 18 mm, bottom -0.5 mm, stepdown 2.5 mm, diameter 3.175 mm, 1 flute.', `got: ${stepped}`);
});
