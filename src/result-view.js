// @ts-check
// What the results area and "What is going on in this cut" show for one
// engine result, as plain data: every banner with its variant, title and
// body, every output row's label and its metric and imperial strings, the
// notes, and the diagnostic badges. Written 2026-09-24, step 3 of
// docs/CONVERSION_PLAN.md.
//
// Plain JavaScript with no React and no page in it, like src/form-state.js,
// so tests/results.test.js runs it in Node against the baseline the old page
// recorded. src/Results.tsx draws what this returns and decides nothing.
//
// THE OLD PAGE IS THE SPECIFICATION: this is render() in js/ui/app.js, the
// parts of it that are not the charts (those are step 4), with every string
// built by the same js/ui/format.js call in the same order. Where render()
// wrote markup this returns the pieces the markup carried.

import { feedPair, rpmPair, surfacePair, fzPair, scallopPair, diaPair } from '../js/ui/format.js';
import { DRILL_OUTPUT_ROWS } from '../js/ui/drill-tables.js';
import { buildChips } from '../js/core/diagnostics.js';

// app.js's OUTPUT_ROWS, copied unchanged. app.js cannot be imported (it builds
// the old page the moment it loads), and it goes when the conversion is done.
/**
 * @typedef {{ metric: string, imperial: string }} Pair
 * @typedef {{
 *   key: string, label: string, fmt: (v: number) => Pair,
 *   secondary?: boolean, noteKey?: string, when?: (o: any) => boolean,
 * }} OutputRow
 */
/** @type {OutputRow[]} */
export const OUTPUT_ROWS = [
  { key: 'spindleRpm', label: 'Spindle speed', fmt: rpmPair },
  { key: 'surfaceSpeedMMin', label: 'Surface speed', fmt: surfacePair, secondary: true },
  { key: 'cuttingFeedMmMin', label: 'Cutting feedrate', fmt: feedPair },
  { key: 'feedPerToothMm', label: 'Feed per tooth', fmt: fzPair, secondary: true },
  { key: 'leadInFeedMmMin', label: 'Lead-in feedrate', fmt: feedPair, noteKey: 'leadInOut' },
  { key: 'leadOutFeedMmMin', label: 'Lead-out feedrate', fmt: feedPair },
  { key: 'rampFeedMmMin', label: 'Ramp feedrate', fmt: feedPair, noteKey: 'plungeRamp' },
  { key: 'plungeFeedMmMin', label: 'Plunge feedrate', fmt: feedPair },
  // Ball nose geometry. The core returns these three for a ball tool only, so
  // the `when` guard drops the whole row for every other tool, the same way
  // the drilling peck row works. They are geometry, not vendor data: no maker
  // publishes a stepover, a scallop rule or an effective-diameter correction
  // for a ball nose in wood (research-session-6-ball-surfacing.md).
  { key: 'scallopHeightMm', label: 'Scallop height', fmt: scallopPair, when: (o) => o.scallopHeightMm != null, noteKey: 'scallop' },
  { key: 'effectiveDiameterMm', label: 'Cutting diameter at this depth', fmt: diaPair, secondary: true, when: (o) => o.effectiveDiameterMm != null, noteKey: 'effectiveDiameter' },
  { key: 'effectiveSurfaceSpeedMMin', label: 'Surface speed at that diameter', fmt: surfacePair, secondary: true, when: (o) => o.effectiveSurfaceSpeedMMin != null },
];

// One glyph per severity, for the whole app, kept in one place so a meaning
// cannot pick up a second drawing at a second call site (app.js's
// STATUS_GLYPH, as the design system's icon names). The Alert part draws the
// same four from its variant; the badges take them from here.
/** @typedef {'success' | 'warning' | 'danger' | 'info'} Severity */
/** @type {Record<Severity, 'success' | 'warning' | 'alert' | 'info'>} */
export const STATUS_ICON = {
  success: 'success',
  warning: 'warning',
  danger: 'alert',
  info: 'info',
};

// buildChips() speaks in levels. The design system speaks in severities.
/** @type {Record<string, Severity>} */
const CHIP_VARIANT = { cool: 'success', warm: 'warning', hot: 'danger', info: 'info' };

/**
 * A banner: app.js's alertHtml(variant, title, body). A body given as a list
 * renders as one item per line; a string renders as one paragraph.
 * @typedef {{ variant: Severity, title: string | null, paragraph: string | null, list: string[] | null }} Banner
 * @typedef {{ label: string, metric: string, imperial: string | null, secondary: boolean, note: string | null }} Row
 * @typedef {{ variant: Severity, icon: 'success' | 'warning' | 'alert' | 'info', text: string }} Chip
 * @typedef {(
 *   | { kind: 'message', banner: Banner }
 *   | { kind: 'figures', drilling: boolean, limit: Banner, rows: Row[], warnings: Banner[], notes: string[], chips: Chip[] | null }
 * )} ResultsView
 */

