// Layer 1: chip-load identity, envelope construction over vendor entries,
// Gentle/Standard/Aggressive profiles, depth derating, radial chip thinning.

export function fzFromFeed(vfMmMin, rpm, z) {
  return vfMmMin / (rpm * z);
}

export function feedFromFz(fzMm, rpm, z) {
  return fzMm * rpm * z;
}

export function surfaceSpeedMMin(dMm, rpm) {
  return (Math.PI * dMm * rpm) / 1000;
}

export function rpmFromSurfaceSpeed(vcMMin, dMm) {
  return (vcMMin * 1000) / (Math.PI * dMm);
}

// Published bands assume DOC <= 1×D. Continuous piecewise derate through the
// anchors published in chiploads.json depth_derating (100/75/50% at 1×/2×/3×D).
// calculate() blocks past 3×D (rules.json depth_limit, 2026-08-29), so the
// hyperbolic tail below only serves a headless caller that skips the block.
export function depthDerate(docRatio, anchors) {
  const a1 = anchors?.['1xD'] ?? 1;
  const a2 = anchors?.['2xD'] ?? 0.75;
  const a3 = anchors?.['3xD'] ?? 0.5;
  if (docRatio <= 1) return a1;
  if (docRatio <= 2) return a1 + (a2 - a1) * (docRatio - 1);
  if (docRatio <= 3) return a2 + (a3 - a2) * (docRatio - 2);
  return a3 * (3 / docRatio);
}

// Radial chip thinning: applies only below 50% radial engagement.
export function chipThinningFactor(dMm, aeMm) {
  if (aeMm >= dMm / 2) return 1;
  return dMm / (2 * Math.sqrt(aeMm * (dMm - aeMm)));
}

// Ball and bull nose geometry (2026-09-02, generalised 2026-09-03). All of
// these are display values. None changes a served speed or feed, because no
// wood source publishes a rule that does: every maker that prints an
// effective-diameter correction works in metal, and the two that print a feed
// multiplier disagree about the base it starts from
// (research-session-6-ball-surfacing.md).
//
// The effective cutting diameter of a round-ended tool at an axial depth ap is
// the flat across its tip plus the chord across the corner at the bottom of
// the cut. Five makers print the ball case in four algebraic forms and all
// four are the same expression. The toroidal form below covers a bull nose as
// well, and it reduces EXACTLY to the ball case when the corner radius is half
// the diameter: the flat term (D - 2R) goes to zero and the chord term becomes
// 2*sqrt(ap*(D - ap)). Checked to the last digit at three sizes.
//
// Past the corner radius the corner is fully buried and the full diameter cuts.
export function effectiveDiameterMm(dMm, apMm, cornerRadiusMm) {
  const r = cornerRadiusMm > 0 ? cornerRadiusMm : dMm / 2;
  if (!(dMm > 0) || !(apMm > 0)) return 0;
  if (apMm >= r) return dMm;
  return (dMm - 2 * r) + 2 * Math.sqrt(r * r - (r - apMm) * (r - apMm));
}

// Scallop (cusp) height left between two passes a stepover apart. The first
// argument is the CORNER diameter, not the tool diameter: the ridge comes off
// the rounded corner that touches the surface, so on a ball it is the tool
// diameter and on a bull nose it is twice the corner radius. Treating a
// 12.7 mm bull nose with a 1.5 mm corner as a 12.7 mm ball reports 0.032 mm
// where the real ridge is 0.141 mm, four and a half times smoother than the
// truth (2026-09-03).
//
// The exact form, not the parabolic ae^2/(8R) approximation, which understates
// by up to 4% at a 40% stepover and costs nothing to avoid. A stepover at or
// past the corner diameter leaves the full corner radius standing.
export function scallopHeightMm(cornerDiameterMm, aeMm) {
  const r = cornerDiameterMm / 2;
  if (!(r > 0) || !(aeMm > 0)) return 0;
  if (aeMm >= cornerDiameterMm) return r;
  return r - Math.sqrt(r * r - (aeMm / 2) * (aeMm / 2));
}

