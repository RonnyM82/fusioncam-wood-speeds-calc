# The calculator's move onto the Livetools React parts

This plan was written on 2026-09-24 by Claude, from the survey in
`docs/CONVERSION_SURVEY.md` and Scott's rulings of the same day. It is the calculator's own
plan for its conversion, which the design system's plan (`livetools-design-system`,
`docs/PLAN.md`, phase 2) names as the proof of the Vite path and as phase 2's
done-condition: "the wood speeds-and-feeds calculator's main screen is rebuilt on Vite from
parts only, with no lt- class written in the app" (D31 there). Decisions made in the design
system keep their D-numbers there; decisions made for this conversion are recorded in this
file, in the "Rulings" section below, with their date.

## What the conversion is

The public page at wood.fusioncam.co is rebuilt as a Vite and React app on the
`@livetools/ui` parts. The calculation engine (`js/core/`), the data layer (`js/data/`) and
the data (`data/`) are not changed at all: the survey confirmed they touch no page and no
browser object apart from the fetch in `js/data/load-browser.js`, and the 201 tests in
`tests/` keep running against them unchanged. What is rewritten is the page: `index.html`,
`js/ui/app.js` and `styles.css`.

The work happens on the branch `react-conversion`. `main` is what GitHub Pages serves
today, from the repository root, so nothing reaches the public site until Scott says to
swap it over. The Fusion panel (`fusion.html`) is not converted in this work; it stays as it
is and keeps every file it loads at its current address.

## Rulings

These are Scott's, from 2026-09-24, unless marked as Claude's.

