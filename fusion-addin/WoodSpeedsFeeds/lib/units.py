"""Every unit conversion in the add-in, in one module.

The wire format (fusion-addin/protocol.md) fixes the units: lengths in
millimetres, feeds in millimetres per minute, spindle speeds in
revolutions per minute, angles in degrees. This module converts raw
Fusion parameter values to those units on the read side.

The write side never depends on any assumption here. Every write uses
an expression string with an explicit unit, for example "4390 mm/min",
and Fusion parses the unit itself (apply.py, decision 2026-09-01).

Each conversion below states the factor it rests on and where the
factor was read. The Fusion connector read every factor inside Fusion
2704 on Windows on 2026-09-01 (fusion-addin/spike-results-windows.md
section 5). One factor stays untested: feeds in an inch document.
"""

MM_PER_CM = 10.0


def internal_length_to_mm(value):
    """Convert an internal length value to millimetres.

    Confirmed 2026-09-01, spike-results-windows.md section 5: raw
    lengths are centimetres. tool_diameter read 0.95 for 9.5 mm,
    maximumStepdown read 0.6 for 6 mm, tool_feedPerTooth read 0.01
    for 0.1 mm. The feed per tooth is a length and takes this factor.
    """
    if value is None:
        return None
    return float(value) * MM_PER_CM


def mm_to_internal_length(value):
    """Convert millimetres to the internal length unit.

    Rests on the same centimetre factor as internal_length_to_mm.
    Kept for symmetry. No write path uses it, because writes use
    expression strings with explicit units.
    """
    if value is None:
        return None
    return float(value) / MM_PER_CM


def internal_feed_to_mm_min(value):
    """Convert an internal feed value to millimetres per minute.

    Confirmed 2026-09-01, spike-results-windows.md section 5: raw
    feeds are already millimetres per minute, so the value passes
    through unchanged. tool_feedCutting read 1000.0 for the dialog's
    1000 mm/min, and the write "1234 mm/min" read back 1234.0. The
    FloatParameterValue type 3 (linear velocity) is millimetres per
    minute, not the centimetres per minute the length unit suggests.

    SPIKE_CONFIRM: feeds in an inch document. No inch document was
    allowed in the Windows pass. If an inch document stores feeds in
    another unit, the read-back compare in apply.py refuses every row,
    which fails safe: the report refuses, it never mislabels a write
    as good.
    """
    if value is None:
        return None
    return float(value)


def internal_rpm_to_rpm(value):
    """Convert an internal spindle speed value to revolutions per minute.

    Confirmed 2026-09-01, spike-results-windows.md section 5: the
    value passes through unchanged. tool_spindleSpeed read 5000.0 for
    5000 rpm, and the write "12345 rpm" read back 12345.0.
    """
    if value is None:
        return None
    return float(value)


def internal_angle_to_deg(value):
    """Convert an internal angle value to degrees.

    Confirmed 2026-09-01, spike-results-windows.md section 5: raw
    angles are degrees, so the value passes through unchanged.
    rampAngle read 2.0 for the dialog's 2 degrees, and the write
    "10 deg" read back 10.0. The API documentation says radians. The
    reading disagrees, and the reading wins.
    """
    if value is None:
        return None
    return float(value)


def within_tolerance(target, actual, relative, absolute):
    """True when actual sits within tolerance of target.

    The tolerance is the larger of a relative band and an absolute
    band, so small values do not fail on float noise.
    """
    if target is None or actual is None:
        return False
    band = max(abs(float(target)) * relative, absolute)
    return abs(float(actual) - float(target)) <= band
