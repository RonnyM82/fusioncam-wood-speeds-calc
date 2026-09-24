// The React page's charts (src/chart-view.js) against the old page it
// replaces. Written 2026-09-24, step 4 of docs/CONVERSION_PLAN.md.
//
// CH1 runs every baseline state through the form state and the engine, builds
// the charts, and holds them to what legacy.html recorded (tests/baseline/):
// every row's label, value and accessible name, which row carries the
// highlight, and every bar start, bar width, marker and cascade fill as the
// exact string the old code computed (the cascade's are unrounded, so a
// formula rewritten in a different order shows here); then each chart's
// heading, units, legend and table. A bar that starts in the wrong place or a
// highlight on the wrong row tells a machinist the wrong chart serves his
// numbers and looks fine in review. The browser comparison
// (tools/baseline.mjs) checks the same things as painted; this catches a
// drift without a browser, on every `npm run check`.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert } from './helpers.js';
import { loadData } from './load-node.js';
import { machinePresets } from '../js/data/presets.js';
import { calculate } from '../js/core/calculate.js';
import { calculateDrilling } from '../js/core/drilling.js';
import { createState, update, currentInput, currentDrillInput, blockers } from '../src/form-state.js';
import { chartsView } from '../src/chart-view.js';

const here = dirname(fileURLToPath(import.meta.url));
const baselineDir = join(here, 'baseline');
const data = loadData();
const presets = machinePresets(data.machines, data.rules);
const states = JSON.parse(readFileSync(join(baselineDir, 'states.json'), 'utf8')).states;
const recorded = (name) => JSON.parse(readFileSync(join(baselineDir, `${name}.json`), 'utf8'));

// The same map as tests/results.test.js.
const ACTIONS = {
  'radio:Twist drill': { type: 'tool', value: 'twist' },
  'radio:Drilling': { type: 'mode', value: 'drill' },
  'radio:Routing': { type: 'mode', value: 'rout' },
};

function chartsFor(st) {
  let s = createState(data, presets, st.query ? `?${st.query}` : '');
  for (const a of st.actions ?? []) {
    const change = a.click ? ACTIONS[`${a.click.role}:${a.click.name}`] : undefined;
    if (!change) throw new Error(`${st.name}: no change known for the action ${JSON.stringify(a)}`);
    s = update(s, change, presets);
  }
  if (blockers(s).length) throw new Error(`${st.name}: a box holds the results back`);
  const r = s.mode === 'drill' ? calculateDrilling(currentDrillInput(s, data, presets), data) : calculate(currentInput(s, data, presets), data);
  return chartsView(r, presets[s.machineIdx].machine);
}

// A table as the old page's reader recorded it. The reader saw the column
// headers and the row headers through the old table's CSS uppercase; the
// case the React page paints is the browser comparison's business.
const tableAsRecorded = (twin) => ({
  role: 'table',
  summary: `Show ${twin.caption.toLowerCase()} as a table`,
  caption: twin.caption,
  headers: twin.headers.map((h) => h.toUpperCase()),
  rows: twin.rows.map((cells) => cells.map((c, i) => ({ header: i === 0, text: i === 0 ? c.toUpperCase() : c }))),
});

const ladderAsRecorded = (chart) => {
  const rows = chart.rows.map((r) => ({
    label: r.tag === null ? r.label : `${r.label} ${r.tag}`,
    tag: r.tag,
    value: r.value,
    emphasis: r.serves,
    serving: r.serves,
    barLeft: r.barLeft,
    barWidth: r.barWidth,
    marker: r.marker,
    name: r.name,
  }));
  return {
    role: 'chart',
    kind: 'ladder',
    heading: chart.heading,
    units: chart.units,
    emphasised: rows.filter((r) => r.emphasis).map((r) => r.label),
    rows,
    // The drill speed chart's legend ends in a space when the drill bank
    // sentence is left out, as app.js wrote it; innerText drops it.
    legend: chart.legend.replace(/ +$/, ''),
    table: tableAsRecorded(chart.twin),
  };
};

const cascadeAsRecorded = (chart) => {
  const rows = chart.rows.map((r) => ({
    label: r.label,
    metric: r.metric,
    imperial: r.imperial,
    emphasis: r.binds,
    binds: r.binds,
    farAbove: r.farAbove,
    fillWidth: r.fillWidth,
    name: r.name,
  }));
  return [
    { role: 'chart', kind: 'cascade', emphasised: rows.filter((r) => r.emphasis).map((r) => r.label), rows },
    tableAsRecorded(chart.twin),
  ];
};

