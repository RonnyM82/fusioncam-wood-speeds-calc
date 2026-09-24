# Conversion survey: the wood calculator onto the Livetools React parts

Written 2026-09-24 by Claude, on the `react-conversion` branch (made today from `main`, at
commit d2af43e, the same commit `main` is on). This is a survey, not a plan the work has
started from: nothing in the repo changed except this file. It exists so the conversion
can be planned with every gap, every changed behaviour and every question written down
before a line of the app is rewritten. The reader is assumed to know the calculator's
`CLAUDE.md` and the design system's `docs/PLAN.md` and `docs/DECISIONS.md`; where a
decision number appears below, the sentence around it says what the decision means.

The reason this survey is careful: the numbers on this page go to someone's spindle. A
conversion that changes a served feed, a unit, a message or a refusal, and still looks
right in review, is the failure to design against. Section 8 ranks those.

## 1. What the calculator is, and which surface converts

The calculator at `wood.fusioncam.co` is a free, static, browser-only speeds-and-feeds
tool for wood CNC work. It serves two operations from one page. Routing takes a material,
a solid-carbide tool type, a diameter, a flute count, the board thickness, an optional
depth and width of cut, a spindle speed, a machine preset, a profile (Gentle, Standard,
Aggressive, Finishing) and a first-cut reduction, and returns a spindle speed, surface
speed, cutting feed, feed per tooth, lead-in, lead-out, ramp and plunge feeds, plus the
ball-nose geometry rows when the tool is a ball. Drilling takes a drill family and
diameter, a hole depth, an optional speed and a drill-bank tick, and returns a speed, a
plunge feed, feed per revolution, feed per edge and a peck depth where one is published.
Every number traces to a published chart or a measured study held in `data/`, and the
calculation engine in `js/core/` is pure and shared with 201 node tests that pass today
(`node tests/run.js`, run on this branch on 2026-09-24).

It has two surfaces on the same site:

- **The public page**, `index.html` with `js/ui/app.js`, `styles.css` and
  `app-tokens.css`. This is what a machinist opens in a browser.
- **The Fusion panel**, `fusion.html` with `js/ui/fusion-panel.js` and `fusion.css`. The
  Fusion add-in in `fusion-addin/` opens a palette on
  `https://wood.fusioncam.co/fusion.html?protocol=1&addin=...&build=...&theme=...`
  (`fusion-addin/WoodSpeedsFeeds/lib/constants.py`, `PANEL_URL`). So the panel is served by
  the same GitHub Pages site as the public page, but it only ever renders inside Fusion's
  embedded browser, which the spike identified as Qt WebEngine (Chromium-based,
  `fusion-addin/spike-results-windows.md`, section 11).

**"Main screen" in the plan means the public page only.** The plan's phase 2 done-condition
says "the wood speeds-and-feeds calculator's main screen is rebuilt on Vite from parts
only" and that it "goes public on the parts at `wood.fusioncam.co`". D31 calls the
calculator "a one-shot app of exactly the kind the Vite template is for". Phase 7 of the
plan says the calculator "uses `lt-number-field` and `lt-unit-toggle` in its own files" and
converts as the proof of the Vite path. The Fusion panel is never named in the plan or the
register, and it is not a screen a person navigates to from the public page; it is a
second application that shares the engine and the data. Section 7 recommends what to do
with it. One correction to the plan's wording, for the record: the public page has no
`lt-unit-toggle` on it at all (see section 3). The plan's sentence is true of the vendored
elements module, not of the page.

## 2. Inventory of the main screen

Every element on `index.html` and everything `app.js` renders, in page order. "Part" is
the React part in `packages/ui/src/index.ts` as of 2026-09-24. "Gap" means no part exists
today. Every gap carries what the conversion has to do about it.

