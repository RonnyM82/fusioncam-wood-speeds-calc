// Soft and hard plastic, from the two Onsrud plastics sheets of catalogue
// PCT-19 (data/plastics.json). Added 2026-09-24 with Scott's approval of the
// plan that day. Pure: takes parsed data, performs no I/O, touches no page.
//
// calculate() hands every plastic pick here and returns what this returns, so
// the page, the Fusion panel and the tests call one entry point, and the wood
// path never runs a plastic number. The envelope is the same shape
// calculate() returns, with the same output keys, so the Fusion and Woodwork
// for Inventor field names do not change.
//
// WHAT DIFFERS FROM WOOD, and why (Scott's rulings of 2026-09-24):
// - The band is one named series, the sheet's "Best" single-pass tool, never
//   an envelope across series. Below 1/2 in that is 63-750 (soft) or 63-700
//   (hard); at 1/2 in and up it is 52-700 (soft) or 60-200 (hard). The other
//   router series printed at the size are drawn on the chart ladder as
//   context and set nothing.
// - A size the series does not print is interpolated in a straight line
//   between its two nearest printed sizes, both band edges, and the result
//   says so. A size outside the series' printed range gets no number. There
//   is no 25 per cent stretch past the ends, as the wood charts have.
// - No cutting force is published for plastic, so the spindle power and the
//   hold-down checks do not run, and the page says so.
// - First-cut mode does not apply: the sheet's cure for chips that weld back
//   is a higher feed, and a reduced first cut runs the other way.
// - The wood chip floor does not apply. The low edge of the printed band is
//   the floor, and a machine limit that holds the chip below it warns.
// - Finishing serves the low edge of the 60-200 row as the programmed chip,
//   as the wood Finishing profile serves its finisher charts.

import {
  feedFromFz, surfaceSpeedMMin, depthDerate, chipThinningFactor, profileFz,
} from './chipload.js';
import { applyLimits, limitMessage, cornerFeedCapMmMin } from './limits.js';
import { meanChipThicknessMm } from './power.js';

export const PLASTIC_FAMILIES = ['soft_plastic', 'hard_plastic'];

export function isPlastic(material) {
  return material === 'soft_plastic' || material === 'hard_plastic';
}

const MM_PER_IN = 25.4;

// Two diameters closer than this are the same printed size. The page's inch
// sizes are stored in millimetres to three decimals (12.7, 3.175), and the
// data carries the exact product with 25.4.
const SAME_MM = 1e-4;

// The tool types a plastic pick serves, and the cut directions of the router
// series drawn beside the band for each. A series offered in both hands
// (60-000, 60-200, 60-900, the Super O pair) belongs beside either spiral.
const CONTEXT_DIRECTIONS = {
  upcut: ['upcut', 'both'],
  downcut: ['downcut', 'both'],
  straight: ['straight'],
};

const TOOL_WORDS = {
  upcut: 'up-cut spiral', downcut: 'down-cut spiral', straight: 'straight',
};

// The printed inch size, written the way the sheet prints it, for a sentence.
function inchWords(e) {
  return `${e.diameter_printed} in`;
}

function round1(x) {
  return Math.round(x * 10) / 10;
}

function mmWords(x) {
  return `${Number(x.toFixed(2))} mm`;
}

function fz3(x) {
  return x.toFixed(3);
}

function rowsOf(entries, family, series) {
  return entries
    .filter((e) => e.family === family && e.series === series)
    .sort((a, b) => a.diameter_mm - b.diameter_mm);
}

/**
 * One series' band at a diameter, in inches and millimetres per tooth.
 * Exact where the sheet prints the size. Between two printed sizes it is
 * interpolated in a straight line on both edges. Outside the first and last
 * printed size it is null: no number is extrapolated.
 */
export function seriesBandAt(entries, family, series, dMm) {
  const rows = rowsOf(entries, family, series);
  if (!rows.length || !(dMm > 0)) return null;
  const exact = rows.find((r) => Math.abs(r.diameter_mm - dMm) < SAME_MM);
  if (exact) {
    return {
      loIn: exact.fz_min_in, hiIn: exact.fz_max_in,
      lo: exact.fz_min_in * MM_PER_IN, hi: exact.fz_max_in * MM_PER_IN,
      interpolated: false, at: exact, between: null,
    };
  }
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (dMm < first.diameter_mm || dMm > last.diameter_mm) return null;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (dMm > a.diameter_mm && dMm < b.diameter_mm) {
      const t = (dMm - a.diameter_mm) / (b.diameter_mm - a.diameter_mm);
      const loIn = a.fz_min_in + t * (b.fz_min_in - a.fz_min_in);
      const hiIn = a.fz_max_in + t * (b.fz_max_in - a.fz_max_in);
      return {
        loIn, hiIn, lo: loIn * MM_PER_IN, hi: hiIn * MM_PER_IN,
        interpolated: true, at: null, between: [a, b],
      };
    }
  }
  return null;
}

