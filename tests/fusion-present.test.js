// Pins for js/fusion/present.js, the pure presentation helpers behind the
// panel's operation cards (2026-09-01). The chip triage is the one that
// matters: a card shows at most three chips, hot first, and the count of
// hidden hot chips drives the "n more need action" wording, so a wrong pick
// here hides a fault behind a toggle.

import { test, assert } from './helpers.js';
import { loadData } from './load-node.js';
import { calculateDrilling } from '../js/core/drilling.js';
import { strategyLabel, pickChips, readFacts, drillChips, STRATEGY_LABELS } from '../js/fusion/present.js';

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
  // A height the add-in resolved from the selected geometry says where it
  // came from, and a null in a geometry mode names the mode (2026-09-02).
  const resolved = readFacts({ strategy: 'slot', tool: { diameterMm: 9.5, flutes: 2 }, params: { doMultipleDepths: false }, heights: { top: { mode: 'from stock top', zMm: 0, zSource: 'parameter' }, bottom: { mode: 'from contour', zMm: -7, zSource: 'geometry', zSpreadMm: 0 } } });
  assert(resolved === 'Read: top 0 mm, bottom -7 mm from the contour, stepdown off, diameter 9.5 mm, 2 flutes.', `got: ${resolved}`);
  const unresolved = readFacts({ strategy: 'slot', tool: { diameterMm: 9.5, flutes: 2 }, params: { doMultipleDepths: false }, heights: { top: { mode: 'from stock top', zMm: 0, zSource: 'parameter' }, bottom: { mode: 'from contour', zMm: null, zSource: null } } });
  assert(unresolved === 'Read: top 0 mm, bottom not read (from contour), stepdown off, diameter 9.5 mm, 2 flutes.', `got: ${unresolved}`);
  // A drill names the hole and the drill, and nothing about stepdowns or flutes.
  const drill = readFacts({ strategy: 'drill', tool: { diameterMm: 3, flutes: 2 }, params: {}, heights: { top: { mode: 'from hole top', zMm: -2, zSource: 'geometry', zSpreadMm: 0 }, bottom: { mode: 'from hole bottom', zMm: -8, zSource: 'geometry', zSpreadMm: 0 } } });
  assert(drill === 'Read: top -2 mm from the hole, bottom -8 mm from the hole, diameter 3 mm.', `got: ${drill}`);
});

test('FR5', 'drill chips: short badge text with the core sentence as detail, hot per danger, no vendor name', () => {
  const data = loadData();
  const machine = { spindleKw: 10, breakpointRpm: 12000, rpmMax: 24000, rpmMin: 1000, feedMaxMmMin: 30000 };
  const input = { drillType: 'hinge_drill', material: 'laminated_pb', diameterMm: 35, holeDepthMm: 13, profile: 'standard', drillBank: false, machine };
  const ok = calculateDrilling(input, data);
  assert(ok.status === 'ok', `the fixture cut must serve, got ${ok.status}`);
  const chips = drillChips(ok);
  assert(chips.some((c) => c.key === 'rev' && c.level === 'cool'), 'a clean cut gets a cool feed-per-rev chip');
  assert(chips.some((c) => c.key === 'speed' && c.level === 'info'), 'the published speed range is an info chip');
  assert(chips.some((c) => c.key === 'factor' && c.level === 'info'), 'the material factor is an info chip');
  for (const c of chips) {
    assert(c.text.length <= 72, `chip text too long for a badge: ${c.text}`);
    assert(typeof c.detail === 'string', `every drill chip carries a detail for the check list: ${c.key}`);
    assert(!/leitz/i.test(`${c.text} ${c.detail}`), `no vendor name in a drilling chip: ${c.text} ${c.detail}`);
  }
  // A machine feed cap under the band: the core's danger warning becomes a
  // hot chip with the full sentence as detail, and the cool chip stays away.
  const capped = calculateDrilling({ ...input, machine: { ...machine, feedMaxMmMin: 100 } }, data);
  assert(capped.status === 'ok', `the capped cut must still serve, got ${capped.status}`);
  const hot = drillChips(capped);
  const below = hot.find((c) => c.key === 'drill_feed_below_band');
  assert(below && below.level === 'hot', 'the below-band warning must be a hot chip');
  assert(below.text === 'Feed below the slowest published' && below.detail.includes('rubs'), `short text and full detail: ${below.text} / ${below.detail}`);
  assert(!hot.some((c) => c.key === 'rev'), 'no cool feed chip beside a below-band warning');
  assert(drillChips({ status: 'refused' }).length === 0, 'a refused result has no chips');
});
