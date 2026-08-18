# CNC Router Speeds & Feeds Calculator

A free, browser-based speeds and feeds calculator for wood CNC routing. No sign-up, no install, no server — it's a static page that runs entirely in your browser.

Live at [speeds.fusioncam.co](https://speeds.fusioncam.co).

## Data provenance

Every number in this tool traces back to a source: a tooling catalogue, a manufacturer's chart, or a documented test cut. Sources are recorded alongside the data in [data/](data/).

Treat the calculated values as a starting point, not a guarantee. Wood is not aluminum — species, moisture, grain, and machine rigidity all move the right answer. Dial in your first cut conservatively and adjust from there.

## Development

No build step, no dependencies. The page is static; the data is plain JSON in [data/](data/).

- `node tests/run.js` runs the full test suite: the twenty worked regression values from [tests/regression-tests.md](tests/regression-tests.md), the data integrity sweep, and the limit scenarios. Run it before pushing; a data edit that moves a recommendation fails here first.
- `node tools/serve.js` serves the page locally at http://localhost:8080 (fetch does not work from file://).
- The calculation core in [js/core/](js/core/) is pure and shared between the browser and the tests. The test runner fails the suite if anything in the core touches fetch or the DOM.

## No warranty

This tool is provided as-is, with no warranty of any kind. You are responsible for verifying settings are safe for your machine, tooling, and material before running a job.