/** The first and last printed size of a series, in millimetres. */
function seriesRange(entries, family, series) {
  const rows = rowsOf(entries, family, series);
  return rows.length ? { from: rows[0], to: rows[rows.length - 1] } : null;
}

/** Which series serves a pick: the Best single-pass tool either side of 1/2 in, or 60-200 in Finishing. */
export function servingSeries(fam, dMm, finishing) {
  if (finishing) return fam.finishing.series;
  const splitMm = fam.serving.split_in * MM_PER_IN;
  return dMm < splitMm - SAME_MM ? fam.serving.below_split : fam.serving.at_or_above_split;
}

function bandLabel(series, band) {
  return `Onsrud ${series}${band.interpolated ? ', interpolated' : ''}`;
}

/**
 * The served band for a plastic pick, the same shape resolveBand() returns
 * for wood, or { served: false, reason } with the sentence the page shows.
 */
export function resolvePlasticBand(plastics, { material, toolType, diameterMm, finishing }) {
  const fam = plastics.families[material];
  const label = fam.label;
  if (toolType === 'compression') {
    return { served: false, reason: `Onsrud prints no compression tool for ${label}. Pick an up-cut, down-cut or straight tool.` };
  }
  if (!CONTEXT_DIRECTIONS[toolType]) {
    return { served: false, reason: `The calculator gives no ${toolType === 'ball' ? 'ball nose' : 'number for this tool'} in ${label}. Pick an up-cut, down-cut or straight tool.` };
  }
  const series = servingSeries(fam, diameterMm, finishing);
  const band = seriesBandAt(plastics.entries, material, series, diameterMm);
  if (!band) {
    if (finishing) {
      const r = seriesRange(plastics.entries, material, series);
      return {
        served: false,
        reason: `Onsrud prints the ${series} finishing tool for ${label} from ${inchWords(r.from)} (${mmWords(r.from.diameter_mm)}) to ${inchWords(r.to)} (${mmWords(r.to.diameter_mm)}), so Finishing gives no number at ${mmWords(diameterMm)}. Pick a diameter in that range, or use another profile.`,
      };
    }
    const lo = seriesRange(plastics.entries, material, fam.serving.below_split).from;
    const hi = seriesRange(plastics.entries, material, fam.serving.at_or_above_split).to;
    return {
      served: false,
      reason: `Onsrud prints no ${label} chip load for a ${mmWords(diameterMm)} tool. Its chart runs from ${inchWords(lo)} (${mmWords(lo.diameter_mm)}) to ${inchWords(hi)} (${mmWords(hi.diameter_mm)}).`,
    };
  }
  const src = plastics.entries.find((e) => e.family === material && e.series === series).source;
  const serving = {
    label: bandLabel(series, band),
    source: src,
    geometry: 'plastic',
    machineClass: null,
    lo: band.lo,
    hi: band.hi,
    mid: (band.lo + band.hi) / 2,
    switchable: false,
  };
  // The other flat solid carbide router series of the family printed at this
  // size, for the picked hand. Engraving, V, ball nose, edge profile, taper
  // and HSS tools are recorded in the data and never drawn.
  const wanted = CONTEXT_DIRECTIONS[toolType];
  const seen = new Set(plastics.entries.filter((e) => e.family === material).map((e) => e.series));
  const context = [];
  for (const s of seen) {
    if (s === series) continue;
    const facts = plastics.series[s];
    if (!facts || facts.kind !== 'router' || !wanted.includes(facts.direction)) continue;
    const b = seriesBandAt(plastics.entries, material, s, diameterMm);
    if (!b) continue;
    context.push({
      label: bandLabel(s, b), source: src, geometry: 'plastic', machineClass: null,
      lo: b.lo, hi: b.hi, mid: (b.lo + b.hi) / 2, switchable: false,
    });
  }
  context.sort((a, b) => a.lo - b.lo);
  return {
    served: true,
    fzMin: band.lo,
    fzMax: band.hi,
    contributors: [`Onsrud ${series}`],
    sources: [src],
    servingBands: [serving],
    context,
    series,
    band,
  };
}

const HOLDER = { vmax: 'machine maximum feed', corn: 'corner' };

function refused(reason) {
  return { status: 'refused', refusal: { reason } };
}

/**
 * calculate() for a plastic pick. The input is calculate()'s own, with
 * `material` set to the family key, 'soft_plastic' or 'hard_plastic'.
 */
