// Drilling behaviour, end to end through calculateDrilling(), against the real
// JSON in data/. The ids are DR*, and each one pins a decision recorded in
// research/research-session-5-drilling.md.

import { test, assert, approx } from './helpers.js';
import { loadData } from './load-node.js';
import { machinePresets } from '../js/data/presets.js';
import { calculateDrilling, bandAtRpm, peckPlan } from '../js/core/drilling.js';
import { DRILL_TOOLS, DRILL_DIAMETERS, DRILL_OUTPUT_ROWS, drillSubfamilyFor } from '../js/ui/drill-tables.js';

const data = loadData();
const presets = machinePresets(data.machines, data.rules);
const preset = (idStart) => presets.find((p) => p.id.startsWith(idStart));

const BASE = {
  drillType: 'hinge_drill',
  material: 'laminated_pb',
  diameterMm: 35,
  rpm: 4000,
  profile: 'standard',
  holeDepthMm: 13,
  drillBank: false,
  machine: preset('SCM Morbidelli X50').machine,
};

const run = (over = {}, machineOver = {}) => calculateDrilling(
  { ...BASE, ...over, machine: { ...BASE.machine, ...machineOver } },
  data,
);

test('DR1', 'a 35 mm hinge cup in melamine serves, and the feed is the speed times the feed per rev', () => {
  const r = run();
  assert(r.status === 'ok', `expected ok, got ${r.status}`);
  assert(r.outputs.spindleRpm === 4000, `expected the entered 4000 rpm, got ${r.outputs.spindleRpm}`);
  // The identity that must never grow a second table: feed = rpm x mm/rev, with
  // no flute count in it, because the published band already counts both edges.
  approx(r.outputs.feedPerRevMm * r.outputs.spindleRpm, r.outputs.plungeFeedMmMin, { rel: 1e-9 });
  approx(r.outputs.surfaceSpeedMMin, (Math.PI * 35 * 4000) / 1000, { rel: 1e-9 });
});

test('DR2', 'Standard is the midpoint of the published band, and the melamine factor is the baseline 1.0', () => {
  const r = run();
  const b = r.meta.band;
  approx(r.meta.materialFactor, 1.0, { abs: 1e-9 });
  approx(r.meta.fnBase, (b.fnMin + b.fnMax) / 2, { rel: 1e-9 });
  // Decision 8 in one number: the vendor's own marked point sits above Standard.
  const marked = r.meta.workedExample.fn_mm_rev;
  assert(r.meta.fnBase < marked, `Standard ${r.meta.fnBase} should sit under the vendor's marked ${marked}`);
  assert(marked < b.fnMax, 'the vendor marked point must stay reachable below Aggressive');
});

test('DR3', 'the three profiles rise in order and span exactly the published band', () => {
  const g = run({ profile: 'gentle' });
  const s = run({ profile: 'standard' });
  const a = run({ profile: 'aggressive' });
  assert(g.outputs.plungeFeedMmMin < s.outputs.plungeFeedMmMin, 'gentle must sit under standard');
  assert(s.outputs.plungeFeedMmMin < a.outputs.plungeFeedMmMin, 'standard must sit under aggressive');
  approx(g.meta.fnBase, g.meta.band.fnMin, { rel: 1e-9 });
  approx(a.meta.fnBase, a.meta.band.fnMax, { rel: 1e-9 });
});

test('DR4', 'no vendor name reaches anything the page renders', () => {
  const vendors = /leitz|onsrud|cmt|amana|vortex|freud|homag|woodweb|rennie|ita\b/i;
  const materials = ['mdf', 'laminated_pb', 'particleboard', 'hardwood', 'softwood', 'plywood', 'softwood_ply', 'hpl'];
  let checked = 0;
  for (const e of data.drills.entries) {
    for (const material of materials) {
      for (const profile of data.rules.drilling.profiles_offered) {
        const r = calculateDrilling(
          { ...BASE, drillType: e.subfamily_id, diameterMm: e.diameter_min_mm, material, profile },
          data,
        );
        checked += 1;
        const rendered = [
          r.refusal?.reason, r.block?.reason, r.limit?.message,
          ...(r.notes ?? []), ...(r.warnings ?? []).map((w) => w.message),
          ...Object.values(r.outputNotes ?? {}),
        ].filter(Boolean);
        for (const text of rendered) {
          assert(!vendors.test(text), `a vendor name reached rendered text for ${e.subfamily_id}/${material}: ${text}`);
        }
        // The structural half of decision 7: the routing chart ladder reads these
        // keys, so a drilling result must not carry them at all.
        assert(!('contributors' in (r.meta ?? {})), 'a drilling result must not carry contributors');
        assert(!('servingBands' in (r.meta ?? {})), 'a drilling result must not carry servingBands');
      }
    }
  }
  assert(checked > 250, `expected a wide sweep, only checked ${checked}`);
});