// Beginner tool types map onto data geometry classes. Decision D1: the
// geometry-unspecified generic charts (Freud, Rennie, Vortex, ITA) join the
// spiral envelopes only — Rennie's own row is noted "up/down cut only, NOT
// compression". Decision D5: down-cut is served by the spiral envelope
// (Onsrud's chart row covers series 52-200 and 57-200 together).
// A ball nose maps to its own geometry class and nothing else (2026-09-02,
// research session 6). Only the Amana ball nose chart carries that class, so a
// flat tool can never pick up a ball band and a ball can never pick up a flat
// one. The generic geometry-unspecified charts do NOT join it either: they are
// flat-tool charts that happen to name no tool type, and a ball's cut removes
// stock along a curved edge whose engaged diameter changes with the depth.
const GEOMETRY_FOR_TOOL = {
  upcut: ['spiral_upcut', 'spiral_downcut'],
  downcut: ['spiral_upcut', 'spiral_downcut'],
  compression: ['compression_spiral'],
  straight: ['straight'],
  ball: ['ball_nose'],
};

const SPIRAL_TOOL_TYPES = new Set(['upcut', 'downcut']);

// The tool types that never fall back to a generic chart or to another
// material's chart. A ball nose is served by one chart in three materials, and
// where that chart says nothing the honest answer is a refusal: no published
// chart covers a ball nose in plywood, melamine, particleboard or HPL.
const NO_FALLBACK_TOOL_TYPES = new Set(['ball']);

// A spiral entry serves the opposite cutting direction only when its data row
// says so (covers_directions, the D5 amendment) — an up-cut-only series must
// never set down-cut numbers silently.
function servesDirection(e, toolType) {
  if (toolType === 'downcut' && e.tool_geometry === 'spiral_upcut') {
    return (e.covers_directions ?? []).includes('downcut');
  }
  if (toolType === 'upcut' && e.tool_geometry === 'spiral_downcut') {
    return (e.covers_directions ?? []).includes('upcut');
  }
  return true;
}

const TOOL_PROSE = {
  upcut: 'up-cut spiral', downcut: 'down-cut spiral', compression: 'compression', straight: 'straight',
  ball: 'ball nose',
};

const MATERIAL_PROSE = {
  mdf: 'MDF', laminated_pb: 'melamine', laminated_chipboard: 'melamine',
  plywood: 'hard plywood', softwood_ply: 'soft plywood', hpl: 'HPL',
};

function matProse(material) {
  return MATERIAL_PROSE[material] ?? String(material).replace(/_/g, ' ');
}

function inScope(e, toolType) {
  return !(e.excludes_tool_types ?? []).includes(toolType);
}

// The ball nose chart and the flat-tool charts never appear on each other's
// ladders (2026-09-02). The exclusion runs both ways on purpose. A flat chip
// load drawn beside a ball's reads as headroom the ball does not have, and a
// ball's drawn beside a flat tool's reads as a chart the flat tool could use.
// Neither is an alternative for the other's cut: the same material, the same
// diameter and a different cutting edge is a different number entirely.
function sameToolFamily(e, toolType) {
  const isBallEntry = e.tool_geometry === 'ball_nose';
  return isBallEntry === (toolType === 'ball');
}

