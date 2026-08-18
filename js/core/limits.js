// Layer 2: every cap in mm/min, the final feed is the minimum, and the
// binding limit is reported in plain language. Ties go to "no limit applies".

export function cornerMinLengthMm(vfMmMin, accelMs2) {
  const v = vfMmMin / 60000;
  return ((v * v) / accelMs2) * 1000;
}

// Inverse of L = v²/a (decision D6): v = √(a·L).
export function cornerFeedCapMmMin(featureMm, accelMs2) {
  return Math.sqrt(accelMs2 * (featureMm / 1000)) * 60000;
}

export function vacuumGripN(mu, dPkPa, areaCm2) {
  return mu * (dPkPa * 1000) * (areaCm2 / 10000);
}

// First-order lateral cutting force F ≈ kc(h)·ap·fz with h = fz·√(ae/D), so
// F/ap = Ks·fz + Int/√(ae/D) — linear in fz, closed-form cap. This force
// model is calibration-pending; the v2 measured pull-off field replaces it.
export function vacuumFeedCapMmMin(gripN, model, apMm, aeMm, dMm, rpm, zEff) {
  const s = Math.sqrt(aeMm / dMm);
  const fzCap = (gripN / apMm - (model.Int || 0) / s) / model.Ks;
  return Math.max(0, fzCap * rpm * zEff);
}

const CAP_ORDER = ['vmax', 'pow', 'vac', 'corn'];

export function applyLimits(idealMmMin, caps) {
  const values = [idealMmMin];
  for (const k of CAP_ORDER) if (caps[k] !== undefined) values.push(caps[k]);
  const finalMmMin = Math.min(...values);
  let binding = 'ideal';
  for (const k of CAP_ORDER) {
    if (caps[k] !== undefined && caps[k] <= finalMmMin + 1e-6) binding = k;
  }
  if (idealMmMin <= finalMmMin + 1e-6) binding = 'ideal';
  return { finalMmMin, binding, caps: { ideal: idealMmMin, ...caps } };
}

// The five active-limit messages. Meaning per the reference doc's binding-limit
// report; wording follows the project's STE copy pass (2026-08-18).
export function limitMessage(binding, ctx) {
  if (binding === 'ideal') {
    if (ctx.firstCutFactor && ctx.firstCutFactor !== 1) {
      return `No limit applies. The cut can take the chart feed. ${ctx.source} sets it, and first-cut mode serves ${Math.round(ctx.firstCutFactor * 100)}% of it.`;
    }
    return `No limit applies. The cut can take the chart feed. ${ctx.source} sets this feed.`;
  }
  if (binding === 'vmax') {
    return 'The machine maximum feed is the limit. The tool and the cut permit more, but the axes do not.';
  }
  if (binding === 'pow') {
    const torqueNote = ctx.rpm < ctx.breakpointRpm ? ' The spindle is in the constant-torque region.' : '';
    return `Spindle power is the limit at ${ctx.rpm} rpm. The spindle gives ${ctx.availKw.toFixed(1)} kW at this speed.${torqueNote} Reduce the depth, reduce the width, or increase the rpm into the constant-power range.`;
  }
  if (binding === 'vac') {
    return `Vacuum hold-down is the limit on a ${ctx.footprintCm2} cm² footprint. Use an onion skin or tabs. More vacuum does not correct a small footprint.`;
  }
  if (binding === 'corn') {
    return `Corner behaviour is the limit. On a ${ctx.featureMm} mm feature at ${ctx.accelMs2} m/s², the machine cannot reach and hold a higher feed.`;
  }
  return '';
}

export function compressionMinDepthMm(upcutLengthMm, extraMm) {
  return upcutLengthMm + extraMm;
}