| # | On the page today | What it does | Part that replaces it | Props that matter, and notes |
|---|---|---|---|---|
| 1 | `<header>` with `<h1>` and `<p class="tagline">` | The title and the one-paragraph description. | No part needed; plain elements styled by the app's own CSS. `Shell` is the brand chrome and is wrong here: the page has no brand bar, and controls sit under the header on the panel. | The tagline could sit in `Prose`, but it is one paragraph and app CSS already sizes it. |
| 2 | `<main id="app" class="lt-panel">` | The working surface: light in both schemes, the controls belong on it. | `Panel` with `as="main"`. | `Panel` takes `className`, so the app's geometry rule for `main` (padding, border, radius) attaches through an app class. The load-failure banners replace the panel's whole content today (`$('app').innerHTML = ...`); in React the app renders an `Alert` instead of the form. |
| 3 | `<form id="inputs" onsubmit="return false">` | Holds the controls. Nothing is ever submitted; the page recalculates on every change. | `Form`. A raw `<form>` is a lint finding (D61: an app never writes a raw form, because a field in a plain form never shows its message). | `Form` renders `noValidate` and validates on change. Give it no `onSubmit`; nothing posts. The keyboard Enter in a text box would submit a plain form and reload the page today too, and `onsubmit="return false"` stops it; in `Form` an `onSubmit` that does nothing keeps that. |
| 4 | `#mode`: two buttons with `role="radio"` in `.lt-btn-group.seg-group`, built by `buildRadioGroup()` | Picks Routing or Drilling. A segmented button row with the arrow-key radiogroup contract, drawn like `lt-unit-toggle`. | **GAP.** `RadioGroup` exists but draws a vertical list of `.lt-check` radios, not a button row. `ButtonGroup` has no state ("not a toggle group, not a radio group, not a segmented control", its header). `UnitToggle` is that exact shape but reads and writes the unit system and takes no items. | Three routes. (a) Use `RadioGroup` with `items` [Routing, Drilling]: correct keys and announcement, different look. (b) Keep a temporary app-layer segmented control that writes `lt-btn`, `lt-btn--primary` and `lt-btn-group`: breaks D21 and the `no-lt-classes` lint rule, so the app cannot pass `npm run check` without an exemption. (c) Wait for a segmented-radio part, which is not planned in either release. Recommend (a) and ask the design system for a "segmented" layout on `RadioGroup`. Question 2 in section 10. |
| 5 | `<select class="lt-select" id="material">` | Picks the material from the seven beginner picks in `MATERIALS`. | `Select` with `items` `[{ value, label }]`, `label="Material"`, `value` held by the app. | `onValueChange` gives `string \| null`; with no `placeholder` it is never null. Type-ahead on the closed face picks the first match without opening (D50), which a native `<select>` also does, so no new behaviour for a machinist. The `hint` lines in `MATERIALS` are not shown today and need not be. |
| 6 | `<fieldset class="lt-fieldset">` with `<legend>` and `#tooltype`, a grid of `.tool-card.lt-check` labels each holding a radio, a name and a hint | Picks the tool type (routing) or drill family (drilling). The card is the hit area; the radio is a real `.lt-check`. | `RadioGroup` with `items` carrying `label` and `hint`, `label` "Tool type" or "Drill type". `Fieldset` is not needed on top, because `RadioGroup` names the group itself. | **Look changes.** `RadioGroup` takes no `className`, and an app CSS rule reaching `.lt-check` inside it is the "never target the inside of a component" mistake. The card grid (`.tool-grid`, `.tool-card`, the selected outline) goes. Each option keeps its hint line under it, which is what carries the meaning. Question 3. |
| 7 | `<select id="diameter">` with a label that switches between "Tool diameter" and "Drill diameter" | Picks the diameter; the list is `DIAMETERS` for routing and `DRILL_DIAMETERS[family]` for drilling, snapped to the nearest published size on a family change. | `Select`, `label` computed from the mode, `items` from `diameterLabel()`. | Values are strings; the app already does `Number(e.target.value)`. Keep that. |
| 8 | `<lt-number-field id="f-flutes" ... min="1" max="6" step="1" decimals="0" stepper>` | Flute count, a plain number with no unit. | `NumberField` with `label="Flutes"`, `decimals={0}`, `min={1}`, `max={6}`, `step={1}`, `stepper`. | No `measure`, no `unit`, so the affix is empty and the range message reads "Must be between 1 and 6." as today. See section 3 for what the app does with an empty or refused value. |
| 9 | `<lt-number-field id="f-thickness" measure="length" decimals="1" min="1" max="120" step="1" stepper>` | Board thickness, mm. | `NumberField`, `measure="length"`, `decimals={1}`, `min={1}`, `max={120}`, `step={1}`, `stepper`. | `decimals` must stay explicit: the length measure defaults to 2 in metric. |
| 10 | `<lt-number-field id="f-doc" ...>` with a hint; empty means the full board thickness | Depth per pass, optional. | `NumberField`, `measure="length"`, `decimals={1}`, `min={0.1}`, `step={0.5}`, `stepper`, `hint`. `value` null when empty. | The `hint` prop is wired to `aria-describedby` by the part, as the element did. |
| 11 | `#f-holedepth` (hint, `min=1 max=120`) and `#f-drillrpm` (`measure="rotation"`, `min=500 max=30000 step=500`, empty means the published speed) | Drilling's two fields; shown only in drilling. | Two `NumberField`s. | Today the fields are hidden with the `hidden` attribute and the app-layer `.lt-field[hidden]` correction. In React they are simply not rendered in the other mode. See row 26. |
| 12 | `#f-woc` (hint, optional) and `#f-rpm` (`measure="rotation"`, `min=1000 max=30000 step=500`) | Routing's width of cut and spindle speed. | Two `NumberField`s. | The rotation measure shows "rpm" in both systems. |
| 13 | `<select id="machine" aria-describedby="machine-note">` plus `<span class="lt-field__hint" id="machine-note">` filled from the preset's notes | Picks the machine; the hint under it is the preset's own note ("This machine publishes no spindle power. The reference default of 8 kW serves."). | `Select` with `hint={presets[i].notes ?? ""}`, recomputed on each change. | The hint text is data-derived; section 8 lists a check for it. |
| 14 | `#profile`: the profile button row (Gentle, Standard, Aggressive, and Finishing in routing only) | How hard to run it. Same builder and keyboard contract as row 4. | **GAP**, same as row 4. | Same three routes. The parked-per-mode profile and the Finishing button vanishing in drilling are app state, unchanged. |
| 15 | `#firstcut-field`: `.lt-check` label with a checkbox; label text built from `rules.first_cut.factor` ("First cut: run 70% of the chart feed until the cut proves good") | The first-cut reduction; hidden while Finishing is on. | `Checkbox`, `label` computed from the data, `checked` held by the app. | Hidden by not rendering, as row 11. |
| 16 | `#drillbank-field`: checkbox | These holes run on a drill bank. Drilling only. | `Checkbox`. | |
| 17 | `<details id="advanced"><summary>Advanced</summary>` | The fold-out holding the advanced fields. | **GAP, not planned.** No disclosure part exists in either release. `<details>` is not in the lint's raw-element list (`input`, `select`, `textarea`, `dialog`, `table`, `form`, `button`), so a raw `<details>` in an app file passes the lint and breaks no decision. | Keep the raw `<details>` with its app CSS. It is native, keyboard-complete and announces its state. Question 10. |
| 18 | `#advanced-fields`: two `<select class="lt-select">` (flute convention, cut direction) and eleven `<lt-number-field>`s, six with a literal `unit` (kW, m/s², cm², kPa, μ, kg/m³) and five with a `measure` (length ×3, rotation, speed) | The overrides. Machine-derived ones fill from the preset and stick until the machine changes. | Two `Select`s and eleven `NumberField`s inside a `FormGrid`. A literal unit is `unit="kW"` with `decimals`; a measure is `measure="speed"` and so on. | The `hint`s that read data (`footprint_cm2`, `feature_mm`, the vacuum range) stay computed. Machine max feed is entered and shown in m/min and multiplied by 1000 into mm/min in `currentInput()`; that multiply is the one unit conversion the UI does, and section 8 ranks losing it. The μ symbol stays in the affix, never the label, for the reason in the source (CSS uppercase turns Greek mu into a Latin M). |
| 19 | `<section id="results" aria-live="polite">` | Where every result renders. | A plain `<section>` with `aria-live`. Not a part; no lint rule touches it. | See row 27 for the interaction with `Alert`'s role. |
| 20 | The limit line, the warnings, the refusal, the block: `alertHtml()` rendering `.lt-alert.lt-alert--{variant}` with the icon and a title and body, or a `<ul>` body when there are four or more warnings | The messages. | `Alert` with `variant`, optional `title`, and `children` (a string, or a `<ul>` of the warning messages). | The icon comes from the variant, matching `STATUS_GLYPH` exactly (success, warning, alert, info). The fold rule (at most three banners, four or more warnings fold into one list) is app logic and stays; test SC30 pins the ceiling in the engine's terms. |
| 21 | `<dl class="out-card">` of `.out-row` with `.out-label`, `.out-vals`, `.metric`, `.imperial`, `.row-note` | The served numbers: a description list, metric bold and right-aligned, the imperial companion under it, an optional note row. | No part. `Specs` is the nearest and the source says why it is not an equivalent (left-aligned values, no companion line). A raw `<dl>` is allowed; the CSS is app CSS reading tokens only. | Stays as app markup and app CSS. `Num` could wrap each figure for tabular figures, but `.metric` already sets `font-variant-numeric`, so it is optional. |
| 22 | `.notes` box with an `<h3>` and a `<ul>` | Provenance notes ("Notes on this calculation"), deliberately not banners. | No part; app markup and CSS. | |
| 23 | `#diagnostics`: `<h2>`, a `.lt-row` of `.lt-badge.lt-badge--{variant}` chips each with a glyph | "What is going on in this cut": the chip triage. | `Row` holding `Badge`s with `variant` and `icon` from `CHIP_VARIANT` and `STATUS_GLYPH`. | `Badge` requires an icon; the app already gives every chip one. |
| 24 | The capacity cascade: `.cascade` of `.casc-row` with a `.casc-bar` track, a `.casc-fill` whose width is `style="width:N%"`, the binding row's fill carrying `.lt-chart-emphasis` | Which cap sets the feed. | **GAP.** There is no chart part in release 1 or 2, by design ("there is still no chart component", the plan). Release 2 promises "exported class names for an app's own chart marks"; D61 says an app drawing its own marks "will need a sanctioned route to the chart colours and mark classes, which today's rules refuse". Two rules refuse it today: `no-lt-classes` fails `lt-chart-emphasis` in a TSX file, and `no-style-prop` allows only `inline-size` and `block-size` inline. | The fill width is `inline-size`, which is allowed. The emphasis class is not. Routes: (a) wait for release 2's export; (b) an app class `casc-fill--binds` painted from an app token in `app-tokens.css` that aliases `--lt-chart-mark-emphasis`, plus the forced-colours rule (`forced-color-adjust: none; background-color: Highlight`) re-declared on the app class, because the vendored rule that does that lives on the lt class and would no longer apply; (c) drop the emphasis, which is the wrong answer, because the highlighted bar is what tells the reader which cap binds. Recommend (b) and report the gap upstream. Question 4. |
| 25 | The chart ladder (`ladderHtml()`, and the two drilling charts `drillFeedChart()` and `drillSpeedChart()` built on the same classes): `.ladder-row` with a `.ladder-track`, a `.ladder-bar` positioned by `style="left:L%;width:W%"`, a `.ladder-mark` positioned by `style="left:P%"`, the serving bar carrying `.lt-chart-emphasis` | Every published band on one scale, the serving band highlighted, the dotted marker at the served chip (or feed per rev, or rpm). | **GAP**, worse than row 24: `left` is not an allowed inline property, so neither the bar's start nor the marker's position can be written inline. | Position through geometry that is allowed: a flex row inside the track where an invisible spacer carries `inline-size: L%` and the bar follows it with `inline-size: W%`; the marker the same way in a second layer. That is "geometry as data" and passes `no-style-prop`. The emphasis class as row 24. This is the one place where a rewrite can silently move a mark; section 8 ranks it and names the check. |
| 26 | The table twins: `tableTwin()` renders `<details class="table-twin">` holding `.lt-table-wrap > table.lt-table.lt-table--zebra` with a `caption.lt-sr-only`, `th scope="col"` and `th scope="row"` | The accessible twin of each chart, collapsed. | Raw `<details>` (row 17) holding `Table` with `columns`, `rows`, `label` (the caption), `zebra`, `empty`, not `sortable`. | `Table` names the table through `label`, so the `SrOnly` caption goes. The app CSS rule letting row headers wrap (`.table-twin th[scope="row"] { white-space: normal }`) targets an lt table's cell; D58 says the part releases row headers from the header styling itself, and whether that release includes the `nowrap` is not confirmed in this survey (VERIFY in the first build session: a long chart name in the first column must wrap, not scroll). |
| 27 | `#chart-tip`, a `.chart-tip.lt-panel` with `role="tooltip"`, positioned by `style.left`/`style.top` from JS, shown on pointer move and on focus of a chart row (roving tabindex, arrow keys between rows) | The hover layer over both charts. It "enhances and never gates": every sentence it shows is also the row's accessible name and the table twin's third column. | `Panel` with an app class for the box. **GAP for the position**: `left` and `top` inline are refused by `no-style-prop`, and a chart tip has no part. | Routes: (a) drop the tip, since nothing it shows is shown only there; (b) keep the roving-tabindex rows and their `aria-label`s (app markup, allowed) and drop only the floating box; (c) position it through a portal part that does not exist. Recommend (b). Question 5. Also: `Alert` rendered inside the `aria-live` region of row 19 gets `role="alert"` or `"status"` from the part when mounted after load, and the author cannot turn that off ("the author never sets it, which is the point"). Today the app deliberately gives the results banners no role, because `#results` is already live and a role inside it announces the same sentence twice. So after the conversion a screen reader hears each results banner twice. This changes no number. Report it upstream; either the live region comes off `#results` (the banners announce themselves) or `Alert` gains a way to sit in a live region. Recommend taking `aria-live` off `#results` and letting the parts announce, and checking the notes box and the numbers still get announced some other way (`announce()` with a short sentence such as "Numbers updated"). Question 11. |
| 28 | `<details class="defects">` ×2 with `<dl class="lt-prose">` | The two "Something looks wrong" fold-outs. | Raw `<details>` holding `Prose` around the `<dl>`. | |
| 29 | `<footer class="lt-prose lt-prose--full">` with `<a class="lt-link">` | The warranty and the repository link. | `Prose` with `full`, `Link`. | |
| 30 | The inlined sprite `<svg class="lt-sprite">` | The glyphs. | Gone: `LivetoolsProvider` mounts the sprite once. | The re-copy instruction in `index.html` goes with it. |
| 31 | `<script type="module" src="components/lt-elements.js">` then `js/ui/app.js` | The behaviour. | `main.tsx` with `LivetoolsProvider`. | The provider must be given `scheme="system"`: its default is `"light"`, and today the page follows the device because the vendored tokens read `prefers-color-scheme` when no attribute is set. Without that prop every dark-mode user gets a light page. |