export function selectEntries(entries, { material, materials, materialsFallback, toolType, finishing }) {
  const wanted = GEOMETRY_FOR_TOOL[toolType];
  if (!wanted) throw new Error(`Unknown tool type: ${toolType}`);
  const matSet = new Set(materials ?? [material]);
  const ofMaterial = entries.filter((e) => matSet.has(e.material) && !e.superseded_by);
  // Finishing serves the finisher-series charts: the only published finishing
  // chip loads (research session 4, Scott's serving decision 2026-08-29). The
  // borrow across tool families is deliberate and calculate() names it in a
  // note. Every chart the tool itself could read stays visible as context.
  // When no finisher chart covers the pick, this returns empty and the caller
  // falls back to the published minimum chip; the generic charts must not
  // serve a finish target, so no generic fallback applies here.
  if (finishing) {
    const finisherOf = (rows) => rows.filter((e) => e.tool_geometry === 'finisher');
    let finisherRows = finisherOf(ofMaterial);
    const finNotes = [];
    // No finisher chart is published for the other panels. The MDF finisher
    // chart, the lowest of the three, serves them as the nearest published
    // finishing chip (Scott, 2026-08-29), the same shape as the soft-ply
    // borrow below. Solid timber never borrows: both species have rows.
    if (!finisherRows.length && isPanelMaterial(material)) {
      finisherRows = finisherOf(entries.filter((e) => e.material === 'mdf' && !e.superseded_by));
      if (finisherRows.length) {
        finNotes.push(`No finisher chart is published for ${matProse(material)}. The MDF finisher chart serves the finish chip as the nearest published finishing chip loads. It is the lowest of the three finisher charts.`);
      }
    }
    const context = ofMaterial.filter((e) => e.tool_geometry !== 'finisher' && inScope(e, toolType) && sameToolFamily(e, toolType));
    return { entries: finisherRows, primary: finisherRows, context, notes: finNotes };
  }
  const exact = ofMaterial.filter((e) => wanted.includes(e.tool_geometry) && servesDirection(e, toolType));
  const generic = ofMaterial.filter((e) => e.tool_geometry === 'unspecified');
  const notes = [];
  if (exact.length) {
    // Everything of the material that is not serving renders as named context
    // (D11), except charts whose own source excludes this tool type.
    // A ball nose is the exception (2026-09-02). The other charts for the
    // material are flat-tool chip loads, and a flat tool's number drawn on the
    // same scale as a ball's is not an alternative for this cut: it is three
    // to five times higher and reads as headroom the tool does not have. The
    // ladder shows the ball chart alone.
    const serving = new Set(exact);
    // The ladder record for a ball nose is NOT pushed here (corrected
    // 2026-09-03). calculate() rebuilds a refusal reason from these notes
    // minus the coverage notes, so a sentence pushed on the serving branch
    // becomes the whole refusal when the chart later drops out on diameter
    // coverage. A 1 inch ball then refused with a sentence about other tool
    // shapes and never mentioned the diameter. The record now lives in
    // calculate()'s chartNotes, where it cannot become a reason.
    const context = NO_FALLBACK_TOOL_TYPES.has(toolType)
      ? []
      : ofMaterial.filter((e) => !serving.has(e) && inScope(e, toolType) && sameToolFamily(e, toolType));
    return { entries: exact, primary: exact, context, notes };
  }
  // A ball nose never borrows. No generic chart and no other material's chart
  // may set a ball number, so a pick with no ball chart refuses here with the
  // reason (2026-09-02, research session 6: no maker publishes a ball nose
  // chip load for plywood, melamine, particleboard or HPL).
  if (NO_FALLBACK_TOOL_TYPES.has(toolType)) {
    notes.push(`No published chart covers a ${TOOL_PROSE[toolType]} in ${matProse(material)}. The calculator gives no number without a source.`);
    return { entries: [], primary: [], context: [], notes };
  }
  // Material-level fallback for a geometry gap: soft plywood publishes no
  // spiral row, so spiral picks ride the hard-plywood chart (conservative for
  // the softer board) rather than a big-iron generic chart.
  if (materialsFallback?.length) {
    const fbSet = new Set(materialsFallback);
    const fbExact = entries.filter((e) => fbSet.has(e.material) && !e.superseded_by
      && wanted.includes(e.tool_geometry) && servesDirection(e, toolType));
    if (fbExact.length) {
      const from = [...new Set(fbExact.map((e) => matProse(e.material)))].join(', ');
      notes.push(`No ${matProse(material)} chart covers ${TOOL_PROSE[toolType]} tools. The ${from} chart serves as the nearest match, and it reads conservative for this board.`);
      const context = ofMaterial.filter((e) => inScope(e, toolType) && sameToolFamily(e, toolType));
      return { entries: fbExact, primary: fbExact, context, notes };
    }
  }
  const scopedGeneric = generic.filter((e) => inScope(e, toolType));
  if (scopedGeneric.length) {
    notes.push('No chart for this material is resolved by tool geometry. Generic vendor values serve instead.');
    notes.push('These charts do not separate tool types, so the tool-type choice does not change these numbers.');
    const serving = new Set(scopedGeneric);
    const context = ofMaterial.filter((e) => !serving.has(e) && inScope(e, toolType) && sameToolFamily(e, toolType));
    return { entries: scopedGeneric, primary: scopedGeneric, context, notes };
  }
  if (generic.length) {
    const vendors = [...new Set(generic.map((e) => e.vendor))].join(', ');
    notes.push(`The only published chart for this material (${vendors}) covers up-cut and down-cut spirals only. Its own scope excludes ${TOOL_PROSE[toolType]} tools, so the calculator gives no number.`);
    return { entries: [], primary: [], context: [], notes };
  }
  return { entries: [], primary: [], context: [], notes };
}

