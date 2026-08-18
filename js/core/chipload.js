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
// anchors published in chiploads.json depth_derating (100/75/50% at 1×/2×/3×D);
// the hyperbolic tail past 3×D is the project extension recorded in rules.json.
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

// Beginner tool types map onto data geometry classes. Decision D1: the
// geometry-unspecified generic charts (Freud, Rennie, Vortex, ITA) join the
// spiral envelopes only — Rennie's own row is noted "up/down cut only, NOT
// compression". Decision D5: down-cut is served by the spiral envelope
// (Onsrud's chart row covers series 52-200 and 57-200 together).
const GEOMETRY_FOR_TOOL = {
  upcut: ['spiral_upcut', 'spiral_downcut'],
  downcut: ['spiral_upcut', 'spiral_downcut'],
  compression: ['compression_spiral'],
  straight: ['straight'],
};

const SPIRAL_TOOL_TYPES = new Set(['upcut', 'downcut']);

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

export function selectEntries(entries, { material, materials, materialsFallback, toolType }) {
  const wanted = GEOMETRY_FOR_TOOL[toolType];
  if (!wanted) throw new Error(`Unknown tool type: ${toolType}`);
  const matSet = new Set(materials ?? [material]);
  const ofMaterial = entries.filter((e) => matSet.has(e.material) && !e.superseded_by);
  const exact = ofMaterial.filter((e) => wanted.includes(e.tool_geometry) && servesDirection(e, toolType));
  const generic = ofMaterial.filter((e) => e.tool_geometry === 'unspecified');
  const notes = [];
  if (exact.length) {
    // Everything of the material that is not serving renders as named context
    // (D11), except charts whose own source excludes this tool type.
    const serving = new Set(exact);
    const context = ofMaterial.filter((e) => !serving.has(e) && inScope(e, toolType));
    return { entries: exact, primary: exact, context, notes };
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
      const context = ofMaterial.filter((e) => inScope(e, toolType));
      return { entries: fbExact, primary: fbExact, context, notes };
    }
  }
  const scopedGeneric = generic.filter((e) => inScope(e, toolType));
  if (scopedGeneric.length) {
    notes.push('No chart for this material is resolved by tool geometry. Generic vendor values serve instead.');
    notes.push('These charts do not separate tool types, so the tool-type choice does not change these numbers.');
    const serving = new Set(scopedGeneric);
    const context = ofMaterial.filter((e) => !serving.has(e) && inScope(e, toolType));
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
};

export function resolveBand(entries, { material, materials, materialsFallback, toolType, diameterMm }, envRules) {
  const coverageTol = envRules?.coverage_tolerance ?? 0.25;
  const disagreement = envRules?.disagreement_ratio ?? 2.0;
  const sel = selectEntries(entries, { material, materials, materialsFallback, toolType });
  const notes = [...sel.notes];
  const primary = chartBands(sel.primary, diameterMm, coverageTol);
  const contextResult = chartBands(sel.context, diameterMm, coverageTol);
  notes.push(...primary.notes, ...contextResult.notes);
  const servedGeometries = new Set(sel.primary.map((e) => e.tool_geometry));
  let serving = primary.bands;
  // Context bands from a different tool family than the pick are labelled
  // with their class, so a compression result can show the finisher and
  // hogger ladder without those numbers reading as available for this tool.
  let context = [...contextResult.bands].map((b) => (
    servedGeometries.has(b.geometry) ? b : { ...b, label: `${b.label} (${GEO_PROSE[b.geometry] ?? b.geometry})` }
  ));
  if (!serving.length && context.length) {
    const generic = context.filter((b) => b.geometry === 'unspecified');
    if (generic.length) {
      serving = generic;
      context = context.filter((b) => b.geometry !== 'unspecified');
      notes.push('The geometry-matched charts do not cover this diameter. Generic chart values serve instead.');
    }
  }
  if (!serving.length) return { served: false, notes };
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
export function profileFz(envelope, profile) {
  if (profile === 'gentle') return envelope.fzMin;
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