Not on the main screen but on the site: `fusion.html` and everything it loads (section
7), `reference/cnc-router-speeds-feeds-reference_4.html` (an archived third-party article
kept for provenance, served today because the whole repo is the site, linked from nothing
on the page), and `research/` (its `sources/` are git-ignored, so they were never served).

## 3. Where a number, a unit or a message is read or written

### The engine call and what the page does with the result

`recalc()` in `app.js` builds the engine's input from `state` (`currentInput()` for routing,
`currentDrillInput()` for drilling), calls `calculate(input, data)` or
`calculateDrilling(input, data)`, and hands the envelope to `render()`, then writes the
whole state to the URL query string (`writeUrlState()`), which `readUrlState()` reads back
at load so a shared link reproduces a cut. The envelope is `{ status, outputs, outputNotes,
warnings, notes, limit, meta }`, or `{ status: 'refused', refusal }`, or
`{ status: 'blocked', block }`. `render()` does four things with it:

1. A refusal renders one danger banner "No number for this one." with the engine's reason,
   and nothing else. A block renders one warning banner "Blocked, not just warned." with the
   reason. In both cases the diagnostics section is emptied.
2. The output rows come from `OUTPUT_ROWS` (routing) or `DRILL_OUTPUT_ROWS` (drilling,
   `js/ui/drill-tables.js`), each row naming an `outputs` key and a formatter from
   `js/ui/format.js`. The formatters do the display rounding and the imperial companions:
   feeds to the nearest 10 mm/min below 2000 and 100 above, and to the whole in/min;
   rpm to the whole; surface speed to the whole m/min and SFM; feed per tooth to three
   decimals and four in inches; feed per rev to two and four; scallop to three and four;
   the effective diameter to two and three. Thousands separators come from
   `toLocaleString('en-NZ')`. Nothing else in the UI rounds.
3. The limit line's severity is decided in `render()`: success only when the chip-load
   target binds and (in drilling) there are no warnings; danger when power or hold-down
   binds; info otherwise. Warnings are danger when the engine says so or the code is
   `chip_plough` or `chip_below_min`, warning otherwise; more than three fold into one list.
