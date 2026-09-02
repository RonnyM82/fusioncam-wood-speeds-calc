// The single entry point the UI and the tests share. Pure: takes parsed data
// objects, performs no I/O, touches no DOM. Result statuses: 'ok', 'refused'
// (OSB, or no data), 'blocked' (compression minimum pass depth).

import {
  feedFromFz, surfaceSpeedMMin, depthDerate, chipThinningFactor,
  resolveBand, profileFz, chipFloorStatus, isPanelMaterial,
} from './chipload.js';
import {
  selectKcModel, toolFamilyFor, powerFeedCapMmMin, availablePowerKw,
  meanChipThicknessMm, kcOfH, cuttingPowerKw, torqueNm,
} from './power.js';
import {
  applyLimits, limitMessage, vacuumGripN, vacuumFeedCapMmMin,
  cornerFeedCapMmMin, compressionMinDepthMm,
} from './limits.js';
import { checkDensity, radiataNote } from './timber.js';

export function calculate(input, data) {
  const { chiploads, kc, rules } = data;
  const warnings = [];
  const notes = [];
  // How the calculator chose its data. Kept for tests and headless callers,
  // never rendered: the public page says what to do and what to watch, and
  // chart attribution lives in the limit line and the chart ladder alone
  // (Scott, 2026-08-31).
  const chartNotes = [];

  if (input.material === 'osb') {
    return {
      status: 'refused',
      refusal: { reason: `This calculator gives no number for OSB. ${kc.osb.reason}. Start low and prove the settings with a test cut.`, source: 'iwms25' },
    };
  }

  const D = input.diameterMm;
  let rpm = input.rpm ?? rules.defaults.rpm;
  const zEff = input.flutesTotal ?? rules.defaults.flutes_total;
  const ap = input.apMm ?? input.thicknessMm;
  // The Finishing profile models a wall skim: with no width of cut given it
  // assumes the rules.json skim instead of a full slot (research session 4).
  const finishing = input.profile === 'finishing';
  const skimMm = finishing && rules.finishing ? Math.min(rules.finishing.skim_ae_mm, D) : null;
  const ae = input.aeMm ?? skimMm ?? D;
  const direction = input.direction ?? 'climb';
  const machine = input.machine ?? {};

  const bad = [];
  if (!(D > 0)) bad.push('a tool diameter');
  if (!(ap > 0)) bad.push('a board thickness (or depth per pass)');
  if (!(ae > 0)) bad.push('a width of cut');
  if (!(rpm > 0)) bad.push('a spindle speed');
  if (!(zEff > 0)) bad.push('a flute count');
  if (bad.length) {
    return { status: 'refused', refusal: { reason: `Enter ${bad.join(', ')}. Each value must be greater than zero.` } };
  }

  if (machine.rpmMax > 0 && rpm > machine.rpmMax) {
    warnings.push({ code: 'rpm_clamped', message: `This machine has a maximum spindle speed of ${machine.rpmMax.toLocaleString('en-NZ')} rpm. The calculator reduced the spindle speed to that value.` });
    rpm = machine.rpmMax;
  }
  if (input.fluteBasis === 'upcut_only') {
    notes.push('The flute count reads as up-cut flutes only. The vendor charts give per-tooth values for the total flute count, so an up-cut-only count serves a lower, safer feed.');
  }

  if (input.toolType === 'compression') {
    const upcutLen = input.upcutLengthMm > 0 ? input.upcutLengthMm : D * rules.compression_min_depth.upcut_length_default_ratio_of_d;
    const minPass = compressionMinDepthMm(upcutLen, rules.compression_min_depth.extra_mm);
    if (ap < minPass) {
      return {
        status: 'blocked',
        block: {
          reason: `A compression tool must cut deeper than its up-cut section plus ${rules.compression_min_depth.extra_display}. The up-cut section here is ${round1(upcutLen)} mm, so the minimum pass is ${round1(minPass)} mm. At ${round1(ap)} mm the up-cut flutes lift the top face and chip it. Use a shorter up-cut section, a down-cut spiral, or a deeper pass.`,
          minPassMm: minPass,
          upcutLengthMm: upcutLen,
        },
      };
    }
  }

  // No chart publishes a SLOT deeper than three diameters: the vendor depth
  // rule ends at its 3xD anchor. Past it the old hyperbolic extension shrank
  // the chip until the floor warning fired against the served number and
  // told the user to raise a feed the calculator had just lowered (review
  // sweep, 2026-08-29). So a slot-width cut blocks, like the compression
  // minimum pass, and says what to do instead.
  //
  // The block covers slot-width cuts only (Scott, 2026-09-02). The depth
  // hazard is engagement, not flute immersion: a cut under half the
  // diameter wide clears its chips sideways, and running the flute length
  // at a light optimal load is standard adaptive practice. Light-radial
  // cuts therefore never block on depth. A pass deeper than the flutes
  // draws a hot chip below, never a block (Scott's call, same date).
  const lightRadial = ae < D / 2;
  const maxRatio = rules.depth_limit?.max_ratio_of_d ?? 3;
  if (!lightRadial && ap / D > maxRatio + 1e-9) {
    return {
      status: 'blocked',
      block: {
        reason: `No published chart covers a cut deeper than ${maxRatio} tool diameters. At ${round1(ap)} mm on a ${round1(D)} mm tool this cut is ${(ap / D).toFixed(1)}×D. Cut in passes of ${round1(maxRatio * D)} mm or less, or use a bigger tool.`,
        maxPassMm: maxRatio * D,
        docRatio: ap / D,
      },
    };
  }

  // Finishing serves the finisher-series charts and nothing else (Scott,
  // 2026-08-29). Outside their diameter coverage it refuses with the reason,
  // because every substitute tried, the tool chart's own low edge and a
  // diameter-blind floor target, served a number a machinist rejected.
  const env = resolveBand(
    chiploads.entries,
    { material: input.material, materials: input.materials, materialsFallback: input.materialsFallback, toolType: input.toolType, diameterMm: D, finishing },
    rules.envelope_rules,
  );
  if (!env.served) {
    // Scope notes (a chart's own exclusions) explain what the user can
    // change, so they stay. Per-chart coverage narration does not.
    const scopeNotes = (env.notes ?? []).filter((n) => !(env.coverageNotes ?? []).includes(n));
    const reason = finishing
      ? 'No published finisher chart covers this tool diameter, so Finishing gives no number. Pick a diameter between 5 and 19.05 mm, or use another profile.'
      : scopeNotes.length
        ? scopeNotes.join(' ')
        : `No published chart covers this material and tool at ${round1(D)} mm. The calculator gives no number without a source.`;
    return { status: 'refused', refusal: { reason } };
  }
  chartNotes.push(...env.notes);

  const fzBase = profileFz(env, input.profile ?? 'standard');
  const docRatio = ap / D;
  // The depth derate is the vendors' deep-slot rule: chip evacuation and
  // deflection at 2x and 3x diameter in a full-width cut. A light-radial
  // cut, below half the diameter, has neither: the chips escape sideways
  // and the chip-thinning compensation below already lifts the programmed
  // feed to hold the effective chip on target. Finishing learnt this first
  // (review, 2026-08-29: derating a skim drove the chip under the floor
  // the profile exists to respect), and on 2026-09-02 Scott extended it to
  // every light-radial cut: adaptive clearing runs the flute length at a
  // light optimal load as standard practice, and the derate was punishing
  // the one cut type that handles depth best. The boundary is the same
  // half-diameter line where chip thinning starts. A slot-width cut in any
  // profile still derates.
  const skimRegime = finishing && lightRadial;
  const derate = lightRadial ? 1 : depthDerate(docRatio, chiploads.depth_derating);
  if (lightRadial && docRatio > 1 && !finishing) {
    chartNotes.push('The deep-slot derate does not apply below half the diameter of width. Chip thinning compensates the programmed feed instead.');
  }
  // A finish pass follows a proven cut, and the first-cut reduction guards
  // heavy engagement. On a skim it would drive the chip under the rubbing
  // floor, so the Finishing profile ignores it (research session 4).
  const firstCut = !finishing && (input.firstCut ?? rules.first_cut?.default_on ?? false);
  const fcFactor = firstCut && rules.first_cut ? rules.first_cut.factor : 1;
  const fzTarget = fzBase * derate * fcFactor;
  // The finisher charts publish the chip you PROGRAM on a finish pass, light
  // radial engagement included, so Finishing does not compensate them for
  // chip thinning. Stacking the compensation on top scaled the chip with
  // diameter twice and reached the machine cap on a 3/4 in three-flute skim
  // (sweep review, 2026-08-29). The physical factor still reports.
  const ctfPhysical = chipThinningFactor(D, ae);
  const ctf = finishing ? 1 : ctfPhysical;
  const fzProg = fzTarget * ctf;

  const kcModel = selectKcModel(kc, input.material, toolFamilyFor(input.toolType), direction);
  if (!kcModel) {
    return { status: 'refused', refusal: { reason: 'No cutting-force model covers this material. The calculator cannot check the power limit, so it gives no number.' } };
  }

  const ideal = feedFromFz(fzProg, rpm, zEff);
  const caps = {};
  if (machine.feedMaxMmMin > 0) caps.vmax = machine.feedMaxMmMin;
  const breakpointRpm = machine.breakpointRpm > 0 ? machine.breakpointRpm : rules.defaults.breakpoint_rpm;
  let availKw;
  if (machine.spindleKw > 0) {
    availKw = availablePowerKw(machine.spindleKw, breakpointRpm, rpm);
    caps.pow = powerFeedCapMmMin(availKw, kcModel, ap, ae, D, rpm, zEff);
  }
  let gripN;
  if (input.footprintCm2 > 0 && machine.vacuum && machine.vacuum.mu > 0 && machine.vacuum.dPkPa > 0) {
    gripN = vacuumGripN(machine.vacuum.mu, machine.vacuum.dPkPa, input.footprintCm2);
    caps.vac = vacuumFeedCapMmMin(gripN, kcModel, ap, ae, D, rpm, zEff);
  }
  if (input.featureMm > 0 && machine.accelMs2 > 0) {
    caps.corn = cornerFeedCapMmMin(input.featureMm, machine.accelMs2);
  }

  const lim = applyLimits(ideal, caps);
  const final = lim.finalMmMin;

  if (!(final > 0) || !Number.isFinite(final)) {
    const capLabel = { vmax: 'machine feed', pow: 'spindle power', vac: 'vacuum hold-down', corn: 'corner' }[lim.binding] ?? lim.binding;
    const advice = lim.binding === 'vac'
      ? `Vacuum hold-down cannot resist this cut at any usable feed on a ${input.footprintCm2} cm² footprint. Use an onion skin or tabs, hold the part another way, or reduce the depth of cut.`
      : lim.binding === 'pow'
        ? 'The spindle cannot power this cut at any usable feed. Reduce the depth or the width of cut, or increase the rpm into the constant-power range.'
        : `The ${capLabel} limit drives the feed to zero. This machine cannot make this cut as set up.`;
    return { status: 'blocked', block: { reason: advice, binding: lim.binding, caps: lim.caps } };
  }

  const fzDeliv = final / (rpm * zEff);
  // Uncapped, the effective chip IS the target. Recovering it from the
  // delivered feed loses an ulp on the round trip, which put a served 0.14
  // one ulp under the 0.14 floor boundary and fired a warning at the
  // profile's own number (review, 2026-08-29).
  const fzEff = lim.binding === 'ideal' ? fzTarget : fzDeliv / ctf;

  if (finishing) {
    chartNotes.push(`The finish chip comes from the ${env.contributors.join(', ')} finisher chart, the only published finishing chip loads. It is the chip you program on a finish pass, as the vendor intends, so the calculator does not compensate it for chip thinning.`);
    if (ctfPhysical > 1.001) {
      chartNotes.push(`On this ${round1(ae)} mm cut the physical chip is thinner than the programmed chip, about ${fz3(fzDeliv / ctfPhysical)} mm/tooth.`);
    }
    if (skimRegime && docRatio > 1) {
      chartNotes.push('The depth derate does not apply to a skim. It is the deep-slot rule, and this cut is under half the diameter wide.');
    }
    if (!(input.aeMm > 0)) {
      notes.push(`Finishing assumes a ${round1(ae)} mm skim on the wall. Enter a width of cut to change the skim.`);
    }
    if (input.firstCut ?? rules.first_cut?.default_on) {
      notes.push('The first-cut reduction does not apply to a finish pass. A finish pass follows a proven cut, and a reduced feed on a light cut rubs.');
    }
    // The flat spiral models (Int = 0) carry no thin-chip rise at all. The
    // straight-tool models carry an intercept that already lifts kc as the
    // chip thins, so the caveat is overstated there.
    if (availKw !== undefined && ctfPhysical > 1.001 && !(kcModel.Int > 0)) {
      notes.push('On a chip this thin the power check reads low. The true draw is higher.');
    }
  }
  const HOLDER = { vac: 'hold-down', pow: 'spindle power', vmax: 'machine maximum feed', corn: 'corner' };
  const capHeld = lim.binding !== 'ideal';
  if (fcFactor !== 1) {
    notes.push(capHeld
      ? `First-cut mode is on, but the ${HOLDER[lim.binding]} limit sets the feed here regardless.`
      : `First-cut mode serves ${Math.round(fcFactor * 100)}% of the chart feed. When the cut proves good, work up toward the chart value.`);
  }
  const heldAdvice = capHeld
    ? `the ${HOLDER[lim.binding]} limit holds the feed this low. Correct that limit first. A cut this slow rubs.`
    : fcFactor !== 1
      ? 'first-cut mode holds the feed down. If the cut is good, switch first-cut mode off.'
      : null;
  // The panel floor is a slotting-practice number on the effective chip. In
  // Finishing the chart's own minimum is the floor, checked on the
  // programmed chip, because that is the basis the finisher chart publishes.
  const floor = finishing ? 'ok' : chipFloorStatus(fzEff, input.material, rules.chip_floor_mm_per_tooth);
  if (floor === 'plough') {
    warnings.push({ code: 'chip_plough', message: heldAdvice
      ? `The effective chip is ${fz3(fzEff)} mm/tooth. Below ${rules.chip_floor_mm_per_tooth.plough_below} mm the tool ploughs and burns, and ${heldAdvice}`
      : `The effective chip is ${fz3(fzEff)} mm/tooth. Below ${rules.chip_floor_mm_per_tooth.plough_below} mm the tool ploughs and burns. Raise the feed or lower the rpm. A slower feed makes this worse.` });
  } else if (floor === 'below_min') {
    warnings.push({ code: 'chip_below_min', message: heldAdvice
      ? `The effective chip is ${fz3(fzEff)} mm/tooth, below the ${rules.chip_floor_mm_per_tooth.warn_below} mm minimum, and ${heldAdvice}`
      : `The effective chip is ${fz3(fzEff)} mm/tooth, below the ${rules.chip_floor_mm_per_tooth.warn_below} mm minimum. Raise the feed or lower the rpm.` });
  } else if (floor === 'marginal') {
    warnings.push({ code: 'chip_marginal', message: `The effective chip is ${fz3(fzEff)} mm/tooth. This is close to the ${rules.chip_floor_mm_per_tooth.warn_below} mm minimum.` });
  } else if (floor === 'thin') {
    warnings.push({ code: 'chip_thin', message: `The effective chip is ${fz3(fzEff)} mm/tooth. This is thin for solid timber.` });
  }
  if (finishing && fzDeliv < env.fzMin - 1e-9) {
    const holder = capHeld
      ? `The ${HOLDER[lim.binding]} limit holds the feed this low. Correct that limit first.`
      : 'The depth derate holds it there, because this cut is wider than half the diameter and deeper than the diameter.';
    warnings.push({ code: 'chip_below_chart', message: `The programmed chip is ${fz3(fzDeliv)} mm/tooth, below the ${env.contributors.join(', ')} finisher chart's minimum of ${fz3(env.fzMin)}. ${holder} A finish cut this slow rubs.` });
  }

  if (kcModel.source === 'iwms25') {
    warnings.push({ code: 'iwms25_speed', message: `Cutting-force values come from a low-speed test. Expect ${kc.speed_caveat.uplift} more power at production speed.` });
  }
  if (kcModel.legacy) {
    chartNotes.push('The power check uses a flat kc estimate for this material. No measured cutting-force model exists.');
    if (input.direction) {
      notes.push('The cut direction has no modelled effect for this material, so both directions serve the same numbers.');
    }
  }
  if (env.allBigIron && rules.big_iron_caveat) {
    warnings.push({ code: 'big_iron_only', message: rules.big_iron_caveat.message });
  }
  // A pass deeper than the flutes runs the shank against the wall. Where
  // the flute length is known (the Fusion panel always sends it, the site
  // has an optional advanced field) this warns hot and never blocks: the
  // machinist owns the call (Scott, 2026-09-02).
  if (input.fluteLengthMm > 0 && ap > input.fluteLengthMm + 1e-9) {
    warnings.push({ code: 'past_flutes', message: `The pass is ${round1(ap)} mm deep and the flutes are ${round1(input.fluteLengthMm)} mm long. The shank rubs the wall above the flutes. Use a longer tool or a shallower pass.` });
  }
  if (env.hasSwitchableBasis) {
    chartNotes.push('An ITA chart contributes here. ITA per-tooth values apply to the total flute count by default. The flute-basis switch in Advanced changes that reading.');
  }
  if (input.densityKgM3 != null && kc.solid_timber_model && !isPanelMaterial(input.material)) {
    const dv = checkDensity(input.densityKgM3, kc.solid_timber_model);
    if (!dv.valid) warnings.push({ code: 'density_out_of_validity', message: dv.warning });
    if (input.material === 'softwood') notes.push(radiataNote());
    notes.push('The density does not change the served numbers yet.');
  }

  const h = meanChipThicknessMm(fzDeliv, ae, D);
  const kcUsed = kcOfH(kcModel, h);
  const powerKw = cuttingPowerKw(kcUsed, ap * ae * final);

  const sourceLabel = env.contributors.join(', ');
  const plungeRatio = rules.plunge_ramp.ratio_of_cutting_feed;
  const leadRatio = rules.lead_in_out.ratio_of_cutting_feed;

  return {
    status: 'ok',
    outputs: {
      spindleRpm: rpm,
      surfaceSpeedMMin: surfaceSpeedMMin(D, rpm),
      cuttingFeedMmMin: final,
      feedPerToothMm: fzDeliv,
      leadInFeedMmMin: final * leadRatio,
      leadOutFeedMmMin: final * leadRatio,
      rampFeedMmMin: final * plungeRatio,
      plungeFeedMmMin: final * plungeRatio,
    },
    outputNotes: {
      leadInOut: 'An arc lead-in enters at reduced engagement, so the full cutting feed is safe there.',
      plungeRamp: `Ramp and plunge at up to ${rules.plunge_ramp.angle_deg_max}° over ${rules.plunge_ramp.ramp_length_mm[0]}–${rules.plunge_ramp.ramp_length_mm[1]} mm at one third of the cutting feed.`,
    },
    limit: {
      binding: lim.binding,
      message: limitMessage(lim.binding, {
        source: sourceLabel, rpm, breakpointRpm, availKw: availKw ?? 0,
        footprintCm2: input.footprintCm2, featureMm: input.featureMm, accelMs2: machine.accelMs2,
        firstCutFactor: fcFactor,
      }),
      caps: lim.caps,
    },
    warnings,
    notes,
    meta: {
      chartNotes,
      contributors: env.contributors,
      sources: env.sources,
      band: { fzMin: env.fzMin, fzMax: env.fzMax },
      servingBands: env.servingBands,
      contextBands: env.context,
      fzBase, fzTarget, fzProg, fzDeliv, fzEff,
      docRatio, derate, chipThinningFactor: ctfPhysical, thinningCompensated: !finishing,
      finishing,
      lightRadial,
      fluteLengthMm: input.fluteLengthMm > 0 ? input.fluteLengthMm : undefined,
      fzPhysical: fzDeliv / ctfPhysical,
      firstCut: { applied: fcFactor !== 1, factor: fcFactor },
      kcModel: { Ks: kcModel.Ks, Int: kcModel.Int, source: kcModel.source, data_class: kcModel.data_class },
      kcUsedNmm2: kcUsed,
      meanChipMm: h,
      powerKw,
      availKw,
      torqueNm: availKw !== undefined ? torqueNm(availKw, rpm) : undefined,
      gripN,
      zEff,
      apMm: ap,
      aeMm: ae,
      dMm: D,
      material: input.material,
      chipFloor: rules.chip_floor_mm_per_tooth,
      breakpointRpm,
      accelMs2: machine.accelMs2,
      featureMm: input.featureMm,
      footprintCm2: input.footprintCm2,
    },
  };
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function fz3(x) {
  return x.toFixed(3);
}
