// @ts-check
// What the page's three charts show for one engine result, as plain data:
// every row's words, which row carries the highlight, where each bar starts
// and ends and where each marker sits, each row's accessible name, and the
// table under each chart. Written 2026-09-24, step 4 of docs/CONVERSION_PLAN.md.
//
// Plain JavaScript with no React and no page in it, like src/result-view.js,
// so tests/charts.test.js runs it in Node against the baseline the old page
// recorded. src/Charts.tsx draws what this returns and decides nothing.
//
// THE OLD PAGE IS THE SPECIFICATION: this is ladderHtml(), drillFeedChart(),
// drillSpeedChart(), the capacity cascade in render(), and labelChartRows()
// in js/ui/app.js, with the ARITHMETIC UNCHANGED. Every position is the same
// expression in the same order, turned into a string the same way the old
// template literal turned it (so the ladder's bar start is String(Number(...))
// and the cascade's fill is the raw, unrounded number), because a bar that
// starts in the wrong place tells a machinist the wrong chart serves his
// numbers and looks fine in review. The strings are what the page writes as
// the spacers' and bars' inline-size, and what tools/baseline.mjs compares
// against the old page's left and width.
//
// The old page's floating tip is dropped (the plan's rulings): each row's
// accessible name is the sentence the tip showed, built as labelChartRows()
// built it, "label. value. note", and the table under the chart carries the
// note in its third column.

import { feedPair, rpmPair } from '../js/ui/format.js';
import { profilesFor } from './form-state.js';

/**
 * One chart row on the ladder construction.
 * @typedef {{
 *   label: string, tag: string | null, value: string, serves: boolean,
 *   barLeft: string, barWidth: string, marker: string | null, name: string,
 * }} LadderRow
 * @typedef {{ caption: string, headers: string[], rows: string[][] }} Twin
 * @typedef {{ heading: string, units: string, rows: LadderRow[], legend: string, twin: Twin }} Ladder
 * @typedef {{
 *   label: string, metric: string, imperial: string, binds: boolean, farAbove: boolean,
 *   fillWidth: string, name: string,
 * }} CascadeRow
 * @typedef {{ rows: CascadeRow[], twin: Twin }} Cascade
 * @typedef {(
 *   | { drilling: false, ladder: Ladder | null, cascade: Cascade }
 *   | { drilling: true, drillFeed: Ladder, drillSpeed: Ladder }
 * )} ChartsView
 */

// app.js's CAP_LABELS, copied unchanged.
/** @type {Record<string, string>} */
const CAP_LABELS = {
  ideal: 'Chip load target',
  vmax: 'Machine feed',
  pow: 'Spindle power',
  vac: 'Hold-down',
  corn: 'Corners',
};

/** labelChartRows(): the row's accessible name, the sentence the tip showed. */
const nameOf = (/** @type {string} */ label, /** @type {string} */ value, /** @type {string} */ note) => `${label}. ${value}. ${note}`;

/**
 * The charts for one result, or null when the result has no figures (a
 * refusal or a block shows no chart).
 * @param {any} result the envelope calculate() or calculateDrilling() returned
 * @param {{ rpmMin?: number, rpmMax?: number }} machine the chosen preset's own
 *   machine (presets[machineIdx].machine), as drillSpeedChart() read it
 * @returns {ChartsView | null}
 */
export function chartsView(result, machine) {
  if (result.status === 'refused' || result.status === 'blocked') return null;
  if (result.meta.mode === 'drilling') {
    return { drilling: true, drillFeed: drillFeedChart(result), drillSpeed: drillSpeedChart(result, machine) };
  }
  return { drilling: false, ladder: ladder(result), cascade: cascade(result) };
}

/**
 * The chart ladder: every published chart for this material and tool on one
 * chip-load scale, the serving chart highlighted, with a marker at the feed
 * per tooth the page serves. ladderHtml() in app.js; null where it drew
 * nothing (no chart holds a band).
 * @param {any} result
 * @returns {Ladder | null}
 */