test('DR5', 'provenance stays complete in the result even though it renders nowhere', () => {
  const r = run();
  assert(r.meta.provenance.sources.length === 2, 'the entry and its chart read must both be named');
  assert(r.meta.provenance.sources.every((s) => data.drills.sources[s]), 'every source must resolve in the sources map');
});

test('DR6', 'the peck output stays silent where the source publishes no rule', () => {
  for (const depth of [5, 13, 40, 120]) {
    const r = run({ holeDepthMm: depth });
    assert(r.outputs.peckStepMm === null, `a tool with no published rule must not name a peck step at ${depth} mm`);
    assert(r.outputNotes.peck === null, 'no peck prose without a published rule');
    assert(!r.warnings.some((w) => /peck|clearing/i.test(w.message)), 'no peck warning without a published rule');
  }
});

test('DR7', 'a published clearing rule does produce a plan, so the silence above is data and not a dead path', () => {
  const clearing = {
    rules: [
      { kind: 'clearing_stroke_recommended_past', ratio_of_d: 4 },
      { kind: 'feed_factor_past_ratio', ratio_of_d: 4, factor: 0.8 },
    ],
  };
  assert(peckPlan(clearing, 8, 24) === null, 'at 3 diameters deep there is nothing to say');
  const deep = peckPlan(clearing, 8, 40);
  assert(deep && deep.strokeRequired, 'past 4 diameters the stroke is called for');
  approx(deep.stepMm, 32, { abs: 1e-9 });
  approx(deep.feedFactor, 0.8, { abs: 1e-9 });
});

test('DR8', 'below the spindle floor the calculator serves with a quiet warning, never a refusal', () => {
  const generic = preset('Generic').machine;
  assert(generic.rpmMin === 12000, `the generic preset should publish a 12000 rpm floor, got ${generic.rpmMin}`);
  const r = run({ rpm: 4000 }, generic);
  assert(r.status === 'ok', `decision 6 says serve, not refuse; got ${r.status}`);
  assert(r.outputs.spindleRpm === 12000, 'the machine floor is what actually turns');
  const floor = r.warnings.find((w) => w.code === 'drill_rpm_below_machine_floor');
  assert(floor && floor.severity === 'warning', 'the floor warning must be quiet, not danger');
  assert(r.meta.availKw > 0, 'the honest derated power still reports');
});

test('DR9', 'the drill bank box lifts the spindle floor and reports no power', () => {
  const generic = preset('Generic').machine;
  const r = run({ rpm: 4000, drillBank: true }, generic);
  assert(r.status === 'ok', 'a bank cut still serves');
  assert(r.outputs.spindleRpm === 4000, 'on a bank the router spindle floor does not apply');
  assert(!r.warnings.some((w) => w.code === 'drill_rpm_below_machine_floor'), 'no floor warning on a bank');
  assert(r.meta.availKw === null, 'no maker publishes a bank drive power, so none is reported');
  assert(r.notes.some((n) => /drill bank/i.test(n)), 'the page must say why the power is missing');
});

test('DR10', 'a material the table does not cover serves the slowest published factor, with a note', () => {
  // No drilling entry publishes a plywood or laminated-veneer row, so plywood is
  // the live case for decision 9.
  const r = run({ material: 'plywood' });
  assert(r.status === 'ok', 'decision 9 serves rather than refuses');
  assert(r.meta.factorSubstituted, 'the substitution must be recorded');
  const lowest = Math.min(...data.drills.entries.find((e) => e.subfamily_id === 'hinge_drill').material_factors.map((f) => f.factor));
  approx(r.meta.materialFactor, lowest, { abs: 1e-9 });
  assert(r.notes.some((n) => /no feed correction/i.test(n)), 'the page must say the factor was substituted');
});

