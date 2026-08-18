// Cutting power, spindle torque and the affine kc model kc(h) = Ks + Int/h.
// Spiral tools (30° helix) carry Int = 0, so kc is flat; straight and insert
// tooling keeps the small-chip rise.

export function kcOfH(model, hMm) {
  return model.Ks + (model.Int || 0) / hMm;
}

export function meanChipThicknessMm(fzMm, aeMm, dMm) {
  return fzMm * Math.sqrt(aeMm / dMm);
}

export function mrrMm3Min(apMm, aeMm, vfMmMin) {
  return apMm * aeMm * vfMmMin;
}

export function cuttingPowerKw(kcNmm2, mrr) {
  return (kcNmm2 * mrr) / 6e7;
}

export function torqueNm(powerKw, rpm) {
  return (powerKw * 60000) / (2 * Math.PI * rpm);
}

// Constant torque below the breakpoint (power falls linearly), constant power above.
export function availablePowerKw(ratedKw, breakpointRpm, rpm) {
  return ratedKw * Math.min(1, rpm / breakpointRpm);
}

// kc model selection. The iwms25 rows are the primary affine set; the goli2018
// MDF-straight row is their measured validation anchor, not the served value.
// Materials without an affine model fall back to the legacy flat defaults in
// kc.json, labelled so the UI can say the value is a flat estimate.
const KC_MATERIAL_MAP = {
  mdf: 'mdf',
  particleboard: 'particleboard',
  laminated_pb: 'particleboard',
  laminated_chipboard: 'particleboard',
  plywood: 'plywood_poplar',
  softwood_ply: 'plywood_poplar',
};

const LEGACY_KC_KEY = {
  hpl: 'kc_dense_hardwood_hpl',
  hardwood: 'kc_dense_hardwood_hpl',
  softwood: 'kc_softwood',
};

export function toolFamilyFor(toolType) {
  return toolType === 'straight' ? 'straight' : 'spiral_30';
}

export function selectKcModel(kcData, material, toolFamily, direction) {
  const mapped = KC_MATERIAL_MAP[material];
  if (mapped) {
    const rows = kcData.affine_models.filter(
      (m) => m.material === mapped && m.tool === toolFamily && m.direction === direction,
    );
    rows.sort((a, b) => (a.source === 'iwms25' ? -1 : 1) - (b.source === 'iwms25' ? -1 : 1));
    if (rows.length) {
      const row = rows[0];
      return { Ks: row.Ks, Int: row.Int, source: row.source, data_class: row.data_class, material: mapped, mappedFrom: mapped === material ? null : material };
    }
  }
  const legacyKey = LEGACY_KC_KEY[material];
  if (legacyKey && kcData.defaults && kcData.defaults[legacyKey] != null) {
    return { Ks: kcData.defaults[legacyKey], Int: 0, source: 'kc.defaults', data_class: 'legacy_default', legacy: true, material };
  }
  return null;
}

// Power cap on feed. P(W) = kc(h)·ap·ae·Vf/60000 with h = c·Vf, c = √(ae/D)/(n·Z),
// so kc(h)·Vf = Ks·Vf + Int/c — linear in Vf. The cap solves in closed form.
export function powerFeedCapMmMin(availKw, model, apMm, aeMm, dMm, rpm, zEff) {
  const c = Math.sqrt(aeMm / dMm) / (rpm * zEff);
  const rhs = (availKw * 1000 * 60000) / (apMm * aeMm);
  const vf = (rhs - (model.Int || 0) / c) / model.Ks;
  return Math.max(0, vf);
}
