# The public page's baseline

Captured 2026-09-24 on the `react-conversion` branch at commit d2af43e, before any
application code was converted. This is step 0 of `docs/CONVERSION_SURVEY.md` (section
9), and the check that sections 8 and 9 lean on: the converted page is done when it
reproduces every file here with zero differences. The calculator's numbers go to
someone's spindle, and a number that drifts by one rounding step still looks right in
review. A byte that drifts here does not.

## What it captures

`states.json` is the list of links: 52 page states, each named for what it shows, plus
three records of today's behaviour with an unreadable box (see the last section). For
each state `tools/baseline.mjs` opens the page at that link, runs the state's clicks if it
has any, waits until two reads in a row agree, and writes `<state>.json` with:

- **`url`**: the query string as the page re-wrote it after loading. This is what a
  shared link means, including a link from before drilling existed.
- **`results`** and **`diagnostics`**: the whole rendered text of each section, then
  every block in reading order with its role:
  - each banner's variant, glyph, title, paragraphs, list items and `role` attribute;
  - each output row's label, metric string, imperial string, whether it is a secondary
    row, and its note;
  - the notes box, the badges (variant, glyph, text), headings;
  - each chart: every row's label, value text, whether it carries the emphasis, the
    bar's start and width and the marker's position as the percentage the code wrote,
    and the row's accessible name (the same sentence the hover tip shows); plus
    `emphasised`, the rows that carry the highlight, which must be exactly the serving
    or binding row;
  - each table twin: summary, caption, headers and every cell.
- **`form`**: every visible field's label, what its box shows, its unit, its hint and any
  message under it. The data-derived sentences live here: the machine note, the first-cut
  label, the advanced hints that quote the data. So does the machine max feed shown in
  m/min.

`_manifest.json` records the commit, the Chromium and Playwright versions and the
viewport. It is kept apart so that comparing never trips on it.

## What is normalised, and why

Nothing that could hide a difference.

- Text is read as the browser renders it (`innerText`). That applies the browser's own
  whitespace collapsing and the CSS `text-transform`, which is why field labels read in
  capitals. Nothing is trimmed or rounded on top.
- Every fold (the table twins, Advanced) is opened before reading, so their contents are
  rendered text, not raw template whitespace. Opening a fold changes no number.
- The address is kept as the query string only, because the host and port differ between
  this server, `vite preview` and the live site.
- Positions are the strings the code wrote into the `style` attribute with the `%`
  removed. The ladder writes one decimal place. The capacity bars' widths are unrounded
  floating-point values (for example `20.435851800000002`), so rewriting the formula in a
  different order shows up here, on purpose.

## Running it

It needs Node and Playwright. Playwright is not a dependency of this repo. The tool finds
it at `$PLAYWRIGHT_MODULE`, then as an installed `playwright` package, then in the
design-system checkout beside this one
(`../livetools-design-system/node_modules/playwright`). If it finds none it stops with
exit code 2. It never skips quietly.

```bash
node tools/baseline.mjs --compare                    # this checkout's legacy.html, served on a free port
node tools/baseline.mjs --compare --base http://localhost:4173/     # vite preview
node tools/baseline.mjs --compare --base https://wood.fusioncam.co/ # the live site
node tools/baseline.mjs --compare --only drill-bank-on-hinge-35     # one state
node tools/baseline.mjs --compare --base http://localhost:4173/ --sections url,form  # some parts only
node tools/baseline.mjs --compare --base http://localhost:4173/ --url-only           # the address only
node tools/baseline.mjs --compare --base http://localhost:4173/ --no-charts          # all but the charts
node tools/baseline.mjs --out some/dir               # capture somewhere else
node tools/baseline.mjs                              # RE-CAPTURE into this folder
```

Since step 1 of the conversion (2026-09-24) the page before the conversion is
`legacy.html`, the old `index.html` renamed with not a byte changed, and `index.html` is
the React page. Without `--base` the tool loads `legacy.html`; to reach it on a server
you started yourself, pass `--base http://localhost:<port>/legacy.html`.

`--sections` (added in step 2 of the conversion, 2026-09-24) compares only the named parts
of each file, from `url`, `form`, `results` and `diagnostics`, for a converted page that has
not rebuilt the rest yet; `--url-only` is `--sections url`. The parts named are compared whole,
exactly as in a full comparison. The reader in `tools/baseline.mjs` reads the form from either
page's markup into the same JSON: the React select's face, its checkbox role and its card-layout
tool picker, and an absent `aria-invalid` read as `"false"`. Run against `legacy.html` after
that change it still reproduced all 52 files.

`--no-charts` (added in step 3 of the conversion, 2026-09-24) leaves the charts out of both
sides of a comparison, for a converted page whose charts are not built yet. In `results` and
`diagnostics` it drops every chart and table block (the converted page holds each chart's
place with an empty element marked `data-chart-slot`, which the reader counts as a chart),
and cuts each section's whole text at the line where the first chart's text begins: its
heading, its first row's label, or its table's summary. The old page drew its charts last in
both sections, so everything before the cut is every banner, number, note and badge, and is
compared exactly as in a full comparison. A non-chart block after a chart, or a first line
that cannot be found, fails the state instead of cutting it. Run against `legacy.html` it
still reproduces all 52 files.

`--compare` prints `same` or `DIFF` per state, with the paths that differ, the old value
and the new one, and exits 1 on any difference. Without `--base` it starts
`tools/serve.js` itself and stops it afterwards. A full run takes under a minute.

Re-capturing overwrites the baseline. Do it only when a difference has been looked at and
Scott has ruled that the new behaviour is right, and say so in the commit.

## What a difference means

A difference is a change a machinist can see: a number, a unit, a rounding, a message, a
refusal, a highlighted chart row, a marker's place, or what a shared link opens to. Each
one is a finding until someone explains it. A few kinds are expected during the
conversion, and each needs its own ruling rather than a re-capture:

- **Markup the conversion changes on purpose.** The reader in `tools/baseline.mjs` finds
  things by today's class names (`.out-row`, `.lt-chart-emphasis`, the `left:` in a
  style). When the converted page draws the same thing with different markup, the
  selectors in `readPage()` change in the same commit and the JSON they produce must not.
  Changing the JSON's shape to make a comparison pass defeats the baseline.
- **The banners' `role`** (`ariaRole`). Today the results banners carry none, because the
  results section announces itself. The survey expects this to change (its question 11).
- **The tool and profile pickers' look.** Their options and the chosen one are recorded
  as text, which should survive a change of look.

Anything else, and above all any number, is a regression.

## Today's unreadable-box behaviour: NOT a target

`today-unreadable-*.json` record what the vanilla page does when a box holds something it
cannot read: `12,000` in the spindle speed, `abc` in the flutes, `6,5` in the depth per
pass. Each is captured twice, once with the text still in the box and once after leaving
it. Scott has ruled that this behaviour **changes**: the converted page shows no numbers
until the box is fixed. These files exist so the change can be seen, each carries a
`WARNING` saying so, and `--compare` skips them.

What they show today: the page reads `12,000` as twelve thousand rpm and `6,5` as 6.5 mm,
and shows numbers for both with no message. `abc` in the flutes marks the box "That is not
a number." while the page quietly works out the cut for two flutes; on leaving the box the
text is cleared, the message goes, and the two-flute numbers stay.