// One chart = one (source, series) group. A chart contributes only near its
// published diameters: clamping a 12.7 mm-only generic chart onto a 3 mm tool
// would serve half-inch chip loads to a cutter that cannot take them.
function chartBands(selected, diameterMm, coverageTol) {
  const groups = new Map();
  for (const e of selected) {
    // Material is part of the chart identity: the same Onsrud series appears
    // in both the hard- and soft-plywood tables, and a merged UI pick
    // (plywood + softwood_ply) must keep those as two charts, not one.
    const key = `${e.source}|${e.series ?? ''}|${e.material}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }
  const bands = [];
  const notes = [];
  for (const rows of groups.values()) {
    const sized = rows.filter((r) => r.diameter_mm != null).sort((a, b) => a.diameter_mm - b.diameter_mm);
    const unsized = rows.filter((r) => r.diameter_mm == null);
    const label = rows[0].series ? `${rows[0].vendor} ${rows[0].series}` : rows[0].vendor;
    let band = null;
    if (sized.length) {
      const lo = sized[0].diameter_mm;
      const hi = sized[sized.length - 1].diameter_mm;
      if (diameterMm < lo * (1 - coverageTol) || diameterMm > hi * (1 + coverageTol)) {
        notes.push(`${label} publishes no values near ${diameterMm} mm (nearest ${diameterMm < lo ? lo : hi} mm), so that chart does not contribute.`);
        continue;
      }
      band = interpolateBand(sized, diameterMm);
      if (diameterMm < lo || diameterMm > hi) {
        notes.push(`${label} publishes nothing at ${diameterMm} mm. The nearest published values (${band.atMm} mm) serve.`);
      }
    } else if (unsized.length) {
      band = { lo: Math.min(...unsized.map((r) => r.fz_min_mm)), hi: Math.max(...unsized.map((r) => r.fz_max_mm)) };
    }
    if (!band) continue;
    bands.push({
      label,
      source: rows[0].source,
      geometry: rows[0].tool_geometry,
      machineClass: rows[0].machine_class ?? null,
      lo: band.lo,
      hi: band.hi,
      mid: (band.lo + band.hi) / 2,
      switchable: rows.some((r) => String(r.flute_basis).endsWith('user_switchable')),
    });
  }
  return { bands, notes };
}

// Decision D11: the served band comes from the geometry-and-diameter-matched
// charts. When the charts eligible to serve disagree by more than the
// disagreement ratio in midpoint, the most conservative chart serves alone.
// Everything not serving renders as named context, never silently dropped.
const GEO_PROSE = {
  spiral_upcut: 'spiral', spiral_downcut: 'spiral', compression_spiral: 'compression',
  compression_chipbreaker_finisher: 'compression chipbreaker', chipbreaker_finisher: 'chipbreaker finisher',
  hogger_low_helix_chipbreaker: 'low-helix hogger', hogger_high_helix_chipbreaker: 'high-helix hogger',
  finisher: 'finisher', straight: 'straight', straight_o_flute: 'O-flute', unspecified: 'generic chart',
  ball_nose: 'ball nose',
};

export function resolveBand(entries, { material, materials, materialsFallback, toolType, diameterMm, finishing }, envRules) {
  const coverageTol = envRules?.coverage_tolerance ?? 0.25;
  const disagreement = envRules?.disagreement_ratio ?? 2.0;
  const sel = selectEntries(entries, { material, materials, materialsFallback, toolType, finishing });
  const notes = [...sel.notes];
  const primary = chartBands(sel.primary, diameterMm, coverageTol);
  const contextResult = chartBands(sel.context, diameterMm, coverageTol);
  // Coverage notes ("publishes no values near...") stay true whatever serves.
  // The serving narrative in `notes` does not, so the two return separately
  // and a caller that overrides the serve (the finishing floor fallback)
  // can keep the first without repeating the second.
  const coverageNotes = [...primary.notes, ...contextResult.notes];
  notes.push(...coverageNotes);
  const servedGeometries = new Set(sel.primary.map((e) => e.tool_geometry));
  let serving = primary.bands;
  // Context bands from a different tool family than the pick are labelled
  // with their class, so a compression result can show the finisher and
  // hogger ladder without those numbers reading as available for this tool.
  let context = [...contextResult.bands].map((b) => (
    servedGeometries.has(b.geometry) ? b : { ...b, label: `${b.label} (${GEO_PROSE[b.geometry] ?? b.geometry})` }
  ));
  if (!finishing && !serving.length && context.length) {
    const generic = context.filter((b) => b.geometry === 'unspecified');
    if (generic.length) {
      serving = generic;
      context = context.filter((b) => b.geometry !== 'unspecified');
      notes.push('The geometry-matched charts do not cover this diameter. Generic chart values serve instead.');
    }
  }
  if (!serving.length) return { served: false, notes, coverageNotes };
  if (serving.length > 1) {
    const mids = serving.map((b) => b.mid);
    if (Math.max(...mids) / Math.min(...mids) > disagreement) {
      serving.sort((a, b) => a.mid - b.mid);
      context.push(...serving.slice(1));
      serving = [serving[0]];
      notes.push(`The published charts for this cut disagree by more than ${disagreement}×, so the most conservative one (${serving[0].label}) sets the band.`);
    }
  }
  // Non-serving charts return as structured context bands, sorted low to
  // high. The UI draws them as a chart ladder; no prose list is built here.
  context = context.slice().sort((a, b) => a.lo - b.lo);
  return {
    served: true,
    fzMin: Math.min(...serving.map((b) => b.lo)),
    fzMax: Math.max(...serving.map((b) => b.hi)),
    contributors: [...new Set(serving.map((b) => b.label))],
    sources: [...new Set(serving.map((b) => b.source))],
    servingBands: serving,
    context,
    notes,
    coverageNotes,
    hasSwitchableBasis: serving.some((b) => b.switchable),
    allBigIron: serving.every((b) => b.machineClass === 'big_iron_10hp_plus'),
  };
}

function interpolateBand(sortedRows, dMm) {
  const first = sortedRows[0];
  const last = sortedRows[sortedRows.length - 1];
  if (dMm <= first.diameter_mm) return { lo: first.fz_min_mm, hi: first.fz_max_mm, atMm: first.diameter_mm };
  if (dMm >= last.diameter_mm) return { lo: last.fz_min_mm, hi: last.fz_max_mm, atMm: last.diameter_mm };
  for (let i = 0; i < sortedRows.length - 1; i++) {
    const a = sortedRows[i];
    const b = sortedRows[i + 1];
    if (dMm >= a.diameter_mm && dMm <= b.diameter_mm) {
      const t = (dMm - a.diameter_mm) / (b.diameter_mm - a.diameter_mm);
      return {
        lo: a.fz_min_mm + t * (b.fz_min_mm - a.fz_min_mm),
        hi: a.fz_max_mm + t * (b.fz_max_mm - a.fz_max_mm),
        atMm: dMm,
      };
    }
  }
  return { lo: last.fz_min_mm, hi: last.fz_max_mm, atMm: last.diameter_mm };
}

// D7: gentle/standard/aggressive are the low edge, midpoint and high edge of
// the merged envelope — a project convention recorded in chiploads.json.
// Finishing also serves the low edge: the measured surface-quality lever is a
// smaller chip (research session 4), and the low edge is the smallest sourced
// number. What separates it from gentle is the assumed skim in calculate().
export function profileFz(envelope, profile) {
  if (profile === 'gentle' || profile === 'finishing') return envelope.fzMin;
  if (profile === 'aggressive') return envelope.fzMax;
  return (envelope.fzMin + envelope.fzMax) / 2;
}

const PANEL_MATERIALS = new Set([
  'mdf', 'particleboard', 'laminated_pb', 'laminated_chipboard', 'plywood', 'softwood_ply', 'hpl',
]);

export function isPanelMaterial(material) {
  return PANEL_MATERIALS.has(material);
}

// The floor is checked on the EFFECTIVE chip (programmed fz ÷ thinning factor)
// and is the only limit that ever asks for the feed to be raised. All three
// thresholds come from rules.json chip_floor_mm_per_tooth.
export function chipFloorStatus(fzEffMm, material, floorRule) {
  if (!isPanelMaterial(material)) {
    return fzEffMm < floorRule.plough_below ? 'thin' : 'ok';
  }
  if (fzEffMm < floorRule.plough_below) return 'plough';
  if (fzEffMm < floorRule.warn_below) return 'below_min';
  if (fzEffMm < (floorRule.marginal_below ?? 0.14)) return 'marginal';
  return 'ok';
}