test('DR11', 'the first-cut reduction never applies to drilling', () => {
  const withFlag = calculateDrilling({ ...BASE, firstCut: true }, data);
  const without = calculateDrilling({ ...BASE, firstCut: false }, data);
  approx(withFlag.outputs.plungeFeedMmMin, without.outputs.plungeFeedMmMin, { rel: 1e-12 });
  assert(data.rules.drilling.first_cut_applies === false, 'decision 10 must stay recorded in the data');
});

test('DR12', 'drilling never binds a vacuum or corner cap, and carries no routing outputs', () => {
  const r = run();
  assert(!('vac' in r.limit.caps) && !('corn' in r.limit.caps), 'a plunge has no lateral force and no corner');
  assert(!('pow' in r.limit.caps), 'no source publishes a drill cutting-force model, so power caps nothing');
  for (const key of ['cuttingFeedMmMin', 'leadInFeedMmMin', 'rampFeedMmMin']) {
    assert(!(key in r.outputs), `${key} is a routing output and must not appear here`);
  }
});

test('DR13', 'a diameter outside the tool table refuses and names the range', () => {
  const r = run({ diameterMm: 6 });
  assert(r.status === 'refused', 'a 6 mm hinge drill does not exist');
  assert(!('outputs' in r), 'a refusal must not carry outputs');
  assert(/15 to 40 mm/.test(r.refusal.reason), r.refusal.reason);
});

test('DR14', 'a drill-press tool can never serve', () => {
  const served = new Set(['cnc_machining_centre', 'point_to_point', 'through_feed', 'drill_bank', 'multi_spindle', 'hinge_boring']);
  for (const e of data.drills.entries) {
    if (e.serves !== true) continue;
    assert(e.machine_classes.some((c) => served.has(c)), `${e.subfamily_id} serves but reaches no in-scope machine`);
  }
  assert(!data.drills.entries.some((e) => e.family === 'cylinder_head_drill' && e.serves), 'cylinder-head drills are drill-press tools');
});

test('DR15', 'the machine feed cap binds and says so, without naming a vendor', () => {
  const r = run({ profile: 'aggressive' }, { feedMaxMmMin: 500 });
  assert(r.limit.binding === 'vmax', `expected the machine cap to bind, got ${r.limit.binding}`);
  approx(r.outputs.plungeFeedMmMin, 500, { abs: 1e-9 });
  assert(/machine feed limit/i.test(r.limit.message), r.limit.message);
  // A cap that holds the feed under the slowest published value is the one thing
  // in drilling worth shouting about: below the band's floor a drill rubs.
  assert(r.warnings.some((w) => w.code === 'drill_feed_below_band' && w.severity === 'danger'),
    'a feed held under the published floor must be a danger, not a whisper');
});

test('DR16', 'the band holds flat outside its own reach and the speed range is never exceeded silently', () => {
  const e = data.drills.entries.find((x) => x.subfamily_id === 'through_hole_drill_excellent_hw_solid');
  const pts = e.feed_band.points;
  const top = pts[pts.length - 1];
  const beyond = bandAtRpm(e.feed_band, e.rpm_max);
  approx(beyond.fnMin, top.fn_min_mm_rev, { abs: 1e-9 });
  assert(beyond.held === true, 'past where the diagram draws, the band must report that it is holding');
  const r = run({ drillType: e.subfamily_id, diameterMm: 8, rpm: e.rpm_max });
  assert(r.warnings.some((w) => w.code === 'drill_rpm_outside_band'), 'holding the feed must be said out loud');
});

test('DR17', 'every served entry produces a number at its own published extremes', () => {
  let served = 0;
  for (const e of data.drills.entries) {
    if (e.serves !== true) continue;
    served += 1;
    for (const d of [e.diameter_min_mm, e.diameter_max_mm]) {
      for (const rpm of [e.rpm_min, e.rpm_max]) {
        const r = calculateDrilling({ ...BASE, drillType: e.subfamily_id, diameterMm: d, rpm, material: 'laminated_pb' }, data);
        assert(r.status === 'ok', `${e.subfamily_id} at ${d} mm and ${rpm} rpm gave ${r.status}`);
        assert(r.outputs.plungeFeedMmMin > 0 && Number.isFinite(r.outputs.plungeFeedMmMin),
          `${e.subfamily_id} produced ${r.outputs.plungeFeedMmMin} mm/min`);
      }
    }
  }
  assert(served === 12, `expected twelve served subfamilies, got ${served}`);
});