function ladder(result) {
  const m = result.meta;
  /** @type {any[]} */
  const serving = (m.servingBands ?? []).map((/** @type {any} */ b) => ({ ...b, serves: true }));
  /** @type {any[]} */
  const context = (m.contextBands ?? []).map((/** @type {any} */ b) => ({ ...b, serves: false }));
  const all = [...serving, ...context].sort((a, b) => a.lo - b.lo || a.hi - b.hi);
  if (!all.length) return null;
  // The marker draws the chip on the chart's own basis. For the roughing
  // charts that is the EFFECTIVE chip: chip thinning raises the programmed
  // feed above the band on a light cut and the first-cut reduction lowers it
  // below, and marking the programmed value made the serving chart claim a
  // fit it did not have whenever either applied (found 2026-08-29). In
  // Finishing nothing is compensated, so fzEff is the programmed chip, which
  // is the basis the finisher chart publishes.
  /** @type {number} */
  const fz = m.fzEff;
  // One name for one quantity: rows, header and legend.
  const chip = m.finishing ? 'programmed chip' : 'effective chip';
  const lo = Math.min(...all.map((b) => b.lo), fz);
  const hi = Math.max(...all.map((b) => b.hi), fz);
  const span = hi - lo || 1;
  const pos = (/** @type {number} */ v) => (((v - lo) / span) * 100).toFixed(1);
  // Whether the chip falls inside this chart's published band, and which way
  // out it sits when it does not.
  const verdictFor = (/** @type {any} */ b) => {
    // A tolerance, because a value that IS the band edge can land an ulp
    // off it on the way through the feed maths.
    if (b.serves) {
      if (fz < b.lo - 1e-6) return `Sets your numbers. The ${chip} ${fz.toFixed(3)} sits below this band. A depth derate, the first-cut reduction or a machine cap holds the feed down.`;
      if (fz > b.hi + 1e-6) return `Sets your numbers. The ${chip} ${fz.toFixed(3)} sits above this band.`;
      return `Sets your numbers. The ${chip} ${fz.toFixed(3)} sits in this band.`;
    }
    if (fz < b.lo) return `The ${chip} is below this band, by ${(b.lo - fz).toFixed(3)} mm/tooth.`;
    if (fz > b.hi) return `The ${chip} is above this band, by ${(fz - b.hi).toFixed(3)} mm/tooth.`;
    return `The ${chip} falls inside this band, but this chart does not serve it.`;
  };

  const rows = all.map((b) => {
    const left = Number(pos(b.lo));
    const width = Math.max(Number(pos(b.hi)) - left, 0.8);
    const range = `${b.lo.toFixed(3)}–${b.hi.toFixed(3)}`;
    const label = `${b.label}${b.machineClass ? ' (10 hp+ charts)' : ''}`;
    return {
      label: String(b.label),
      tag: b.machineClass ? '10 hp+ charts' : null,
      value: range,
      serves: b.serves,
      barLeft: `${left}`,
      barWidth: width.toFixed(1),
      marker: pos(fz),
      name: nameOf(label, `${range} mm/tooth`, verdictFor(b)),
    };
  });

  return {
    heading: 'Every published chart for this cut',
    units: 'mm/tooth',
    rows,
    legend: `The highlighted chart sets your numbers. The dotted line marks ${m.finishing ? 'the programmed chip per tooth' : 'the effective chip this cut delivers'}, ${fz.toFixed(3)} mm/tooth. The other charts are context, and their numbers do not serve.`,
    twin: {
      caption: 'Every published chart for this cut',
      headers: ['Chart', 'Published band (mm/tooth)', `Against the ${chip}`],
      rows: all.map((b) => [
        b.label + (b.machineClass ? ' (10 hp+ charts)' : ''),
        `${b.lo.toFixed(3)}–${b.hi.toFixed(3)}`,
        verdictFor(b),
      ]),
    },
  };
}

/**
 * Drilling chart one: the published feed range at the served speed, with the
 * three profiles on it. drillFeedChart() in app.js.
 * @param {any} result
 * @returns {Ladder}
 */
function drillFeedChart(result) {
  const m = result.meta;
  const b = m.bandServed;
  /** @type {number} */
  const served = m.fnDeliv;
  // The chart's own marked point belongs to the speed it was printed at, so
  // it appears only at the speed it was printed for.
  /** @type {number | null} */
  const marked = (m.workedExample && m.workedExample.rpm === result.outputs.spindleRpm)
    ? m.workedExample.fn_mm_rev * m.materialFactor
    : null;
  const lo = Math.min(b.fnMin, served, marked ?? Infinity);
  const hi = Math.max(b.fnMax, served, marked ?? -Infinity);
  const span = hi - lo || 1;
  const pos = (/** @type {number} */ v) => (((v - lo) / span) * 100).toFixed(1);

  /** @type {Record<string, number>} */
  const positions = { gentle: b.fnMin, standard: b.fnMin + m.standardPosition * (b.fnMax - b.fnMin), aggressive: b.fnMax };
  const rows = profilesFor('drill').map((p) => {
    const fn = positions[p.id];
    const on = p.id === m.profile;
    const feed = feedPair(fn * result.outputs.spindleRpm);
    const verdict = on
      ? `The setting you picked. It plunges at ${feed.metric}.`
      : `${p.label} would plunge at ${feed.metric}.`;
    const left = Number(pos(b.fnMin));
    const width = Math.max(Number(pos(fn)) - left, 0.8);
    const value = `${fn.toFixed(2)} mm/rev`;
    return {
      row: {
        label: p.label,
        tag: null,
        value: fn.toFixed(2),
        serves: on,
        barLeft: `${left}`,
        barWidth: width.toFixed(1),
        marker: marked != null ? pos(marked) : null,
        name: nameOf(p.label, value, verdict),
      },
      cells: [p.label, value, verdict],
    };
  });

  const legend = marked != null
    ? `The highlighted bar is the setting you picked. The dotted line marks the operating point the published chart itself prints, ${marked.toFixed(2)} mm/rev. The bars run from the slowest published feed, which is the point below which the drill rubs instead of cutting.`
    : 'The highlighted bar is the setting you picked. The bars run from the slowest published feed, which is the point below which the drill rubs instead of cutting.';

  return {
    heading: 'The published feed range at this speed',
    units: 'mm/rev',
    rows: rows.map((r) => r.row),
    legend,
    twin: {
      caption: 'The published feed range at this speed',
      headers: ['Setting', 'Feed per rev', 'What it means'],
      rows: rows.map((r) => r.cells),
    },
  };
}

