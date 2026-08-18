// Data-integrity sweep. Runs in node on every test run and in the browser at
// page load. An entry without provenance is rejected — it must never render.

// Vocabulary mirrors data/schema.md. A typo in any of these fields silently
// changes or deletes safety output, so the gate rejects unknown values.
const MATERIALS = new Set(['mdf', 'particleboard', 'laminated_pb', 'laminated_chipboard', 'hardwood', 'softwood', 'plywood', 'softwood_ply', 'hpl']);
const GEOMETRIES = new Set(['straight', 'spiral_upcut', 'spiral_downcut', 'compression_spiral', 'compression_chipbreaker_finisher', 'chipbreaker_finisher', 'hogger_low_helix_chipbreaker', 'hogger_high_helix_chipbreaker', 'finisher', 'straight_o_flute', 'unspecified']);
const DIRECTIONS = new Set(['upcut', 'downcut']);
const TOOL_TYPES = new Set(['upcut', 'downcut', 'compression', 'straight']);
const MACHINE_CLASSES = new Set(['big_iron_10hp_plus']);

export function validateData({ chiploads, kc, machines, rules }) {
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

  return { errors, warnings };
}
