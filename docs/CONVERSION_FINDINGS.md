# What the calculator's React conversion found in the design system

Written 2026-09-24 by Claude, at step 5 of `docs/CONVERSION_PLAN.md`, on the
`react-conversion` branch. It lists everything steps 0 to 5 of the conversion found in the
Livetools design system's React parts (`@livetools/ui`, linked from
`livetools-design-system/packages/ui`), each with how it was found and what it needs. It
is written to be moved into the design system's consumer reports (`docs/consumer-reports/`
there) as the calculator's third report. Decision numbers (D58 and so on) are the design
system's, in its `docs/DECISIONS.md`; the sentence around each says what the decision is.

Every measurement below was taken in Chromium through Playwright, against the built page
under `vite preview` and, where a comparison is given, against the page before the
conversion (`legacy.html`, served by `tools/serve.js`).

## Summary

| # | Finding | Status on 2026-09-24 | What it needs |
|---|---|---|---|
| 1 | A banner in a results view that changes as you type is announced on every change | Open | A quiet mode on `Alert`, so the app can say its words once through `announce()` |
| 2 | A table's row headers in words could not wrap | Fixed upstream the same day (D58 amended) | Nothing more |
| 3 | A table's column headers do not wrap at phone width | Open | A way for a column header in words to wrap |
| 4 | A row of four buttons has a width floor wider than a phone's field | Open, recorded in D64 | A decision on how a button row behaves under its floor |
| 5 | A titled banner's title is one step larger than the old banner's | Accepted by the calculator | Confirmation that the size is intended |
| 6 | An app drawing its own chart has no sanctioned route to the chart emphasis, a mark's position or a floating tip | Open, recorded in D61 | The chart exports release 2 promises |
| 7 | A number field cannot hold an exclusive lower bound, and rounds its `min` to its display decimals | Open | An exclusive bound on `NumberField`, or a written rule for apps |
| 8 | A long badge does not wrap and widens the page at phone width | Open, same on the old page | A decision on whether a badge's words may wrap |
| 9 | The paint probe is not in the published package | Open | Ship it, so an app can measure its page without the design-system checkout |
| 10 | A linked copy of the package does not bring its own dependencies, and breaks while it rebuilds | Ends at step 6 | Nothing, if the published package is used |
| 11 | The results area's live region and `Alert`'s own role announced each banner twice | Settled in the app | Nothing more; recorded for the record |

## 1. A banner in a changing results view is announced on every change

**How it was found.** Step 3 took the live region off the results area, because `Alert` gives
a banner mounted after load its own role (`alert` for danger and warning, `status` for
success and info) and the two together announced each banner twice (finding 11). The
figures are then carried by one polite "Numbers updated." said through `announce()` once
they have changed and held still for a second, so typing 22000 key by key says it once.
Step 4 tried to hold the banners to the same one-second settle and could not. A banner
mounted after load is a live region: Chromium's accessibility tree reports it as
`live: assertive` or `polite`, `atomic: true`, `relevant: additions text`. So a banner kept
mounted while its words change is announced on every change, exactly as a banner mounted
fresh is. The only way to stop that from the app is to hold back the words the banner
shows, and the calculator must never show a warning late. So each banner is keyed by its
words and announces whenever its words change, which while someone types a speed can be
several times in a second.

**What it needs.** A way for an `Alert` to stay quiet: no role, no live region, whether it
mounted at load or later, so that the app can say the banner's words once through
`announce()` when the result has settled. The default should stay as it is, because a
banner that appears once after an action is exactly what the role is for.

## 2. A table's row headers in words could not wrap

**How it was found.** Step 4 measured the table under the calculator's chart ladder, whose
first column names charts such as "Onsrud 60-000-HH (high-helix hogger)". The release rule
for row headers (`.lt-table tbody .lt-table__rowheader`) kept the value grid's
`white-space: nowrap`, so the names stayed on one line and the table measured 765 px in its
602 px box at every page width. It scrolled sideways, and the part made its box a Tab stop
while it did. The old page wrapped the names and never scrolled at 900 px or wider.

