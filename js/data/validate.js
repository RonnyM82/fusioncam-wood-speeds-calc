// Data-integrity sweep. Runs in node on every test run and in the browser at
// page load. An entry without provenance is rejected — it must never render.

import { bandAtRpm } from '../core/drilling.js';

// Vocabulary mirrors data/schema.md. A typo in any of these fields silently
// changes or deletes safety output, so the gate rejects unknown values.
const MATERIALS = new Set(['mdf', 'particleboard', 'laminated_pb', 'laminated_chipboard', 'hardwood', 'softwood', 'plywood', 'softwood_ply', 'hpl']);
const GEOMETRIES = new Set(['straight', 'spiral_upcut', 'spiral_downcut', 'compression_spiral', 'compression_chipbreaker_finisher', 'chipbreaker_finisher', 'hogger_low_helix_chipbreaker', 'hogger_high_helix_chipbreaker', 'finisher', 'straight_o_flute', 'ball_nose', 'unspecified']);
const DIRECTIONS = new Set(['upcut', 'downcut']);
const TOOL_TYPES = new Set(['upcut', 'downcut', 'compression', 'straight', 'ball']);
const MACHINE_CLASSES = new Set(['big_iron_10hp_plus']);
// What a chart says about the cut its numbers are for. Every routing chart in
// the file says nothing, which is why the field is optional; the ball nose
// entries carry it explicitly, because there the silence is load-bearing
// (2026-09-02, research session 6).
const CUT_TYPES_PUBLISHED = new Set(['none']);

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

