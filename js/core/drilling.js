// Drilling calculation. Pure, like the rest of js/core: it takes data as an
// argument and touches no page and no network.
//
// Naming: the published speed limits are always a "speed range", never the other
// word for it. The purity scan in tests/run.js rejects that word anywhere in this
// directory, comments included, and it is the natural name for the central idea
// here, so the term is fixed once at the top rather than rediscovered per edit.
// The same scan bans the verb for retrieving a file over the network, which is
// why the first line above is worded the way it is.
//
// Drilling data has a different shape from routing data. Routing publishes a chip
// load per tooth against material, geometry and diameter, merged across vendors.
// Drilling publishes, per tool subfamily: a spindle speed range, a feed band in
// mm per revolution that varies with speed and not with diameter, a table of
// material correction factors against one baseline material, and chip-clearing
// rules. So the chart-merging machinery in chipload.js does not apply here, and
// the feed identity is feed = rpm * mm-per-rev, with no flute count in it: the
// published band already counts both cutting edges.

// Linear interpolation of the published feed band at one spindle speed. Outside
// the band's own range the nearest edge holds flat (rules.drilling.out_of_range_feed),
// which is the conservative continuation because the upper edge falls as speed rises.
export function bandAtRpm(feedBand, rpm) {
  const pts = feedBand.points;
  if (!pts || pts.length === 0) return null;
  if (rpm <= pts[0].rpm) return { fnMin: pts[0].fn_min_mm_rev, fnMax: pts[0].fn_max_mm_rev, held: rpm < pts[0].rpm };
  const last = pts[pts.length - 1];
  if (rpm >= last.rpm) return { fnMin: last.fn_min_mm_rev, fnMax: last.fn_max_mm_rev, held: rpm > last.rpm };
  for (let i = 1; i < pts.length; i += 1) {
    const a = pts[i - 1];
    const b = pts[i];
    if (rpm <= b.rpm) {
      const t = (rpm - a.rpm) / (b.rpm - a.rpm);
      return {
        fnMin: a.fn_min_mm_rev + t * (b.fn_min_mm_rev - a.fn_min_mm_rev),
        fnMax: a.fn_max_mm_rev + t * (b.fn_max_mm_rev - a.fn_max_mm_rev),
        held: false,
      };
    }
  }
  return null;
}

// Where each profile sits on the published band. Gentle at the low edge, Standard
// at the position rules.drilling.standard_band_position names, Aggressive at the
// high edge. Standard is the midpoint by Scott's call of 2026-09-02, so the three
// words mean the same thing here as they do in routing. Drilling never offers
// Finishing: a hole has no finish pass, and no source publishes a finishing feed.
export function profileFn(band, profile, standardPosition) {
  if (profile === 'gentle') return band.fnMin;
  if (profile === 'aggressive') return band.fnMax;
  return band.fnMin + standardPosition * (band.fnMax - band.fnMin);
}