| Question | Ruling |
|---|---|
| A box the calculator cannot read (a comma, letters, a value outside its range) | The results show no numbers until it is fixed, and say which box. Today the page quietly calculates from a stand-in value when a box holds letters (two flutes when the flutes box reads `abc`), and it reads a comma as part of a number (`12,000` rpm computes at 12,000). The design system's number field now refuses commas (its D52), so after the conversion `12,000` shows "Use a full stop for decimals, and no commas." and no numbers until it is corrected; the baseline step recorded today's behaviour for both cases (`tests/baseline/today-unreadable-*.json`). An empty optional box still means what it means today (full board, full slot, published speed). |
| The two segmented button rows (Routing or Drilling; Gentle, Standard, Aggressive, Finishing) and the tool-type cards | The design system gains a button-row layout and a card layout on its radio group part, so the calculator keeps its look. That work is in the design system's repo and lands before the form is built here. |
| The two charts (the capacity bars and the chart ladder, with the highlighted serving band and the dotted marker) | The calculator draws them itself for now, with its own class names. The highlight is painted from an app token that reads the design system's chart emphasis colour, with its Windows high contrast rule written on the app's own class. The bars and the marker are placed with spacers sized by inline size, which the rules allow. No design-system class is written in the app, so no exception to the rules is needed. They move onto proper design-system parts when those exist. |
| The floating tip over the charts | It is dropped, because everything it shows is already each chart row's accessible name and the table under the chart (Claude's, following the survey's recommendation, which the chart ruling above allows). |
| Publishing the design system's parts to npm | Scott pushes the version tag himself when the conversion says the version is ready. |
| The archived reference article | Claude's: it stays reachable at its current address, copied unchanged into the published folder. |
| The Fusion panel | Claude's: it stays vanilla in this work and converts later as a second entry of the same Vite app. |
| Units | Claude's: unchanged. Inputs stay metric, each result shows metric with the imperial figure under it, and there is no unit switch. A switch would be a separate decision. |
| Dark mode | Claude's: the page keeps following the device setting (`LivetoolsProvider scheme="system"`). |
| The "Advanced" and "Something looks wrong" fold-outs | Claude's: they keep the browser's own open-and-close box, because no part exists for one and the rules allow it. |
| The results banners announced twice to a screen reader | Claude's: the results area stops announcing itself as a whole, the banners announce themselves, and a short spoken "Numbers updated" carries the figures. The clash is reported to the design system. |
| Where the page before the conversion lives while the work runs (settled in step 1) | Claude's, 2026-09-24: `index.html` was renamed to `legacy.html` at the repo root, with not a byte changed (checked against the committed `index.html` with `cmp`). Every relative address in it still resolves, so `node tools/serve.js` serves it at `/legacy.html` exactly as it ran before. `tools/baseline.mjs --compare` with no `--base` now loads that address, and `--base http://localhost:<port>/legacy.html` reaches it explicitly; the React page is `--base http://localhost:4173/` under `vite preview`. It is not part of the built site, so it is never published. A git worktree of `main` was the alternative; it was not chosen because it lives outside the repo and every session would have to recreate it. `legacy.html`, `js/ui/app.js` and `styles.css` go when the conversion is done. |
| How the Fusion panel's files are published without keeping two copies (settled in step 1) | Claude's, 2026-09-24: a small step in `vite.config.ts` copies them into `dist/` at build time, byte for byte, from where they already are in the repo: `fusion.html`, `fusion.css`, the root `app-tokens.css`, `tokens/`, `components/`, `fonts/`, `icons/`, `js/core/`, `js/data/`, `js/fusion/`, the three panel modules in `js/ui/`, the five JSON files in `data/`, and `tools/fusion-harness.js` (which `?harness=1` imports, and which has been public since the panel shipped). The same step copies the archived reference article to its current address. Nothing is kept in `public/` except `CNAME`, so `js/core/`, `js/data/` and `data/` each exist once. After copying, the build reads every address `fusion.html` loads, follows every module import from there, and fails if any file is missing from `dist/`, so a panel file cannot silently drop out of the published site. The `?v=` cache keys are untouched because `fusion.html` is copied, not processed by Vite. Checked on 2026-09-24: under `vite preview`, `/fusion.html?harness=1` rendered the harness job with every tool confirmed, and its text and a full-page screenshot were identical to the same page served from the repo root. |
| An empty flute count or routing spindle speed (settled in step 2) | Claude's, 2026-09-24, for Scott to confirm: it holds the results back like an unreadable box, with "Enter a value." under the box and "The flute count box is empty." in the results area. The old page computed for two flutes, or at 18000 rpm, while the box stood empty, which is the stand-in the unreadable-box ruling was made against. The box shows no required asterisk, because the old page never showed one. An empty board thickness is unchanged: it is read as 0 and the engine refuses it in its own words, which is not a stand-in. The empty optional boxes (depth, width, hole depth, drill speed, every advanced field) are unchanged. |
| The advanced fields on a drilling link (settled in step 2) | Claude's, 2026-09-24: the new page shows only the three advanced fields drilling reads (spindle power, breakpoint, machine max feed), whether the page is opened on a drilling link or switched to drilling. The old page showed all thirteen when opened on a drilling link, because its app.js hid them before it had built them, and three after a switch; the ten extra do nothing in drilling (`currentDrillInput()` never reads them). This is the one difference in the form section of the baseline, in the 15 drilling states, and nothing else differs there. |
| An advanced box at 0 or below (settled in step 2, changed in step 3) | Claude's, 2026-09-24, step 3, replacing step 2's "unchanged": an advanced box holding 0 or a negative number is refused like any other value outside its range. The box says "Must be more than 0." and the results show no numbers and say "The spindle power is outside the range its box takes. Fix it to see feeds and speeds." (with that box's name). The old page quietly served the machine's own value in its place, which is the stand-in the unreadable-box ruling ended. An EMPTY advanced box still means the machine's own value. It is an exclusive bound in `src/form-state.js` (`above: 0`, checked by `blockers()` and handed to the field as its own rule), not a `min` on the field: the field part writes a `min` rounded to the box's display decimals, and the machine max feed shows whole m/min, so any `min` there either refuses the 0.5 m/min the old page served (a baseline state) or reads "at least 0". Every number above 0 is taken exactly as before. Pinned by FS9. |
| How the results announce themselves to a screen reader (settled in step 3) | Claude's, 2026-09-24, carrying out the ruling on the double announcement: `#results` carries no `aria-live`. Each banner is the `Alert` part, which gives a banner mounted after load `role="alert"` (danger, warning) or `role="status"` (success, info), and each is keyed by its words (`src/Results.tsx`), so a banner whose words change is mounted fresh and announces, where one kept from load would change silently. The figures are carried by `announce("Numbers updated.")`, polite, said once the output card's figures have changed and then held still for one second, so typing 22000 key by key says it once; nothing is said at load or when a change leaves the figures as they were. Checked in a browser on 2026-09-24. In the baseline this shows only in the banners' `role`, and only in the two states with clicks: `fallback-drill-family-change-snaps-diameter` (the third and fourth results blocks, two warnings, now `alert`) and `fallback-mode-switch-parks-finishing` (the limit line, now `status`, and the third block, a warning, now `alert`). The states opened from a link have no role on any banner, because the part gives none to what is there at load. |
| Where step 4 draws the charts (settled in step 3) | Claude's, 2026-09-24: `src/Results.tsx` holds each chart's place with an empty, hidden element marked `data-chart-slot`, where the old page drew it: `ladder` (routing) or `drill-feed` (drilling) as the last thing in `#results`, each with its table twin inside; `cascade` after the badges in `#diagnostics` (the cascade, then its table twin); `drill-speed` as the whole of `#diagnostics` in drilling. Step 4 replaces each slot. `tools/baseline.mjs --no-charts` reads a slot as a chart and leaves charts out of both sides of a comparison. |
| A titled banner's look (seen in step 3) | Claude's, 2026-09-24: the `Alert` part sets a banner's title at the page's text size and its body smaller, where the old page set both small. So the refusal, the block and the "4 things to check on this cut" titles read one step larger than before; the limit line and the list under the fold are unchanged. The words, the colours and the glyphs are the same. A banner with no title keeps the old small size through an app class on its own paragraph. |
| How the charts are drawn (settled in step 4) | Claude's, 2026-09-24, carrying out Scott's chart ruling: `src/chart-view.js` is `ladderHtml()`, `drillFeedChart()`, `drillSpeedChart()` and the cascade from `js/ui/app.js` as plain data, the arithmetic unchanged, and `src/Charts.tsx` draws it. Each ladder track is a one-cell grid holding two lanes laid over each other; in each lane an empty spacer sized with `inline-size` to the start percentage pushes the bar (sized with `inline-size`) or the dotted marker along. The cascade fill keeps its absolute placement and takes its length as `inline-size`. The highlight is the app's `chart-emphasis` class, painted from `--wood-chart-mark-emphasis` in `src/app-tokens.css`, which reads `--lt-chart-mark-emphasis`, with `forced-color-adjust: none; background-color: Highlight` re-declared on the app's class. Every bar, fill and marker also carries its percentage as `data-at`, the exact string the code computed, because the browser rounds an `inline-size` to six figures when it writes the attribute back. Checked 2026-09-24: all 96 charts in the baseline match the old page's highlight, positions, names and tables (`tests/charts.test.js` CH1 in Node, `tools/baseline.mjs` in the browser, which also measures each mark where it is painted); the 1280 px screenshots match the old page pixel for pixel in the light scheme, and under forced colours; the design system's paint probe passes on four states at two widths. |
| Which rows the highlight goes on (seen in step 4) | Claude's, 2026-09-24: on every row that serves, as the old page did. That is one row in the cascade and in both drilling charts, but the ladder highlights every published chart the engine serves from, and in two baseline states that is more than one: two Onsrud charts for a 12.7 mm straight tool in softwood, three for the same tool in MDF. CH2 holds it to the engine's own list of serving charts. |
| The floating tip, the table fold's gap, and the drill speed chart's heading (settled in step 4) | Claude's, 2026-09-24: the tip is gone, as ruled; each chart is still one Tab stop with the arrow keys, Home and End moving between its rows, and each row keeps its accessible name (checked key for key against the old page). The space between a table fold's summary and its table was a margin on the design system's table wrapper, and is now on the open fold's own summary, the same size. The drill speed chart's heading keeps the extra space above it that the old page gave it by accident of its CSS (the section heading rule outranked the chart heading rule on its id), so the chart draws where it did. The "Something looks wrong" folds and the footer are word for word the old page's, the list and the footer in the `Prose` part, the link the `Link` part; both match the old page pixel for pixel in the light scheme. |
| The differences the baseline accepts (settled in step 5) | The orchestrator's ruling, 2026-09-24: four differences between the old page and the React page are deliberate, and `tests/baseline/accepted-differences.json` lists them, each with its field, its states, its old and new form and its ruling: the chart tables' first column in its own case (the Table part's row-header rule, D58 there; Claude's ruling of 2026-09-24), each chart table named by an accessible label so the section's read text has one line fewer per table (the Table part, D58), the 15 drilling states showing 3 advanced fields (step 2's ruling), and the banners' role in the two click states (step 3's ruling). `tools/baseline.mjs --compare` applies them only to the React page, recognised by its `#root` element, never to `legacy.html`. Each is a named rewrite in the tool that first checks the old form is there and fails the state if it is not, so the comparison stays exact about everything else. Result on 2026-09-24 against `vite preview`, charts included: 52 identical, zero unaccepted differences. |
| The pre-commit hook (settled in step 5) | Claude's, 2026-09-24: the hook is tracked at `.githooks/pre-commit` and runs `npm run check`, which is, in order and once each, `python conformance.py .`, `node tests/run.js`, the lint, the type check, the build and `node tools/paint.mjs` (17 seconds). `npm install` points `core.hooksPath` at `.githooks/` through the `prepare` script (`tools/install-hooks.mjs`), as the design system does, and the hook uppercases a lowercase drive letter before running npm, copied from the design system's hook. `.gitattributes` keeps the hook's line endings LF. The untracked `.git/hooks/pre-commit`, which ran conformance alone, is no longer used. Proven on 2026-09-24: a commit goes through, and a deliberate `lt-` class in a TSX file under `src/` fails it at the lint. |
| The paint measurement (settled in step 5) | Claude's, 2026-09-24: `smoke-measure.py` is retired, because it drove the old page through the old page's own markup and could not drive the React page. `tools/paint.mjs` replaces it: step 4's scratch script kept, which serves `dist/` with `vite preview` and runs the design system's paint probe (compiled from `packages/ui/.storybook/paint-probe.ts` in the checkout, never copied) over four states at 1280 px and 390 px in six variants, plus smoke-measure.py's chart checks (one track height, one mark height, a mark never fills its track) and its check that the page does not scroll sideways with every fold open, at 1280 px only because a long badge widens the page at 390 px on the old page and the new alike. It takes about 10 seconds, so `npm run check` runs it. It needs the design-system checkout for the probe and for Playwright, which step 6 does not remove (the probe is not published; the design system's `docs/consumer-reports/2026-09-24-wood-calculator-conversion.md`, finding 9). |

