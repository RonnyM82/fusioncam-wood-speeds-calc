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

// Two decimals, not three. Drilling feeds come off a chart read validated to
// about a percent, and a third decimal would claim a precision the diagram
// cannot carry. Four imperial places, because 0.20 mm/rev is 0.0079 in/rev and
// three would round it to 0.008.
export function revPair(mm) {
  return {
    metric: `${mm.toFixed(2)} mm/rev`,
    imperial: `${(mm / IN).toFixed(4)} in/rev`,
  };
}

// A ball nose scallop is small: 8% of a 1/8 inch ball leaves 5 microns, and
// 40% of a 3/4 inch ball leaves half a millimetre. Three decimals in mm covers
// both ends without printing a row of zeros, and four in inches, because
// 0.005 mm is 0.0002 in and three places would round it away.
export function scallopPair(mm) {
  return {
    metric: `${mm.toFixed(3)} mm`,
    imperial: `${(mm / IN).toFixed(4)} in`,
  };
}

// Two decimals. This is a derived cutting diameter, not a tool size, and a
// third place would claim the stepdown was known to a micron.
export function diaPair(mm) {
  return { metric: `${mm.toFixed(2)} mm`, imperial: `${(mm / IN).toFixed(3)} in` };
}

export function diameterLabel(dMm) {
  const fractions = { 1.5875: '1/16"', 3.175: '1/8"', 4.762: '3/16"', 6.35: '1/4"', 7.938: '5/16"', 9.525: '3/8"', 12.7: '1/2"', 15.875: '5/8"', 19.05: '3/4"', 22.225: '7/8"', 25.4: '1"' };
  const frac = fractions[dMm];
  return frac ? `${dMm} mm (${frac})` : `${dMm} mm`;
}
