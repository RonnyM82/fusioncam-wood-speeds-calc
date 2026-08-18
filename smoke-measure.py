#!/usr/bin/env python3
"""
Measure the rendered page, do not read it.

    python smoke-measure.py                 # against a page served on :8081
    python smoke-measure.py --port 8080

WHY THIS EXISTS, and why conformance.py cannot do its job
conformance.py reads source. lt_dom_audit.py reads rendered markup. Neither
computes a layout, and there is a whole class of defect that only exists once
one has been computed: markup and CSS each individually correct, and the
painted result wrong.

Every finding below was live on this page and passed both other checks:

  - The stepper buttons rendered at seven different widths, from 29.41px down
    to 24.00px, against the 36px --lt-control-height that .lt-btn--icon asks
    for. .lt-input-group is display:flex and nothing pinned the buttons or the
    affix to flex: none, so they shrank whenever the line overflowed, which it
    always did because .lt-input is inline-size: 100%. How far each one shrank
    then depended on how wide its neighbour's unit text happened to be.
    The one that mattered: the widest affix in the form squeezed its buttons
    onto --lt-target-min, the 24px WCAG floor, and shrinking also defeats the
    coarse-pointer floor of --lt-target-touch. A touch-target bug that reads
    as a cosmetic one.

  - The two charts drew the same kind of bar at two geometries, a 12px track
    painted edge to edge against a 16px track carrying a 12px mark.

Neither is visible in a stylesheet. Both are obvious in a measurement.

Playwright is not a dependency of this repo. Without it this exits 0 with a
skip, so it never blocks a machine that has not got it.
"""

import argparse
import sys

CONTROL_KINDS = ".lt-select, .lt-input, .lt-affix:not([hidden]), .lt-btn"

MEASURE_JS = r"""() => {
  const box = el => el.getBoundingClientRect();
  const root = getComputedStyle(document.querySelector('main'));
  const px = n => parseFloat(root.getPropertyValue(n));
  const controlH = parseFloat(getComputedStyle(document.querySelector('.lt-select')).blockSize);

  const sizes = sel => [...document.querySelectorAll(sel)].map(el => {
    const r = box(el);
    return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
  });

  return {
    controlHeight: controlH,
    targetMin: px('--lt-target-min'),
    controls: sizes(arguments0),
    steppers: sizes('[data-step]'),
    tracks: sizes('.casc-bar, .ladder-track'),
    marks: sizes('.casc-fill, .ladder-bar'),
    // Anything a pointer can act on, measured at its HIT AREA rather than at
    // its painted box. For a checkbox or a radio those differ on purpose: the
    // box draws at --lt-check-size, 18px, and the .lt-check label wrapping it
    // is the target. Measuring the input would report every tickbox in the
    // system as undersized, which is a bug in the check, not in the page.
    targets: [...document.querySelectorAll('button, input, select, summary, [tabindex="0"], .lt-check')]
      .filter(el => el.offsetParent !== null)
      .map(el => {
        const hit = (el.type === 'checkbox' || el.type === 'radio')
          ? (el.closest('.lt-check') || el) : el;
        const r = box(hit);
        return { w: +r.width.toFixed(2), h: +r.height.toFixed(2),
                 what: (el.id || el.type || el.tagName).toString() };
      }),
  };
}"""


def check(name, ok, detail):
    print(f"  {'PASS' if ok else 'FAIL'}  {name:<44} {detail}")
    return ok


def run(page, label, coarse):
    d = page.evaluate(MEASURE_JS.replace("arguments0", repr(CONTROL_KINDS)))
    print(f"\n{label}  control-height={d['controlHeight']}px  target-min={d['targetMin']}px")
    ok = True

    heights = sorted({c["h"] for c in d["controls"]})
    ok &= check("every control hits the control height", heights == [d["controlHeight"]], heights)

    # A stepper is an icon button: square, at the control height, every time.
    ssz = sorted({(s["w"], s["h"]) for s in d["steppers"]})
    want = (d["controlHeight"], d["controlHeight"])
    ok &= check("every stepper is square at the control height", ssz == [want], ssz)

    tracks = sorted({t["h"] for t in d["tracks"]})
    ok &= check("both charts share one track height", len(tracks) == 1, tracks)

    marks = sorted({m["h"] for m in d["marks"]})
    ok &= check("both charts share one mark height", len(marks) == 1, marks)

    ok &= check("a mark never fills its whole track",
                bool(marks) and bool(tracks) and marks[-1] < tracks[0],
                f"mark {marks} in track {tracks}")

    under = [t for t in d["targets"] if min(t["w"], t["h"]) < d["targetMin"] - 0.5]
    ok &= check("no hit area under the minimum", not under,
                f"{len(under)} under" + (f": {under[:3]}" if under else ""))

    if coarse:
        touch = [s for s in d["steppers"] if min(s["w"], s["h"]) < 44 - 0.5]
        ok &= check("steppers reach the touch floor", not touch, f"{len(touch)} under 44px")
    return ok


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8081)
    args = ap.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("smoke-measure: playwright not installed, skipping.")
        return 0

    url = f"http://localhost:{args.port}/"
    ok = True
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for label, kw in (("fine pointer", {}),
                          ("coarse pointer", {"has_touch": True, "is_mobile": True})):
            ctx = browser.new_context(viewport={"width": 900, "height": 1000}, **kw)
            page = ctx.new_page()
            try:
                page.goto(url, wait_until="networkidle")
            except Exception as err:
                print(f"smoke-measure: could not reach {url} ({err}).")
                print("Start it with: node tools/serve.js 8081")
                return 1
            page.click("#advanced summary")
            page.wait_for_timeout(400)
            ok &= run(page, label, coarse=kw.get("has_touch", False))
            ctx.close()
        browser.close()

    print("\nsmoke-measure passed" if ok else "\nsmoke-measure FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