/**
 * app.js's render(), without the charts.
 * @param {any} result the envelope calculate() or calculateDrilling() returned
 * @returns {ResultsView}
 */
export function resultsView(result) {
  if (result.status === 'refused') {
    return { kind: 'message', banner: { variant: 'danger', title: 'No number for this one.', paragraph: result.refusal.reason, list: null } };
  }
  if (result.status === 'blocked') {
    return { kind: 'message', banner: { variant: 'warning', title: 'Blocked, not just warned.', paragraph: result.block.reason, list: null } };
  }

  const drilling = result.meta.mode === 'drilling';

  // A description list, so the pairing of a label to its number is in the
  // markup rather than implied by two columns lining up. The imperial line is
  // left out when the pair has none (a speed is rpm in both systems).
  /** @type {OutputRow[]} */
  const table = drilling ? DRILL_OUTPUT_ROWS : OUTPUT_ROWS;
  const rows = table
    .filter((row) => !row.when || row.when(result.outputs))
    .map((row) => {
      const pair = row.fmt(result.outputs[row.key]);
      const noteText = row.noteKey ? result.outputNotes[row.noteKey] : null;
      return {
        label: row.label,
        metric: pair.metric,
        imperial: pair.imperial ? pair.imperial : null,
        secondary: !!row.secondary,
        note: noteText ? noteText : null,
      };
    });

  // The limit line reports on the feed cap alone. In drilling a cut can have no
  // binding cap while the machine cannot reach the drill's speed at all, and a
  // green tick above that warning claims a soundness the cut does not have. So
  // the success tone is reserved for a cut with nothing else to say about it.
  /** @type {Severity} */
  const limitVariant = result.limit.binding === 'ideal'
    ? (drilling && result.warnings.length ? 'info' : 'success')
    : (result.limit.binding === 'pow' || result.limit.binding === 'vac') ? 'danger' : 'info';

  // A warning asks for judgement, so it is a banner. A note is provenance
  // context, and there can be nine of them at once when most published charts
  // hold no value at the chosen diameter. Nine banners is a stream, and a
  // stream belongs in the page rather than in a stack of banners that drowns
  // the numbers above it.
  //
  // The banner pile itself is bounded: the limit line plus at most three
  // banners. Up to three warnings render one each. Four or more fold into
  // one banner carrying a list, at the worst severity among them, because
  // past about three the correct visual has become a stream. Test SC30
  // sweeps the input space to hold the ceiling at four.
  // Routing warnings carry no severity of their own, so their two loud codes are
  // named here. Drilling's core sets a severity on every warning, because it is
  // the half that knows whether a condition is quiet.
  const isDanger = (/** @type {any} */ w) => w.severity === 'danger'
    || w.code === 'chip_plough' || w.code === 'chip_below_min';
  /** @type {Banner[]} */
  const warnings = result.warnings.length > 3
    ? [{
      variant: result.warnings.some(isDanger) ? 'danger' : 'warning',
      title: `${result.warnings.length} things to check on this cut`,
      paragraph: null,
      list: result.warnings.map((/** @type {any} */ w) => w.message),
    }]
    : result.warnings.map((/** @type {any} */ w) => ({ variant: isDanger(w) ? 'danger' : 'warning', title: null, paragraph: w.message, list: null }));

  // The badges belong to routing: drilling's "What is going on" area is its
  // speed chart alone.
  const chips = drilling ? null : buildChips(result).map((/** @type {any} */ c) => {
    const variant = CHIP_VARIANT[c.level];
    return { variant, icon: STATUS_ICON[variant], text: String(c.text) };
  });

  return {
    kind: 'figures',
    drilling,
    limit: { variant: limitVariant, title: result.limit.message, paragraph: null, list: null },
    rows,
    warnings,
    notes: [...result.notes],
    chips,
  };
}

/**
 * The figures a machinist reads off the card, as one string, so the page can
 * tell a recalculation that changed them from one that did not. Null when no
 * figures are shown (a refusal, a block, or a box holding the results back).
 * @param {ResultsView | null} view
 * @returns {string | null}
 */
export function figuresOf(view) {
  if (!view || view.kind !== 'figures') return null;
  return view.rows.map((r) => `${r.label}\t${r.metric}\t${r.imperial ?? ''}`).join('\n');
}
