# Wood speeds and feeds calculator

A public, deployed calculator at wood.fusioncam.co. A wrong number here goes to someone's
spindle, so a data or behaviour regression is worse than any styling gap.

This file describes the `react-conversion` branch, rewritten on 2026-09-24 at step 5 of
`docs/CONVERSION_PLAN.md`. On this branch the public page is a Vite and React app built on
the Livetools design system's React parts. `main` is still the live site, the static page
from before the conversion, unchanged, and nothing reaches the public site until Scott says
to swap it over (step 6 of the plan, still to come).

## What the page is built with

- **Vite 8 and React 19**, TypeScript for the app's own components. `index.html` and `src/`
  are the page. `npm run dev` serves it while working; `npm run build` then `npm run preview`
  serves the built site on port 4173, the Fusion panel included.
- **`@livetools/ui`**, the design system's React parts. Until step 6 it is a local link to
  `../livetools-design-system/packages/ui`, which needs that checkout beside this one with
  its package built (`npm run build -w @livetools/ui` there). Step 6 swaps it for a published
  version, pinned exactly, before anything deploys, because the GitHub Pages build cannot
  reach a local folder.
- `src/globals.css` imports, in this order and no other, the package's stylesheet,
  `src/app-tokens.css` (this app's own tokens, prefixed `--wood-`) and `src/app.css`.
  `src/main.tsx` mounts the app in `LivetoolsProvider` with `scheme="system"`, so the page
  follows the device's light or dark setting as it always has.

## Every screen uses Livetools parts only

Every control, banner, badge, table, list and link on the page is a part from
`@livetools/ui`. The app writes no `lt-` class and no `data-lt-` attribute, and never reaches
inside a part with its own CSS. What no part covers is the app's own markup with its own
class names, styled in `src/app.css` from tokens only: the header, the output card of
figures, the notes box, the two charts, and the browser's own fold-out box (`<details>`) for
Advanced, the chart tables and "Something looks wrong".

The lint enforces the rules, extended from the package and never copied
(`eslint.config.js`, `stylelint.config.js`, the design system's D61). In `src/`:

- no raw text box, list, text area, dialog, table, form or button; use the part;
- no `lt-` class and no `data-lt-` attribute;
- no raw colour, px font size or hand-made shadow, in a style or a class string;
- no inline style except `inline-size` and `block-size` (geometry as data);
- no import of Base UI or React Aria, types included;
- in the app's CSS, no page surface inside a field and no small brand-red text.

If a rule stops something, the answer is a part or an upstream request, never a local
exception. When a part is wrong, do not patch it from the app: record it in
the design system's `docs/consumer-reports/2026-09-24-wood-calculator-conversion.md` (which goes to the design system as a consumer report) and
report it upstream, as step 4 did with the row headers that would not wrap.

**Where the parts' docs are.** Each part has a docs page beside its source in the
design-system repo, `packages/ui/src/<part>/<Part>.mdx` (for example
`packages/ui/src/table/Table.mdx`), shown in its catalogue (`npm run storybook` there, which
uses port 6006; never start anything else on that port). The types are in
`node_modules/@livetools/ui/dist/`. The decisions behind each part are in the design
system's `docs/DECISIONS.md`. Load the `livetools-design-system` skill before writing markup
or CSS; it is pinned at `.claude/skills/` so a clone carries it, and it describes the
vanilla system the Fusion panel still uses as well as the rules that carry across.

## The engine and the data are not touched

`js/core/` (the calculation), `js/data/` (the data layer) and `data/` (the data) are not
changed by the conversion, and must not be changed by page work. The React page imports
them as they are. The data is imported as modules (`src/data.ts`) and `validateData()` runs at
start; a broken entry shows the danger banner "The data failed its integrity check, so the
calculator shows no numbers." and nothing else. `js/ui/format.js` and `js/ui/drill-tables.js`
stay at their paths, because the tests and the panel import them.

- `js/core/*` is pure calculation. **No DOM, no fetch, no CSS.** `tests/run.js` enforces it
  for `js/core/` and `js/fusion/` and fails the whole suite if that breaks. The scan is a
  plain regex over the source, comments included, so the words it bans cannot appear in
  prose either. "Speed range", never the other word for it.
- `src/form-state.js` holds the page's state and carries across the old page's rules
  (reading and writing the address, the machine max feed's m/min to mm/min multiply, the
  parked Finishing profile, the drill diameter snap). `src/result-view.js` and
  `src/chart-view.js` decide everything the results and the charts show; the TSX files only
  draw it. The tests hold all three to the baseline in Node.
- While a box holds something the calculator cannot read (a comma, letters, a number outside
  its range, an empty flute count or routing speed, an advanced box at 0 or below), the
  results show no numbers and say which box (Scott's ruling, 2026-09-24). An empty optional
  box still means what it always meant: full board, full slot, published speed, the
  machine's own value.

### Two modes, two calculators

The page serves routing and drilling. They share the material, the machine and the profile,
and share nothing else, so the mode is a radio group rather than tabs: tabs say "two views
of one thing", and these are two operations with two output vocabularies. `calculate()`
serves routing and `calculateDrilling()` serves drilling; they return the same envelope,
which is what lets one results view handle both.

Drilling data has a different shape from routing data, and `data/schema.md` records why it
lives in its own file. Three rules there differ from routing and are deliberate, not
oversights. No vendor name renders in the drilling output, so a drilling result carries no
`contributors` or `servingBands` key and the chart ladder structurally cannot be pointed at
one. Drilling caps only on the machine feed, because no source publishes a cutting-force
model for a drill. And drilling never multiplies by a flute count: the published band
already counts every cutting edge.

## The Fusion panel is still vanilla

`fusion.html` is not converted in this work (the plan's rulings); it converts later as a
second entry of the same Vite app. It still uses the vendored copies of the design system,
and every file it loads keeps its address in the published site: the build copies them into
`dist/` byte for byte from where they are (`vite.config.ts`, `SITE_FILES`) and fails if any
address `fusion.html` loads is missing. The `?v=` cache keys are untouched, because Fusion's
palette browser serves a stale copy of any address whose key did not change.

**The vendored design system is the panel's. Do not edit it.** `tokens/`, `components/`,
`fonts/` and `icons/` are copies of the vanilla Livetools Design System, and
`conformance.py` is vendored too. Never edit a file in them; upgrading is a deliberate
re-copy. When the vanilla system is wrong for the panel, fix it in the panel's own layer
(`fusion.css`, or the root `app-tokens.css` for a token the system lacks), with the
measurement that found it written above the rule, and report it upstream.
`.lt-field[hidden]` in `fusion.css` is such a correction; the design system fixed the cause
on 2026-09-24 (D63), and the rule can go at the next re-vendor.

`reference/cnc-router-speeds-feeds-reference_4.html` is an archived third-party article kept
for where its numbers came from. It is exempt in `.conformance-exempt`, must stay
byte-for-byte what was published, and is copied unchanged to its address in the built site.

## The charts are drawn by the app

The chart ladder, the capacity cascade and the two drilling charts are drawn by the app with
its own class names (`src/Charts.tsx`, from `src/chart-view.js`), because the design system
has no chart part yet. This is Scott's ruling of 2026-09-24, and they move onto proper parts
when those exist. Before touching either chart, load the `dataviz` skill: they follow its
emphasis pattern, its mark specs and its rule that every chart has a table twin.

- **The highlight** on the serving bar is the app's `chart-emphasis` class, painted from
  `--wood-chart-mark-emphasis` in `src/app-tokens.css`, which reads the system's
  `--lt-chart-mark-emphasis` and adds nothing of its own, with the Windows high contrast rule
  (`forced-color-adjust: none; background-color: Highlight`) re-declared on the app's class.
  It goes on every row that serves, as the old page did.
- **Positions.** A bar or marker is placed by an empty spacer sized with `inline-size` in
  front of it, because the lint refuses an inline `left`. Each length also carries the exact
  computed percentage as `data-at`, because the browser rounds an `inline-size` to six
  figures when it writes it back; the baseline reads that.
- The floating tip is gone (ruled); each row keeps its accessible name, its roving Tab stop
  and its arrow keys, and the table under each chart says everything the tip did.

## The checks

```bash
npm run check          # the whole gate, in this order:
                       #   python conformance.py .   the panel, its CSS, the app CSS
                       #   node tests/run.js         216 tests: engine, data, form, results, charts
                       #   the lint                  the rules above, over src/
                       #   tsc --noEmit
                       #   vite build                fails if a panel file is missing
                       #   node tools/paint.mjs      the paint probe over the built page
```

It took 17 seconds on 2026-09-24. **The pre-commit hook runs it.** The hook is tracked at
`.githooks/pre-commit`; `npm install` points git at that folder through the `prepare`
script (`tools/install-hooks.mjs`). A clone made before that runs, once,
`git config core.hooksPath .githooks`. If it fails, fix the cause; never add an exemption
or loosen a rule to make it pass. It was proven to refuse a commit carrying an `lt-` class
in a TSX file on 2026-09-24.

`tools/paint.mjs` serves `dist/` with `vite preview` on a free port and runs the design
system's paint probe (its D59) over four states (routing, drilling, four warnings folded
into one list, a refusal) at 1280 px and 390 px: as rendered, at the other two densities,
with no density attribute, under a coarse pointer and under forced colours. It also checks
what only this page has: the charts share one track height and one mark height, a mark never
fills its track, and with every fold open the page does not scroll sideways at 1280 px. It
replaced `smoke-measure.py`, which measured the old page through its old markup. It reads
the probe from the design-system checkout and finds Playwright there, and stops with exit
code 2 rather than skipping if either is missing. `node tools/paint.mjs --base <url>`
measures a page already served, such as the live site.

`lt_dom_audit.py` still serves the vanilla panel; it has nothing to read on the React page.

## The baseline

`tests/baseline/` holds what the page before the conversion showed for 52 links: every
figure, unit, banner, note, table cell, highlighted chart row and marker position, every
form field, and the address as the page rewrote it. It is the master check of the
conversion, and `tests/baseline/README.md` says exactly what it captures and why.

```bash
npm run build && npm run preview                                # in one shell
node tools/baseline.mjs --compare --base http://localhost:4173/ # in another
node tools/baseline.mjs --compare                               # legacy.html, served for you
```

Against the React page the comparison applies the differences ruled deliberate, listed with
their rulings in `tests/baseline/accepted-differences.json`, and is exact about everything
else; `--no-accepted` turns them off. On 2026-09-24 the React page matched all 52 states
with those four differences and nothing else. Any other difference, above all any number, is
a regression until explained. Re-capture the baseline only when Scott has ruled a new
behaviour right, and say so in the commit. `legacy.html` is the old `index.html` renamed with
not a byte changed; it, `js/ui/app.js` and `styles.css` go when the conversion is done.

## Still to come

Step 6 of the plan, on Scott's word: the design system's package published (Scott pushes
the tag), the published version swapped in with a fresh lockfile, the baseline run against
that build, the GitHub Pages workflow added and the Pages source switched from the branch to
the workflow, the first deploy, the baseline run against wood.fusioncam.co, and the Fusion
add-in opened against the live site. Until then `main` is the live site.

## TODO

- **Three 3D surfacing calls waiting for Scott (from research session 6,
  deferred by him on 2026-09-24 to when surfacing is next worked on).** Put
  each to him in plain words with the evidence in
  `research/research-session-6-ball-surfacing.md`:
  1. Whether a ball's light surfacing pass should skip the first-cut feed
     reduction. It is on by default and drives a light pass's chip toward the
     rubbing floor, which is why the Finishing profile disables it; a ball
     roughing pass at a 40 per cent stepover is a different case.
  2. The ball chart's material order: softwood above MDF above hardwood, the
     reverse of every flat-tool chart in the repo, and nothing on the page
     says so.
  3. The single-pass finish row. The research's "Still open" list has it
     refusing, but the same file records Scott's later decision that a pass
     with no stated depth serves, with the power and hold-down checks skipped.
     Check with him that this settled it, then close it in the research file.
     Found by the conversion's baseline capture on 2026-09-24: the public page
     never reaches that path. An empty depth box on a ball nose is sent as
     `undefined`, not `null`, so it is read as the full 18 mm board (a
     cutting diameter of 12.70 mm and no scallop row); only the Fusion panel
     sends `null`. Put that to him with this question.
- **Tool identity in the Fusion panel: use the library GUID before the
  fingerprint (Scott, 2026-09-02).** The panel remembers each confirmed tool
  (geometry, up-cut length, drill type) against a key from
  `js/fusion/tool-identity.js`. Today that key is vendor plus product number
  when both exist, else a fingerprint of type, diameter, flutes and
  description, so a description edit on a tool with no product number detaches
  its stored answer. Fusion's tool JSON carries a `guid` the snapshot does not
  ship yet (`op.tool.toJson()`, see spike-results-windows.md section 4). The
  work: ship the guid in the job message tool shape (additive field, no
  protocol bump), prefer vendor|productId, then guid, then fingerprint in
  `toolKey()`, and on restore adopt an answer stored under the old fingerprint
  the first time the same tool arrives under its guid, so nobody loses a
  confirmed tool in the change. Know the guid's own limits before leaning
  harder on it: the same physical cutter in two libraries carries two guids,
  and a duplicated or rebuilt library entry gets a fresh one. Touches
  snapshot.py, protocol.md, tool-identity.js and the FI tests.
