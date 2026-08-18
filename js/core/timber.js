// Solid-timber density handling. The Curti 2021 density-normalised model is
// valid between 287 and 1080 kg/m³; outside that the output is flagged, not
// silently extrapolated. Radiata pine has no direct measured Ks — it is
// mapped by density and must say so.

export function checkDensity(densityKgM3, timberModel) {
  const [lo, hi] = timberModel.validity_kg_m3;
  if (densityKgM3 < lo || densityKgM3 > hi) {
    return {
      valid: false,
      warning: `Density ${densityKgM3} kg/m³ is outside the solid-timber model range of ${lo} to ${hi} kg/m³. The result is an extrapolation, not a modelled value.`,
    };
  }
  return { valid: true };
}

export function radiataNote() {
  return 'Radiata pine is estimated from density. No direct radiata milling measurement exists.';
}