function expectedCharts(charts) {
  if (charts === null) return { results: [], diagnostics: [] };
  if (charts.drilling) return { results: [ladderAsRecorded(charts.drillFeed)], diagnostics: [ladderAsRecorded(charts.drillSpeed)] };
  return {
    results: charts.ladder === null ? [] : [ladderAsRecorded(charts.ladder)],
    diagnostics: cascadeAsRecorded(charts.cascade),
  };
}

const recordedCharts = (file) => {
  const keep = (b) => b.role === 'chart' || b.role === 'table';
  return { results: file.results.blocks.filter(keep), diagnostics: file.diagnostics.blocks.filter(keep) };
};

test('CH1', 'every baseline state draws the charts the old page drew: the same highlighted row, every bar and marker at the same computed position, the same names and tables', () => {
  assert(states.length >= 50, `only ${states.length} baseline states found`);
  const wrong = [];
  for (const st of states) {
    const want = JSON.stringify(recordedCharts(recorded(st.name)));
    const got = JSON.stringify(expectedCharts(chartsFor(st)));
    if (want !== got) {
      let i = 0;
      while (i < want.length && want[i] === got[i]) i++;
      wrong.push(`${st.name}\n      was: ...${want.slice(Math.max(0, i - 60), i + 80)}\n      now: ...${got.slice(Math.max(0, i - 60), i + 80)}`);
    }
  }
  assert(!wrong.length, `${wrong.length} differ:\n    ${wrong.join('\n    ')}`);
});

// The highlight goes on the rows that serve and on nothing else. That is one
// row in every chart but the ladder, where every published chart the engine
// serves from is highlighted, as the old page highlighted it: in two baseline
// states a straight tool is served by two and by three Onsrud charts at once
// (material-softwood-straight-12.7, tool-straight-12.7-mdf).
test('CH2', 'the highlight is on the serving charts, the picked setting, the drill and the binding cap, and nowhere else', () => {
  let charts = 0;
  let severalServe = 0;
  for (const st of states) {
    let s = createState(data, presets, st.query ? `?${st.query}` : '');
    for (const a of st.actions ?? []) s = update(s, ACTIONS[`${a.click.role}:${a.click.name}`], presets);
    const r = s.mode === 'drill' ? calculateDrilling(currentDrillInput(s, data, presets), data) : calculate(currentInput(s, data, presets), data);
    const c = chartsView(r, presets[s.machineIdx].machine);
    if (c === null) continue;
    const lit = (rows) => rows.filter((x) => x.serves).map((x) => x.label);
    if (c.drilling) {
      charts += 2;
      assert(JSON.stringify(lit(c.drillFeed.rows)) === JSON.stringify([c.drillFeed.rows.find((x) => x.label.toLowerCase() === r.meta.profile).label]), `${st.name}: the feed chart highlights ${lit(c.drillFeed.rows)}`);
      assert(JSON.stringify(lit(c.drillSpeed.rows)) === '["This drill"]', `${st.name}: the speed chart highlights ${lit(c.drillSpeed.rows)}`);
    } else {
      charts++;
      const binds = c.cascade.rows.filter((x) => x.binds);
      assert(binds.length === 1, `${st.name}: the cascade highlights ${binds.length} rows`);
      if (c.ladder !== null) {
        charts++;
        const serving = r.meta.servingBands.map((b) => b.label).sort();
        assert(serving.length >= 1, `${st.name}: no chart serves`);
        assert(JSON.stringify([...lit(c.ladder.rows)].sort()) === JSON.stringify(serving), `${st.name}: the ladder highlights ${lit(c.ladder.rows)}, the engine serves from ${serving}`);
        if (serving.length > 1) severalServe++;
      }
    }
  }
  assert(charts >= 90, `only ${charts} charts checked`);
  assert(severalServe === 2, `${severalServe} states where several charts serve at once; the baseline has 2`);
});

test('CH3', 'a refusal or a block draws no chart', () => {
  for (const name of ['refusal-ball-nose-in-hpl', 'block-depth-over-3x-diameter']) {
    assert(chartsFor(states.find((s) => s.name === name)) === null, `${name} draws a chart`);
  }
});