export function validateData({ chiploads, kc, machines, rules, drills, plastics }) {
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
    if (e.cut_type_published != null && !CUT_TYPES_PUBLISHED.has(e.cut_type_published)) {
      errors.push(`${id}: unknown cut_type_published "${e.cut_type_published}"`);
    }
    // A ball nose entry carries the two facts that make it safe to serve: the
    // chart's own silence about the cut type, and its printed feed band. The
    // second is the gate that keeps a broken chart out. Amana's 2D/3D carving
    // charts fail their own printed formula in five of twenty-five cells, and
    // this check is what would catch that before a number reached a spindle.
    if (e.tool_geometry === 'ball_nose') {
      if (e.cut_type_published !== 'none') {
        errors.push(`${id}: a ball nose entry must state cut_type_published`);
      }
      if (!(e.diameter_mm > 0)) errors.push(`${id}: a ball nose entry must carry a diameter`);
      if (e.flutes !== 2) errors.push(`${id}: the ball nose chart is a two-flute chart`);
      const pf = e.printed_feed_in_min;
      if (!pf || !(pf.rpm > 0) || !(pf.min > 0) || !(pf.max > 0)) {
        errors.push(`${id}: a ball nose entry must carry the chart's printed feed band`);
      } else if (typeof e.fz_min_mm === 'number' && typeof e.fz_max_mm === 'number') {
        // The maker's own formula, printed on the same page: feed rate equals
        // rpm times flutes times chip load. Both edges must agree with the
        // printed band, in the chart's own units.
        //
        // The tolerance is absolute AND relative, and a cell fails only when
        // it breaks both. Amana prints its feed bands on a ladder of round
        // tens, so a sound cell can sit a whole step out (180 computed
        // against 190 printed) while agreeing perfectly in substance. A
        // broken cell misses by far more than a rounding step: on Amana's
        // 2D/3D carving chart the two-flute 1/16 in wood cell prints 55-90
        // against a computed 108-180, which is a factor of two and fails
        // both tests. Measured across this chart the worst sound cell is
        // exactly one step out.
        const inPerMm = 1 / 25.4;
        const implied = [e.fz_min_mm, e.fz_max_mm].map((fz) => fz * inPerMm * pf.rpm * e.flutes);
        const printed = [pf.min, pf.max];
        const broken = implied.some((v, k) => Math.abs(v - printed[k]) > 10.0001
          && Math.abs(v - printed[k]) / printed[k] > 0.05);
        if (broken) {
          errors.push(`${id}: the printed feed band ${pf.min}-${pf.max} in/min disagrees with rpm x flutes x chip load (${implied[0].toFixed(0)}-${implied[1].toFixed(0)}) by more than a rounding step`);
        }
      }
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
  validatePlastics(plastics, errors);

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

// The plastics gate (2026-09-24). Every entry is one printed cell of an Onsrud
// plastics sheet, and the check here is that the cell still says what the
// entry claims: its printed text reads back to the same two numbers, its
// diameter is a column the sheet prints, and it names its source, page and
// edition, so any record can be audited against the PDF without the code.
const PLASTIC_FAMILIES = { soft_plastic: 120, hard_plastic: 121 };
const PLASTIC_COLUMNS = ['1/16', '3/32', '1/8', '5/32', '3/16', '7/32', '1/4', '5/16', '3/8', '7/16', '1/2', '9/16', '5/8', '3/4', '7/8', '1', '1 1/8', '1 1/4', '1 1/2', '1 3/4', '2'];
const SERIES_KINDS = new Set(['router', 'hss', 'engraving', 'ball_nose', 'edge_profile', 'taper']);
const SERIES_DIRECTIONS = new Set(['upcut', 'downcut', 'straight', 'both']);

function columnInches(col) {
  return col.split(' ').reduce((v, p) => {
    const [n, d] = p.split('/');
    return v + (d ? Number(n) / Number(d) : Number(n));
  }, 0);
}

// The printed band read back to numbers. A value printed without its decimal
// point reads as thousandths (the 56-000 and 56-000P cells at 3/16 in on the
// hard sheet, Scott's ruling).
function readPrinted(printed) {
  const halves = String(printed).replace(/\s+/g, '').split('-');
  if (halves.length !== 2) return null;
  const vals = halves.map((h) => {
    if (/^\.\d{3}$/.test(h)) return Number(`0${h}`);
    if (/^\d{3}$/.test(h)) return Number(`0.${h}`);
    return NaN;
  });
  return vals.every(Number.isFinite) ? vals : null;
}

function validatePlastics(plastics, errors) {
  if (!plastics || !Array.isArray(plastics.entries) || !plastics.families || !plastics.series) {
    errors.push('plastics: the plastics data file must exist and carry families, series and entries');
    return;
  }
  for (const [key, page] of Object.entries(PLASTIC_FAMILIES)) {
    const fam = plastics.families[key];
    const id = `plastics family ${key}`;
    if (!fam) {
      errors.push(`${id}: missing`);
      continue;
    }
    if (!fam.source || !plastics.sources?.[fam.source]) errors.push(`${id}: source missing or not in the sources map`);
    if (fam.page !== page) errors.push(`${id}: page must be ${page}`);
    if (fam.edition !== 'PCT-19') errors.push(`${id}: edition must be PCT-19`);
    const d = fam.depth_derating ?? {};
    if (d['1xD'] !== 1 || d['2xD'] !== 0.75 || d['3xD'] !== 0.5) {
      errors.push(`${id}: the depth rule must be the printed one, 1xD 100%, 2xD 75%, 3xD 50%`);
    }
    for (const s of [fam.serving?.below_split, fam.serving?.at_or_above_split, fam.finishing?.series]) {
      if (!plastics.entries.some((e) => e.family === key && e.series === s)) {
        errors.push(`${id}: the serving series "${s}" prints no row on this sheet`);
      }
    }
    if (fam.serving?.split_in !== 0.5) errors.push(`${id}: the sheet splits its tool tables at 1/2 in`);
    if (!Array.isArray(fam.picks) || fam.picks.length === 0) errors.push(`${id}: no material picks`);
    if (!fam.defect || !fam.note_printed) errors.push(`${id}: the sheet's printed note and the defect it names must be recorded`);
  }
  const pickIds = Object.values(plastics.families).flatMap((f) => (f.picks ?? []).map((p) => p.id));
  if (new Set(pickIds).size !== pickIds.length) errors.push('plastics: a material pick belongs to two families');

  for (const [name, s] of Object.entries(plastics.series)) {
    const id = `plastics series ${name}`;
    if (!SERIES_KINDS.has(s.kind)) errors.push(`${id}: unknown kind "${s.kind}"`);
    if (s.kind === 'router') {
      if (!SERIES_DIRECTIONS.has(s.direction)) errors.push(`${id}: a router series must state its cut direction`);
      if (!Number.isInteger(s.flutes) || !(s.flutes > 0)) errors.push(`${id}: a router series must state its flutes`);
      if (!s.words) errors.push(`${id}: a router series must carry its plain words`);
    }
    if (!s.source || !plastics.sources?.[s.source]) errors.push(`${id}: source missing or not in the sources map`);
    if (!(s.page > 0)) errors.push(`${id}: missing catalogue page`);
  }

  const seen = new Set();
  plastics.entries.forEach((e, i) => {
    const id = `plastics entry ${i} (${e.family ?? '?'} ${e.series ?? '?'} ${e.diameter_printed ?? '?'})`;
    if (!e.source) errors.push(`${id}: missing source`);
    else if (!plastics.sources?.[e.source]) errors.push(`${id}: source key "${e.source}" not in sources map`);
    if (!(e.family in PLASTIC_FAMILIES)) errors.push(`${id}: unknown family`);
    else if (e.page !== PLASTIC_FAMILIES[e.family]) errors.push(`${id}: page must be ${PLASTIC_FAMILIES[e.family]}`);
    if (e.edition !== 'PCT-19') errors.push(`${id}: edition must be PCT-19`);
    if (!e.data_class) errors.push(`${id}: missing data_class`);
    if (!plastics.series[e.series]) errors.push(`${id}: series not in the series map`);
    if (!PLASTIC_COLUMNS.includes(e.diameter_printed)) errors.push(`${id}: not a printed column`);
    else {
      const dIn = columnInches(e.diameter_printed);
      if (Math.abs(e.diameter_in - dIn) > 1e-6) errors.push(`${id}: diameter_in does not match the column`);
      if (Math.abs(e.diameter_mm - dIn * 25.4) > 1e-4) errors.push(`${id}: diameter_mm is not diameter_in x 25.4`);
    }
    if (typeof e.fz_min_in !== 'number' || typeof e.fz_max_in !== 'number' || !(e.fz_min_in > 0) || !(e.fz_max_in >= e.fz_min_in)) {
      errors.push(`${id}: the chip load band must be two positive numbers, low at or below high`);
    } else if (e.fz_max_in > 0.05) {
      errors.push(`${id}: ${e.fz_max_in} in/tooth is outside anything these sheets print`);
    }
    const back = readPrinted(e.printed);
    if (!back) errors.push(`${id}: the printed text "${e.printed}" does not read as a band`);
    else if (Math.abs(back[0] - e.fz_min_in) > 1e-9 || Math.abs(back[1] - e.fz_max_in) > 1e-9) {
      errors.push(`${id}: the printed text "${e.printed}" reads ${back[0]}-${back[1]}, not ${e.fz_min_in}-${e.fz_max_in}`);
    }
    const key = `${e.family}|${e.series}|${e.diameter_printed}`;
    if (seen.has(key)) errors.push(`${id}: duplicate cell`);
    seen.add(key);
  });
}
