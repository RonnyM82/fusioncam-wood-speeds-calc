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

- Whether the table part's row-header release lets a long chart name wrap in the first
  column (survey, section 2, row 26). The first build session checks it.
- How the Fusion panel's files are published without duplicating `js/core/`, `js/data/`
  and `data/` (survey, section 6). Settled in step 1.
- Whether the design system's publish workflow succeeds on its first real run, which has
  never happened (survey, section 6). Found out at step 6.
- The three 3D surfacing decisions Scott deferred on 2026-09-24 are not part of this work;
  they are in `CLAUDE.md`'s TODO list.
