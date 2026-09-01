// Data-integrity sweep. Runs in node on every test run and in the browser at
// page load. An entry without provenance is rejected — it must never render.

import { bandAtRpm } from '../core/drilling.js';

// Vocabulary mirrors data/schema.md. A typo in any of these fields silently
// changes or deletes safety output, so the gate rejects unknown values.
const MATERIALS = new Set(['mdf', 'particleboard', 'laminated_pb', 'laminated_chipboard', 'hardwood', 'softwood', 'plywood', 'softwood_ply', 'hpl']);
const GEOMETRIES = new Set(['straight', 'spiral_upcut', 'spiral_downcut', 'compression_spiral', 'compression_chipbreaker_finisher', 'chipbreaker_finisher', 'hogger_low_helix_chipbreaker', 'hogger_high_helix_chipbreaker', 'finisher', 'straight_o_flute', 'unspecified']);
const DIRECTIONS = new Set(['upcut', 'downcut']);
const TOOL_TYPES = new Set(['upcut', 'downcut', 'compression', 'straight']);
const MACHINE_CLASSES = new Set(['big_iron_10hp_plus']);

// Drilling vocabulary. FACTOR_MATERIALS is deliberately its own namespace and does
// not extend MATERIALS: Leitz names factor rows the calculator has no pick for
// (veneered chipboard, glulam), and adding those to MATERIALS would offer routing
// picks that every chip-load chart refuses. drills.material_factor_map is the only
// join between the two.
const DRILL_FAMILIES = new Set(['dowel_drill', 'through_hole_drill', 'boring_pin', 'hinge_drill', 'turnblade_hinge_drill', 'twist_drill', 'levin_drill', 'cylinder_head_drill']);
const DRILL_EDGE_MATERIALS = new Set(['HW_tipped', 'HW_solid', 'HS_solid', 'DP_tipped']);
const DRILL_MACHINE_CLASSES = new Set(['cnc_machining_centre', 'point_to_point', 'through_feed', 'drill_bank', 'multi_spindle', 'hinge_boring', 'column_drill', 'portable_drill', 'special_purpose_drill', 'drilling_machine']);
// Decision 1 (2026-09-01): the scope is CNC machining centres and drill banks. An
// entry aimed only at drill presses may be recorded but must never serve, so the
// gate enforces the scope rather than a comment doing it.
const SERVED_MACHINE_CLASSES = new Set(['cnc_machining_centre', 'point_to_point', 'through_feed', 'drill_bank', 'multi_spindle', 'hinge_boring']);
const FACTOR_MATERIALS = new Set(['chipboard_plastic_coated', 'chipboard_uncoated', 'chipboard_veneered_or_paper_coated', 'mdf', 'mdf_plastic_coated', 'solid_wood', 'softwood', 'hardwood', 'glulam', 'plywood', 'laminated_veneer_lumber', 'hpl']);
const CLEARING_KINDS = new Set(['max_infeed_ratio_of_d', 'clearing_stroke_required', 'clearing_stroke_recommended_past', 'no_clearing_stroke_to_ratio', 'no_clearing_stroke_to_depth_mm', 'feed_factor_past_ratio']);
const BAND_BASES = new Set(['mm_per_rev']);