## How the work is run

Each step below is sized for one session and ends with the check that proves it. The
design system's working pattern carries across: an orchestrating session decides each
contract, and subagents build, test and write, with the orchestrator reading every file
before accepting it. Nothing is pushed to `main`, and nothing is deployed, until Scott says.

The master check is the baseline. Before any code moves, a script records exactly what the
current page renders for about forty URL states: every result row's metric and imperial
text, every banner, every note, every table cell, which chart row is highlighted, where
each chart marker sits, and the URL as the page re-writes it. The converted page must
reproduce every file at zero differences, and a difference is a failure until explained.
The one ruled exception is the unreadable-box behaviour, which Scott has ruled will change;
its current behaviour is recorded separately and marked as not a target.

## The steps

| Step | What it does | The check that proves it |
|---|---|---|
| 0 | Capture the baseline on the current page (`tools/baseline.mjs`, `tests/baseline/`). | A second run reproduces every file byte for byte. |
| 1 | Scaffold the Vite app on the branch: `package.json` keeping `"type": "module"`, `@livetools/ui` linked locally from the design-system repo, `src/main.tsx` with the provider, `globals.css` with the three imports, the lint configs extended, the data imported as modules with the data check run at start, the Fusion panel's files kept at their addresses, and `npm run check` including `node tests/run.js`. | `npm run check` green on an app that renders the title; the 201 tests pass; `vite preview` serves `/fusion.html?harness=1` with a rendered job. |
| 2 | The form: every input as a part, the app state in one place, the URL reading and writing carried across, and the results held back while any box is in error. It needs the design system's button-row and card layouts first. | The lint at zero findings; `12,000` in the speed shows the blocking message and no numbers; the URL after load equals the baseline's for every state. |
| 3 | The results: the limit line, the banners with their fold, the output card, the notes and the badges. | The baseline comparison at zero differences for every state, charts excluded. |
| 4 | The charts and their tables, as ruled above. | The baseline comparison including the highlighted rows and the marker positions; the design system's paint measurement against `vite preview`. |
| 5 | The gates and the documentation: the pre-commit hook, `CLAUDE.md` rewritten for the React app, and the findings reported to the design system. | A commit goes through the hook; a deliberate `lt-` class in a TSX file fails it. |
| 6 | Publish and deploy, on Scott's word: the published package version swapped in, the baseline run against that build, the GitHub Pages workflow added and the Pages source switched, the first deploy, the baseline run against wood.fusioncam.co, and the Fusion add-in opened against the live site. | The live page reproduces the baseline; the panel receives its hello. |