**Status.** Fixed in the design system on 2026-09-24 (commit 5c757e7, D58 amended): a row
header in an ordinary table wraps like any other cell, while a part-number row header and a
value grid's keep their `nowrap`. Checked in step 5 after rebuilding the linked package: at
1280 px and at 900 px the ladder's table is 602 px wide in its 602 px box and does not
scroll sideways, and its row headers compute `white-space: normal`. The box still takes a
Tab stop, correctly, because the table is 1454 px tall in a box 628 px tall and scrolls up
and down.

## 3. A table's column headers do not wrap at phone width

**How it was found.** While checking the row-header fix in step 5, at 400 px. The column
headers still compute `white-space: nowrap`, so the ladder's table is 564 px wide in a
298 px box and scrolls sideways; its header "PUBLISHED BAND (MM/TOOTH)" alone takes 221 px.
The old page does the same at 400 px (571 px in 298 px), so nothing is lost by the
conversion, but a phone user has to scroll a three-column table sideways to read a row.

**What it needs.** A way for a column header in words to wrap, as a row header in words now
does, while a header over figures keeps its line. The calculator does nothing about it
locally, because an app rule reaching into the part is what the rules forbid.

## 4. A row of four buttons has a width floor wider than a phone's field

**How it was found.** Recorded in D64 when the radio group gained its button-row layout, and
seen in the calculator at 400 px. The profile row (Gentle, Standard, Aggressive, Finishing)
cannot shrink below 345 px, because a button's words do not wrap. At 400 px it overhangs
its 334 px field by 11 px, and at 390 px it overhangs a 324 px field by 21 px. The old
page's hand-made row measures the same at both widths, so this is not a change the
conversion made.

**What it needs.** A decision in the design system on what a button row does below its floor:
wrap the words, wrap the row onto two lines, or fall back to the list layout.

## 5. A titled banner's title is one step larger than the old banner's

**How it was found.** Step 3's screenshots, then measured in step 5 on the state with four
warnings folded into one list: the title "4 things to check on this cut" is 14 px on the
React page and was 13 px on the old page, and the list under it is 13 px on both. The
`Alert` part sets a title at the page's text size and its body smaller, where the old page
set both small. The refusal and the block titles read one step larger in the same way. A
banner with no title keeps the old small size through an app class on its own paragraph.

