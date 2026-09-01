// Drilling calculation. Pure, like the rest of js/core: it takes data as an
// argument and touches no page and no network.
//
// Naming: the published speed limits are always a "speed range", never the other
// word for it. The purity scan in tests/run.js rejects that word anywhere in this
// directory, comments included, and it is the natural name for the central idea
// here, so the term is fixed once at the top rather than rediscovered per edit.
// The same scan bans the verb for retrieving a file over the network, which is
// why the first line above is worded the way it is.
//
// Drilling data has a different shape from routing data. Routing publishes a chip
// load per tooth against material, geometry and diameter, merged across vendors.
// Drilling publishes, per tool subfamily: a spindle speed range, a feed band in
// mm per revolution that varies with speed and not with diameter, a table of
// material correction factors against one baseline material, and chip-clearing
// rules. So the chart-merging machinery in chipload.js does not apply here, and
// the feed identity is feed = rpm * mm-per-rev, with no flute count in it: the
// published band already counts both cutting edges.

// Linear interpolation of the published feed band at one spindle speed. Outside
// the band's own range the nearest edge holds flat (rules.drilling.out_of_range_feed),
// which is the conservative continuation because the upper edge falls as speed rises.
export function bandAtRpm(feedBand, rpm) {
  const pts = feedBand.points;
  if (!pts || pts.length === 0) return null;
  if (rpm <= pts[0].rpm) return { fnMin: pts[0].fn_min_mm_rev, fnMax: pts[0].fn_max_mm_rev, held: rpm < pts[0].rpm };
  const last = pts[pts.length - 1];
  if (rpm >= last.rpm) return { fnMin: last.fn_min_mm_rev, fnMax: last.fn_max_mm_rev, held: rpm > last.rpm };
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (rpm <= b.rpm) {
      const t = (rpm - a.rpm) / (b.rpm - a.rpm);
      return {
        fnMin: a.fn_min_mm_rev + t * (b.fn_min_mm_rev - a.fn_min_mm_rev),
        fnMax: a.fn_max_mm_rev + t * (b.fn_max_mm_rev - a.fn_max_mm_rev),
        held: false,
      };
    }
  }
  return null;
}

// Where each profile sits on the published band. Gentle at the low edge, Standard
// at the position rules.drilling.standard_band_position names, Aggressive at the
// high edge. Standard is the midpoint by Scott's call of 2026-09-02, so the three
// words mean the same thing here as they do in routing. Drilling never offers
// Finishing: a hole has no finish pass, and no source publishes a finishing feed.
export function profileFn(band, profile, standardPosition) {
  if (profile === 'gentle') return band.fnMin;
  if (profile === 'aggressive') return band.fnMax;
  return band.fnMin + standardPosition * (band.fnMax - band.fnMin);
}

// Which correction factor a material pick reads. The map names ordered candidates
// and the first one the tool's own table publishes wins. When the table publishes
// none of them the most conservative published factor serves (decision 9), because
// refusing a pick the tool's own material list covers would be a refusal the source
// never makes. The caller renders that substitution as a note.
export function materialFactorFor(entry, material, map) {
  const rows = entry.material_factors;
  for (const candidate of map[material] ?? []) {
    const row = rows.find((r) => r.material === candidate);
    if (row) return { factor: row.factor, factorMaterial: row.material, substituted: false };
  }
  const lowest = rows.reduce((a, b) => (b.factor < a.factor ? b : a));
  return { factor: lowest.factor, factorMaterial: lowest.material, substituted: true };
}

// The peck plan, or null. Decision 5: the output stays silent where the source
// publishes no rule, and the calculator never invents one. Nothing in the served
// set publishes a rule today, so this returns null for every v1 tool; it exists
// because the boring pins and the twist drills do publish rules, and they are the
// next entries in.
export function peckPlan(chipClearing, dMm, holeDepthMm) {
  if (!chipClearing || !(dMm > 0) || !(holeDepthMm > 0)) return null;
  const ratio = holeDepthMm / dMm;
  const plan = { ratio, stepMm: null, strokeRequired: false, clearBeyondRatio: null, feedFactor: 1, statements: [] };
  for (const rule of chipClearing.rules) {
    switch (rule.kind) {
      case 'max_infeed_ratio_of_d':
        plan.stepMm = Math.min(plan.stepMm ?? Infinity, rule.ratio_of_d * dMm);
        plan.statements.push(`Take at most ${rule.ratio_of_d} times the drill diameter in one infeed.`);
        break;
      case 'clearing_stroke_required':
        plan.strokeRequired = true;
        plan.statements.push('Retract to clear the flutes before the hole is finished.');
        break;
      case 'clearing_stroke_recommended_past':
        plan.clearBeyondRatio = rule.ratio_of_d;
        if (ratio > rule.ratio_of_d) {
          plan.strokeRequired = true;
          plan.stepMm = Math.min(plan.stepMm ?? Infinity, rule.ratio_of_d * dMm);
          plan.statements.push(`Past ${rule.ratio_of_d} times the diameter the chips pack, so retract to clear them.`);
        }
        break;
      case 'no_clearing_stroke_to_ratio':
        if (ratio <= rule.ratio_of_d) {
          plan.statements.push(`This drill needs no clearing stroke to ${rule.ratio_of_d} times its diameter. This hole is ${ratio.toFixed(1)} times.`);
        }
        break;
      case 'no_clearing_stroke_to_depth_mm':
        if (holeDepthMm <= rule.depth_mm) {
          plan.statements.push(`This drill needs no clearing stroke to ${rule.depth_mm} mm deep.`);
        }
        break;
      case 'feed_factor_past_ratio':
        if (ratio > rule.ratio_of_d) plan.feedFactor = rule.factor;
        break;
      default:
        break;
    }
  }
  if (plan.stepMm === Infinity) plan.stepMm = null;
  return plan.statements.length || plan.feedFactor !== 1 ? plan : null;
}

