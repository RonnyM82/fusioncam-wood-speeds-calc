# CNC Router Speeds & Feeds Calculator

A free, browser-based speeds and feeds calculator for wood CNC work. No sign-up, no install, no server — it's a static page that runs entirely in your browser.

Live at [wood.fusioncam.co](https://wood.fusioncam.co).

It does two jobs. **Routing** gives you a spindle speed, a cutting feed and a chip load for solid carbide router bits on nested-base machines. **Drilling** gives you a speed, a plunge feed and a feed per revolution for the cabinet-making drills: dowel drills, through-hole drills and hinge drills from 3 to 40 mm, on machining centres and drill banks. Pick which one at the top of the page.

Drilling reads differently from routing on purpose. Drill makers publish a spindle speed range and a feed band per tool, not a chip load per diameter, so the calculator serves the published speed and shows you where your setting sits inside the published feed range. If your machine cannot turn slowly enough for the drill, it says so and still gives you the honest numbers rather than refusing.

## Data provenance

Every number in this tool traces back to a source: a tooling catalogue, a manufacturer's chart, or a documented test cut. Sources are recorded alongside the data in [data/](data/).

Treat the calculated values as a starting point, not a guarantee. Wood is not aluminum — species, moisture, grain, and machine rigidity all move the right answer. Dial in your first cut conservatively and adjust from there.

## Development

No build step, no dependencies. The page is static; the data is plain JSON in [data/](data/).

- `node tests/run.js` runs the full test suite: the twenty worked regression values from [tests/regression-tests.md](tests/regression-tests.md), the data integrity sweep, the limit scenarios and the drilling behaviour. Run it before pushing; a data edit that moves a recommendation fails here first.
- The drilling numbers are read off the vendor's printed diagrams rather than transcribed. `python tools/read-leitz-drilling.py` reads the band polygons out of the source PDF and `python tools/build-drill-entries.py` turns them into [data/drills.json](data/drills.json), so the whole file is reproducible. `node tools/drill-sight-sweep.mjs` prints the served grid for a human to look at.
- `node tools/serve.js` serves the page locally at http://localhost:8080 (fetch does not work from file://).
- The calculation core in [js/core/](js/core/) is pure and shared between the browser and the tests. The test runner fails the suite if anything in the core touches fetch or the DOM.

## No warranty

This tool is provided as-is, with no warranty of any kind. You are responsible for verifying settings are safe for your machine, tooling, and material before running a job.