## What is not settled yet

- The table part's row headers now wrap (settled 2026-09-24). Step 4 found that the chart
  names in the table under the chart ladder stayed on one line, so the table was 765 px wide
  in a 602 px box and scrolled sideways. The design system fixed it the same day (commit
  5c757e7, its D58 amended). Step 5 rebuilt the linked package and measured: at 1280 px and
  900 px the table is 602 px in its 602 px box and does not scroll sideways. At 400 px it
  still does, because the column headers do not wrap, exactly as on the old page; that is
  finding 3 in the design system's `docs/consumer-reports/2026-09-24-wood-calculator-conversion.md`.
- The two things the Table part changes in the tables under the charts (the first column in
  its own case, and no hidden caption line) are ruled deliberate and accepted by the
  baseline comparison in step 5 (the rulings above). The baseline itself was not
  re-captured.
- Holding each banner's re-mount to the same one-second settle as "Numbers updated."
  cannot be done with the `Alert` part as it is (step 4, 2026-09-24, so not attempted). A
  banner mounted after load is a live region (Chromium's accessibility tree reports
  `live: assertive` or `polite`, `atomic: true`, `relevant: additions text`), so a
  banner kept mounted while its words change live is announced on every change, the same
  as a re-mount; only holding back the displayed words would stop it, and the displayed
  words must never wait. It needs the design system: a way for an `Alert` to stay quiet
  so the app can say its words once, through `announce()`, when the result has settled.
  Until then the banners stay as step 3 left them, keyed by their words.