// The limit line. Deliberately not limits.js limitMessage(): its no-limit branch
// names the serving chart, which decision 7 forbids here. Keeping the two apart
// also stops an edit to the routing wording silently changing the drilling wording.
export function drillLimitMessage(binding) {
  if (binding === 'vmax') {
    return 'The machine feed limit sets this plunge. The drill and the hole would take more, but the axis will not.';
  }
  return 'No limit applies. The drill can take its published feed at this speed.';
}

const REFUSE = (reason) => ({ status: 'refused', refusal: { reason } });

export function calculateDrilling(input, data) {
  const { drills, rules } = data;
  const cfg = rules.drilling;

  const entry = drills.entries.find((e) => e.subfamily_id === input.drillType);
  if (!entry) return REFUSE('Choose a drill type.');
  if (entry.serves !== true) {
    return REFUSE(`${entry.label} is a drill-press tool. This calculator serves machining centres and drill banks.`);
  }

  const D = input.diameterMm;
  const bad = [];
  if (!(D > 0)) bad.push('a drill diameter');
  if (bad.length) return REFUSE(`Enter ${bad.join(', ')}. Each value must be greater than zero.`);
  if (D < entry.diameter_min_mm || D > entry.diameter_max_mm) {
    return REFUSE(`${entry.label} is published from ${entry.diameter_min_mm} to ${entry.diameter_max_mm} mm. Pick a diameter in that range, or a different drill.`);
  }

  const notes = [];
  const chartNotes = [];
  const warnings = [];

  const machine = input.machine ?? {};
  const onBank = input.drillBank === true;

  // Speed. The published range is the served value (decision 2). The user may
  // override it, and a drill bank runs at whatever speed its gearing gives, so an
  // override is the only way a bank user gets a true number.
  const bandLo = entry.feed_band.points[0].rpm;
  const bandHi = entry.feed_band.points[entry.feed_band.points.length - 1].rpm;
  // With no speed entered, run at the speed the diagram itself marks. Six of the
  // twelve tools print a worked operating point, and that is a published choice
  // rather than an arithmetic one. Where none is printed, the middle of the
  // published range serves.
  const marked = entry.feed_band.worked_example?.rpm ?? null;
  let rpm = input.rpm ?? marked ?? Math.round((entry.rpm_min + entry.rpm_max) / 2);
  let rpmSource = input.rpm != null ? 'entered' : (marked ? 'marked' : 'published');

  if (machine.rpmMax != null && rpm > machine.rpmMax) {
    rpm = machine.rpmMax;
    rpmSource = 'machine';
    warnings.push({ code: 'drill_rpm_clamped_max', severity: 'warning', message: `This machine tops out at ${machine.rpmMax} rpm, so that is the speed served.` });
  }
  // Decision 6: below the spindle's rated floor the calculator serves and warns
  // quietly, never refuses. On a drill bank the floor does not apply at all,
  // because the bank is not the spindle being rated.
  if (!onBank && machine.rpmMin != null && rpm < machine.rpmMin) {
    rpm = machine.rpmMin;
    rpmSource = 'machine';
    warnings.push({
      code: 'drill_rpm_below_machine_floor',
      severity: 'warning',
      message: `This machine is rated from ${machine.rpmMin} rpm, above the ${entry.rpm_min} to ${entry.rpm_max} rpm this drill is published for. The numbers below run at ${machine.rpmMin} rpm. On a drill bank, tick the drill bank box.`,
    });
  }
  if (rpm < entry.rpm_min || rpm > entry.rpm_max) {
    warnings.push({
      code: 'drill_rpm_outside_published',
      severity: 'warning',
      message: `${rpm} rpm is outside the ${entry.rpm_min} to ${entry.rpm_max} rpm this drill is published for. The feed holds at the nearest published speed.`,
    });
  } else if (rpm < bandLo || rpm > bandHi) {
    warnings.push({
      code: 'drill_rpm_outside_band',
      severity: 'warning',
      message: `The published feed only reaches ${bandLo} to ${bandHi} rpm, so the feed per revolution holds at the nearest edge of it.`,
    });
  }

  const band = bandAtRpm(entry.feed_band, rpm);
  if (!band) return REFUSE('The published feed for this drill could not be read at this speed.');

  const { factor, factorMaterial, substituted } = materialFactorFor(entry, input.material, drills.material_factor_map.map);
  if (substituted) {
    notes.push(`This drill publishes no feed correction for the material you picked, so the slowest one it does publish serves. Treat the feed as a starting point and prove it with a test hole.`);
  }
  chartNotes.push(`Factor row ${factorMaterial} at ${factor}, against the ${entry.feed_band.baseline_material} baseline.`);

  const fnBase = profileFn(band, input.profile ?? 'standard', cfg.standard_band_position);
  const fnMaterial = fnBase * factor;

  const peck = peckPlan(entry.chip_clearing, D, input.holeDepthMm);
  const fnProg = fnMaterial * (peck?.feedFactor ?? 1);

  // feed = speed x feed-per-revolution. No flute count: the published band already
  // counts every cutting edge, so multiplying by the tooth count would double it.
  const idealMmMin = fnProg * rpm;
  const caps = {};
  if (machine.feedMaxMmMin > 0) caps.vmax = machine.feedMaxMmMin;
  const finalMmMin = Math.min(idealMmMin, ...Object.values(caps));
  const binding = caps.vmax !== undefined && caps.vmax < idealMmMin ? 'vmax' : 'ideal';
  if (!(finalMmMin > 0)) {
    return { status: 'blocked', block: { reason: 'The machine feed limit leaves no usable plunge feed for this drill.', binding, caps: { ideal: idealMmMin, ...caps } } };
  }

  const fnDeliv = finalMmMin / rpm;
  if (fnDeliv < band.fnMin * factor - 1e-9) {
    warnings.push({
      code: 'drill_feed_below_band',
      severity: 'danger',
      message: 'A machine limit holds this plunge below the slowest published feed. Below that the drill rubs instead of cutting, which burns the hole and the edge.',
    });
  }

  // The spindle's honest power at the served speed. It caps nothing: no source in
  // this research publishes a cutting-force model for a drill, and borrowing the
  // milling one would invent a number. On a bank it is not reported at all,
  // because the bank has its own drive and nobody publishes its power.
  let availKw = null;
  if (!onBank && machine.spindleKw > 0) {
    const breakpoint = machine.breakpointRpm > 0 ? machine.breakpointRpm : rules.defaults.breakpoint_rpm;
    availKw = machine.spindleKw * Math.min(1, rpm / breakpoint);
  }
  if (onBank) {
    notes.push('On a drill bank the calculator reports no spindle power. The bank has its own drive and no maker publishes its rating.');
  }

  const outputs = {
    spindleRpm: rpm,
    plungeFeedMmMin: finalMmMin,
    feedPerRevMm: fnDeliv,
    surfaceSpeedMMin: (Math.PI * D * rpm) / 1000,
    feedPerToothMm: fnDeliv / entry.teeth,
    peckStepMm: peck?.stepMm ?? null,
  };

  return {
    status: 'ok',
    outputs,
    outputNotes: {
      speedRange: `This drill is published from ${entry.rpm_min} to ${entry.rpm_max} rpm.`,
      peck: peck && peck.statements.length ? peck.statements.join(' ') : null,
    },
    limit: { binding, message: drillLimitMessage(binding), caps: { ideal: idealMmMin, ...caps } },
    warnings,
    notes,
    meta: {
      mode: 'drilling',
      drillType: entry.subfamily_id,
      label: entry.label,
      section: entry.section,
      teeth: entry.teeth,
      rpmSource,
      rpmRangeMin: entry.rpm_min,
      rpmRangeMax: entry.rpm_max,
      bandRangeMin: bandLo,
      bandRangeMax: bandHi,
      band: { fnMin: band.fnMin, fnMax: band.fnMax },
      bandServed: { fnMin: band.fnMin * factor, fnMax: band.fnMax * factor },
      workedExample: entry.feed_band.worked_example,
      materialFactor: factor,
      factorMaterial,
      factorSubstituted: substituted,
      baselineMaterial: entry.feed_band.baseline_material,
      standardPosition: cfg.standard_band_position,
      fnBase,
      fnMaterial,
      fnProg,
      fnDeliv,
      dMm: D,
      holeDepthMm: input.holeDepthMm ?? null,
      peck,
      drillBank: onBank,
      availKw,
      material: input.material,
      // Provenance stays complete here and renders nowhere (decision 7). The name
      // is deliberately not "contributors": the routing chart ladder reads that
      // key, so a drilling result structurally cannot be fed to it.
      provenance: { sources: [entry.source, entry.feed_band.source], section: entry.section },
      chartNotes,
    },
  };
}