export function validateData({ chiploads, kc, machines, rules, drills }) {
  const errors = [];
  const warnings = [];

  chiploads.entries.forEach((e, i) => {
    const id = `chiploads entry ${i} (${e.vendor ?? '?'} ${e.series ?? ''} ${e.material ?? '?'})`;
    if (!e.source) errors.push(`${id}: missing source`);
    else if (!chiploads.sources[e.source]) errors.push(`${id}: source key "${e.source}" not in sources map`);
    if (!e.data_class) errors.push(`${id}: missing data_class`);
    if (!e.vendor) errors.push(`${id}: missing vendor`);
    if (!MATERIALS.has(e.material)) errors.push(`${id}: unknown material "${e.material}"`);
    if (!GEOMETRIES.has(e.tool_geometry)) errors.push(`${id}: unknown tool_geometry "${e.tool_geometry}"`);
    if (typeof e.fz_min_mm !== 'number' || typeof e.fz_max_mm !== 'number' || !(e.fz_min_mm > 0) || !(e.fz_max_mm > 0)) {
      errors.push(`${id}: chip load band must be positive numbers`);
    } else if (e.fz_min_mm > e.fz_max_mm) errors.push(`${id}: fz_min above fz_max`);
    for (const d of e.covers_directions ?? []) {
      if (!DIRECTIONS.has(d)) errors.push(`${id}: unknown covers_directions value "${d}"`);
    }
    for (const t of e.excludes_tool_types ?? []) {
      if (!TOOL_TYPES.has(t)) errors.push(`${id}: unknown excludes_tool_types value "${t}"`);
    }
    if (e.machine_class != null && !MACHINE_CLASSES.has(e.machine_class)) {
      errors.push(`${id}: unknown machine_class "${e.machine_class}"`);
    }
    if (e.source === 'ita' && !String(e.flute_basis).endsWith('user_switchable')) {
      errors.push(`${id}: ITA entry must carry the user-switchable flute basis`);
    }
  });

  kc.affine_models.forEach((m, i) => {
    const id = `kc affine model ${i} (${m.material} ${m.tool} ${m.direction})`;
    if (!m.source) errors.push(`${id}: missing source`);
    if (!m.data_class) errors.push(`${id}: missing data_class`);
    if (m.tool === 'spiral_30' && m.Int !== 0) errors.push(`${id}: spiral_30 must have Int = 0`);
    if (!(m.Ks > 0)) errors.push(`${id}: non-positive Ks`);
  });

  if (!kc.osb || kc.osb.modellable !== false || !kc.osb.reason) {
    errors.push('kc.osb: the OSB refusal entry must exist with modellable=false and a reason');
  }
  if (!kc.speed_caveat || !kc.speed_caveat.uplift) {
    errors.push('kc.speed_caveat: the IWMS-25 production-speed caveat must exist');
  }

  machines.machines.forEach((m, i) => {
    if (!m.data_class) errors.push(`machine ${i} (${m.make} ${m.model}): missing data_class`);
  });
  (machines.spindles_hsd ?? []).forEach((s, i) => {
    if (!s.data_class) warnings.push(`spindle ${i} (${s.model}): missing data_class`);
  });

  for (const [key, rule] of Object.entries(rules)) {
    if (key === 'schema_version' || key === 'sources') continue;
    if (!rule.source) errors.push(`rules.${key}: missing source`);
    else if (!rules.sources[rule.source]) errors.push(`rules.${key}: source key "${rule.source}" not in sources map`);
    if (!rule.data_class) errors.push(`rules.${key}: missing data_class`);
  }

  validateDrills(drills, rules, errors);

  return { errors, warnings };
}

