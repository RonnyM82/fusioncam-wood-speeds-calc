# Livetools Design System, component reference

Companion to `SKILL.md`. Read the relevant section before writing markup for a
component you have not used before.

## Contents

1. [Why light DOM](#1-why-light-dom)
2. [Layout helpers](#2-layout-helpers)
3. [Buttons](#3-buttons)
4. [Fields](#4-fields)
5. [Custom elements](#5-custom-elements)
6. [Status, alerts and badges](#6-status-alerts-and-badges)
7. [Tables](#7-tables)
8. [Row actions](#8-row-actions)
9. [Icons and the lt glyph set](#9-icons-and-the-lt-glyph-set)
9b. [Chart colours](#9b-chart-colours)
10. [Kiosk patterns](#10-kiosk-patterns)
11. [The traps, in full](#11-the-traps-in-full)

---

## 1. Why light DOM

No shadow DOM anywhere. This is a deliberate trade-off recorded in
`lt-elements.js`:

- Tokens and surface contexts cross the boundary without `::part` plumbing. A
  component inside a panel cannot disagree with the panel around it.
- Native form participation is free. The real `<input>` is in the page, so it
  posts, validates and autofills with no `ElementInternals` gymnastics.
- It degrades. If the script fails to load, the markup is still a labelled input
  inside a form. On a shop-floor kiosk that matters more than encapsulation.

The cost is that app CSS can reach inside a component. That was accepted
knowingly, and it is why every internal element carries an `lt-` prefixed class
rather than relying on a bare tag selector. **Do not write app CSS that targets
the internals of a component.** Style the wrapper.

---

## 2. Layout helpers

| class | job |
|---|---|
| `.lt-stack` / `.lt-stack--sm` | vertical rhythm |
| `.lt-row` | horizontal group, wraps |
| `.lt-prose` / `.lt-prose--full` | rhythm + reading measure for written content |
| `.lt-form-grid` | responsive field grid |
| `.lt-form-row` | one line of fields + trailing action, hint-safe (see §4) |
| `.lt-form-actions` | button row at the end of a form |
| `.lt-divider` | rule between sections |
| `.lt-card` | bounded content block |
| `.lt-sr-only` | visually hidden, still announced |
| `.lt-numeric` / `.lt-mono` | tabular figures, slashed zero |

Use `.lt-numeric` for any column of numbers. It sets tabular figures so a column
does not jitter between `12` and `12.00`.

### Prose: `.lt-prose`

The reset zeroes every text margin and only components restore their own, so
ordinary written content — a page intro, a back-link paragraph above a
heading, a block of help text — ships squished until someone hand-spaces it.
The first consumer hit exactly that three times in ONE day (2026-07-28: its
blanks-page intro, nine back-link paragraphs, and a button row as a cousin),
each patched with a bespoke app.css rule. Wrap the written content instead:

```html
<div class="lt-prose">
  <p><a class="lt-link" href="/blanks">&larr; All reference tables</a></p>
  <h2>Carbide blanks</h2>
  <p>Every diameter on this page is ground stock in grade K40UF…</p>
  <ul><li>Grade and tolerance hold for the whole panel…</li></ul>
</div>
```

What it gives: paragraphs, headings, lists and definition lists at sensible
default rhythm; list indent and markers back (the reset stripped their
padding); heading sizes from the type scale; and a 70ch reading measure on
the wrapper. `.lt-prose--full` releases the measure for a full-width block,
or re-declare `max-inline-size` in app.css.

Two properties worth knowing. Every child rule is `:where()`-wrapped — zero
specificity — so any app rule on the element itself wins without a fight.
And components inside the wrapper are untouched: they set their own margins
at real specificity, and the wrapper's edge trims (no lead-in gap above the
first child, no trailing margin after the last) only remove margins the
components do not carry. Do not hand-space prose with per-page margin rules
any more; that is the category this class ends.

---

## 3. Buttons

```html
<button class="lt-btn lt-btn--primary">Add to quote</button>
<button class="lt-btn lt-btn--secondary">Cancel</button>
<button class="lt-btn lt-btn--danger">Delete tool</button>

<!-- icon-only ALWAYS needs an accessible name -->
<button class="lt-btn lt-btn--secondary lt-btn--icon" aria-label="Settings">
  <svg aria-hidden="true">…</svg>
</button>

<!-- kiosk primary action: same blue, just bigger -->
<button class="lt-btn lt-btn--primary lt-btn--lg">Dispense</button>
```

Variants: `primary`, `secondary`, `danger`, `danger-quiet`, `danger-text`,
`ghost` (no chrome until hover).
Modifiers: `--lg`, `--icon`, `--full`. Group with `.lt-btn-group`.

**There is deliberately no brand-red button variant.** One existed
(`.lt-btn--brand-kiosk`) and was removed on 2026-07-26. It forced a 24px label
so brand red would clear the large-text contrast threshold, which was solving
the wrong problem. A positive action is blue at every size. Delete-tool stays
red under `--danger`.

`conformance.py` will flag an icon-only button with no accessible name as
`icon-button-unnamed`.

### Danger has three weights

Added 2026-07-28. Red still means exactly one thing; what changes is how loudly
it says it. This is a weight tier, **not** a new hue, and the red-is-danger rule
is unchanged.

| variant | use it for | looks like |
|---|---|---|
| `lt-btn--danger` | the confirm step, and only that | filled red |
| `lt-btn--danger-quiet` | a destructive action repeating down a list of rows | red outline, transparent |
| `lt-btn--danger-text` | a destructive item inside a menu or a bounded toolbar | red label, no chrome |

```html
<!-- one destructive action per row, down a list of rows -->
<button class="lt-btn lt-btn--danger-quiet">
  <svg class="lt-icon" aria-hidden="true" focusable="false"><use href="#lt-ic-slash"/></svg>
  Delete
</button>
```

**Always icon plus word, never the icon alone.** At these weights there is no
fill reinforcing the colour, so a bare red glyph is colour carrying meaning on
its own (rule 3). `lt-btn--icon` is for the neutral variants.

Why it exists: the first consumer rendered 7–17 filled red deletes on a single
reference page, which made the rarest and most destructive action the loudest
element on it and left the confirm step with nothing louder to escalate to.
The rule that goes with the variant is a row-level one — see
[Row actions](#8-row-actions).

Ink at rest is `--lt-danger-text`, the status ink for a neutral surface, which
follows the scheme. Hover fills with `--lt-danger-surface`, a light card in
every scheme, so the ink moves to `--lt-danger-on-surface` in the same rule.
The two always change together; keeping the scheme-following ink on that fill
is the defect fixed on 2026-07-27, which measured 3.35:1 in dark mode. The
border stays `--lt-danger-border` in both states because it is the boundary
against the panel, not against the fill: 4.38:1 on the light panel, 3.26:1 on
the dark one, and `verify-tokens.py` now gates that pairing.

---

## 4. Fields

Labels sit above the control. That completes fastest, survives translation, and
avoids floating-label patterns that break at small sizes and confuse screen
readers.

Errors and warnings are chips, not bare coloured text, so they carry an icon and
words as well as colour (rule 3).

```html
<div class="lt-field">
  <label class="lt-field__label" for="part">Part number</label>
  <input id="part" class="lt-input" aria-describedby="part-hint">
  <p class="lt-field__hint" id="part-hint">As printed on the tool shank.</p>
</div>
```

Structure, in order: `.lt-field__label`, the control, optional
`.lt-field__hint`, optional `.lt-field__warning` or `.lt-field__error`. The
hint says what is always true and the chip says what is wrong now, so the chip
reads last, closest to where the eye lands.

### The hint slot

**The hint is where a parenthetical qualifier belongs.** `DIAMETER (mm, AT THE
SHANK)` is a label nobody finishes reading — it is uppercase, which is
measurably slower to scan, and it is carrying two jobs. `DIAMETER` with
*Measured at the shank, in millimetres.* underneath is two short glances.

- **Sentence case**, one line, ending in a full stop. The label is the only
  uppercase thing in a field.
- **Always wire it with `aria-describedby`**, or it is announced after the
  field, detached from it, or not at all.
- It never disturbs the label-to-control gap. `.lt-field` carries
  `align-content: start` for exactly this reason; see the traps.

A hint under a checkbox or a switch indents to the label **text**, not to the
page edge — flush left, it hangs under an empty tick and reads as a second,
unlabelled option. The indent is automatic; just put the hint after the label:

```html
<div class="lt-field">
  <label class="lt-check">
    <input type="checkbox" id="active" aria-describedby="active-hint">
    <span>Active</span>
  </label>
  <span class="lt-field__hint" id="active-hint">Inactive rows stay in the
  catalogue and stop appearing in the material matrices.</span>
</div>
```

`lt-number-field` takes a `hint` attribute and does all of this for you.

An input with a unit or prefix attached uses a group:

```html
<div class="lt-input-group">
  <input class="lt-input lt-input--numeric">
  <span class="lt-affix">mm</span>
</div>
```

`.lt-field` must keep `align-content: start`. Without it the field is a grid item
stretched by its row, its auto rows absorb the surplus, and the label-to-control
gap grows on whichever field happens to have fewer rows. Two fields side by side
then disagree depending on whether one carries a hint.

`.lt-affix` must carry a definite `block-size` matching `--lt-control-height`. A
flex item with a definite cross size is not stretched, so its border cannot add
to the height.

A group is one control with internal divisions, built like `.lt-btn-group`:
every child is squared and pulled one border width onto its neighbour, and only
the group's outer ends are re-rounded via `:first-child` / `:last-child`. Both
rules must hit **every** child — squaring only the input leaves each button's
own radius curving away from the seam (a notch), and pulling back only the
input leaves the input's end border beside the affix's start border (a double
rule). Border colour is also group-level: every child reads
`--lt-field-border` at rest and the whole group takes `--lt-border-strong` on
hover, because the parts are different components whose default border families
differ (`#868686` field vs `#565554` secondary button on a panel) and per-part
hover recreates that mismatch. Disabled and invalid parts keep their own
border. A focused or hovered child takes `z-index: 1` so the overlapping
sibling does not clip its ring.

Every input needs a label. `conformance.py` flags `unlabelled-input`. Never use
`--lt-surface-page` tokens inside a field; that is `page-surface-in-field`.

### Fields in a row: `.lt-form-row`

A filter bar, an add-row, a set-status form — one line of fields with the
action that submits them. **Never hand-roll this with `align-items:
flex-end`.** Bottom-aligning works until one field carries a hint; then that
field is taller, its control floats above its neighbours', and the row jumps
again when validation adds a message. The first consumer hit exactly this
twice in one session (2026-07-28, `.addform` then `.statusform`), which is why
the primitive exists.

```html
<form class="lt-form-row">
  <div class="lt-field">
    <label class="lt-field__label" for="code">Code</label>
    <input class="lt-input" id="code" aria-describedby="code-hint">
    <span class="lt-field__hint" id="code-hint">Immutable once saved.</span>
  </div>
  <div class="lt-field">…</div>
  <div class="lt-form-row__action">
    <button class="lt-btn lt-btn--primary">Add family</button>
  </div>
</form>
```

The row top-aligns, so hints, errors and warnings hang below their own field
without moving anyone else, and it zeroes the fields' own end margins so
wrapped rows keep one rhythm. `.lt-form-row__action` drops its content
`calc(1lh + var(--lt-space-2))` — exactly one label line plus the field's
label-to-control gap — so buttons sit level with the controls at every
density. That is the same box a label occupies, not a guessed number: the
consumer's two attempts at approximating the drop with a space token were
each a few pixels off, and off differently between densities. A loose
`.lt-check` (a "make default" checkbox, say) goes in the same
`.lt-form-row__action` and centres on the control line.

The one assumption: **every field in the row carries a visible one-line
label.** A wrapping label or a bare unlabelled control breaks the line-up —
and the unlabelled control is a conformance finding anyway.

### The width cap: `--lt-field-max-width`

By default a field's control fills its column (`none`), which is right inside
`.lt-form-grid`, dialogs and other bounded layouts. In a wide panel, a
short-value form sprawling to the panel edge is an app-level taste decision —
so the SYSTEM owns the mechanism and the APP owns the number, pinned once in
its app layer:

```css
:root { --lt-field-max-width: 26rem; }        /* app.css / app-tokens.css */
.field-notes { --lt-field-max-width: none; }  /* release one field */
```

The cap applies to every control kind inside `.lt-field` — input, select,
textarea, input-group (so a unit affix caps with its input as one control) —
and that completeness is the whole point. The first consumer hand-rolled the
cap as `.lt-input/.lt-textarea` selectors, selects fell through to their 100%
default, and a yes/no dropdown rendered 700px wide (2026-07-28). Whoever owns
the cap must own the complete control list, and that is the system. Release a
field by re-declaring the token on it, never by writing `max-inline-size`
back on the control.

---

## 5. Custom elements

Eight elements, all light DOM, all degrading to sensible markup. Six are
below; `lt-menu` lives with [Row actions](#8-row-actions), and
`lt-status-select` — the chip combobox — is next to the fields it behaves
like, at the end of this section.

### `lt-number-field`

The one to understand properly. A numeric input that knows about units.

```html
<lt-number-field label="Cutting diameter" measure="length"
                 value="12" stepper step="0.5"></lt-number-field>

<lt-number-field label="Feed rate" measure="feed" value="1240"
                 warn-above="1200"
                 warn-message="Above the published range for this tool.">
</lt-number-field>
```

Attributes: `label`, `measure`, `system`, `value`, `unit`, `min`, `max`, `step`,
`decimals`, `warn-above`, `warn-below`, `warn-message`, `hint`, `name`,
`input-id`, `required`, `stepper`.

**Replacing a native control: `stepper` is not optional in practice.** This
element exists partly to get rid of `<input type="number">`, whose spinners are
far below any sane target size and whose scroll wheel silently changes committed
values. Swapping the native element in without adding `stepper` therefore takes
the nudge away and gives nothing back, and the form ships with no way to step a
value at all. That happened, 2026-08-20. If the field it replaces had spinners,
it needs `stepper`.

**`value` is ALWAYS the metric base unit**, whatever is on screen:

```js
field.value          // 12       (mm)
field.displayValue   // 0.4724   (in, when imperial)
field.unit           // current unit label
field.state          // "ok" | "warn" | "error"
field.valid          // false only when state is "error"
field.addEventListener("lt-change", e => e.detail.value)
```

Measures available: `length` (mm/in), `feed` (mm/min ÷ in/min), `feedPerTooth`
(mm/tooth ÷ in/tooth), `speed` (m/min ÷ …), `rotation` (rpm), `angle` (degrees
in both systems). Each carries its own decimal precision per system, so a
converted value does not gain false accuracy.

**A form posts the base unit** (since 0.4.0). A `name` puts a hidden input in
the element carrying the metric base value; the visible input is nameless, so
what the toggle shows can never leak into what a form stores. Post through the
form or read `.value` — both are metric, always.

**Moving `min` or `max` re-validates immediately** (since 0.4.0). That is the
documented cross-field mechanism — one field's edit narrows its neighbour's
range — so the neighbour's chip and `aria-invalid` update the moment its bounds
move, without emitting `lt-change`, so bound-moves cannot loop.

A warn band sits **inside** the valid range: it warns and stays valid. An out of
range value is an error and blocks. Do not conflate them.

**`state` and the message chip are the same thing.** One validation pass sets
`state`, sets `aria-invalid`, and paints `.lt-field__error` (error) or
`.lt-field__warning` (warn) with the right live-region role, on every keystroke
and again on blur. Read `state`; never write the chip yourself. A plain
`.lt-input` has nothing wired, so app code does both halves by hand, the same
way round.

### `lt-date-field`

Not `<input type="date">`. The native picker cannot read the density tokens or
join a surface context, gives a kiosk whatever day-cell size the OS chooses, and
parses its text half **by locale**, so 03/04/2026 is the third of April on one
machine and the fourth of March on another with nothing on screen to say which.

```html
<lt-date-field label="Due date" name="due" value="2026-04-03"
               min="2026-01-01" max="2026-12-31"></lt-date-field>
```

Attributes: `label`, `hint`, `value` (ISO), `min`, `max`, `month-first`, `name`,
`required`, `disabled`, `input-id`.

**`value` is ALWAYS ISO `yyyy-mm-dd`**, whatever is displayed. `month-first`
changes the display order only. A `name` puts a hidden input in the element
carrying the ISO value; the visible input is nameless, so a local reading can
never be what a form stores. Same construction as `lt-number-field` posting
metric.

```js
field.value        // "2026-04-03"
field.dateValue    // a local-midnight Date, or null
field.valid        // false when unparseable or outside min/max
field.addEventListener("lt-change", e => e.detail.value)
```

**The parsed date is echoed back in words** under the control. That is the
point of the element: a numeric date is the one value in this system a reader
cannot check by looking at it, and the month name is the only thing that settles
03/04.

Typing accepts `3/4/26`, `3-4-2026`, `03042026`, `3 Apr 2026` and ISO. Anything
impossible is refused rather than guessed: 31 February returns nothing rather
than rolling into March.

The calendar is a real dialog with a real grid. Down or Alt+Down opens it.
Arrows move a day or a week, PageUp and PageDown move a month, Shift with them
moves a year, Home and End reach the ends of the week, Enter or Space picks, and
Escape closes and returns focus to the field. Every day is a button at
`--lt-control-height`, lifting to `--lt-target-touch` on a coarse pointer.

**A move that would leave `min`/`max` lands on the boundary**, never on a
disabled cell. Focusing a disabled button does nothing, and the cell the user
came from has just been replaced, so focus would fall to `<body>` and strand a
keyboard user outside the dialog. Found by driving the arrows in a real browser,
2026-08-20; jsdom cannot see it because it does not run focus.

### `lt-time-field`

No popup: a time is two numbers and typing them beats any picker, which is not
true of a date. 24-hour by default, because a job sheet that says 7:15 without
saying which one has the same problem as a date that does not say its order.

```html
<lt-time-field label="Shift start" value="06:00" step="30"></lt-time-field>
```

Attributes: `label`, `hint`, `value` (`HH:MM`), `min`, `max`, `step` (minutes,
default 15), `twelve-hour`, `name`, `required`, `disabled`, `input-id`.

`value` is always 24-hour `HH:MM`; `twelve-hour` changes the display only. Up
and Down step by `step`. Typing accepts `1430`, `14:30`, `14.30`, `2:30pm`,
`2:30 pm` and a bare `9`. 12am is midnight and 12pm is noon; 13pm is refused
rather than wrapped.

**The echo shows the other clock.** Someone who typed 7:15 meaning the evening
sees `19:15` underneath, and someone who typed 19:15 sees `7:15 pm`. Either way
the reading they did not type is on screen.

### `lt-file-drop`

```html
<lt-file-drop label="Drawings" name="drawings" accept=".pdf,.step"
              multiple max-size="10MB" max-files="5"></lt-file-drop>
```

Attributes: `label`, `hint`, `accept`, `multiple`, `max-size` (`"10MB"`,
`"500KB"` or bytes), `max-files`, `name`, `required`, `disabled`, `input-id`.

```js
drop.files                       // File[]
drop.valid                       // required-but-empty, or any row erroring
drop.setProgress(file, 0.5)      // 0..1, drives the row's bar
drop.setError(file, "message")   // paints the row and marks the field
drop.clearError(file)
drop.clear()
drop.addEventListener("lt-files-change", e => e.detail.added)
```

**It does not own the network.** An app owns its endpoint, its auth and its
retry policy. This collects, validates, lists, and keeps the input's own
FileList in step so a plain form post carries exactly what is on screen; without
that last part a removed file still posts, which is the bug every hand-rolled
version ships with.

**The zone is a `<label>` around the real input**, so click, Enter, Space, the
focus ring and the OS dialog all come from the platform. The input is visually
hidden, never `display:none`, which would take it out of the tab order.
`accept` is enforced in script as well as on the input, because the input only
applies it inside its own dialog and a dropped file never goes near that dialog.

**Dragging is pointer-only and never the only way in.** The browse action stays
visible; the drag states only change how the same target looks.

### `lt-unit-toggle`

Switches metric and imperial across everything bound to it. Emits
`lt-system-change`.

### `lt-tabs`

Emits `lt-tab-change`. Manages `aria-selected` and `aria-controls`. For content
already in the DOM: selection follows focus, which is the APG default *because*
the panels are already there. If choosing an option refetches or navigates,
that is `lt-filter`, not tabs.

### `lt-filter`

The catalogue filter: a bar carrying quick filters, search and one trigger per
facet, applied filters as removable `.lt-chip`s below it, and facet bodies that
open as popovers on a wide component and as one bottom sheet on a narrow one.
The breakpoint is a **container query on the component's own inline size**, so a
filter in a narrow panel on a wide screen collapses correctly.

```js
el.schema = {
  quick:  [{ id: "all", label: "All tools" }],
  facets: [
    { key: "series", label: "Series",   type: "checkbox", values: ["HEM"] },
    { key: "iso",    label: "Material", type: "swatch",
      values: [{ value: "P", label: "Steel", swatch: "iso-p" }] },
    { key: "dia",    label: "Diameter", type: "range", unit: "mm", step: "0.5" },
  ],
};
el.count   = (key, value, state) => n;   // optional; omitted, counts are omitted
el.results = { shown, total };           // optional; drives the summary line
el.addEventListener("lt-filter-change", e => refilter(e.detail.state));
```

**One serialisable state object is the point** — `{ quick, q, facets, range }`.
Every control writes to it and none reads another control, so saved views, URL
persistence, grouping and any later natural-language layer all reduce to reading
and writing it.

A count ignores its own facet's picks, so a number reads as "how many would I
get if I *also* ticked this". A value that would return nothing is dimmed, never
removed — options that appear and vanish as you tick are the classic
faceted-filter complaint.

**Schema-driven, so there is nothing to degrade to.** Unlike `lt-menu` and
`lt-status-select`, which upgrade markup a template already rendered, a facet
schema is an array of objects that no template engine can put in an attribute.
That is why the CSS half stands alone: a server-rendered app that needs no-JS
filters renders its own markup with the same `.lt-filter` classes, quick items
as real anchors with `href` and `aria-current`, and lets the server filter.
Ctrl-click, a copied URL and a no-JS page load all keep working. Never
`role="radio"` on a link — it erases the link semantics that is the whole point.

**The quick strip has no roving tabindex and no arrow keys**, deliberately.
Tabs and radio groups move selection *with* focus, which is right when selecting
is free; here selecting refetches, so an arrow sweep across five quick filters
would fire five requests. Plain Tab, plain buttons, `aria-current` on the active
one.

### `lt-dialog`

Attributes include `heading`, `confirm-label`, `cancel-label`, `for`. Emits
`lt-dialog-close` with the result.

It generates `<dialog class="lt-dialog lt-panel">` with the heading as
`.lt-dialog__title`, the slotted content in `.lt-dialog__body` and the actions
in `.lt-form-actions`. The panel class is load-bearing, not decoration: the
dialog sits in the top layer and inherits whatever context its author put it
in, which at page level in the dark scheme is light ink on its own light card.
There is deliberately no wrapper element inside it — one used to sit there
painting a second, different surface. See the traps.

### `lt-table`

Sortable. Emits `lt-sort`. Pair with `.lt-table--zebra` or `.lt-table--freeze`.

### `lt-wizard`

One step at a time with a step indicator that stays in sync. Refuses to advance
past a step with an invalid control. Validation runs only on the step being
left, so a user is never shouted at about a step they have not reached. Emits
`lt-wizard-step` and `lt-wizard-finish`.

A completed step is a solid green disc with a tick drawn from two borders. It is
deliberately not a diagonal stripe; a single 45° line across a disc reads as a
prohibition sign, not an achievement.

### `lt-status-select`

The chip combobox: a picker whose closed face and option list render real
status chips — glyph + colour + word, the Linear/GitHub status-picker
pattern. Added 2026-07-28 for the first consumer's rating matrices. A native
select cannot render markup in its face or options, and the moment the face
is custom the full APG select-only-combobox keyboard contract comes with it —
which is why this is a system element and never an app hand-roll, the same
reasoning as `lt-menu`.

**The markup is the API.** Author a real, labelled `<select
class="lt-select">`; each option names its chip on data attributes:

```html
<lt-status-select>
  <select class="lt-select" name="rating" aria-label="Rating for P steels">
    <option value="">— not yet ruled —</option>
    <option value="ideal" data-glyph="lt-ic-check" data-variant="success">Ideal</option>
    <option value="capable" data-glyph="lt-ic-tilde" data-variant="info">Capable</option>
    <option value="not_suitable" data-glyph="lt-ic-dash-circle" data-variant="warning">Not suitable</option>
  </select>
</lt-status-select>
```

| on the option | |
|---|---|
| `data-glyph` | a sprite symbol id (inline the sprite once per page, as for any badge) |
| `data-variant` | badge variant: `danger` \| `warning` \| `success` \| `info` \| `neutral` (default) |
| `data-swatch` | a `.lt-swatch` modifier, e.g. `iso-p` — renders a taxonomy swatch instead of a status chip |
| `data-code` | what goes inside the swatch box; **defaults to the option's value**, so it is only needed where the posted value is not the printed code |
| none of them | the option renders as plain text — which is how an unset "— not yet ruled —" placeholder stays visibly different from a rated value |

**The taxonomy picker is this same element** (2026-07-29), not a sibling
`lt-swatch-select`. The entire difference is what goes inside one span; the APG
keyboard contract, focus handling, type-ahead, placement and ARIA are
identical, and that contract is the last thing in the system worth keeping two
copies of. Scott Moyse decided the hatch over the sibling on those grounds.

```html
<option value="P" data-swatch="iso-p">Steel</option>          <!-- [P] Steel -->
<option value="12" data-swatch="iso-p" data-code="P2.1">Low-alloy</option>
```

`data-swatch` **names a modifier**, exactly as `data-variant` does, so a colour
never reaches app markup and a picker cannot invent an uncertified fill. A
value that is not a plain modifier name is dropped rather than injected.

**Put the name in the option text, not the code** — "Steel", not "P — Steel",
or the code renders twice. The cost lands on the light-DOM fallback, where an
un-upgraded native select shows "Steel" with no letter; the eight
material-group names are mutually unambiguous, so that reads fine.

Labelling: an `aria-label` on the select copies to the face; a `<label for>`
pointing at the select is re-pointed at the face (and its click re-wired,
since a hidden control cannot take focus). One kind, one glyph, everywhere —
the badge mapping dict rule in §6 applies to these options unchanged.

**The native select stays in the page as the posted form value**: hidden,
still submitting under its own `name`. A commit fires a real bubbling
`change` event on the real select, so an `onchange` attribute or an htmx
trigger the app already has fires exactly as it would natively, and hidden
sibling fields in the same form (a reason that must ride along with every
save) keep riding along. The element also mirrors the current value onto its
own `data-value` attribute for app CSS. Programmatic writes through the
`value` property render but fire no event, same as a native select.

Properties and events: `el.value` (proxies the select), `el.open`,
`el.show()`, `el.close()`, `el.toggle()`; `lt-change { value }` bubbles, and
the native `change` fires on the inner select. `list-id` fixes the generated
listbox id.

Keyboard, the APG select-only combobox pattern: focus stays on the face and
the options are reached through `aria-activedescendant`. Closed: Enter,
Space, Down or Up open at the current value, Home/End open at the ends, a
printable character opens and jumps. Open: Down/Up move **without wrapping**
(clamping is what a native select does — Down at the bottom must not
teleport a rating back to the top), Home/End jump, type-ahead jumps, Enter
or Space commits and closes, Tab commits and lets focus move on, Escape
closes without committing. Light dismiss closes without committing, like a
native select.

Two decisions from the consumer's own iteration, on the record so neither is
re-proposed:

- **A full-face badge tint on the closed face was tried and REJECTED as too
  loud** (Scott, 2026-07-28): a column of rating selects each painted in its
  status surface out-shouted the data around it. The face stays a plain
  field control reading the field tokens, with the select's own chevron
  drawing; the chip inside it carries the colour at chip size.
- The interim it replaces was a plain select with a status-accent glyph
  overlaid at the start edge, state on a `data-rating` attribute. `data-value`
  on the host is that attribute's replacement.

The floating list is `.lt-menu__list`'s construction again: `.lt-panel` for
its own surface (the overlay-plus-page-ink pair measures 1.09:1 in dark —
see the traps), `position: fixed` so `.lt-table-wrap`'s overflow cannot clip
it, the popover top layer where the browser has it, and the list opens at
least as wide as the face, start-aligned, so it reads as the same control.
Inside `.lt-field` the element honours `--lt-field-max-width` like every
other control kind. Without the script the markup is a labelled native
select that posts the same name and value; it has no chips and loses
nothing else.

Anything that changes without a page load announces through the shared live
region at the bottom of `lt-elements.js`.

---

## 6. Status, alerts and badges

```html
<span class="lt-state lt-state--running">Running</span>

<span class="lt-badge lt-badge--warning">
  <svg aria-hidden="true" focusable="false"><use href="#lt-ic-warning"/></svg>Low stock
</span>

<!-- Title and body. The icon is a sibling of the wrapper, not inside it, so the
     alert's flex row is icon-then-text and the wrapper stacks the two lines. -->
<div class="lt-alert lt-alert--danger">
  <svg aria-hidden="true" focusable="false"><use href="#lt-ic-alert"/></svg>
  <div>
    <strong class="lt-alert__title">Spindle fault, cycle stopped</strong>
    <span class="lt-alert__body">Machine 04 halted at operation 7.</span>
  </div>
</div>

<!-- One line only. No wrapper, because there is nothing to stack. -->
<div class="lt-alert lt-alert--info">
  <svg aria-hidden="true" focusable="false"><use href="#lt-ic-info"/></svg>
  <span>Prices exclude GST.</span>
</div>
```

States: `running`, `warning`, `fault`, `waiting`, `idle`.
Badge and alert variants: `danger`, `warning`, `success`, `info`, `neutral`.

**The icon is a required slot, not an option**, for a badge and for an alert
alike — rule 3, colour never carries meaning alone. The four alert icons are
`lt-ic-alert`, `lt-ic-warning`, `lt-ic-success` and `lt-ic-info`, and each
inherits the alert's ink through `currentColor`, so one drawing serves every
variant.

**A title and a body need a wrapper around them.** `.lt-alert` is
`display: flex` with no wrap, so two children sit side by side on one line. The
wrapper is a plain `<div>`; `.lt-alert__body` is the body text itself and only
sets `--lt-text-sm`, so putting the title inside it shrinks the title to the
body size and loses the distinction. Measured 2026-08-20, after the second
consumer report found the earlier example here rendering its title and body on
one line at the same 36px offset.

### Which status visual

Severity picks the colour. **Lifetime picks the component.** If there is
something on screen the message belongs to, put it there: under the field, on
the row, above the section, on the readout. Only float it when there is nowhere
to put it, and that is a toast.

| showing | use | until |
|---|---|---|
| a condition that is true right now | `.lt-alert--*` banner, above what it is about | it stops being true |
| the result of an action, with nothing on screen that shows it | `toast()` | 5 s, or dismissed (danger: dismissed only) |
| a problem with one input | `.lt-field__error` + `aria-invalid`, or `.lt-field__warning` if the value is legal but odd | the value is fixed |
| what an input expects, before it is wrong | `.lt-field__hint` | never, it is permanent |
| a record's state in a table or card | `.lt-badge--*` | the record changes |
| a machine or job's live condition | `.lt-state--*` | the state changes |
| a state the user can set | `lt-status-select` | it is a control, not a message |
| an applied filter, a picked value, anything the user can take back off | `.lt-chip` | they remove it |
| a result outside its safe range | `.lt-readout--warning` / `--danger` | the inputs change |
| a decision that blocks everything else | `lt-dialog` | they decide |

**A toast is a receipt. A banner is a condition.** "Quote saved as Q-2026-0418"
is finished business, so it can vanish. "Feed above the published range" stays
true until the number changes, so it stays on the page. If you cannot say when
the message stops being true, it is a receipt.

Five rules follow from that:

- **Anything the user has to act on is a banner.** A toast is gone in five
  seconds, and on a kiosk they are looking at the workpiece for most of it.
- **An error chip and `aria-invalid` are one thing.** Paint one without the
  other and the field looks wrong to the person reading it and reports
  perfectly valid to everything else, including `lt-wizard`, which decides
  whether a step may advance by looking for `aria-invalid="true"` inside it.
  See "the chip is half a field" below.
- **A validation error never floats.** Validated inline, the message goes under
  the field as the user types. Validated on submit, it still goes under every
  failing field, and it earns a banner as well only when the failing field can
  be off screen: a long form, a wizard step, a collapsed section. Move focus to
  the first failing field, or to the banner if it links to them. Only a failure
  with nothing to point at, a network drop or a server error, follows the toast
  rules.
- **One event, one visual.** Never a toast and a banner for the same thing. If
  the fields carry their own errors, the form does not also toast.
- **A fault only floats if it happened out of sight**: a background save, a
  machine on another screen. `toast()` will not auto-dismiss a danger, so a
  danger toast sits over the content until someone closes it. Do not stack
  them either. Three at once means you are reporting a stream, and a stream
  belongs in the page.
- **A banner you insert is silent.** Set `role="alert"` (danger, warning) or
  `role="status"` (success, info) before inserting it, or call `announce()`.
  Toasts announce themselves. A banner already in the markup at load needs no
  role; it is read in document order.

```js
// receipt: the saved quote is not on this screen
toast("Quote saved as Q-2026-0418.", { variant: "success", title: "Saved" });
```

### The chip is half a field

A field error is two things, and hand-rolled markup can do one and skip the
other:

```html
<div class="lt-field">
  <label class="lt-field__label" for="f-code">Code</label>
  <input class="lt-input" id="f-code"
         aria-invalid="true" aria-describedby="f-code-error">
  <p class="lt-field__error" id="f-code-error">Already in use.</p>
</div>
```

The attributes are not decoration. `lt-wizard` gates Continue on finding
`aria-invalid="true"` in the step, so a step whose fields carry only chips lets
the user walk past a bad value. And `role="alert"` on the chip announces it once
when it appears; `aria-describedby` is what makes it readable again when the
user tabs back. Both, every time.

`lt-number-field` cannot get this wrong: one validation pass sets the state, the
attributes and the chip together. Anything you build by hand can, and the first
consumer did, on every field in the app, with nothing anywhere complaining.

**Two checks now complain.** Neither repairs anything, deliberately: a system
that silently rewrites your markup is one where the file and the page disagree.

```bash
python lt_dom_audit.py rendered.html    # any saved page or htmx fragment
```

```js
import { auditFields } from "./components/lt-elements.js";
auditFields();        // [] when clean, otherwise one entry per split field
```

`<body data-lt-audit>` runs the JS one on a live page and warns to the console,
re-checking after htmx swaps, since a server-rendered error only appears after a
failed submit. It is opt-in, so no production page pays for the observer.

A server-rendered app imports `audit()` in the test it already has, and must
drive a **failing** submit to see anything:

```python
from lt_dom_audit import audit
r = client.post("/coatings", data={"code": ""})   # the error render
assert audit(r.text) == []
```

`.lt-field__warning` is exempt on purpose: a warning is legal but worth a second
look, so it stays valid and must not carry `aria-invalid`.

**Why this is not a `conformance.py` rule.** Conformance is a static per-file
scan. It catches the inline shape above, but not the one that ships: a macro in
one file emits the chip and a call site in another owns the control. Pointed at
templates it reports the macro forever, a file that cannot be fixed, and passes
every call site that can. Rendering resolves that seam, so the audit reads
output rather than source.

**`lt-status-select` needs the attributes on the native `<select>`**, and copies
them to its face at upgrade. It hides the select and takes it out of the
accessibility tree, so an `aria-invalid` left only there is announced to nobody
and paints nothing. To flip validity on a live element rather than re-rendering,
call `el.setInvalid(true)`, which marks both halves.

### A badge needs a glyph, not just a colour

Five severities is what the colour layer offers. A real application vocabulary
is bigger: the first consumer maps fourteen states onto those five, so *draft*
and *retired* are both grey and *active* and *default* are both green. Colour
stopped distinguishing them long before the user did. The glyph is what carries
the difference, and it is the signal that survives red-green colour vision
deficiency, glare and a photocopy — rule 3, applied to the component that needs
it most.

```html
<span class="lt-badge lt-badge--neutral">
  <svg aria-hidden="true" focusable="false"><use href="#lt-ic-pencil"/></svg>Draft
</span>
```

The badge sets its own ink and the glyph inherits it through `currentColor`, so
**one drawing works on all five variants**. Never colour a glyph per variant.

**A glyph that "reads a pixel low" in a badge is the artwork, not the box.**
Measured 2026-07-28, after the first consumer reported exactly that: the
badge's flex centring puts the icon box dead on the text's cap-band centre at
every density — with Inter, (ascent−descent)/2 equals cap-height/2, so
geometric centring *is* optical centring. The symptom was real but lived in
the tilde glyph, whose wave was drawn 3 grid units low in its viewBox (fixed
the same day). If a glyph looks off-centre beside badge text, check its ink
extents in the sprite; do not add a nudge to `.lt-badge > svg`, which would
push every correctly drawn glyph off to compensate. The alert icon is the one
place a vertical offset is legitimate — it top-aligns beside multi-line text
and centres itself on the first line with `calc((1lh − var(--lt-icon-size)) / 2)`.

**Beside running text the badge sits on the line's middle**, via
`vertical-align: middle` on the component (2026-07-28). An inline-flex box's
baseline is its last line box's, and since the glyphs landed the pill is
taller than its own 2xs text, so baseline alignment parked the whole pill
high of the prose around it — the first consumer carried the fix as a
documented app override, and it belongs on the component. Inside flex and
grid parents (toolbars, `.lt-row`, table cells) `vertical-align` does
nothing, so chip rows are untouched. Do not re-add the override in an app.

The status glyphs in the `lt` sprite, with the roles they were drawn for:

| glyph | id | states |
|---|---|---|
| pencil | `lt-ic-pencil` | draft, seeded |
| check | `lt-ic-check` | active, signed off, ideal, default |
| dash-circle | `lt-ic-dash-circle` | retired, not suitable |
| slash | `lt-ic-slash` | banned |
| bookmark | `lt-ic-bookmark` | reserved |
| tilde | `lt-ic-tilde` | capable |
| flask | `lt-ic-flask` | experimental |

`lt-ic-check` is a **bare** tick. `lt-ic-success` is a tick in a circle and
means an outcome, not a state; using it for "active" makes the two
indistinguishable in a table. Same for `lt-ic-slash` (banned, a 45° bar) and
`lt-ic-dash-circle` (retired, a horizontal bar): the angle is the whole
difference at badge size, and it is enough.

**The seven are a vocabulary, not a constraint.** They cover the states an
application lifecycle tends to have; a badge renders whatever symbol you point
it at, and the same sprite carries `success`, `warning`, `alert`, `info`,
`add`, `box` and `settings`. Reach past the set whenever something else fits
the meaning better — a stock level is a severity, not a lifecycle state, so
"Low stock" takes `lt-ic-warning` rather than being forced onto a flask.

What is not negotiable is that **one kind gets one glyph everywhere in an
app**. Keep the mapping in a single dict and override per meaning, never per
call site; an override that starts repeating belongs in the dict. If a kind
needs a glyph the set has not got, that is a request upstream, not a local
drawing — a one-off icon drawn in an app is one nobody gates.

`.lt-state--*` reads `--lt-*-accent`, because it sits on plain grey with no
coloured background. Badges, alerts and toasts read `--lt-*-on-surface` for
their ink and for the alert's left bar, because they sit on their own status
surface, which is light in both schemes. Never `--lt-*-text` there: that is
page ink, it follows the scheme, and in dark mode it measured 3.35–3.44:1 on
the status surfaces — the bug fixed on 2026-07-27. See the "three different
jobs" section in `SKILL.md`.

Alert variants are `danger`, `warning`, `success` and `info` — all four are in
the gallery, including the info case ("Scan your badge to continue").

`.lt-readout` is the large output half of a calculator: big, tabular, unit always
visible. Variants `--warning` and `--danger`.

### `.lt-swatch`: a taxonomy code, not a state

A badge says how a record is *going*; a swatch says what it *is*. Added
2026-07-29, it draws one workpiece-material palette of eight fills. Six of them
are ISO 513's own groups, which the trade has colour-coded for decades — P blue,
M yellow, K red, N green, S orange, H grey — and which a machinist reads off the
insert box before reading the letter.

The other two joined them on 2026-07-30 as Evolute extension roots: **W brown**
for wood and wood-based materials, and **O purple** for plastics, resins and
composites. Read those two hues differently from the first six. The trade fixes
P through H and the system only certifies their digital values, while nothing
outside Livetools fixes a colour for wood, and Sandvik Coromant, whose letter O
this follows for the same scope, prints that column uncoloured and marked
"Non-ISO" in its grade charts. Both of these hues are Evolute's own choice, and
section 3b records them that way.

```html
<span class="lt-swatch lt-swatch--iso-p">P</span>
<span class="lt-swatch lt-swatch--iso-p">P2.1</span>   <!-- a sub-group takes its root's colour -->
```

Modifiers are `--iso-p`, `--iso-m`, `--iso-k`, `--iso-n`, `--iso-s`, `--iso-h`,
`--iso-w` and `--iso-o`. Sizing is `--lt-swatch-size`, the same kind of named
glyph box as `--lt-check-size`, so anything aligning to a swatch computes from
the number the swatch draws itself with.

**Square at one character, rectangle as the code grows.** `min-inline-size`
holds the square and `padding-inline` lets `P2.1` grow past it, so there is no
wide variant to choose between and no reason for an app to re-solve it.
`smoke-measure.py` asserts both halves in the paint.

**It never ships empty, and that is measured, not stylistic.** Under Brettel
deuteranopia simulation the K, N and S fills land within ΔE2000 5.4 of each
other — one olive smear — so for roughly 8% of the men on a shop floor those
three groups are the same colour. Protanopia is tighter still since W arrived:
K and W simulate to ΔE2000 2.1, the closest pair this palette has ever carried.
Scott Moyse took that knowingly on 2026-07-30, choosing the richer walnut over
a duller `#5D4037` that would have separated at 8.6, on the footing that the
letter is what a protan reader is reading anyway. The code inside the box is
the signal; the colour is recognition speed for everyone else. There is no
colour-only variant, no legend dot and no bare key. This is rule 3 with numbers
behind it.

Several fills sit under 3:1 against surfaces they legitimately land on (yellow
on any light surface; the mid-tones and both of the dark extension fills on a
dark table header, where W's 1.78 is the furthest under it). The component
restores the boundary with an inset edge derived from the fill itself, mixed
`--lt-swatch-edge-mix` toward `--lt-text-primary` so it darkens on light
surfaces and lifts on dark ones. **Do not retune that in an app**, and do not
add a per-colour edge token: `verify-tokens.py` sweeps all 192 fill/surface
pairs, and 50% is the certified answer. It was 144 pairs until the palette went
to eight fills on 2026-07-30, and the re-sweep moved neither the answer nor the
binding case, which is still M on the panel table header. The consumer's
original 82% is what it replaced — it looked right and left yellow's edge at
1.84:1.

**A taxonomy picker is `lt-status-select` with `data-swatch`**, not a second
element. See §5.

---

## 7. Tables

```html
<div class="lt-table-wrap">
  <table class="lt-table lt-table--zebra">…</table>
</div>
```

Always wrap. `--freeze` sticks the first column. Numeric cells get
`.lt-numeric`. Sort controls inside `th` need to reach `--lt-target-min`.

---

## 8. Row actions

One rule, applied down a whole table:

- **Two or more actions on a row → one kebab** (`<lt-menu>`).
- **Exactly one action → that action inline**, as a quiet button
  (`lt-btn--danger-quiet` when it is destructive).

Filled red per-row buttons are what this replaces.

### `lt-menu`

**The markup is the API.** There is no JavaScript configuration property
anywhere on this element, because the pages that need it are rendered by a
template engine: a Jinja macro can emit an `<a>` and a `<button>`, and cannot
pass an array of action objects. Author the items; the element supplies the
trigger, the wrapper, the roles and the behaviour.

```html
<lt-menu label="Actions for EV-1200-5F-30">
  <a class="lt-menu__item" href="/tools/1200/edit">Edit</a>
  <button class="lt-menu__item" type="submit" form="default-1200">Make default</button>
  <hr class="lt-menu__sep">
  <button class="lt-menu__item lt-menu__item--danger" type="submit" form="del-1200">
    <svg aria-hidden="true" focusable="false"><use href="#lt-ic-slash"/></svg>Delete
  </button>
</lt-menu>
```

| attribute | |
|---|---|
| `label` | accessible name for the trigger. **Name the row, not the verb.** Twenty triggers called "Actions" are twenty identical announcements. Defaults to `Row actions`. |
| `align` | `end` (default) or `start` — which edge of the trigger the list lines up with |
| `menu-id` | fixes the generated list id, when something else has to reference it |

Classes: `.lt-menu__item` on each action, `.lt-menu__item--danger` on a
destructive one, `.lt-menu__sep` on an `<hr>` between groups.

Properties and events: `menu.open`, `menu.show("first" | "last")`,
`menu.close()`, `menu.toggle()`; `lt-menu-open` and `lt-menu-close` bubble.

Keyboard, the APG menu button pattern: Enter, Space or Down on the trigger open
it and focus the first item, Up focuses the last; inside, Down and Up move,
Home and End jump, a printable character jumps to the next item starting with
it, Escape closes and puts focus back on the trigger, Tab closes and lets focus
move on. A disabled item keeps its `menuitem` role so the menu is not silently
shorter to a screen reader, but the arrow keys skip it.

Three things it does that a hand-rolled kebab usually does not:

- **The list is `position: fixed`, not absolute.** A row menu lives inside
  `.lt-table-wrap`, which is `overflow: auto`. An absolutely positioned panel
  in there is clipped by the wrapper, and in a dense table most of the menu is
  simply not on screen. Where the browser has the popover API the list also
  takes the top layer, so a sticky header cannot cover it either.
- **It carries `.lt-panel`.** The list floats free of the row, so it needs a
  surface context of its own. The obvious pair — `--lt-surface-overlay` with
  `--lt-text-primary` — measures **1.09:1** in the dark scheme (#FDFDFD card,
  #EBEBEB ink), because the overlay is a light card in every scheme while page
  ink follows the scheme up to the shell ladder. Same shape as the alert ink
  defect of 2026-07-27.
- **Without the script the items are simply visible in the row.** A
  destructive action is never hidden behind a control that failed to upgrade.

The trigger is `lt-btn lt-btn--ghost lt-btn--icon`, so it is square at
`--lt-control-height` in every density and floors at `--lt-target-touch` on a
coarse pointer. It draws its own kebab rather than referencing the sprite, so
the element works on a page that has not inlined one.

**Inside a `.lt-table` the trigger compacts automatically** (2026-07-28): at
the full 36px control height its dots ride visibly below a top-aligned row's
first text line, reading as misalignment down the whole actions column, and
every consumer with row kebabs hit it. The stylesheet re-declares
`--lt-control-height: var(--lt-target-min)` on `.lt-table lt-menu` — a token
re-declaration, not a hard size, so the trigger still reads the same token
as every control — and floors it back to `--lt-target-touch` under
`pointer: coarse`. Nothing to opt into, and no app rule to carry; an app
that wants the full-size trigger back re-declares the token on a more
specific selector. Do not re-create the compact rule in an app.

---

## 9. Icons and the lt glyph set

Inline `icons/lt/sprite.svg` once per page — it is display-less via
`.lt-sprite` — then reference symbols by id:

```html
<svg class="lt-icon" aria-hidden="true" focusable="false"><use href="#lt-ic-add"/></svg>
```

The set: `add`, `settings`, `alert`, `warning`, `success`, `info`, `box`, the
four UI glyphs `search`, `filter`, `close`, `chevron-down`, and the seven status
glyphs listed under [badges](#6-status-alerts-and-badges).

`close` is the one glyph for every dismissal — a drawer, a dialog, a toast, a
chip's remove button — the way `check` serves every settled state. Reach for it
rather than a literal `×`: a non-ASCII character in a string literal takes the
**document's** encoding when a module is inlined rather than imported, so it
mis-decodes on any page without a charset declaration. Draw any sibling chevron
to agree with `chevron-down`; the select paints the same mark through a `url()`
marker instead of a `<use>`, because a `background-image` cannot reference a
sprite, and a trigger and a select in one bar must not point differently.

Two sizes, both from tokens: `.lt-icon` reads `--lt-icon-size` (16 / 20 / 24 by
density) and `.lt-pictogram` reads `--lt-pictogram-size` (32 / 40 / 48). Chip
slots — `.lt-badge > svg`, `.lt-field__error > svg` — read
`--lt-icon-size-xs` / `-sm`, **both 16px since 2026-07-28**: they were 12 and
14, which is under the 24-grid's own floor, and a 3-unit distinguishing mark
renders at 1.5px there instead of the 2px the standard asks for. There is
nowhere legal below 16px; a mark that needs to be smaller needs different
artwork, not a smaller render.

---

## 9b. Chart colours

No chart component ships. These are the colours to draw with, and the contract
that makes them valid. Full reasoning and every measured figure are in
`lt-tokens.css` section 3c.

| Token | Job |
|---|---|
| `--lt-chart-track` | the plot background. **Paint it.** `--lt-grey-2` in every scheme and theme |
| `--lt-chart-grid` | gridlines, deliberately faint at 1.42:1 on the track |
| `--lt-chart-1` … `-8` | categorical series, taken in order, never cycled |
| `--lt-chart-mark` | a single series, when identity is not in question |
| `--lt-chart-mark-context` | a quieter mark: a reference, a previous period |
| `--lt-chart-mark-emphasis` | the one mark that matters |

```html
<figure class="lt-panel">
  <figcaption>Tool life by grade</figcaption>
  <div style="background:var(--lt-chart-track);padding:var(--lt-space-4)">
    <div style="block-size:60%;background:var(--lt-chart-1)"></div>
    <div style="block-size:45%;background:var(--lt-chart-2)"></div>
  </div>
</figure>
```

**The track is load-bearing.** Every series colour is certified against
`--lt-grey-2` and nothing else. A mark drawn straight onto a panel meets 3:1 on
the light panel and the commercial dark panel, and four of the eight fall to
2.38–2.45:1 on the **operational** dark panel, which is `--lt-grey-5`. Painting
the plot area is what makes the palette valid, and it is also what stops a chart
reflowing between day and night shift.

**Order is the mechanism, not a convention.** The eight are sequenced so that
every prefix is separable on its own: three series measure 20.4 apart, four
14.9, six 13.0, all eight 10.3, under simulated red-green colour blindness where
the floor is 8. Take the first N. Re-ordering them weakens every chart that
draws fewer than eight, silently.

**One series is grey.** `--lt-chart-mark` rather than slot 1. Colour is the
identity channel and a lone series has no identity question to answer, so
spending it there wastes the one signal you have left for
`--lt-chart-mark-emphasis`.

**Past eight, stop.** Fold the tail into "Other", facet into small multiples, or
change the chart. A ninth generated hue is never the answer, and
`verify-tokens.py` fails a `--lt-chart-9`.

**Colour still never carries meaning alone.** Two or more series means a legend;
four or fewer also means direct labels. The separation figures say a reader can
tell two marks apart, not that they know which is which.

**No red, and that was measured rather than assumed.** A red slot scored 10.4
against this palette's 10.3 at eight series, and 10.5 against 13.0 at six, so it
bought nothing and would have cost a second exception to "red is identity and
danger". The rose at slot 3 is held off the red band on purpose.

**Texture, for when colour is gone entirely.** The palette survives red-green
colour blindness; a photocopy, a monochrome print and Windows High Contrast Mode
do not leave any colour to survive. Add one class to a mark that already carries
a chart colour.

| Class | Fill |
|---|---|
| *(none)* | solid |
| `.lt-hatch` | 45 degrees |
| `.lt-hatch--back` | 135 degrees |
| `.lt-hatch--cross` | both, crossed |

Four fills, so four series are tellable apart with no colour at all. Past four
the legend is doing the work again, which is another reason eight is the
ceiling. The stripes are cut in `--lt-chart-track` rather than painted in a new
colour, so hatching never introduces a second hue. **The legend key takes the
same class**, via `.lt-chart-key`, or the texture is decoration rather than an
encoding. In forced colours every fill collapses to one system colour and the
texture is all that is left.

There is no sequential or diverging ramp yet.

---

## 10. Kiosk patterns

Unattended screens need two things the desktop tools do not: targets a gloved
thumb can hit, and a session that resets itself so the next person does not
inherit the last one's work.

```html
<body data-lt-density="spacious" data-lt-idle-reset="90" data-lt-idle-href="/">
```

`data-lt-idle-reset` warns ten seconds out rather than wiping the screen without
notice. Kiosk primary actions are `lt-btn--primary lt-btn--lg`, blue like
everywhere else.

The logotype is the sanctioned brand-red exception and must declare itself:

```html
<span data-lt-logotype style="color:var(--lt-brand-red)">LIVETOOLS.</span>
```

WCAG 1.4.3 exempts text that is part of a logo or brand name from the contrast
requirement. `data-lt-logotype` makes that exemption a decision on the record
rather than an assumption, and `conformance.py` looks for it.

---

## 11. The traps, in full

**Inlining the JS into an HTML file.** `lt-elements.js` has a usage example in
its header comment containing a literal `</script>`. Inlined into a `<style>` or
`<script>` block, the HTML parser ends the script element there, and everything
after it parses as markup. Escape it as `<\/script>`. Harmless inside a JS
comment, invisible to the parser.

**Grid rows stretching.** Any grid that is itself a stretched grid item will
share surplus height across its auto rows unless you set `align-content: start`.
This hit `.lt-field` (label-to-control gap grew) and showed up again as an input
group measuring 2px taller than all of its children.

**An uppercased label mangling a symbol.** `.lt-field__label` sets
`text-transform: uppercase`, and CSS uppercasing is lossy. Greek small mu
(U+03BC) and the micro sign (U+00B5) both map to Greek capital Mu (U+039C),
which Inter draws indistinguishably from a Latin M. Measured 2026-08-20: a label
reading "Ra µm finish" paints "RA ΜM FINISH", so a machinist reads millimetres
where the field means microns, a factor of a thousand out. A field labelled
"Grip factor µ" comes out "GRIP FACTOR M", a different quantity.

The remedy needs no new machinery. `.lt-affix` is `text-transform: none`, so the
symbol goes in the affix where it is read as part of the value anyway, and the
hint slot takes any qualifier. This is the argument the hint section already
makes about parentheticals, one step further: an all-caps label is the wrong
place for anything whose case carries meaning.

**Stretch vs definite size.** `align-items: stretch` sizes a flex item's outer
box to the line. An item with a border and no definite cross size can therefore
end up taller than a sibling that has one. Give both a definite `block-size`.

**Source order beating a surface class.** `.lt-panel` and `.lt-shell` are single
class selectors. Any later single-class rule setting `background` wins against
them, and you get a surface whose background says one thing while its text
tokens say another. Light text on a light fill, or dark on dark.

**A surface context that only re-declares ink.** It must also re-declare its
`--lt-surface-*` tokens and its `color-scheme`. Miss the surfaces and any
component drawing its own background from a surface token gets the wrong scheme's
value. Miss `color-scheme` and the browser paints native radios and checkboxes
for the wrong scheme, which on a light panel in dark mode looks like a filled
disc that reads as "selected" when nothing is.

**A double border where a code block or panel is the first child of a framed
container.** If the child carries a `border-block-start` meant to separate it
from a sibling above, and there is no sibling, it doubles the frame border. Zero
it with `:first-child`.

**A component with its own light surface reading scheme-following ink.** The
status surfaces are identical in both schemes, but `--lt-*-text` lifts in dark
mode for the dark page. Alerts, badges and toasts reading it put pastel ink on
a pale card at 3.35–3.44:1 in dark mode, for every status at once. Ink for
content on a scheme-independent surface must itself be scheme-independent:
`--lt-*-on-surface`, and `verify-tokens.py` fails the run if that pairing
diverges between schemes.

**A scheme toggle that half-works: dark ink, light page.** The manual scheme
attribute selector was bare `[data-lt-scheme="dark"]` at (0,1,0), and the
default operational theme block `:root:not([data-lt-theme="commercial"])` at
(0,2,0) re-declares `--lt-surface-page`, so the toggle switched every ink token
while the theme block held the page light. OS-level dark worked because its
media-query selector already sat at (0,2,0). Fixed 2026-07-27 by pinning the
toggle selector as `:root[data-lt-scheme="dark"]`. The lesson: a scheme or
theme override must match the specificity of every block that re-declares the
same tokens, or it applies in stripes.

**Grouped controls reading different border families.** A field reads
`--lt-field-border`, a secondary button `--lt-action-secondary-border`. Put
them in one `.lt-input-group` and the border changes shade partway along one
object — and hovering the input appeared to fix it, purely because
`--lt-border-strong` happens to equal the button border in most contexts. The
group sets one border family on every child and hovers as a unit. Details in
the Fields section.

**The reset's fluid-media clamp beating a sized icon.** The reset puts
`max-inline-size: 100%` on every svg so content media stays fluid. That is a
*different property* from `inline-size`, so the `:where()` reset's zero
specificity is irrelevant — the clamp stacks on top of a definite size. In any
container narrower than the icon, the width caps while the height does not,
and `preserveAspectRatio` then paints the artwork smaller than both. The first
consumer measured a 20px icon painting 15×15 in a table column, strokes at
1.25px — and the trap feeds itself, because the column was narrow *because*
the icon was its only content. Every sized icon slot in `lt-components.css`
carries `max-inline-size: none` in one grouped rule; a new rule that gives a
replaced element a definite inline size must join that list, and
`smoke-measure.py` keeps a 10px-container fixture that fails if it doesn't.

**A floating panel reading page ink.** Anything that paints its own light card
and floats over the page — a menu list, a dialog, a popover — must take a
surface context, not `--lt-surface-overlay` plus `--lt-text-primary`. Measured
in the dark scheme on 2026-07-28: overlay #FDFDFD, page ink #EBEBEB, 1.09:1.
The card is scheme-independent and the ink is not, which is the same split that
put alerts and badges at 3.35–3.44:1 in 2026-07-27. Both `lt-menu` and
`lt-dialog` put `.lt-panel` on the floating element and declare no background
or ink of their own; `.lt-dialog` carried the bad pair until 2026-07-28.

**A wrapper with everything switched off except the thing that breaks it.**
The dialog wrapped its content in `.lt-card` with `border:0;padding:0` inline —
every visible property disabled but the background, which still painted
`--lt-surface-panel` inside a dialog painting `--lt-surface-overlay`. In light
both are white and nothing showed; in dark they are #DEDEDE and #FDFDFD, so
every dialog rendered a grey slab inside a white frame. If a wrapper's only
remaining job is one you did not ask it for, delete the wrapper.

**A reference page restyling the components it exists to show.** The gallery
styled `h1`/`h2`/`h3`/`p` as bare element selectors, which reach inside every
demo. `lt-dialog` generates an `<h2>` for its heading, so it inherited the
gallery's 64px top margin and its bottom border, and the dialog appeared to
have a huge gap above its title and a rule under it. It was reported as a
component defect. Gallery furniture is scoped to `.wrap`'s own children now.

**A 24-grid glyph rendered under 16px.** The grid's floor is 16px, where a
2-unit stroke lands at 1.33px and a 3-unit distinguishing mark at 2px. Below
that the marks that separate one glyph from another go first, and the icon
degrades into a silhouette that still looks fine in review at 24px. The chip
size tokens sat at 12 and 14px until 2026-07-28 for exactly this reason: nobody
was looking at them at the size they shipped.

**A token flooring itself.** `--x: max(var(--x), floor)` reads as "raise the
current value if it is under the floor" and is actually a self-reference,
which is a cycle: the token computes to guaranteed-invalid on every element,
and an inherited value does not break it. The pointer-coarse touch floor
shipped exactly this, so on all touch hardware it silently destroyed
`--lt-control-height` and `--lt-row-height` — controls collapsed to their
24px minimum. Derive through a second name instead: the density blocks write
`--lt-*-base`, and `:root, [data-lt-density]` rules produce the consumed
tokens, floored under `pointer: coarse`. `conformance.py` fails the pattern
(`token-self-cycle`) and the smoke test's coarse variant measures the result.
