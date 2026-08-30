// Status chips with the reference doc's exact thresholds. Pure: consumes a
// calculate() result and returns plain objects for the UI to render.
// Levels: cool (fine), warm (watch it), hot (act), info (context).

import { isPanelMaterial } from './chipload.js';
import { cornerMinLengthMm } from './limits.js';

export function buildChips(result) {
  if (result.status !== 'ok') return [];
  const m = result.meta;
  const caps = result.limit.caps;
  const codes = new Set(result.warnings.map((w) => w.code));
  const chips = [];

  const x = m.fzEff.toFixed(3);
  const warnBelow = m.chipFloor?.warn_below ?? 0.1;
  // Finishing serves the finisher chart's programmed chip and checks it
  // against that chart, not against the panel floor (see calculate.js).
  if (m.finishing && codes.has('chip_below_chart')) chips.push({ key: 'chip', level: 'hot', text: `Chip ${x} mm programmed, below the finisher chart` });
  else if (m.finishing) chips.push({ key: 'chip', level: 'cool', text: `Chip ${x} mm programmed, per the finisher chart` });
  else if (codes.has('chip_plough')) chips.push({ key: 'chip', level: 'hot', text: `Chip ${x} mm, the tool ploughs and burns` });
  else if (codes.has('chip_below_min')) chips.push({ key: 'chip', level: 'hot', text: `Chip ${x} mm, below the ${warnBelow.toFixed(2)} minimum` });
  else if (codes.has('chip_marginal')) chips.push({ key: 'chip', level: 'warm', text: `Chip ${x} mm, close to the minimum` });
  else if (codes.has('chip_thin')) chips.push({ key: 'chip', level: 'warm', text: `Chip ${x} mm, thin for solid timber` });
  else if (isPanelMaterial(m.material)) chips.push({ key: 'chip', level: 'cool', text: `Chip ${x} mm, above the minimum` });
  else chips.push({ key: 'chip', level: 'cool', text: `Chip ${x} mm` });

  const r = m.docRatio;
  chips.push({
    key: 'depth',
    level: r > 3 ? 'hot' : r > 1 ? 'warm' : 'cool',
    text: `Depth ${r.toFixed(1)}×D gives ${Math.round(m.derate * 100)}% chip load`,
  });

  if (m.chipThinningFactor > 1.001) {
    chips.push({
      key: 'thinning',
      level: m.chipThinningFactor > 1.5 ? 'warm' : 'cool',
      text: `Chip thinning ${m.chipThinningFactor.toFixed(2)}× at ${Math.round((m.aeMm / m.dMm) * 100)}% radial${m.thinningCompensated === false ? ', not compensated' : ''}`,
    });
  }

  if (m.availKw !== undefined && m.availKw > 0 && Number.isFinite(m.powerKw)) {
    const head = m.powerKw / m.availKw;
    chips.push({
      key: 'power',
      level: head > 0.95 ? 'hot' : head > 0.75 ? 'warm' : 'cool',
      text: `Power ${Math.round(head * 100)}% of available`,
    });
    if (result.outputs.spindleRpm < m.breakpointRpm) {
      chips.push({
        key: 'torque',
        level: 'warm',
        text: `Constant-torque region, ${Math.round((result.outputs.spindleRpm / m.breakpointRpm) * 100)}% of rated power`,
      });
    }
  }

  if (m.featureMm > 0 && m.accelMs2 > 0) {
    const lMin = cornerMinLengthMm(result.outputs.cuttingFeedMmMin, m.accelMs2);
    chips.push({
      key: 'corner',
      level: lMin > m.featureMm ? 'hot' : lMin > 0.4 * m.featureMm ? 'warm' : 'cool',
      text: `Corners need ${lMin.toFixed(0)} mm to reach the feed`,
    });
  }

  if (m.gripN !== undefined) {
    chips.push({
      key: 'holddown',
      level: caps.vac !== undefined && caps.vac < caps.ideal ? 'hot' : 'cool',
      text: `Hold-down ${m.gripN.toFixed(0)} N usable`,
    });
  }

  chips.push({ key: 'kc', level: 'info', text: `kc ${Math.round(m.kcUsedNmm2)} N/mm² · ${m.material.replace(/_/g, ' ')}` });
  chips.push({ key: 'band', level: 'info', text: `Band ${m.band.fzMin.toFixed(3)} to ${m.band.fzMax.toFixed(3)} mm/tooth · ${m.contributors.join(', ')}` });
  return chips;
}