test('DR19', 'with no speed entered, the tool runs at the speed its own diagram marks', () => {
  const r = calculateDrilling({ ...BASE, rpm: undefined }, data);
  const marked = data.drills.entries.find((e) => e.subfamily_id === 'hinge_drill').feed_band.worked_example.rpm;
  assert(r.outputs.spindleRpm === marked, `expected the marked ${marked} rpm, got ${r.outputs.spindleRpm}`);
  assert(r.meta.rpmSource === 'marked', `expected the speed to come from the diagram, got ${r.meta.rpmSource}`);
  // A tool whose diagram marks nothing falls back to the middle of its range.
  const plain = calculateDrilling({ ...BASE, drillType: 'dowel_drill_hw_tipped', diameterMm: 8, rpm: undefined }, data);
  assert(plain.meta.rpmSource === 'published', `expected the published fallback, got ${plain.meta.rpmSource}`);
  assert(plain.outputs.spindleRpm === 6000, `expected the range midpoint 6000, got ${plain.outputs.spindleRpm}`);
});

test('DRUI1', 'every drill the picker offers serves a number at every size it offers', () => {
  const entries = data.drills.entries;
  const offered = new Set(DRILL_TOOLS.flatMap((t) => t.subfamilies));
  for (const id of offered) {
    assert(entries.some((e) => e.subfamily_id === id && e.serves), `the picker offers ${id}, which does not serve`);
  }
  // The other direction: a subfamily nobody can reach is data with no way in.
  for (const e of entries) {
    if (e.serves) assert(offered.has(e.subfamily_id), `${e.subfamily_id} serves but no drill family offers it`);
  }
  for (const family of DRILL_TOOLS) {
    for (const d of DRILL_DIAMETERS[family.id]) {
      const id = drillSubfamilyFor(family.id, d, entries);
      const r = calculateDrilling({ ...BASE, drillType: id, diameterMm: d, rpm: undefined }, data);
      assert(r.status === 'ok', `${family.label} at ${d} mm gave ${r.status}: ${r.refusal?.reason ?? ''}`);
    }
  }
});

test('DRUI2', 'every row the page draws exists in a real result, or is guarded', () => {
  const r = run();
  for (const row of DRILL_OUTPUT_ROWS) {
    if (row.when) continue;
    assert(row.key in r.outputs, `the page draws ${row.key}, which the core does not return`);
    assert(Number.isFinite(r.outputs[row.key]), `${row.key} is not a number`);
    // A row that names a note must find one, or it draws a label with nothing
    // under it.
    if (row.noteKey) assert(r.outputNotes[row.noteKey], `${row.key} names note ${row.noteKey}, which is empty`);
  }
  // The guarded row must genuinely be absent, not merely undefined-tolerant.
  const peckRow = DRILL_OUTPUT_ROWS.find((x) => x.key === 'peckStepMm');
  assert(!peckRow.when(r.outputs), 'the peck row must stay hidden while no rule is published');
});

test('DR18', 'no input stacks more than four warnings, the ceiling the page folds at', () => {
  let worst = 0;
  for (const e of data.drills.entries) {
    for (const material of ['mdf', 'laminated_pb', 'plywood', 'hpl']) {
      for (const profile of data.rules.drilling.profiles_offered) {
        for (const p of presets) {
          for (const rpm of [1000, e.rpm_min, e.rpm_max, 24000]) {
            const r = calculateDrilling(
              { ...BASE, drillType: e.subfamily_id, diameterMm: e.diameter_min_mm, material, profile, rpm, machine: p.machine },
              data,
            );
            if (r.status !== 'ok') continue;
            worst = Math.max(worst, r.warnings.length);
            assert(r.warnings.length <= 4, `${r.warnings.length} warnings for ${e.subfamily_id} on ${p.id}`);
            assert(r.notes.length <= 5, `${r.notes.length} notes render for ${e.subfamily_id}; the page carries guidance, not a log`);
          }
        }
      }
    }
  }
  assert(worst >= 1, 'the sweep must actually reach some warnings, or it is proving nothing');
});
