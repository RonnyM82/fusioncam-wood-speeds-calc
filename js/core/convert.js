// Canonical internal units: mm, mm/min, mm/tooth, rpm, kW, N/mm².
// Conversions happen here (inbound) and in js/ui/format.js (display) — nowhere else.

export const IN_TO_MM = 25.4;
export const IPM_PER_M_MIN = 39.3700787;

export function inToMm(inches) {
  return inches * IN_TO_MM;
}

export function mmToIn(mm) {
  return mm / IN_TO_MM;
}

// Feed: IPM to m/min divides by 39.37. Dividing by 25.4 gives a feed wrong by 1.55×.
export function ipmToMMin(ipm) {
  return ipm / IPM_PER_M_MIN;
}

export function mMinToIpm(mMin) {
  return mMin * IPM_PER_M_MIN;
}

export function mmMinToIpm(mmMin) {
  return mmMin / IN_TO_MM;
}

export function ipmToMmMin(ipm) {
  return ipm * IN_TO_MM;
}

// Chip load converts by 25.4 (it is a length per tooth, not a feed).
export function fzInToMm(fzIn) {
  return fzIn * IN_TO_MM;
}

export function fzMmToIn(fzMm) {
  return fzMm / IN_TO_MM;
}

export function mMinToSfm(mMin) {
  return mMin * 3.28084;
}