- Whether the design system's publish workflow succeeds on its first real run, which has
  never happened (survey, section 6). Found out at step 6.
- The build depends on the design-system checkout beside this one until step 6. Found in
  step 1 (2026-09-24): `@livetools/ui` is a link to `../livetools-design-system/packages/ui`,
  and npm did not install that package's own dependencies (`@base-ui/react`,
  `react-aria-components`) into this repo; they load from the design-system checkout's
  `node_modules`, and the lockfile does not list them. So a fresh clone anywhere else cannot
  build, and while the design-system repo is rebuilding its package, this repo's lint and
  build fail for the seconds its `dist/` is missing (seen once in step 1; a rerun passed).
  Swapping to the published version in step 6 ends both.
- `tools/paint.mjs` (step 5) reads the paint probe's source and Playwright from the
  design-system checkout, so `npm run check`, and with it the pre-commit hook, still needs
  that checkout after step 6 swaps in the published package, because the package does not
  ship the probe. Either the design system ships it (finding 9 in
  the design system's `docs/consumer-reports/2026-09-24-wood-calculator-conversion.md`) or the Pages workflow in step 6 runs the gate without it.
  To decide at step 6.
- The three 3D surfacing decisions Scott deferred on 2026-09-24 are not part of this work;
  they are in `CLAUDE.md`'s TODO list.
