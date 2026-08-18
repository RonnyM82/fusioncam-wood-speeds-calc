// Normalises the heterogeneous machines.json presets into the shape
// calculate() expects. Where a preset publishes a range, the lower value is
// used, which errs conservative on the power cap.

export function machinePresets(machines, rules) {
  return machines.machines.map((m) => {
    let kw = Array.isArray(m.spindle_kw) ? m.spindle_kw[0] : (m.spindle_kw ?? m.routing_kw);
    let note = m.notes;
    if (kw == null) {
      kw = rules.defaults.spindle_kw;
      note = `${note ? `${note} ` : ''}This machine publishes no spindle power. The reference default of ${kw} kW serves.`;
    }
    const rpmMax = m.rpm_max ?? (Array.isArray(m.rpm) ? m.rpm[1] : undefined);
    let feedMMin = m.cut_feed_m_min ?? m.cut_m_min;
    if (feedMMin == null) {
      feedMMin = rules.defaults.max_feed_m_min;
      note = `${note ? `${note} ` : ''}This machine publishes no cutting feed. The reference default of ${feedMMin} m/min serves.`;
    }
    return {
      id: `${m.make} ${m.model}`,
      label: `${m.make} ${m.model}`,
      machine: {
        spindleKw: kw,
        breakpointRpm: m.breakpoint_rpm ?? rules.defaults.breakpoint_rpm,
        rpmMax,
        feedMaxMmMin: feedMMin * 1000,
        accelMs2: m.accel_m_s2 ?? machines.acceleration_tiers_m_s2.heavy_nesting_default,
        vacuum: { mu: machines.vacuum.mu_default, dPkPa: machines.vacuum.default_kpa },
      },
      data_class: m.data_class,
      notes: note,
    };
  });
}