4. The charts read `result.meta` (`servingBands`, `contextBands`, `fzEff`, `finishing`,
   `bandServed`, `fnDeliv`, `workedExample`, `materialFactor`, `standardPosition`,
   `rpmRangeMin/Max`, `drillBank`) and `result.limit.caps`, and compute bar positions as
   percentages of the shared scale. The verdict sentences (which band the chip sits in, by
   how much) are computed here with `toFixed(3)` and a `1e-6` tolerance on the serving band.

All of this is app code that carries across as-is; the conversion moves it into TSX
without changing a formula. Sections 8 and 9 make "without changing" checkable.

### How units flow

Everything the engine reads and returns is metric: millimetres, mm/min, mm/tooth, mm/rev,
m/min, rpm, kW, kPa, kg/m³. **The public page has no `lt-unit-toggle`.** Every
`lt-number-field` with a `measure` therefore shows its metric unit, because the element's
`system` attribute defaults to `"metric"` and nothing on the page ever calls `setSystem`.
Imperial appears only as the companion string on each output row, computed by `format.js`
from the metric value. So the "metric base, display converts" machinery exists on the page
but is never exercised.

In React the unit system lives in `LivetoolsProvider` (`unitSystem`, default `"metric"`),
every `NumberField` reads it, and `UnitToggle` is the only thing that changes it. If no
`UnitToggle` is placed on the page, the behaviour is identical to today. If one is ever
added, the input boxes would flip to inches while the output rows keep showing metric
first with the imperial companion, which is a mixed page; that is a product decision for
Scott and not part of this conversion (question 8 in section 10 asks him to confirm
"no toggle").

### What the page relies on in the vanilla `lt-number-field`, and what changed

The app wires each field with `numberField(hostId, initial, apply)`: it sets `el.value`
(the metric base) and listens for `lt-change`, whose `detail.value` is the base or `NaN`.
`apply` maps the value into `state`, and every field's mapping matters:

| Field | What `NaN` (empty, unreadable, or refused) becomes today | Consequence |
|---|---|---|
| Board thickness | `0` | The engine refuses: "Enter board thickness. Each value must be greater than zero." Visible. |
| Flutes | `2`, silently | The page calculates for two flutes while the box may show something else. |
| Spindle speed (routing) | `18000`, silently | The page calculates at 18000 rpm while the box shows whatever was typed. |
| Depth per pass, width of cut, drill speed | `null` | Means "full board", "full slot", "published speed": the documented meaning of empty. Correct for an empty box, wrong for a refused entry. |
| Hole depth | `null` | The engine takes `undefined` and applies its own default. |
| Advanced fields | the key is deleted | Falls back to the machine preset. |

The Fusion panel does this differently and better: it reads `e.detail.state` and, while
the field is in error, holds the cards in a blocked state and keeps the last accepted
speed ("a value the field has refused, 50 rpm say, must never reach calculate()",
`fusion-panel.js`). The public page does not read the state at all. Every changed
behaviour below lands on that difference.

The React `NumberField` differs from the vanilla element in these ways (from
`packages/ui/src/number-field/NumberField.tsx`, its docs page, D18 and D52), each with
what it means for a machinist:

| Change | Vanilla | React | Consequence for a machinist |
|---|---|---|---|
| **Commas are refused** (D52, Scott 2026-09-24) | `parseNumber` read `12,5` as 12.5, `1,240` as 1240, `18,000` as 18000. | Any comma marks the field wrong with "Use a full stop for decimals, and no commas." and the value reported is `null`. | Someone who types `18,000` for the speed gets a red box. With today's mapping the page would then calculate at 18000 rpm by coincidence; typing `12,000` gets a red box and numbers computed at 18000 rpm, silently. Typing `6,5` for the depth gets a red box and numbers for a full-thickness pass. Typing `18,5` for the board refuses visibly. **The conversion must read `detail.state` and show no numbers while any field is in error, as the Fusion panel does.** This is the first item in section 8 and question 1 in section 10. |
| **Text that is not a number stays in the box on blur** (D52) | Cleared on blur; then, unless required, no message at all. | Stays, with "That is not a number." under it. | Better on its own: `12mm` stays visible with its message. Same requirement as above, or the numbers beside it belong to a stand-in value. |
| **The value reported is `null`, not `NaN`** | `detail.value` was `NaN`. | `onValueChange(null, detail)`. | None for the arithmetic: the app's `Number.isFinite(v)` guards treat both the same. The TypeScript types will force the mapping to be explicit, which is a good thing. |
| **`onValueChange` fires only on a person's change** | `lt-change` also fired on blur (a re-emit) and after `setSystem`. | Never on an app-set `value`, a unit flip or a bound moving. | None. `applyMachineToAdvanced()` sets values and then calls `recalc()` itself, so it never depended on the re-emit. The app holds the value (controlled) and updates it from `onValueChange`. |
| **The stepper buttons are not Tab stops** (D52) | Tab landed on minus, box, plus. | Tab lands on the box only; the arrow keys step. | Fewer Tab stops. No number changes. |
| **The text repaints after an arrow key at once** | Repainted on blur only. | At once. | Cosmetic. |
| **Out of range is reported and kept**, both | Same | Same ("Must be between 1 and 6."), `allowOutOfRange` under the part. | Same as today: eight flutes or 40000 rpm still reach the engine with the message showing. Same fix as the first row covers it. |
| **Home and End** | To `min`/`max` when given. | Same. | None. |
| **Formatting** | `toFixed(decimals)`, no grouping. | Same (`formatNumber`, no grouping). | None. |
| **The chip and the state are one thing** | Set in one pass in the element. | Set by the frame from one validity state. | None visible. `lt_dom_audit.py` retires (D26). |

Other parts the page will use, and what changed:

| Part | Change from the vanilla | Consequence |
|---|---|---|
| `Select` (D50) | A letter typed on the closed face picks the first match without opening; Home and End do nothing while closed; Tab while open commits the highlighted option. | A native `<select>` already picks on a typed letter, so the material and diameter pickers behave as before for a machinist. Tab-commits is new but is what a native select does too. |
| `Alert` | The role is set by the part from the moment it mounts (after load: `alert` for danger and warning, `status` for the rest). | Inside `#results`'s live region each banner is announced twice. See row 27 of section 2. No number changes. |
| `Checkbox`, `RadioGroup` (D49) | The stylesheet now draws the box, tick and dot for the React parts. | Look only. |
| `Table` (D58) | Plain when not sortable; releases row headers from the header styling; an overflowing plain table becomes one Tab stop so it can scroll. | The table twins gain nothing and lose nothing. Verify the row-header wrap (row 26). |
| `toast()` (D55) | Newest on top; no overall stack ceiling; three receipts at most. | Not used on the public page. It is used by the Fusion panel, which stays vanilla (section 7). |
| The `hidden` attribute | The app carries `.lt-field[hidden] { display: none }` because `.lt-field` sets its own display and beats the attribute (reported upstream 2026-08-29, still open on 2026-09-24 per the consumer report). | React does not hide; it does not render. The correction and the whole reliance on `hidden` go away. A field left unrendered keeps nothing of its own; its value lives in the app's state, which is what today's code assumes too ("The choice is kept and returns with the other profiles"). One subtlety: an unreadable text in a field that is then unmounted is gone when the field returns, which today's page also loses (the element re-painted from its base). |

## 4. The engine and the data