export function calculatePlastic(input, data) {
  const { plastics, rules } = data;
  const fam = plastics?.families?.[input.material];
  if (!fam) return refused('The plastics data did not load, so the calculator gives no number for plastic.');
  const label = fam.label;

  const D = input.diameterMm;
  let rpm = input.rpm ?? rules.defaults.rpm;
  const zEff = input.flutesTotal ?? rules.defaults.flutes_total;
  const ap = input.apMm ?? input.thicknessMm;
  const finishing = input.profile === 'finishing';
  const skimMm = finishing && rules.finishing ? Math.min(rules.finishing.skim_ae_mm, D) : null;
  const ae = input.aeMm ?? skimMm ?? D;
  const machine = input.machine ?? {};
  const warnings = [];
  const notes = [];
  const chartNotes = [];

  const bad = [];
  if (!(D > 0)) bad.push('a tool diameter');
  if (!(ap > 0)) bad.push('a board thickness (or depth per pass)');
  if (!(ae > 0)) bad.push('a width of cut');
  if (!(rpm > 0)) bad.push('a spindle speed');
  if (!(zEff > 0)) bad.push('a flute count');
  if (bad.length) return refused(`Enter ${bad.join(', ')}. Each value must be greater than zero.`);

  if (machine.rpmMax > 0 && rpm > machine.rpmMax) {
    warnings.push({ code: 'rpm_clamped', message: `This machine has a maximum spindle speed of ${machine.rpmMax.toLocaleString('en-NZ')} rpm. The calculator reduced the spindle speed to that value.` });
    rpm = machine.rpmMax;
  }

  // The sheet's depth rule ends at 3xD, as the wood charts do, so a slot
  // deeper than that blocks with the same words. A cut under half the
  // diameter wide clears its chips sideways and never blocks on depth.
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

  const env = resolvePlasticBand(plastics, { material: input.material, toolType: input.toolType, diameterMm: D, finishing });
  if (!env.served) return refused(env.reason);
  const series = env.series;
  const facts = plastics.series[series];

  const fzBase = profileFz(env, input.profile ?? 'standard');
  const docRatio = ap / D;
  // The sheet's own depth rule: 1xD the printed chip load, 2xD less 25 per
  // cent, 3xD less 50 per cent, in straight lines between, as for wood. A
  // light-radial cut takes chip-thinning compensation instead.
  const derate = lightRadial ? 1 : depthDerate(docRatio, fam.depth_derating);
  const fzTarget = fzBase * derate;
  const ctfPhysical = chipThinningFactor(D, ae);
  // Finishing serves the 60-200 row as the chip to program, light
  // engagement included, the wood Finishing rule, so it is not compensated.
  const ctf = finishing ? 1 : ctfPhysical;
  const fzProg = fzTarget * ctf;

  const ideal = feedFromFz(fzProg, rpm, zEff);
  const caps = {};
  if (machine.feedMaxMmMin > 0) caps.vmax = machine.feedMaxMmMin;
  if (input.featureMm > 0 && machine.accelMs2 > 0) caps.corn = cornerFeedCapMmMin(input.featureMm, machine.accelMs2);
  const lim = applyLimits(ideal, caps);
  const final = lim.finalMmMin;
  if (!(final > 0) || !Number.isFinite(final)) {
    const capLabel = { vmax: 'machine feed', corn: 'corner' }[lim.binding] ?? lim.binding;
    return { status: 'blocked', block: { reason: `The ${capLabel} limit drives the feed to zero. This machine cannot make this cut as set up.`, binding: lim.binding, caps: lim.caps } };
  }
  const fzDeliv = final / (rpm * zEff);
  const fzEff = lim.binding === 'ideal' ? fzTarget : fzDeliv / ctf;
  const breakpointRpm = machine.breakpointRpm > 0 ? machine.breakpointRpm : rules.defaults.breakpoint_rpm;

  // What serves, in words a beginner can act on: the series, its shape and
  // its flutes. The per-tooth value is multiplied by the flute count entered,
  // the sheet's own formula, so the flute count matters here.
  const why = !finishing
    ? 'Onsrud names it the best tool at this size.'
    : fam.finishing.printed_as_finishing
      ? 'Onsrud names it for finishing.'
      : 'Onsrud names it for finishing hard plastic.';
  notes.push(`The chip load is Onsrud's ${label} value for its ${series}, a ${facts.words}. ${why} The feed counts the flutes you entered, so check that they match your own tool.`);
  if (!finishing && input.toolType !== 'upcut') {
    notes.push(`The ${TOOL_WORDS[input.toolType]} choice does not change this number. The chart below shows what Onsrud prints for ${TOOL_WORDS[input.toolType]} tools.`);
  }
  if (finishing && !fam.finishing.printed_as_finishing) {
    chartNotes.push(`The ${label} sheet names no finishing tool. It prints a ${series} row of its own, and the hard plastic sheet names ${series} as its finishing tool, so that row serves Finishing.`);
  }
  if (env.band.interpolated) {
    const [a, b] = env.band.between;
    notes.push(`Onsrud prints no value at ${mmWords(D)}. The chip load is interpolated between ${inchWords(a)} and ${inchWords(b)} on the ${series} row.`);
  }
  notes.push('No cutting-force data is published for plastic, so the spindle power and the hold-down checks did not run.');
  if (!finishing && (input.firstCut ?? rules.first_cut?.default_on)) {
    notes.push('First-cut mode does not apply to plastic. Onsrud\'s cure for chips that weld back is a higher feed, and a reduced first cut runs the other way.');
  }
  if (finishing && !(input.aeMm > 0)) {
    notes.push(`Finishing assumes a ${round1(ae)} mm skim on the wall. Enter a width of cut to change the skim.`);
  }

  // A machine limit that holds the chip under the printed band is the one
  // case where the calculator's number, not the maker's, makes the chip wrong.
  const capHeld = lim.binding !== 'ideal';
  const chipCheck = finishing ? fzDeliv : fzEff;
  if (capHeld && chipCheck < env.fzMin - 1e-9) {
    warnings.push({
      code: 'chip_below_band',
      message: `The ${HOLDER[lim.binding] ?? lim.binding} limit holds the chip at ${fz3(chipCheck)} mm/tooth, below the ${env.contributors[0]} band's low edge of ${fz3(env.fzMin)}. On ${label} a chip that thin can weld back to the cut and leave ${fam.defect}. Correct that limit first.`,
    });
  }
  if (input.fluteLengthMm > 0 && ap > input.fluteLengthMm + 1e-9) {
    warnings.push({ code: 'past_flutes', message: `The pass is ${round1(ap)} mm deep and the flutes are ${round1(input.fluteLengthMm)} mm long. The shank rubs the wall above the flutes. Use a longer tool or a shallower pass.` });
  }

  // The maker's own advice for the family, printed under its table. The
  // spoilboard sentence is for a down-cut spiral, as the sheet says.
  const advice = [
    'If the chips weld back to the cut, increase the feed or change to a single-edge tool.',
    ...(input.material === 'soft_plastic' && input.toolType === 'downcut'
      ? ['With a down-cut spiral, cut a slot in the spoilboard so the chips have room to expand.']
      : []),
    `A wrong chip load leaves ${fam.defect}.`,
  ];

  const plungeRatio = rules.plunge_ramp.ratio_of_cutting_feed;
  const leadRatio = rules.lead_in_out.ratio_of_cutting_feed;
  const h = meanChipThicknessMm(fzDeliv, ae, D);

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
        source: env.contributors[0], rpm, breakpointRpm, availKw: 0,
        footprintCm2: input.footprintCm2, featureMm: input.featureMm, accelMs2: machine.accelMs2,
        firstCutFactor: 1,
      }),
      caps: lim.caps,
    },
    warnings,
    notes,
    advice: { title: `Onsrud's advice for ${label}`, lines: advice },
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
      ballNose: false,
      bullNose: false,
      cornerRadiusMm: null,
      cuttingDiameterMm: D,
      lightRadial,
      fluteLengthMm: input.fluteLengthMm > 0 ? input.fluteLengthMm : undefined,
      fzPhysical: fzDeliv / ctfPhysical,
      firstCut: { applied: false, factor: 1 },
      kcModel: null,
      kcUsedNmm2: undefined,
      meanChipMm: h,
      powerKw: undefined,
      availKw: undefined,
      torqueNm: undefined,
      gripN: undefined,
      zEff,
      apMm: ap,
      depthUnstated: false,
      aeMm: ae,
      dMm: D,
      material: input.material,
      chipFloor: null,
      breakpointRpm,
      accelMs2: machine.accelMs2,
      featureMm: input.featureMm,
      footprintCm2: input.footprintCm2,
      plastic: {
        family: input.material,
        label,
        series,
        seriesName: facts.name,
        seriesFlutes: facts.flutes,
        interpolated: env.band.interpolated,
        printedAt: env.band.at ? env.band.at.diameter_printed : null,
        between: env.band.between ? env.band.between.map((e) => e.diameter_printed) : null,
        bandIn: { min: env.band.loIn, max: env.band.hiIn },
        defect: fam.defect,
      },
    },
  };
}