**What it needs.** Only confirmation that this is the intended look for a titled banner. The
calculator accepted it (the plan's rulings, "A titled banner's look").

## 6. An app drawing its own chart has no sanctioned route to the emphasis, a position or a tip

**How it was found.** The survey (section 2, rows 24, 25 and 27), then step 4. Three things the
old charts did are refused by the app rules (D61):

- The highlighted bar carried `.lt-chart-emphasis`, the design system's class that keeps the
  emphasis under forced colours. An app may not write an `lt-` class, so the calculator
  paints its own `chart-emphasis` class from an app token that reads
  `--lt-chart-mark-emphasis`, and re-declares the forced-colours rule
  (`forced-color-adjust: none; background-color: Highlight`) on its own class. If the system
  changes that rule, the calculator will not follow.
- Each bar's start and each marker's place were an inline `left`. An app may write only
  inline and block sizes, so each bar and marker now sits after an empty spacer sized with
  `inline-size`. It works and measures exactly, but it is a workaround every chart-drawing
  app would have to rediscover.
- The floating tip over the charts was placed with an inline `left` and `top`, and there is no
  part that positions a tip. It was dropped (the plan's rulings), which cost nothing because
  every word it showed is also the row's accessible name and the table under the chart.

**What it needs.** The sanctioned route D61 leaves to release 2: exported chart mark classes
(or a `Measure`-style part) that carry the emphasis and its forced-colours rule, a way to
place a mark along a track, and a positioned tip. When they exist the calculator moves onto
them (Scott's chart ruling).

## 7. A number field cannot hold an exclusive lower bound

**How it was found.** Step 3, making an advanced box at 0 or below refused. The box must accept
any number above 0, including the 0.5 m/min machine feed the old page served (a baseline
state), and refuse 0. `NumberField` has only an inclusive `min`, and the part writes that
`min` rounded to the box's display decimals. The machine max feed box shows whole m/min, so
a `min` of 0.001 is written as 0 and reads "at least 0", while a `min` of 1 refuses the
0.5 m/min the old page served. The calculator holds the bound in its own state
(`src/form-state.js`, `above: 0`) and hands the field its message as the field's own rule.

**What it needs.** An exclusive lower bound on `NumberField` ("more than 0", with its own
message), or a rule written down that an app enforces exclusive bounds itself as the
calculator does. Separately, whether rounding `min` and `max` to the display decimals is
intended, since it can move a bound.

## 8. A long badge does not wrap and widens the page at phone width

**How it was found.** Step 5, measuring the page at 400 px and 390 px. On the default routing
page the badge "Band 0.152 to 0.330 mm/tooth · Onsrud 48-000, Onsrud 56-200, Onsrud 61-200"
is 461 px wide on one line, so the page is 494 px wide and scrolls sideways. The old page
does exactly the same. `tools/paint.mjs` therefore checks that the page does not scroll
sideways only at 1280 px, and says why.

**What it needs.** A decision on whether a badge's words may wrap, or whether an app with long
badge text should use something other than a badge.

## 9. The paint probe is not in the published package

**How it was found.** Step 5, making step 4's scratch script into `tools/paint.mjs`, which runs
the design system's paint probe (`packages/ui/.storybook/paint-probe.ts`, D59) over the
calculator's built page in six variants at two widths, inside `npm run check`, in about ten
seconds. The probe is compiled from its source in the design-system checkout, because the
package publishes only `dist`. Once the calculator uses the published package (step 6),
this check still needs the checkout beside it, or stops with exit code 2.

**What it needs.** The probe shipped in the package (for example as
`@livetools/ui/paint-probe`, built to plain JavaScript), so that any app can measure its own
page the way the catalogue measures every story.

## 10. A linked copy of the package does not bring its dependencies, and breaks while it rebuilds

**How it was found.** Step 1. `@livetools/ui` is linked as
`file:../livetools-design-system/packages/ui`, and npm did not install the package's own
dependencies (`@base-ui/react`, `react-aria-components`) into the calculator; they load from
the design-system checkout's `node_modules`, and the lockfile does not list them. While the
design system rebuilds its package, `dist/` is missing for a few seconds and the
calculator's lint and build fail (seen once in step 1; a rerun passed). Step 5 waited for
the design system's own gate to finish before rebuilding the package, for the same reason.

**What it needs.** Nothing from the design system if the calculator moves to the published
package in step 6, which ends both. It is worth a line in the design system's guidance for
any app linked to a checkout during development.

## 11. The results area's live region and `Alert`'s role announced each banner twice

**How it was found.** The survey (section 2, row 27). The old page gave its banners no role,
because the results area was a polite live region that announced everything in it. `Alert`
sets its own role on a banner mounted after load and the author cannot turn it off, so
inside that live region each banner would have been announced twice.

**Status.** Settled in the calculator (the plan's rulings, step 3): the results area has no
live region, the banners announce themselves, and "Numbers updated." carries the figures.
In the baseline this shows only as the banners' role in the two states that click, which
the comparison accepts as ruled. It is recorded here because finding 1 comes from it.

## What worked, and should not change

- The `Table` part named by `label`, with no caption: the table's name reached every screen
  reader the same way and the baseline's name field matched in all 48 states with a table.
  The row headers kept in their own case (D58) are accepted as a deliberate difference.
- `hidden` hiding everything (D63) and the radio group's button-row and card layouts (D64)
  arrived before the form was built and let the calculator keep its look with no app rule
  reaching into a part.
- The app lint caught every `lt-` class and every inline position the conversion might have
  written, and the pre-commit hook now proves it fails on one (step 5).
- After the conversion the React page reproduces all 52 states of the old page's baseline,
  with only the four ruled differences (`tests/baseline/accepted-differences.json`).