**`js/core/` is pure and stays untouched.** `tests/run.js` scans every file in `js/core/`
and `js/fusion/` for `fetch`, `document`, `window`, `XMLHttpRequest`, `localStorage` and
`require` and fails the suite on a hit; the scan passed on this branch today. Every module
is an ES module importing only its siblings (`calculate.js` imports `chipload`, `limits`,
`power`, `timber`; `diagnostics.js` imports `chipload` and `limits`; `validate.js` in
`js/data/` imports `bandAtRpm` from the core). A Vite app imports them as they are; Vite
bundles plain `.js` modules without any setting. TypeScript needs `allowJs: true` in the
app's `tsconfig.json` to import them without a type declaration; the alternative, a
hand-written `.d.ts` for the two entry points (`calculate`, `calculateDrilling`,
`buildChips`, `validateData`, `machinePresets`), is more typing and no safer, and either
way the engine's source is not edited.

**`js/data/presets.js` and `js/data/validate.js` are pure** (no DOM, no fetch; checked by
grep on 2026-09-24) and stay untouched. **`js/data/load-browser.js` is the one `fetch`** and
it reads `data/chiploads.json` and the four other files relative to the page. Under Vite
the `data/` folder is not served unless it is either put under `public/` (then it is
served at `/data/...` and the fetch works unchanged) or imported as JSON modules (then the
five files are bundled into the app, about 260 KB of JSON, `chiploads.json` being 192 KB of
it, and `load-browser.js` is no longer called). The tests read the files through
`tests/load-node.js` from `../data`, so **the folder must stay at `data/` for the tests**:
moving it under `public/` breaks `node tests/run.js`, and the two Python tools that
regenerate `drills.json` write to `data/` too. The clean route is to keep `data/` where it
is and point Vite's `publicDir` at a folder that contains it, or simpler, import the JSON
as modules from `../data/` and drop the fetch. The JSON-import route also keeps the
integrity sweep (`validateData` at load) and its danger banner, which is worth keeping
because it is the gate that stops a data edit without provenance from rendering. The
"could not load its data files" banner becomes unreachable and can go. Recommend the
JSON-import route. Either way a data edit now needs a build to reach the site, where
today a push to `main` is the deploy; section 6 covers that.

**`data/` is untouched** in both routes. **`js/ui/format.js` and `js/ui/drill-tables.js`
must stay as `.js` at their paths**, because `tests/drilling.test.js` imports
`DRILL_TOOLS`, `DRILL_DIAMETERS`, `DRILL_OUTPUT_ROWS` and `drillSubfamilyFor` from
`../js/ui/drill-tables.js`, which imports `format.js`. Both are pure (no DOM) and the React
app imports them as they are. `js/ui/app.js` is the file the conversion replaces;
`js/ui/fusion-panel.js` stays for the panel (section 7). The only test that reads
`app.js` at all is a comment in `scenario.test.js` (SC30 describes the banner ceiling that
`render()` implements); the test itself drives the engine.

