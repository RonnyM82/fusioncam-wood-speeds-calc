// Display rounding and imperial companions. Hard rounding is deliberate:
// four significant figures would claim accuracy the source data does not have.

const IN = 25.4;

function roundTo(x, step) {
  return Math.round(x / step) * step;
}

function thousands(x) {
  return x.toLocaleString('en-NZ');
}

export function feedPair(mmMin) {
  const step = mmMin >= 2000 ? 100 : 10;
  return {
    metric: `${thousands(roundTo(mmMin, step))} mm/min`,
    imperial: `${thousands(Math.round(mmMin / IN))} in/min`,
  };
}

export function rpmPair(rpm) {
  return { metric: `${thousands(Math.round(rpm))} rpm`, imperial: '' };
}

export function surfacePair(mMin) {
  return {
    metric: `${thousands(Math.round(mMin))} m/min`,
    imperial: `${thousands(Math.round(mMin * 3.28084))} SFM`,
  };
}

export function fzPair(mm) {
  return {
    metric: `${mm.toFixed(3)} mm/tooth`,
    imperial: `${(mm / IN).toFixed(4)} in/tooth`,
  };
}

export function mmPair(mm) {
  return { metric: `${mm.toFixed(1)} mm`, imperial: `${(mm / IN).toFixed(3)} in` };
}

export function diameterLabel(dMm) {
  const fractions = { 3.175: '1/8"', 4.762: '3/16"', 6.35: '1/4"', 7.938: '5/16"', 9.525: '3/8"', 12.7: '1/2"', 15.875: '5/8"', 19.05: '3/4"', 22.225: '7/8"', 25.4: '1"' };
  const frac = fractions[dMm];
  return frac ? `${dMm} mm (${frac})` : `${dMm} mm`;
}