/**
 * Drilling chart two: the drill's published speed range against the
 * machine's own, with the served speed marked on both. drillSpeedChart() in
 * app.js, which read the chosen preset's own machine, not the advanced boxes.
 * @param {any} result
 * @param {{ rpmMin?: number, rpmMax?: number }} preset
 * @returns {Ladder}
 */
function drillSpeedChart(result, preset) {
  const m = result.meta;
  const bank = m.drillBank;
  const machineLo = bank ? null : preset.rpmMin;
  const machineHi = bank ? null : preset.rpmMax;

  /** @type {{ label: string, lo: number, hi: number, on: boolean }[]} */
  const bars = [{ label: 'This drill', lo: m.rpmRangeMin, hi: m.rpmRangeMax, on: true }];
  if (machineLo != null || machineHi != null) {
    bars.push({ label: 'This machine', lo: machineLo ?? m.rpmRangeMin, hi: machineHi ?? m.rpmRangeMax, on: false });
  }
  /** @type {number} */
  const served = result.outputs.spindleRpm;
  const lo = Math.min(...bars.map((x) => x.lo), served);
  const hi = Math.max(...bars.map((x) => x.hi), served);
  const span = hi - lo || 1;
  const pos = (/** @type {number} */ v) => (((v - lo) / span) * 100).toFixed(1);

  const rows = bars.map((x) => {
    const range = `${rpmPair(x.lo).metric} to ${rpmPair(x.hi).metric}`;
    const inside = served >= x.lo && served <= x.hi;
    const verdict = x.on
      ? (inside ? 'The served speed sits inside what this drill is published for.' : 'The served speed sits outside what this drill is published for, so the feed holds at the nearest published value.')
      : (inside ? 'The served speed is inside what this machine is rated for.' : 'The served speed is outside what this machine is rated for.');
    const left = Number(pos(x.lo));
    const width = Math.max(Number(pos(x.hi)) - left, 0.8);
    return {
      row: {
        label: x.label,
        tag: null,
        value: `${x.lo}–${x.hi}`,
        serves: x.on,
        barLeft: `${left}`,
        barWidth: width.toFixed(1),
        marker: pos(served),
        name: nameOf(x.label, range, verdict),
      },
      cells: [x.label, range, verdict],
    };
  });

  return {
    heading: 'Speed range for this drill',
    units: 'rpm',
    rows: rows.map((r) => r.row),
    legend: `The dotted line marks the ${rpmPair(served).metric} being served. ${bank ? 'On a drill bank the router spindle range does not apply, so it is not drawn.' : ''}`,
    twin: {
      caption: 'Speed range for this drill',
      headers: ['Range', 'From and to', 'Where the served speed sits'],
      rows: rows.map((r) => r.cells),
    },
  };
}

/**
 * The capacity cascade: every cap that could hold the feed down, the binding
 * one highlighted. The cascade half of render() in app.js.
 * @param {any} result
 * @returns {Cascade}
 */
function cascade(result) {
  /** @type {Record<string, number | undefined>} */
  const caps = result.limit.caps;
  const shown = /** @type {[string, number][]} */ (Object.entries(caps).filter(([, v]) => v !== undefined));
  const maxCap = Math.max(...shown.map(([, v]) => v));
  /** @type {number} */
  const finalV = result.outputs.cuttingFeedMmMin;

  const rows = shown.map(([k, v]) => {
    const na = k !== 'ideal' && k !== result.limit.binding && v > finalV * 2;
    const binds = k === result.limit.binding;
    const w = Math.max(2, Math.min(100, (v / maxCap) * 100));
    const pair = feedPair(v);
    const verdict = binds ? 'This is the cap that sets the feed.'
      : na ? 'Far above the served feed, so it cannot bind.'
        : `Above the served ${feedPair(finalV).metric}, so it does not bind.`;
    return {
      label: CAP_LABELS[k],
      metric: pair.metric,
      imperial: pair.imperial,
      binds,
      farAbove: na,
      fillWidth: `${w}`,
      name: nameOf(CAP_LABELS[k], pair.metric, verdict),
      verdict,
    };
  });

  return {
    rows: rows.map(({ verdict: _verdict, ...row }) => row),
    twin: {
      caption: 'What could cap the feed',
      headers: ['Limit', 'Feedrate', 'Does it bind?'],
      rows: rows.map((r) => [r.label, `${r.metric} (${r.imperial})`, r.verdict]),
    },
  };
}