**The 201 tests keep running unchanged**: `node tests/run.js` needs `"type": "module"` in
the root `package.json` (it is there today and the Vite app's `package.json` keeps it),
Node, and nothing else. Vite's dependencies do not touch it. The test runner should be
added to the app's `npm run check` so the lint, the type check, the build and the 201
tests are one command.

## 5. The app-layer CSS today, and where each rule goes

The template's shape has one `globals.css` with three imports in fixed order: the package
stylesheet, `app-tokens.css`, `app.css`. So the app keeps a CSS file and a token file, and
the question per rule is only whether it survives. "Stays" means it moves into `app.css`
as it is. No rule in `styles.css` writes a literal; every value reads a token, which the
conformance checker still enforces over CSS after the conversion.

| Rule(s) in `styles.css` | What it does | After the conversion |
|---|---|---|
| `:root { font-family }`, `body { margin, padding, max-width: 44rem, background, color, font-size, line-height }` | The page surface and its reading measure. | Stays. The package stylesheet has no `body` rule (checked 2026-09-24), so the app still paints the page. `44rem` is a literal length, not a colour or a px font size, so conformance allows it today and stylelint's two rules do not touch it; the design system now defines `--lt-page-measure-panel: 48rem`, but that is the panel's measure and the site chose 44rem, so leave it. |
| `header h1`, `.tagline` | Title and tagline type. | Stays. |
| `#diagnostics h2` | The section heading, scoped so it cannot reach a part's heading. | Stays. |
| `main { padding, border, border-radius }` | The panel's geometry, never its background. | Stays, attached through an app class on `Panel` (`className` is accepted). |
| `.tool-grid`, `.tool-card`, `.tool-card:has(input:checked)`, `.tool-body`, `.tool-name`, `.tool-hint` | The tool-type card grid and its selected outline. | Goes if the tool picker becomes `RadioGroup` (row 6 of section 2), because the part owns its look and its internals cannot be styled from the app. Stays only under the "temporary app-layer control" route, which the rules refuse. |
| `.seg-group`, `.seg-group > .lt-btn` | The two button rows fill the field width. | Goes with the segmented pickers (rows 4 and 14). It targets `.lt-btn`, an lt class, from app CSS. |
| `.lt-field[hidden] { display: none }` | The app-layer correction for the mode switch. | Goes: React renders or does not render. The consumer report's entry stays open upstream for the vanilla system; it no longer affects this app. |
| `#results > *, #diagnostics > * { min-inline-size: 0 }` | Stops an expanded table twin pushing the column wide. | Stays. Re-measure after the conversion, because `Table` wraps the table in `.lt-table-wrap` itself and the details box around it is still the app's. |
| `.table-twin th[scope="row"] { white-space: normal }` | Lets chart names wrap in the twin's first column. | Probably replaced by `Table`'s own row-header release (D58). VERIFY. If not, this is an app rule reaching inside a part and needs an upstream request rather than a local rule. |
| `details#advanced, details.defects`, `details summary`, `#advanced-fields` | The fold-out boxes. | Stays (raw `<details>` kept, row 17). |
| `#results { display: grid; gap; margin-block }` | Spaces the banners and the card. | Stays. |
| `.notes`, `.notes-title`, `.notes ul`, `.notes li` | The provenance notes box. | Stays. |
| `.out-card`, `.out-row`, `.out-row.secondary ...`, `.out-label`, `.out-vals`, `.metric`, `.imperial`, `.row-note` | The served numbers. | Stays; bespoke on purpose (row 21). |
| `.cascade`, `.casc-row`, `.casc-label`, `.casc-bar`, `.casc-fill`, `.casc-fill:not(.lt-chart-emphasis)`, `.casc-row.is-bind`, `.casc-row.na`, `.casc-val` | The capacity cascade. | Stays except the `:not(.lt-chart-emphasis)` selector, which references an lt class and is replaced by the app's own emphasis class (row 24). The emphasis paint (`--lt-chart-mark-emphasis`, and `Highlight` under forced colours) is re-declared on the app class, because the vendored rule lives on the lt class the app can no longer write. `--lt-chart-track`, `--lt-chart-mark` and `--lt-chart-mark-context` are tokens and stay readable from app CSS. |
| `.ladder`, `.ladder-head`, `.ladder-units`, `.ladder-row`, `.ladder-label`, `.ladder-tag`, `.ladder-track`, `.ladder-bar`, `.ladder-bar:not(.lt-chart-emphasis)`, `.ladder-mark`, `.ladder-range`, `.ladder-legend`, the 480px media rule | The chart ladder and the two drilling charts. | Stays, with the same emphasis change, and with the positioning rewritten from `position: absolute; left` to the spacer construction (row 25), which is a CSS change as well as a markup one. The dotted marker rule stays as it is (a threshold reference line, the one dashed rule the dataviz rules allow). |
| `.casc-row, .ladder-row { border-radius, outline-offset }`, `:hover`, `:focus-visible`, `.ladder-row { min-block-size }` | The row hit area, hover lift and focus ring for the roving-tabindex rows. | Stays. The rows are app markup. |
| `.chart-tip`, `.chart-tip[hidden]`, `.chart-tip__value/__label/__note` | The floating tip. | Goes if the tip is dropped (row 27, recommended). If kept, the box rules stay and the position needs a route that does not exist. |
| `.table-twin`, `.table-twin > summary`, `.table-twin .lt-table-wrap { margin-top }` | The twin's details box. | Stays, except the `.lt-table-wrap` margin rule, which targets a part's internal class; move the margin onto the details box instead. |
| `.defects dt`, `.defects dd` | The two fold-outs' lists. | Stays. |
| `footer` | The footer type. | Stays. |

`app-tokens.css` defines three tokens, all opened by the Fusion panel (2026-09-01) and
used only by `fusion.css`. Two of them, `--lt-page-measure-panel` and
`--lt-tip-max-inline-size`, are now defined in the design system's own
`tokens/lt-tokens.css` (checked 2026-09-24, lines 675 and 684), so they will arrive with
the package stylesheet and the app copies should be deleted on the next vendor of the
panel's tokens to avoid shadowing. The third, `--lt-card-selected-border`, is not upstream
and stays. None of the three is read by the public page, so after the conversion the
public page's `app-tokens.css` is empty apart from whatever the chart emphasis route adds
(the alias token in row 24), which is exactly the slot the template gives it.

## 6. The build and the deploy

**Today.** GitHub Pages serves the `main` branch from the repository root with the legacy
branch build (confirmed 2026-09-24 through the GitHub API for
`RonnyM82/fusioncam-wood-speeds-calc`: `build_type: legacy`, `source: { branch: main,
path: / }`, `cname: wood.fusioncam.co`, HTTPS enforced, certificate approved to
2026-11-24). `.nojekyll` at the root stops Jekyll processing. There is no workflow. A push
to `main` is the deploy, and the pre-commit hook runs `conformance.py` before every commit.
The site is the repo: `index.html`, `fusion.html`, `js/`, `data/`, the four vendored
folders, `reference/` and the checked-in half of `research/` are all live URLs.

**After.** The plan's Vite template shape: `src/main.tsx` with `LivetoolsProvider`,
`src/globals.css` with three imports, `eslint.config.js` and `stylelint.config.js`
extending `@livetools/ui/eslint` and `@livetools/ui/stylelint`, `.github/workflows/pages.yml`
that installs, runs `npm run check`, builds and deploys the `dist/` folder as a Pages
artefact, and a `public/CNAME`. Pinned versions in the proof app today: Vite 8.3.0, React
19.3.0, ESLint 10.11.0, typescript-eslint 8.70.1, Stylelint 17.15.0 (`apps/proof-vite/package.json`).
What has to be true for `wood.fusioncam.co` to keep working:

- **The Pages source setting changes once**, from "Deploy from a branch" to "GitHub
  Actions". The plan calls this the one setting a developer turns on per app. Until it is
  switched, a push with the workflow still serves the old branch build, and after it is
  switched the old `index.html` at the root of `main` is no longer served.
- **The custom domain stays** through `public/CNAME` containing `wood.fusioncam.co`
  (Vite copies `public/` into `dist/` as it is) and through the repository's Pages setting,
  which already holds the domain. The base path is empty under a custom domain, so Vite's
  `base` stays `/`; the plan says the workflow reads the base from the Pages configuration
  step rather than the repository name, for exactly this app.
- **`fusion.html` must keep its address** (`/fusion.html`) and everything it loads must keep
  its address too: `tokens/lt-tokens.css`, `app-tokens.css`, `components/lt-components.css`,
  `fusion.css`, `components/lt-elements.js`, `js/ui/fusion-panel.js` and the modules it
  imports (`js/core/`, `js/data/`, `js/fusion/`, `js/ui/format.js`, `js/ui/drill-tables.js`),
  `data/*.json`, `fonts/` and `icons/`. The `?v=2026-09-02d` cache-bust keys must survive
  the build untouched, because the palette's browser caches stale copies otherwise. The
  simplest way is a `public/` folder holding the panel's files, but that duplicates
  `js/core/`, `js/data/` and `data/` (the copies the tests and the React app read). A
  build step that copies them into `dist/` at build time, or a Vite `publicDir` pointed at
  a folder that contains them by reference, avoids the duplicate. This has to be settled
  in the scaffold session; the check is that `vite preview` serves `/fusion.html?harness=1`
  and the harness panel (`tools/fusion-harness.js`) renders a job.
- **`reference/` and the checked-in `research/` files** are provenance, linked from nothing
  on the page. They need not be served. Recommend keeping the archived article at its
  address under `public/reference/` unchanged, because it costs nothing and someone may
  hold the link; question 6.
- **The `.nojekyll` file** is irrelevant to an Actions deploy and can stay or go.
- **`tools/serve.js`** keeps serving the repo root for the vanilla panel and the tests'
  harness; the React app uses `vite dev` and `vite preview`.

**The gates.** `conformance.py` reads `.html`, `.js` and `.css`, not TSX, so after the
conversion it gates `fusion.html`, `fusion-panel.js`, `fusion.css`, `app.css` and
`app-tokens.css` and sees nothing of the React app. The React app is gated by
`npm run check` (lint, `tsc --noEmit`, build). The pre-commit hook should run both, plus
`node tests/run.js`. `lt_dom_audit.py` retires for the public page (D26: the seam it
audited no longer exists) and stays for the panel. `smoke-measure.py` drives
`index.html` on port 8081 and measures both modes on both pointer types; after the
conversion it can be pointed at `vite preview` and keeps its value as long as the chart
class names (`.casc-bar`, `.ladder-track`, the fills and marks) survive, because it asserts
the two charts share a geometry, which no lint checks. Recommend keeping it and updating
its address, rather than losing the only rendered-geometry check the charts have. The
`CLAUDE.md` "four checks" section is rewritten in the same session.

**The package.** `@livetools/ui` on npm is at 0.1.0, published 2026-09-22 from Scott's
machine, and it is the only version (`npm view`, 2026-09-24). It predates every part the
calculator needs: `NumberField`, `Select`, `RadioGroup`, `Checkbox`, `Alert`, `Badge`,
`Table`, `Form`, `Fieldset`, `FormGrid`, `Prose`, `Link`, `Row` all landed on 2026-09-22 to
2026-09-24 and are unpublished. The publish workflow runs on a `v*` tag; its browser test
steps have never run on GitHub (plan phase 3, the one open item), so the first tag push
may fail before it publishes. The conversion therefore needs one of:

| Route | How | Consequence for the eventual swap |
|---|---|---|
| **A newer published version first** | Bump `packages/ui/package.json` to 0.2.0, tag, push, let the workflow publish. Then the calculator installs `@livetools/ui@0.2.0` exactly (D27) with a lockfile. | Cleanest. Every fix the conversion finds in a part goes upstream, gets published, and the calculator bumps. The cost is a publish per fix round, and the first publish has to prove the workflow. Nothing about the calculator's deploy depends on Scott's machine. |
| **A local link during the work** | `"@livetools/ui": "file:../livetools-design-system/packages/ui"` (or `npm link`), built locally with `npm run build` in the package. | Fast to iterate, and part fixes are testable in the app the same minute. But the Pages workflow cannot resolve a local path, so **nothing deploys until the dependency is swapped to a published version**, and a lockfile entry pointing at a local path must not be committed to `main`. The swap is a one-line `package.json` change plus a fresh lockfile, and because the CSS is the same file in both, nothing visual moves at the swap; what can move is a part's behaviour if the published version is not the same commit as the linked one. The check at the swap is section 9's baseline comparison, run against the published build. |
| A git dependency on the design-system repo | Not workable as it is: the package publishes its `dist/`, which is not committed, so a git dependency has nothing to import. | Rejected. |
| A packed tarball committed to the calculator | `npm pack` and a `file:` on the `.tgz`. | This is vendoring the package, which D35 rejected. Rejected. |

Recommend: the local link for the build sessions, then a published 0.2.0 (or whatever the
next number is) before the first deploy, and the swap as a step of its own with the
baseline comparison as its check (section 9, step 6). The one thing the sequence must not
do is deploy from anything but a published exact version.

## 7. The Fusion panel

**Recommendation: the panel stays vanilla in this work and converts later as its own
piece, once the Vite build is serving the site.** Not a decision; the reasons, for Scott:

- The panel is a second application with its own 1725-line DOM module, its own stylesheet,
  its own protocol module set (`js/fusion/`, pure and tested by four of the test files) and
  a build key (`PAGE_BUILD`) that the tests pin equal to every `?v=` in `fusion.html`. It
  uses `lt-number-field` (the spindle speed, and an up-cut length per compression tool) and
  `toast()`; it reads the field's `state` to block Apply on a refused speed, which is the
  behaviour the public page should copy, not the other way round.
- It runs inside Fusion's palette, a Qt WebEngine (Chromium) browser that injects the
  `window.adsk` bridge 20 to 32 ms after the page's scripts run, caches stale copies unless
  every address carries a build key, has no visible console, and gets its colour scheme
  from a `?theme=` query the add-in appends. A React build would run there (ES modules
  already do), but every one of those conditions is handled by hand in the current page
  and has been proven in Fusion; re-proving them under a bundler is a spike of its own,
  and the plan has no such spike.
- The plan's done-condition is the main screen, and D3 keeps `lt-elements.js` alive and
  taking fixes until the tool manager converts, so the panel loses nothing by waiting.
- The panel's Apply writes numbers into Fusion operations. Converting the surface that
  writes to the CAM system in the same work as the surface that a person transcribes from
  doubles the surface across which a silent change can land.

What the conversion has to do for the panel anyway: keep every file it loads at its
address (section 6), keep the vendored copies of the design system in the repo for it
(they are still its stylesheet and its elements), and note that `fusion-panel.js` carries
its own copy of the `MATERIALS` list with a comment naming `js/ui/app.js` as the source
of truth; after the conversion that source is a TSX file, so the comment and the copy's
home need a decision (a shared `js/ui/materials.js` that both import is the obvious one,
and it is pure).

When the panel does convert, it is a second Vite entry (`fusion.html` as a second input),
with the error surface and the theme query handled before React mounts, and the bridge
poll kept as it is.

## 8. Risks, ranked

Each is something that could change a machinist's number, unit, message or refusal
without anyone noticing in review, with the check that catches it.

1. **A refused entry computing with a stand-in value.** With commas now refused and text
   staying in the box, the current mapping (`NaN` to 18000 rpm, to two flutes, to "full
   board", to "full slot") produces a page whose numbers belong to a cut the boxes are not
   showing, while one box is red. The check: the results section renders no numbers while
   any field reports `state: "error"`, and a browser test types `12,000` into the speed,
   `abc` into the flutes and `6,5` into the depth and asserts the banner and the absence
   of an output card each time. Also assert that an empty optional box still means what it
   means (full board, full slot, published speed): empty is `ok`, not `error`.
2. **The machine max feed's ×1000.** The advanced field is entered in m/min and
   `currentInput()` multiplies by 1000 into mm/min. A rewrite that passes the m/min value
   through caps every feed at, say, 20 mm/min, and the page looks fine: a low feed with a
   "Machine feed" limit line. The check: a baseline URL state with `a_feedMaxMMin=20`
   renders the same cutting feed before and after.
3. **The charts' emphasis and marker.** The lint refuses the emphasis class and the inline
   `left`, so the person converting has to rebuild both, and a bar that starts at the wrong
   place or a highlight on the wrong row tells the reader the wrong band serves. The check:
   for each baseline state, exactly one row per chart carries the app's emphasis class and
   it is the serving (or binding) row, and the marker's percentage position equals the
   value `pos(fz)` computed today; plus `smoke-measure.py` against `vite preview` for the
   shared geometry.
4. **Rendered text drift: rounding, units, messages, refusals.** `format.js` is untouched,
   but the strings are assembled in `render()`, which is rewritten. The check is the master
   check: a **baseline capture** made before the conversion (section 9, step 0) of the
   rendered text of `#results` and `#diagnostics` (every output row's metric and imperial
   string, every banner's text and variant, every note, every table twin's cells) for a
   fixed list of URL states covering both modes, every material, every tool type, a ball
   nose, a refusal, a block, a four-warning fold, a drill-bank case and an advanced
   override, compared after the conversion at zero differences.
5. **Shared links.** `readUrlState()` and `writeUrlState()` define what a shared link means,
   including links from before drilling existed. The check: the same baseline states,
   written back to the URL after load, produce byte-identical query strings.
6. **The data gate.** Moving the data from a fetch to an import must keep `validateData()`
   running at start and its danger banner reachable. The check: a deliberately broken
   `chiploads.json` entry in a dev build shows "The data failed its integrity check, so the
   calculator shows no numbers." and nothing else.
7. **The package version at deploy.** A part linked locally at one commit and published at
   another can differ. The check: the baseline comparison is run once more against the
   build made from the published version, not the linked one, before the Pages setting is
   switched.
8. **Dark scheme.** `LivetoolsProvider` defaults to light. Not a number, but a dark-mode
   user gets a page that has changed under them. The check: the provider gets
   `scheme="system"`, and a screenshot under `prefers-color-scheme: dark` matches today's.
9. **The double announcement** of results banners (section 2, row 27) and any loss of the
   live announcement of the numbers. Not a number. The check: a screen-reader pass, or at
   least a DOM assertion on which elements carry `role` and `aria-live`.
10. **The Fusion panel losing a file.** The build must keep every panel address alive.
    The check: `vite preview` plus `?harness=1` renders a job; then a real Fusion open
    against the live site after the first deploy, with the add-in's hello received.
11. **The mode switch and the parked profile.** App logic that a rewrite can simplify
    wrongly (a Finishing link opened in drilling falls back to Standard; the diameter snaps
    to the nearest published drill size on a family change). Covered by the baseline states
    if the list includes them; add them.
12. **Type-ahead on `Select`** changing the material on a keypress with the list closed.
    Same as the native select today; low. No check beyond noting it.

## 9. A recommended sequence

Each step is sized for one session and ends with a check that proves it.

0. **Capture the baseline on the vanilla page.** A Playwright script (the same shape as
   `smoke-measure.py`) loads `index.html` from `tools/serve.js` for a committed list of URL
   states (aim for forty: every material × a tool type, every tool type at 12.7 mm, a ball
   nose at three depths, each drill family at two diameters, the drill bank on, Finishing,
   first cut off, each machine preset, the advanced feed cap, a refusal, a block, the
   four-warning fold from SC30's sweep) and writes the rendered text of `#results` and
   `#diagnostics`, the class of the emphasised rows, the marker positions and the
   re-written URL to `tests/baseline/<state>.json`. Check: a second run reproduces every
   file byte for byte. This step touches no app code and can be done before anything else;
   it is the single most valuable thing in the sequence.
1. **Scaffold the Vite app in the repo.** `package.json` with the proof app's pins and
   `"type": "module"` kept, `@livetools/ui` linked locally, `src/main.tsx` with
   `LivetoolsProvider scheme="system"`, `globals.css`, `app.css` and `app-tokens.css`
   (empty for now), the two lint configs extended, `tsconfig` with `allowJs`, `index.html`
   moved to Vite's shape, the data imported as JSON with `validateData` at start, the panel's
   files kept at their addresses, `npm run check` including `node tests/run.js`. Check:
   `npm run check` green on an app that renders the panel and the title; `node tests/run.js`
   201 passing; `vite preview` serves `/fusion.html?harness=1` with a rendered job.
2. **The form.** Every control from rows 3 to 18 as parts, with the app state in one hook,
   the URL read and write carried across, and results held back while any field is in
   error (risk 1). The segmented pickers and the tool cards go the way Scott rules
   (questions 2 and 3); if he has not ruled, build `RadioGroup` and leave the look for later.
   Check: lint at zero; typing `12,000` into the speed shows the blocking banner and no
   numbers; the URL after load equals the baseline's for every state.
3. **The results.** The limit line, the banners with the fold, the output card, the notes,
   the badges. Check: the baseline comparison at zero differences for every state, charts
   excluded.
4. **The charts, the twins and the tip.** The spacer construction for position, the app
   emphasis class with its token alias and its forced-colours rule, `Table` for the twins,
   the tip as ruled (question 5). Check: the baseline comparison including the chart rows,
   the emphasis and the marker positions; `smoke-measure.py` against `vite preview`.
5. **The gates and the documentation.** The pre-commit hook running conformance, the
   tests and `npm run check`; `CLAUDE.md` rewritten (the vendored folders now serve the
   panel only, the checks, the rules in React terms, the TODO carried over); the consumer
   report in the design-system repo updated with what this conversion found (the emphasis
   route, the `left` position, the live-region role, the segmented picker, the row-header
   wrap). Check: a commit goes through the hook; a deliberate lt- class in a TSX file fails.
6. **Publish and deploy.** A published package version; the dependency swapped to it with a
   fresh lockfile; the baseline comparison run against that build (risk 7); the workflow
   added; the Pages source setting switched; the first deploy; the baseline comparison run
   against `wood.fusioncam.co` itself; the Fusion add-in opened against the live site.
   Check: the live page reproduces the baseline; the panel receives hello.

## 10. Questions only Scott can answer

Each in plain words about what the calculator does for its user, with a recommendation.

1. **When a box holds something the calculator cannot read** (a comma, letters, a value
   outside the allowed range), should the page show no numbers until it is fixed, saying
   which box, instead of quietly working out a cut from a stand-in value as it does today?
   Recommend yes: the Fusion panel already does this, and it is the only safe answer once
   commas are refused.
2. **The two rows of buttons** (Routing or Drilling; Gentle, Standard, Aggressive,
   Finishing) have no part that draws them as a row. The choices are an ordinary list of
   round radio buttons with the same words, or a hand-made button row that breaks the
   "parts only" rule, or waiting for a part. Recommend the radio list now and asking the
   design system for a row-of-buttons layout on its radio group part.
3. **The tool-type cards** (the boxed grid with a name and a one-line hint each) become an
   ordinary radio list with the hint under each option. The hints stay. Is the card look
   worth keeping enough to hold the conversion for it? Recommend accepting the list.
4. **The two charts** cannot be drawn under the current rules as they stand: the highlight
   on the serving bar and the position of each bar both need a route the rules refuse.
   The options are to wait for the design system's chart work, to draw them with the
   app's own class and token (which reads the system's chart colours) and a spacer for
   position, or to drop the highlight. Recommend the app class and spacer now and report
   the gap, never dropping the highlight, because it is what tells the reader which chart
   serves the numbers.
5. **The floating tip over the charts** repeats what each row already says on focus and in
   the table below it. Its position cannot be set under the rules. Drop it and keep the
   keyboard rows and the tables, or hold for a way to position it? Recommend dropping it.
6. **The archived reference article** is served at its old address today because the whole
   repository is the site. Should it stay reachable at that address after the conversion?
   Recommend yes, copied unchanged into the published folder; it costs nothing.
7. **The Fusion panel** stays as it is in this work and converts later on its own.
   Agreed? Recommend yes (section 7).
8. **Units.** The page shows metric first with the imperial figure under each result, and
   the input boxes are always metric; there is no units switch. Keep it that way in the
   conversion? Recommend yes; a switch is a separate decision because it would change the
   input boxes and not the results.
9. **Dark mode.** The page follows the device's light or dark setting today. Keep that?
   Recommend yes.
10. **The "Advanced" and "Something looks wrong" fold-outs** keep the browser's own
    open-and-close box, because no part exists for one. Recommend yes.
11. **Screen readers will hear each results banner twice** after the conversion unless the
    results area stops announcing itself as a whole. Recommend letting the banners announce
    themselves and adding a short spoken "Numbers updated" for the figures, and reporting
    the clash upstream.
12. **Publishing the package.** The first deploy needs a published version of the parts,
    which is a tag push from the design-system repo and its workflow's first real run.
    Is that yours to do when the conversion is ready, or should the conversion sessions
    do it? Recommend the conversion sessions prepare it and Scott pushes the tag.

## Things this survey could not settle, listed in one place

- Whether `Table`'s row-header release lets a long chart name wrap (section 2, row 26).
- Whether the results region's live announcement should move to `announce()` (row 27).
- How the panel's files are published without duplicating `js/core/`, `js/data/` and
  `data/` (section 6, third bullet).
- Whether the first tag push of the design-system publish workflow succeeds (section 6).