// A wrong drilling number goes to someone's spindle exactly as a wrong routing one
// does, so this gate is as hard as the chip-load gate. Two checks here are the whole
// reason the drilling data can be trusted: a band must span its own published speed
// range at both ends, because a misread diagram picks up a neighbouring chart and
// stops short; and where a diagram prints a worked example, that example must land
// inside the band read off it. Both turn the research's per-page validation into
// something that runs on every test run and every page load.
function validateDrills(drills, rules, errors) {
  if (!drills || !Array.isArray(drills.entries)) {
    errors.push('drills: the drilling data file must exist and carry an entries array');
    return;
  }

  const ratioRange = rules.drilling?.band_ratio_sanity ?? [1.3, 5.5];
  const coverageMin = rules.drilling?.band_coverage_min ?? 0.6;
  const map = drills.material_factor_map;
  if (!map || !map.map) errors.push('drills.material_factor_map: missing');
  else {
    if (!map.source) errors.push('drills.material_factor_map: missing source');
    else if (!drills.sources[map.source]) errors.push(`drills.material_factor_map: source key "${map.source}" not in sources map`);
    if (!map.data_class) errors.push('drills.material_factor_map: missing data_class');
    for (const [pick, candidates] of Object.entries(map.map)) {
      if (!MATERIALS.has(pick)) errors.push(`drills.material_factor_map: unknown material "${pick}"`);
      if (!Array.isArray(candidates) || candidates.length === 0) {
        errors.push(`drills.material_factor_map.${pick}: needs at least one candidate factor row`);
        continue;
      }
      for (const c of candidates) {
        if (!FACTOR_MATERIALS.has(c)) errors.push(`drills.material_factor_map.${pick}: unknown factor row "${c}"`);
      }
    }
  }

  const seenIds = new Set();
  drills.entries.forEach((e, i) => {
    const id = `drills entry ${i} (${e.subfamily_id ?? '?'})`;
    if (!e.source) errors.push(`${id}: missing source`);
    else if (!drills.sources[e.source]) errors.push(`${id}: source key "${e.source}" not in sources map`);
    if (!e.data_class) errors.push(`${id}: missing data_class`);
    if (!e.subfamily_id) errors.push(`${id}: missing subfamily_id`);
    else if (seenIds.has(e.subfamily_id)) errors.push(`${id}: duplicate subfamily_id`);
    else seenIds.add(e.subfamily_id);
    if (!e.label) errors.push(`${id}: missing label`);
    if (!DRILL_FAMILIES.has(e.family)) errors.push(`${id}: unknown family "${e.family}"`);
    if (!DRILL_EDGE_MATERIALS.has(e.edge_material)) errors.push(`${id}: unknown edge_material "${e.edge_material}"`);
    if (!Number.isInteger(e.teeth) || !(e.teeth > 0)) errors.push(`${id}: teeth must be a positive integer`);
    if (typeof e.serves !== 'boolean') errors.push(`${id}: serves must be true or false`);

    const classes = e.machine_classes;
    if (!Array.isArray(classes) || classes.length === 0) errors.push(`${id}: machine_classes must list at least one machine class`);
    else {
      for (const c of classes) {
        if (!DRILL_MACHINE_CLASSES.has(c)) errors.push(`${id}: unknown machine class "${c}"`);
      }
      if (e.serves === true && !classes.some((c) => SERVED_MACHINE_CLASSES.has(c))) {
        errors.push(`${id}: serves is true but no machine class is in scope (decision 1: CNC machining centres and drill banks only)`);
      }
    }

    for (const m of e.materials ?? []) {
      if (!MATERIALS.has(m)) errors.push(`${id}: unknown material "${m}" in the tool's own scope`);
    }
    const rpmOk = typeof e.rpm_min === 'number' && typeof e.rpm_max === 'number' && e.rpm_min > 0 && e.rpm_max > e.rpm_min;
    if (!rpmOk) errors.push(`${id}: the published speed range must be two positive numbers, low below high`);
    // Absolute bounds, not just internal consistency. Without them a band with
    // every value multiplied by ten passed every check: the ratios, the ordering
    // and the speed coverage all still held. These are the outer edges of what a
    // wood drill can physically be, not a target.
    if (rpmOk && (e.rpm_min < 200 || e.rpm_max > 30000)) {
      errors.push(`${id}: a speed range of ${e.rpm_min}-${e.rpm_max} rpm is outside anything this chapter publishes`);
    }
    if (e.diameter_min_mm < 1 || e.diameter_max_mm > 80) {
      errors.push(`${id}: a diameter range of ${e.diameter_min_mm}-${e.diameter_max_mm} mm is outside anything this chapter publishes`);
    }
    if (e.rpm_recommended_min != null && rpmOk && (e.rpm_recommended_min < e.rpm_min || e.rpm_recommended_min > e.rpm_max)) {
      errors.push(`${id}: rpm_recommended_min sits outside the published speed range`);
    }
    if (!(e.diameter_min_mm > 0) || !(e.diameter_max_mm >= e.diameter_min_mm)) {
      errors.push(`${id}: the diameter range must be positive, low at or below high`);
    }

    const band = e.feed_band;
    if (!band) {
      errors.push(`${id}: missing feed_band`);
    } else {
      if (!band.source) errors.push(`${id}: feed_band missing source`);
      else if (!drills.sources[band.source]) errors.push(`${id}: feed_band source key "${band.source}" not in sources map`);
      if (band.data_class !== 'measured_chart_read') errors.push(`${id}: a feed band read off a diagram must carry data_class measured_chart_read`);
      if (!BAND_BASES.has(band.basis)) errors.push(`${id}: unknown feed band basis "${band.basis}"`);
      if (!FACTOR_MATERIALS.has(band.baseline_material)) errors.push(`${id}: unknown feed band baseline_material "${band.baseline_material}"`);

      const pts = band.points;
      if (!Array.isArray(pts) || pts.length < 2) {
        errors.push(`${id}: a feed band needs at least two read points`);
      } else {
        let shapeOk = true;
        pts.forEach((p, j) => {
          if (typeof p.rpm !== 'number' || typeof p.fn_min_mm_rev !== 'number' || typeof p.fn_max_mm_rev !== 'number') {
            errors.push(`${id}: feed band point ${j} must carry numbers, not strings`);
            shapeOk = false;
            return;
          }
          if (!(p.fn_min_mm_rev > 0) || !(p.fn_max_mm_rev > p.fn_min_mm_rev)) {
            errors.push(`${id}: feed band point ${j} must be a positive band, low below high`);
            shapeOk = false;
            return;
          }
          if (p.fn_min_mm_rev < 0.02 || p.fn_max_mm_rev > 2.5) {
            errors.push(`${id}: feed band point ${j} runs ${p.fn_min_mm_rev}-${p.fn_max_mm_rev} mm/rev, outside anything a wood drill takes`);
            shapeOk = false;
            return;
          }
          if (j > 0 && p.rpm <= pts[j - 1].rpm) {
            errors.push(`${id}: feed band point ${j} does not rise in spindle speed`);
            shapeOk = false;
            return;
          }
          const ratio = p.fn_max_mm_rev / p.fn_min_mm_rev;
          if (ratio < ratioRange[0] || ratio > ratioRange[1]) {
            errors.push(`${id}: feed band point ${j} spans ${ratio.toFixed(2)}x, outside the ${ratioRange[0]}-${ratioRange[1]}x the diagrams publish. That is a bad read, not a wide band.`);
          }
        });

        // The band must sit inside the tool's speed range and cover most of it.
        // Not all of it: a diagram sometimes draws its band over less than the
        // range the tool is rated for (the solid-carbide through-hole drill is
        // rated to 12,000 but its diagram stops near 9,000), and the polygons are
        // drawn a whisker inside the axis ends. Where the band stops, the feed
        // holds at that edge and the calculator says so. A band covering only a
        // little of the range is the misread this catches.
        if (shapeOk && rpmOk) {
          const bandLo = pts[0].rpm;
          const bandHi = pts[pts.length - 1].rpm;
          if (bandLo < e.rpm_min || bandHi > e.rpm_max) {
            errors.push(`${id}: the feed band runs ${bandLo}-${bandHi} rpm, outside the tool's published ${e.rpm_min}-${e.rpm_max}. A band beyond its own speed range is reading the wrong diagram.`);
          } else if ((bandHi - bandLo) / (e.rpm_max - e.rpm_min) < coverageMin) {
            errors.push(`${id}: the feed band covers ${bandLo}-${bandHi} rpm of the tool's published ${e.rpm_min}-${e.rpm_max}, too little of the range to trust the read.`);
          }
        }

        const ex = band.worked_example;
        // Every served tool must carry the operating point its own diagram
        // prints, because that is the only check that bounds the magnitude of a
        // read rather than its shape. Six entries once shipped without one,
        // because the reader's number pattern could not match a marker at 4,500
        // rpm, and nothing downstream noticed.
        if (ex == null && e.serves === true) {
          errors.push(`${id}: a served tool must carry the worked operating point printed on its own diagram`);
        }
        if (ex != null && shapeOk) {
          if (rpmOk && (ex.rpm < e.rpm_min || ex.rpm > e.rpm_max)) {
            errors.push(`${id}: the worked example sits outside the published speed range`);
          }
          const converted = (ex.vf_m_min * 1000) / ex.rpm;
          if (Math.abs(converted - ex.fn_mm_rev) > 1e-3) {
            errors.push(`${id}: the worked example does not convert: ${ex.vf_m_min} m/min at ${ex.rpm} rpm is ${converted.toFixed(4)} mm/rev, not ${ex.fn_mm_rev}`);
          }
          const at = bandAtRpm(band, ex.rpm);
          if (!at || ex.fn_mm_rev < at.fnMin - 1e-6 || ex.fn_mm_rev > at.fnMax + 1e-6) {
            errors.push(`${id}: the diagram's own worked example (${ex.fn_mm_rev} mm/rev at ${ex.rpm} rpm) falls outside the band read off that diagram. The read is wrong.`);
          }
        }
      }
    }

    const factors = e.material_factors;
    if (!Array.isArray(factors) || factors.length === 0) {
      errors.push(`${id}: missing material_factors`);
    } else {
      const seenMaterials = new Set();
      let baselineRows = 0;
      for (const f of factors) {
        if (!FACTOR_MATERIALS.has(f.material)) errors.push(`${id}: unknown factor row "${f.material}"`);
        if (seenMaterials.has(f.material)) errors.push(`${id}: duplicate factor row "${f.material}"`);
        seenMaterials.add(f.material);
        if (typeof f.factor !== 'number' || !(f.factor > 0)) errors.push(`${id}: factor for "${f.material}" must be a positive number`);
        else if (f.factor < 0.4 || f.factor > 2) errors.push(`${id}: a correction factor of ${f.factor} for "${f.material}" is outside anything this chapter publishes`);
        if (band && f.material === band.baseline_material && f.factor === 1) baselineRows += 1;
      }
      if (band && baselineRows !== 1) {
        errors.push(`${id}: the factor table must carry exactly one row at 1.0 for its baseline material "${band.baseline_material}"`);
      }
    }

    if (!('chip_clearing' in e)) {
      errors.push(`${id}: chip_clearing must be present, and null where the source publishes no rule. Silence is a value here (decision 5).`);
    } else if (e.chip_clearing != null) {
      const cc = e.chip_clearing;
      if (!cc.source) errors.push(`${id}: chip_clearing missing source`);
      else if (!drills.sources[cc.source]) errors.push(`${id}: chip_clearing source key "${cc.source}" not in sources map`);
      if (!cc.data_class) errors.push(`${id}: chip_clearing missing data_class`);
      if (!Array.isArray(cc.rules) || cc.rules.length === 0) errors.push(`${id}: chip_clearing carries no rules`);
      else {
        for (const r of cc.rules) {
          if (!CLEARING_KINDS.has(r.kind)) errors.push(`${id}: unknown chip-clearing rule "${r.kind}"`);
          if (r.ratio_of_d != null && !(r.ratio_of_d > 0)) errors.push(`${id}: chip-clearing ratio_of_d must be positive`);
          if (r.depth_mm != null && !(r.depth_mm > 0)) errors.push(`${id}: chip-clearing depth_mm must be positive`);
          if (r.factor != null && !(r.factor > 0)) errors.push(`${id}: chip-clearing factor must be positive`);
          for (const m of r.materials ?? []) {
            if (!FACTOR_MATERIALS.has(m)) errors.push(`${id}: unknown chip-clearing material "${m}"`);
          }
        }
      }
    }
  });
}
