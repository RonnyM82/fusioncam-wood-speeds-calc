// The single entry point the UI and the tests share. Pure: takes parsed data
// objects, performs no I/O, touches no DOM. Result statuses: 'ok', 'refused'
// (OSB, or no data), 'blocked' (compression minimum pass depth).

import {
  feedFromFz, surfaceSpeedMMin, depthDerate, chipThinningFactor,
  resolveBand, profileFz, chipFloorStatus, isPanelMaterial,
  effectiveDiameterMm, scallopHeightMm,
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
import { isPlastic, calculatePlastic } from './plastics.js';

export function calculate(input, data) {
  // Soft and hard plastic have their own data and their own rules
  // (js/core/plastics.js, 2026-09-24). Nothing below this line sees a plastic
  // pick, so no wood number can change because plastics exist.
  if (isPlastic(input.material)) return calculatePlastic(input, data);
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
  // A 3D surfacing pass with no stepdown states no depth of cut, and Fusion
  // does not carry one: a scallop, a pencil or a blend pass has a stepover
  // and nothing else, read firsthand through the Fusion API on 2026-09-03.
  // The feed does not depend on the depth, so the cut still serves; the
  // checks that DO depend on it are skipped and say so (Scott, 2026-09-03).
  const depthUnstated = input.apMm === null && input.toolType === 'ball';
  const ap = depthUnstated ? null : (input.apMm ?? input.thicknessMm);
  // A ball nose (2026-09-02, research session 6). Its chart is one maker's,
  // published at a depth of one tool diameter, which is a full-width groove.
  // It is not published for a surfacing pass and the calculator says so.
  const ballNose = input.toolType === 'ball';
  // A round-ended tool cuts on its corner, and on a surfacing pass the corner
  // is the whole story. A ball's corner radius is half its diameter, so the
  // two are the same tool; a bull nose has a smaller corner and a flat across
  // the middle. The site offers a ball only, so a missing corner radius means
  // a full radius. The Fusion panel sends the real one.
  const cornerR = ballNose
    ? (input.cornerRadiusMm > 0 ? Math.min(input.cornerRadiusMm, D / 2) : D / 2)
    : null;
  // The diameter that indexes the chip-load chart and sets the chip geometry.
  // On a bull nose it is the CORNER diameter, not the tool diameter (Scott,
  // 2026-09-03): the corner is what cuts on a surfacing pass, and reading the
  // chart there is conservative twice over, because it gives both the lower
  // published chip load and the smaller thinning compensation. The cost is
  // that a small corner radius falls off the bottom of the chart's ladder and
  // refuses, which is the honest outcome for a geometry nobody publishes.
  const bullNose = ballNose && cornerR < D / 2 - 1e-9;
  const cutD = bullNose ? 2 * cornerR : D;
  // The Finishing profile serves the finisher-series charts, and no finisher
  // chart covers a ball nose. Refuse rather than borrow: every finisher row
  // is a flat-edged tool and its chip load is not a ball number.
  if (ballNose && input.profile === 'finishing') {
    return {
      status: 'refused',
      refusal: { reason: 'No finisher chart covers a ball nose, so the Finishing profile gives no number for this tool. Use Gentle for the lightest published chip.' },
    };
  }
  // The Finishing profile models a wall skim: with no width of cut given it
  // assumes the rules.json skim instead of a full slot (research session 4).
  const finishing = input.profile === 'finishing';
  const skimMm = finishing && rules.finishing ? Math.min(rules.finishing.skim_ae_mm, D) : null;
  const ae = input.aeMm ?? skimMm ?? D;
  const direction = input.direction ?? 'climb';
  const machine = input.machine ?? {};

  const bad = [];
  if (!(D > 0)) bad.push('a tool diameter');
  if (!depthUnstated && !(ap > 0)) bad.push('a board thickness (or depth per pass)');
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
  const lightRadial = ae < cutD / 2;
  const maxRatio = rules.depth_limit?.max_ratio_of_d ?? 3;
  if (!depthUnstated && !lightRadial && ap / D > maxRatio + 1e-9) {
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
    { material: input.material, materials: input.materials, materialsFallback: input.materialsFallback, toolType: input.toolType, diameterMm: cutD, finishing },
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
  const docRatio = depthUnstated ? 0 : ap / D;
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
  // floor, so the Finishing profile ignores it (research session 4). A 3D
  // surfacing pass is a light finishing cut by design, so it ignores the
  // reduction for the same reason (Scott, 2026-09-25). A ball nose is the
  // engine's surfacing marker, so the skip runs on every ball and bull nose
  // pass. Routing and drilling keep the reduction, as before.
  const firstCut = !finishing && !ballNose && (input.firstCut ?? rules.first_cut?.default_on ?? false);
  const fcFactor = firstCut && rules.first_cut ? rules.first_cut.factor : 1;
  const fzTarget = fzBase * derate * fcFactor;
  // The finisher charts publish the chip you PROGRAM on a finish pass, light
  // radial engagement included, so Finishing does not compensate them for
  // chip thinning. Stacking the compensation on top scaled the chip with
  // diameter twice and reached the machine cap on a 3/4 in three-flute skim
  // (sweep review, 2026-08-29). The physical factor still reports.
  const ctfPhysical = chipThinningFactor(cutD, ae);
  // The compensation is unbounded as the stepover falls, and on a ball nose
  // that runs away inside the tool's normal working range: at a 2% stepover
  // on a 3.175 mm ball it programs a chip ten times the width of cut. The
  // thinning relation assumes the chip is small against the engagement, and
  // there it is not. So a ball computes the compensation from the stepover or
  // the rules.json floor, whichever is larger, and never extrapolates below
  // it (2026-09-03). Same shape as the 3xD depth block: hold a correction at
  // its anchor rather than run it past the point anybody checked.
  const thinFloorAe = ballNose && rules.ball_nose
    ? Math.max(ae, rules.ball_nose.thinning_stepover_floor_fraction * cutD)
    : ae;
  const thinFloored = thinFloorAe > ae + 1e-12;
  const ctf = finishing ? 1 : chipThinningFactor(cutD, thinFloorAe);
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
    if (!depthUnstated) caps.pow = powerFeedCapMmMin(availKw, kcModel, ap, ae, D, rpm, zEff);
  }
  let gripN;
  if (input.footprintCm2 > 0 && machine.vacuum && machine.vacuum.mu > 0 && machine.vacuum.dPkPa > 0) {
    gripN = vacuumGripN(machine.vacuum.mu, machine.vacuum.dPkPa, input.footprintCm2);
    if (!depthUnstated) caps.vac = vacuumFeedCapMmMin(gripN, kcModel, ap, ae, D, rpm, zEff);
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
  // Where the ball floor held the compensation, the programmed chip is lower
  // than the physical engagement would need, so the chip the tool actually
  // takes sits below the chart value. The floor check has to see that number,
  // not the chart's. thinFloored is a ball-only state and a ball never reaches
  // the Finishing branch, so neither reading changes for any other pick.
  const fzEff = lim.binding === 'ideal'
    ? fzTarget * (thinFloored ? ctf / ctfPhysical : 1)
    : fzDeliv / (thinFloored ? ctfPhysical : ctf);

  if (ballNose) {
    // The one thing on this pick the user can act on: below the floor the
    // feed stops rising, so a finer stepover buys surface finish and time
    // and nothing else. That belongs in the rendered notes.
    // The checks that need a depth did not run, and the user must know which.
    // A finishing raster is not usually power or hold-down limited, but the
    // calculator does not get to assume that on their behalf.
    if (depthUnstated) {
      notes.push('This toolpath states no depth of cut, so the spindle power and the hold-down checks did not run. The feed comes from the chip load and the stepover, which do not depend on the depth.');
    }
    // The first-cut reduction never applies to a ball, so the box does nothing
    // here. Say so when it would otherwise be on, as the Finishing profile does
    // (Scott, 2026-09-25).
    if (input.firstCut ?? rules.first_cut?.default_on) {
      notes.push('The first-cut reduction does not apply to a 3D surfacing pass. A surfacing pass is a light finishing cut, and a reduced feed on a light cut rubs.');
    }
    if (thinFloored) {
      const pct = Math.round(rules.ball_nose.thinning_stepover_floor_fraction * 100);
      notes.push(`The stepover is under ${pct} per cent of the tool diameter. The calculator holds the chip-thinning compensation at ${pct} per cent and does not raise the feed further. Below that the correction runs past anything published or tested.`);
    }
    // The record of what the ball chart is and what was done to it. Kept out
    // of the rendered notes with every other chart-selection sentence
    // (2026-08-31); the page shows the numbers and the limit line.
    chartNotes.push(`The ${env.contributors.join(', ')} chart states one condition, a depth of cut of one tool diameter. That is a full-width groove, not a surfacing pass, so the chip load is a full-engagement number and the calculator compensates it for radial chip thinning on the stepover, as it does for any other light-radial cut.`);
    if (bullNose) {
      chartNotes.push(`This is a bull nose, and no maker publishes a chip load for one in wood. The band is the ball nose chart read at the corner diameter, ${round1(cutD)} mm, because the corner is what cuts on a surfacing pass. That reads the lower published chip and applies the smaller thinning compensation. The scallop and the cutting diameter come from the tool's real corner radius, not from the ball the chart describes.`);
    }
    chartNotes.push('Charts for other tool shapes are not drawn beside this band. Their chip loads are for a flat cutting edge and do not apply to this cut.');
    chartNotes.push('The calculator applies no second correction for the ball\'s effective cutting diameter. The two makers that publish that multiplier disagree about the base it starts from, and no wood source publishes one at all, so it renders as a number and moves nothing.');
  }

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
  if (!depthUnstated && input.fluteLengthMm > 0 && ap > input.fluteLengthMm + 1e-9) {
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

  const h = meanChipThicknessMm(fzDeliv, ae, cutD);
  const kcUsed = kcOfH(kcModel, h);
  const powerKw = depthUnstated ? undefined : cuttingPowerKw(kcUsed, ap * ae * final);

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
      // Ball nose geometry, display only. The three values below appear only
      // for a ball tool, and the UI rows carry a `when` guard on them. None of
      // them changes a served number: the effective diameter is what the tool
      // is actually cutting on at this depth, and no wood source publishes a
      // speed or feed correction from it.
      ...(ballNose && !depthUnstated ? {
        effectiveDiameterMm: effectiveDiameterMm(D, ap, cornerR),
        effectiveSurfaceSpeedMMin: surfaceSpeedMMin(effectiveDiameterMm(D, ap, cornerR), rpm),
      } : {}),
      ...(ballNose ? {
        // A scallop is the ridge between two passes a stepover apart, so it
        // exists while the passes overlap on the corner: at or past the CORNER
        // diameter they do not, and the arithmetic returns the full corner
        // radius, which is right and reads as nonsense on a groove. The row
        // then drops out on its `when` guard.
        //
        // The gate is the corner diameter, not light-radial engagement
        // (corrected 2026-09-03). On a bull nose the corner is far smaller
        // than the tool, so a stepover that is heavy against the corner is
        // still light against the tool, and a light-radial gate hid a real
        // and coarse ridge: 1.27 mm across a 1.5 mm corner leaves 0.23 mm.
        ...(ae < 2 * cornerR ? { scallopHeightMm: scallopHeightMm(2 * cornerR, ae) } : {}),
      } : {}),
    },
    outputNotes: {
      leadInOut: 'An arc lead-in enters at reduced engagement, so the full cutting feed is safe there.',
      plungeRamp: `Ramp and plunge at up to ${rules.plunge_ramp.angle_deg_max}° over ${rules.plunge_ramp.ramp_length_mm[0]}–${rules.plunge_ramp.ramp_length_mm[1]} mm at one third of the cutting feed.`,
      ...(ballNose && ae < 2 * cornerR ? {
        scallop: 'This is the ridge left standing between passes, from the stepover and the ball radius alone. Shops and CAM documentation run 8 to 12 per cent of the tool diameter for a 3D finish pass, and no tooling maker publishes a figure. Halving the stepover quarters the ridge and doubles the cutting time.',
      } : {}),
      ...(ballNose && !depthUnstated ? {
        effectiveDiameter: 'A ball cuts on a smaller circle than its full diameter until the pass reaches half the diameter deep, and the speed falls to zero at the exact tip. Use a larger ball where the surface is flat.',
      } : {}),
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
      ballNose,
      bullNose,
      cornerRadiusMm: cornerR,
      cuttingDiameterMm: cutD,
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
      depthUnstated,
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
