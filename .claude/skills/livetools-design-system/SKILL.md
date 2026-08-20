---
name: livetools-design-system
description: >-
  Build user interfaces with the Livetools Design System (lt-tokens.css,
  lt-components.css, lt-elements.js), the design system behind Livetools'
  machining and tooling applications. Use this skill whenever you are writing,
  editing, or reviewing markup or CSS for a Livetools tool, calculator,
  configurator, catalogue, quoting front-end, or shop-floor kiosk, and whenever
  you see --lt-* custom properties, lt- prefixed classes, or lt-number-field /
  lt-date-field / lt-time-field / lt-file-drop / lt-unit-toggle / lt-tabs /
  lt-dialog / lt-table / lt-wizard / lt-menu / lt-status-select elements in a
  file. Also trigger it for anything to do with charts, dates, times or file
  uploads in a Livetools app, because the system now owns all four and the
  obvious native control is the wrong answer in each case. Trigger it even for small changes like "make this button red", "add a
  field here", or "why is this the wrong colour", because the system's rules
  are the whole point and a plausible-looking change is usually the wrong one.
  For adding or changing tokens, ramps, surfaces, or contrast values, use
  livetools-design-tokens instead.
---

# Building with the Livetools Design System

You are working inside a system that has already made its decisions and written
down why. Your job is to find the existing answer, not to invent a new one.

If the system genuinely has no answer, the fix belongs in the token layer, never
patched around in a component. Where that layer is depends on where you are. In
the design-system repo it is `lt-tokens.css`, and the `livetools-design-tokens`
skill carries the maths. In an application it is `app-tokens.css`, which loads
between the token file and the components, is exempt in `conformance.py` by
name, and is the sanctioned home for a value the system does not define. Put it
there, then report the gap upstream; do not wait on the upstream answer, and do
not reach for a token that belongs to another job.

Read `reference.md` in this folder for the component catalogue, the custom
element APIs, and worked examples. Read it before writing markup for a component
you have not used before.

## Rule number one: never write a raw value

No hex colours. No `rgb()`. No raw `px` font sizes. No hand-rolled shadows. Every
colour, size, space, radius and duration comes from a `--lt-*` token.

This is the failure the system was built to prevent, and it is specifically a
failure agents commit. Asked to "make the button red", the tempting move is to
write `#ED1C24` into a component. It looks correct on the day and it is wrong
from then on, because it will not respond to scheme, density or theme, and
nobody will notice until a customer does.

If no token fits, stop and say so. Do not approximate with the nearest hex, nor
with the nearest token from another job. A border token used as the fill of a
data bar passes every check in this system and is the same mistake wearing a
token's name: a value chosen because it was near rather than because it was
right. No checker can catch that one, which is why it is written here. The
second consumer report, 2026-08-20, shipped exactly it.

Where the system really has no answer, see "What this system does not cover"
below. An application's own token extensions belong in `app-tokens.css`, which
loads between the token file and the components and is the one sanctioned home
for a value the system does not define.

## The other three rules

**Red is identity and danger. Blue acts.** (One named exception, and it is
named rather than general: ISO 513's cast-iron K swatch — see "Colour has three
jobs" below.) A positive call to action is blue at
every size, on every surface, including a kiosk. Red is for the logotype, for
`--danger` (delete, destroy, stop), and for fault states. Livetools Red is
4.38:1 on white, so it fails AA for normal text and cannot carry body copy, a
small label, or a normal-size button label. This was decided on 2026-07-26 by
Scott Moyse after reviewing three options, and the file says in as many words:
do not quietly revert it. It also matches what blue already means on a machine
control panel, mandatory action.

**Colour never carries meaning alone** (WCAG 1.4.1). Every status needs an icon
and words as well as a colour. Around 8% of men have red-green colour vision
deficiency and Livetools' users are mostly men on a shop floor. This is why
statuses are chips with icons rather than bare coloured text. It bites hardest
on badges: five severities cannot separate a fourteen-state vocabulary, so
*draft* and *retired* both come out grey and the glyph is the only thing left
carrying the difference. The `lt` sprite ships seven status glyphs for this
(pencil, check, dash-circle, slash, bookmark, tilde, flask) — see
`reference.md`.

**Danger has three weights, and they are weights, not hues.** Filled
`lt-btn--danger` is the confirm step. `lt-btn--danger-quiet` (outlined) is a
delete that repeats down a list of rows; `lt-btn--danger-text` is one inside a
menu. Seventeen filled red buttons on one page made the rarest action the
loudest element on it, which is what added the tier on 2026-07-28. All three
always carry an icon **and** the word.

**Interactive borders use `--lt-border-interactive` or darker.** The lighter grey
border tokens are under 3:1 and are decorative only. A control boundary that
uses one fails SC 1.4.11.

## Surfaces decide everything

The single most important structural idea, and the one that causes the worst
bugs when it is missed. Three surfaces, each a context that re-declares tokens:

| surface | class | tone | what goes on it |
|---|---|---|---|
| page | (default) | follows the scheme | the background behind everything |
| panel | `.lt-panel` | **light in both schemes** | every control, form, table, card |
| shell | `.lt-shell` | **dark in both schemes** | brand chrome, nav, headers |

Controls belong on a panel. The panel staying light in both schemes is
deliberate: it is what lets brand blue and brand red keep their exact values
instead of being re-tuned per scheme.

**Put the class on the container, then let components inherit.** Do not set
surface tokens on individual components.

```html
<body>
  <header class="lt-shell">…brand chrome…</header>
  <main class="lt-panel">…controls belong here…</main>
</body>
```

If you build a new surface context, it must re-declare **all** of its tokens:
ink, borders, fields, **its `--lt-surface-*` values, and its `color-scheme`**.
Declaring only the text colours is the bug that produces dark-on-dark readouts
and native radio buttons that render as filled discs on a light card. See
`livetools-design-tokens` before adding one.

## Density is a feature, not a default

Set `data-lt-density="compact | comfortable | spacious"` on `<html>` or any
container, and persist the user's choice.

- **comfortable** (36px controls) is the default for a Windows desktop tool
- **compact** (28px) for a dense catalogue or spec grid
- **spacious** (48px) for a touchscreen kiosk

The comfortable values are also the `:root` defaults baked into the token
file (the comfortable block's selector is `:root, [data-lt-density=…]`), so a
page that sets no attribute gets comfortable, not nothing — forgetting the
attribute must degrade to a sane density, never to unstyled. The attribute is
how you *change* density, and the place the persisted choice lands. On a
coarse pointer the tokens floor themselves at `--lt-target-touch` (44px)
whatever density is set.

Never hardcode a control height. Read `--lt-control-height` — and never the
`--lt-control-height-base` / `--lt-row-height-base` names, which are internal
to the token file's density section and skip the touch floor. And whatever
density is set, an interactive hit area must still reach `--lt-target-min`
(24px). Pad the target, do not shrink it past the floor.

## Icons

Two grids, no exceptions: `0 0 24 24` renders at 16–24px through `.lt-icon`,
`0 0 48 48` at 32–48px through `.lt-pictogram` (decided 2026-07-28, the full
record is ICONS-PROPOSAL.md). Any other viewBox renders strokes at broken
widths — the Evolute set drew a "2px" stroke at 1.09px in its own tables —
and `conformance.py` fails it.

An icon paints through the `lt-ic-*` layer classes and nothing else: `ink`
(currentColor — surfaces and forced colours work unaided), `tint` (stock,
never load-bearing), `accent` and `emphasis` (read `--lt-icon-accent`, a slot
each app pins to its own brand hue in `app-tokens.css`; Evolute pins
`#2F8DCB`), `accent-fill`. Writing `fill="#..."` on an SVG attribute is the
one raw-hex route the old checks could not see; `icon-raw-colour` now catches
it. No `opacity` in an icon, ever — a tint that needs compositing cannot be
contrast-checked and is discarded by forced colours.

The acceptance test: render the set at its tier floor with the accent
collapsed to ink (which is exactly what an unpinned slot does). If two icons
are not tellable apart, the artwork is wrong — colour is reinforcement, never
the signal, same as rule 3. Sprites live in `icons/<set>/sprite.svg`, ids are
`<set>-ic-<name>`, and `icons/verify-icons.py` gates every hosted set.

The 24 grid's floor is 16px and it is a floor, not a preference: a 2-unit
stroke lands at 1.33px there and a 3-unit distinguishing mark at 2px, so
anything smaller loses the marks that separate one glyph from another while
still reviewing fine at 24px. The chip slots (`--lt-icon-size-xs` / `-sm`, the
badge and field-chip sizes) sat at 12 and 14px until 2026-07-28 for exactly
that reason — nobody had looked at them at the size they shipped.

## Theme intensity

Operational is the default: grey first, colour reserved for meaning, following
the High Performance HMI convention. Internal tools get it without asking.
Customer-facing surfaces that sit next to Livetools marketing opt in to the
fuller brand expression with `data-lt-theme="commercial"`.

## Status visuals: lifetime picks the component

Severity picks the colour. How long the message stays true picks the
component. If there is something on screen the message belongs to, put it
there: under the field, on the row, above the section. Only float it when
there is nowhere to put it, and that is a toast.

| showing | use |
|---|---|
| a condition that is true right now | `.lt-alert--*` banner, in the flow |
| the result of an action, with nothing on screen that shows it | `toast()` |
| a problem with one input | `.lt-field__error` + `aria-invalid` |
| what an input expects, before it is wrong | `.lt-field__hint` |
| a record's state in a table or card | `.lt-badge--*` |
| what a record *is* — a taxonomy code | `.lt-swatch--*` |
| a machine or job's live condition | `.lt-state--*` |
| a state the user can set | `lt-status-select` |
| a taxonomy the user can set | `lt-status-select` + `data-swatch` |
| a result outside its safe range | `.lt-readout--warning` / `--danger` |
| a decision that blocks everything else | `lt-dialog` |

**Never more than about three at once, whichever component you picked.** The
table above says which visual to reach for. It does not say what to do when the
correct visual arrives nine times, and the answer is the same for every row: past
about three, you are reporting a stream, and a stream belongs in the page as a
list with a count at its head. Nine correctly-judged banners bury the numbers
they sit above just as thoroughly as nine toasts would (second consumer report,
2026-08-20, where one calculation produced nine).

**A toast is a receipt. A banner is a condition.** "Quote saved" is finished
business, so it can vanish. "Feed above the published range" stays true until
the number changes, so it stays on the page. Anything the user has to act on
is a banner: a toast is gone in five seconds, and on a kiosk they are looking
at the workpiece. One event gets one visual, never both. A banner your code
inserts is silent, so set `role="alert"` or `role="status"` before inserting
it, or call `announce()`; toasts announce themselves.

**A validation error never floats**, inline or on submit. It goes under every
failing field, and earns a banner as well only when that field can be off
screen (a long form, a wizard step); focus moves to the first one. Only a
failure with nothing to point at, a network drop or a server error, follows
the toast rules. In `lt-number-field` the chip and `field.state` are one
thing: read the state, never write the chip. Rest in `reference.md` §6.

**An error chip without `aria-invalid` is half a field.** A hand-rolled field
that paints `.lt-field__error` must also set `aria-invalid="true"` on its
control and point `aria-describedby` at the chip's id. This is not just
assistive tech: `lt-wizard` gates Continue on `aria-invalid`, so a step whose
fields carry only chips lets the user walk past a bad value. `lt_dom_audit.py`
checks rendered HTML for it (consumers run it in their own tests, and
`run-all.sh` step 7 runs it here); `auditFields()` checks a live DOM, with
`<body data-lt-audit>` to warn in the console. Neither repairs the markup, on
purpose.

## Colour has three jobs, not two

Brand identity says **who we are**. Status severity says **how something is
going**. A domain palette says **what something is** — and it is the one people
reach for the wrong tool for, because a taxonomy that happens to be red is not
danger.

Domain palettes live in `lt-tokens.css` section 3b. Today there is exactly one,
the workpiece-material palette drawn by `.lt-swatch`, and since 2026-07-30 it
carries eight fills, each with a matching `-on` ink. Six are ISO 513's own groups
(`--lt-iso-p` … `--lt-iso-h`), whose hues are fixed by the trade rather than by
us and whose digital values are ours, certified by `verify-tokens.py` on every
run. Two are Evolute's extension roots, added in the style of Sandvik Coromant's
non-ISO letters: `--lt-iso-w`, brown, for wood and wood-based materials, and
`--lt-iso-o`, purple, for plastics, resins and composites. Never build a
taxonomy out of the status tokens: a cast-iron row in `--lt-danger-*` reads as a
fault, and a non-ferrous row in `--lt-success-*` reads as a pass.

**Adding a colour to a domain palette is a decision, not an edit.** Every fill
is pinned by name in `DOMAIN_PINS` in `verify-tokens.py`, so a new one fails the
build until somebody puts it there deliberately. That fence exists because ISO
513's K reuses red, against "red is identity and danger only". K is approved
**for ISO 513 and for nothing else** (Scott Moyse, 2026-07-29): it is duller and
darker than `--lt-brand-red`, and it only ever appears as a fill behind a
required letter. A second palette that wants red, green or amber does not
inherit that — it raises its own decision with its own numbers.

The fence has been walked through once since. W and O were added on 2026-07-30
by Scott Moyse and both are pinned in `DOMAIN_PINS` by name, exactly as the
original six are. Neither needed a hue exception of its own: brown and purple
are outside the three hues the fence contests, so K's red permission is
untouched and still generalises to nothing. What these two do add to the record
is a limit on what the system may claim about them. The six ISO hues come from
the trade and our only job is certifying digital values for them, and none of
that holds for W and O. No standards body or trade convention fixes a colour for
wood at all, and Sandvik Coromant, whose letter O this borrows for the same
scope, leaves the O column uncoloured and marked "Non-ISO" in its own grade
charts. Both hues are therefore Evolute's own choice, section 3b says so in as
many words, and a later round must not quietly promote them to trade-fixed.

## Status colour: three different jobs

Getting these confused is a bug that has now happened twice, once in each
direction, so check yourself here.

- `--lt-*-on-surface` is ink AND edge for content sitting **on its own status
  surface**: the words inside an alert, a badge, a toast, and the alert's left
  bar. Scheme-independent, because the status surfaces are light in both
  schemes.
- `--lt-*-text` is for a hint or field error sitting on the **page**. It
  follows the scheme and lifts on dark chrome. Never use it on a status
  surface: in dark mode that puts lifted pastel ink on a pale card at ~3.4:1.
  That bug shipped and was fixed on 2026-07-27.
- `--lt-*-accent` is for status colour on a **neutral** surface, e.g. a
  `.lt-state` dot and label on a plain grey panel.

Use the accent for `.lt-state` and anything like it. Know that the danger and
warning accents are the vivid step-9 tones and do NOT meet AA, by a recorded
owner decision (2026-07-27): for those two the icon and words are the signal
and the colour is reinforcement. Do not "fix" them back to AA values, and do
not describe them as AA-compliant. `--lt-*-border` keeps the vivid boundary
jobs, like the invalid-field edge; it is no longer the alert's left bar.

## What this system does not cover

A system that states its boundaries routes the work. A system that stays silent
gets each application inventing inside the same gap, differently. The second
consumer report (2026-08-20) built two bar visualisations without going to look
for guidance, because nothing here prompted it to.

Two of these are different situations and the difference decides what you do.

| Not here | Status | What to do now |
|---|---|---|
| Charts and plots | **Colours are here**, `--lt-chart-*`, landed 2026-08-20. There is no chart COMPONENT: you draw the marks. | Paint the plot area `--lt-chart-track`, then take `--lt-chart-1..8` in order. See "Charts" below. |
| Dense data visualisation: maps, network graphs, treemaps | Not planned. | Reach for an external library and give it its own surface. Feed it the `--lt-chart-*` values so it agrees with everything else. |
| Date and time pickers | **Here**, `lt-date-field` and `lt-time-field`, landed 2026-08-20. | See "Dates and times" below. Do not reach for `<input type="date">`. |
| File upload, drag and drop | **Here**, `lt-file-drop`, landed 2026-08-20. | See "Files" below. It collects and validates; your app sends. |
| Rich text editing | Out of scope, and not planned. | Reach for an external editor and give it its own surface. The system has no opinion on its internals. |

"Coming" means the system intends to own it, so what you build is temporary and
the gap is worth reporting. "Out of scope" means it is not coming, and you are
not waiting for anything.

Either way, two rules still hold inside the gap. Everything you write reads
`--lt-*` tokens, with any new value defined in `app-tokens.css` rather than
written raw. And a token from another job is not an answer: the fill of a data
bar is not a border token because the border token happened to be the right
grey.

## Charts

There is no chart component. There are chart **colours**, and they carry rules.

```html
<div class="lt-panel">
  <div style="background: var(--lt-chart-track); padding: var(--lt-space-4)">
    <!-- bars, lines, whatever you are drawing -->
    <div style="background: var(--lt-chart-1)"></div>
    <div style="background: var(--lt-chart-2)"></div>
  </div>
</div>
```

**Paint the plot area `--lt-chart-track`.** Not optional, and not cosmetic. The
eight series colours are certified against that surface and no other. It is
`--lt-grey-2` in every scheme and every theme, so a chart holds still between
day and night shift. Draw marks straight onto a panel instead and four of the
eight drop to about 2.4:1 on the operational dark theme, which fails SC 1.4.11.

**Take the slots in order and never cycle.** `--lt-chart-1` for one series,
1 and 2 for two, and so on. The order is solved, not alphabetical: every prefix
was measured separately so that a three-series chart is as readable as an
eight-series one. Re-ordering them quietly weakens every small chart.

**One series takes `--lt-chart-mark`, not slot 1.** Identity is not in question
when there is only one thing on screen, so a lone series stays neutral grey and
the colour channel is left free for `--lt-chart-mark-emphasis` on the one bar
that actually matters. `--lt-chart-mark-context` is the quieter grey for a
reference or a previous period.

**Nine series is not a ninth colour.** Fold the tail into "Other", facet into
small multiples, or change the chart.

**Colour is still never the only signal** (rule 3, which does not stop being
true inside a chart). Every chart with two or more series carries a legend, and
four or fewer also carry direct labels. The separation figures in the token file
say a reader *can* tell two marks apart; they do not say a reader knows which is
which without being told.

Gridlines take `--lt-chart-grid`, deliberately faint at 1.42:1. A gridline is
not a graphical object under SC 1.4.11 because the axis labels carry the values,
so do not darken it to satisfy a contrast finding it is not subject to.

**Texture is the other half of rule 3.** The eight colours survive red-green
colour blindness. A photocopy, a monochrome print and Windows High Contrast
Mode wipe colour out entirely, and no palette fixes any of those. Add
`.lt-hatch`, `.lt-hatch--back` or `.lt-hatch--cross` to a mark that already has
a chart colour; solid is the absence of a class. Four fills, so four series are
tellable apart with no colour at all. **The legend key takes the same class**,
or the texture is decoration rather than an encoding.

There is no sequential or diverging ramp yet. If you need one, that is the
`livetools-design-tokens` conversation, or `app-tokens.css` in an app.

## Dates and times

`lt-date-field` and `lt-time-field`. Not `<input type="date">`, for the same
reason `lt-number-field` is not `<input type="number">`: the native picker
cannot read the density tokens, cannot join a surface context, gives a kiosk
whatever day-cell size the OS chooses, and its text half parses **by locale**,
so 03/04/2026 is two different days depending on the machine with nothing on
screen to say which.

```html
<lt-date-field label="Due date" name="due" value="2026-04-03"
               min="2026-01-01" max="2026-12-31"></lt-date-field>
<lt-time-field label="Shift start" value="06:00" step="30"></lt-time-field>
```

**The value is always ISO `yyyy-mm-dd`, and the time is always 24-hour**,
whatever is displayed. `month-first` and `twelve-hour` change the display only.
A named field posts through a hidden input; the visible one is nameless, so a
local reading can never be what a form stores. Same construction as
`lt-number-field` posting metric.

**Read `.value`, never the input.** And never re-format a date yourself: the
field echoes the parsed date back in words under the control, because the month
name is the only thing that settles 03/04 and a reader cannot check a numeric
date by looking at it. The time field echoes the other clock for the same
reason.

Typing accepts what people type: `3/4/26`, `03042026`, `3 Apr 2026` and ISO for
dates; `1430`, `14:30`, `2:30pm` and a bare `9` for times. Anything ambiguous
or impossible is refused rather than guessed, and 31 February is refused rather
than rolled into March.

## Files

`lt-file-drop`. The zone is a `<label>` around a real `<input type="file">`, so
click, Enter, Space, focus and the OS dialog are the platform's.

```html
<lt-file-drop label="Drawings" name="drawings" accept=".pdf,.step"
              multiple max-size="10MB" max-files="5"></lt-file-drop>
```

**It does not own the network.** It collects, validates against `accept`,
`max-size` and `max-files`, lists what it holds, and keeps the input's FileList
in step so a plain form post carries exactly what is on screen. Sending is the
app's job. Listen for `lt-files-change`, then drive `setProgress()` and
`setError()` as your upload reports back.

**Dragging is never the only way in.** It is pointer-only, so the browse action
stays visible at all times and the drag states only change how the same target
looks. If you hand-roll one of these elsewhere, copy two things: hide the input
visually rather than with `display:none`, which would take it out of the tab
order, and check `accept` in script as well as on the input, because the input
only enforces it inside its own dialog and a dropped file never goes near that
dialog.

## Before you commit

```bash
python3 tokens/verify-tokens.py     # colour maths and surface pairings
python3 conformance.py .            # token use and accessibility basics
node components/test-elements.mjs   # component behaviour
python3 smoke-measure.py            # design-system repo only: renders the
                                    # built gallery headless, measures the paint
```

Run them all. `conformance.py` catches raw hexes, raw font sizes, unlabelled
inputs, icon buttons with no accessible name, inline state styling, page-surface
tokens used in fields, brand red used as small text, and a `.lt-swatch` with no
code in it (`empty-swatch`, 2026-07-29) — and, since
2026-07-28, the token graph itself: a `var(--lt-*)` nothing defines
(`undefined-token`), a token whose every definition is conditional consumed
with no fallback (`conditional-token-no-fallback`), and a token that
references itself (`token-self-cycle`). If it flags something, fix the cause.
Do not add the file to the exempt list to make it pass.

`smoke-measure.py` exists because the first consumer report proved a class of
defect no text scan can see: markup and CSS both individually correct, and
the computed result wrong. It asserts every icon slot paints square at
exactly its token, every control hits `--lt-control-height`, no target falls
under `--lt-target-min` — with the density attribute removed, and with the
coarse-pointer floor applied.

## When you are asked to change something visual

1. Find the token or component that already does it. Read the comment above it,
   the reasoning is usually written down.
2. If the answer conflicts with what was asked, say so and explain the rule.
   "Make the CTA red" gets pushback, not compliance.
3. Change it at the right layer. Component CSS reads tokens. Token values live
   in `lt-tokens.css`. App overrides live in `app.css`, which loads last.
4. Re-run the three checks.

## Load order

```html
<link rel="stylesheet" href="tokens/lt-tokens.css">
<link rel="stylesheet" href="app-tokens.css">
<link rel="stylesheet" href="components/lt-components.css">
<link rel="stylesheet" href="app.css">
<script type="module" src="components/lt-elements.js"></script>
```

Tokens first, because every rule in `lt-components.css` reads a `--lt-*` value
and gets nothing if the tokens have not landed. `app.css` last so your own rules
win without a specificity fight. The script is a module with no build step and
no dependencies.

`app-tokens.css` sits between the token file and the components, because the
components have to be able to read what it defines. It holds this application's
own token extensions and its brand literals, and it is exempt in
`conformance.py` by name, which no other file outside `lt-tokens.css` is. Two
kinds of value belong there and nowhere else: a brand value such as
`--lt-icon-accent`, and a token the system does not define yet. It is scaffolded
empty, so an app always has one to write into.

## Distribution

`run-all.sh` finishes by publishing this skill to `~/.claude/skills/` on the
machine it runs on, bundling the verified `tokens/`, `components/` and
`fonts/` files as `dist/` and the `conformance.py`/`scaffold.py` tooling as
`scripts/`, plus a consumer appendix from `skill/APPENDIX.md`. The repo is the
only source; the published copy is a build output, overwritten on every green
run, and can never be ahead of the repo. New consumer apps are created with
the published skill's `scripts/scaffold.py`; each app pins its own copy of the
skill and of the files it was scaffolded with, so upgrading an app is a
deliberate re-copy, never an ambient change.

## Traps that have already bitten

These are real bugs that shipped, not hypotheticals. Full detail in
`reference.md`.

- **Inlining `lt-elements.js` into an HTML file** breaks the page unless you
  escape the closing tag in its header comment as `<\/script>`. The HTML parser
  does not care that it is inside a JS comment; it ends the script block there
  and the rest of the file parses as garbage.
- **A field's label-to-control gap changing** when a hint is present means
  `.lt-field` is stretching its grid rows. It needs `align-content: start`.
- **A chart mark that reads fine in the office and fades on the shop floor**
  means it was drawn straight onto the panel instead of onto
  `--lt-chart-track`. The panel is `--lt-grey-5` in the operational dark theme
  and four of the eight series colours fall to about 2.4:1 there. The track is
  `--lt-grey-2` in every scheme and theme, which is the whole reason the palette
  could be solved once. Paint the plot area.
- **A symbol in a field label, because `.lt-field__label` is uppercased.** CSS
  uppercasing is lossy. Both the Greek small mu and the micro sign map to Greek
  capital Mu, which is indistinguishable from a Latin M in Inter, so a label
  reading "Ra µm finish" paints "RA ΜM FINISH" and a machinist reads
  millimetres where the field means microns. That is out by a factor of a
  thousand, on a shop floor. The remedy is already in the system: the symbol
  belongs in the affix, which is not uppercased, and a qualifier belongs in the
  hint. Measured 2026-08-20. The same applies to any cased symbol, not just mu.
- **A floating light card reading page ink.** A menu, a dialog, anything that
  paints its own light surface and sits above the page, must take a surface
  context rather than `--lt-surface-overlay` plus `--lt-text-primary`. In the
  dark scheme that pair measures 1.09:1 (#FDFDFD card, #EBEBEB ink), because
  the card is scheme-independent and the ink is not — the same split that put
  every alert and badge at 3.35–3.44:1 in 2026-07-27. `lt-menu` and `lt-dialog`
  both put `.lt-panel` on the floating element and paint nothing themselves.
- **An affix taller than its input** means it is relying on `align-items:
  stretch` instead of carrying a definite `block-size`.
- **A grouped control whose border changes shade partway along, or shows a
  double line at a seam,** means its parts are reading different border
  families or keeping their own radii. Inside `.lt-input-group` every child is
  squared, overlapped one border width, and reads `--lt-field-border`; hover
  darkens the whole group to `--lt-border-strong`, never just the part under
  the pointer.
- **A component that overrides a surface class's background** while the surface
  class has already switched the text tokens gives you light-on-light. Watch
  source order between app CSS and surface classes.
- **An icon painted smaller than its token in a narrow container** means the
  reset's fluid-media clamp (`max-inline-size: 100%` on every svg) is beating
  a definite `inline-size` — a different property, so `:where()`'s zero
  specificity is irrelevant. Every sized icon slot in `lt-components.css`
  carries `max-inline-size: none`; a new rule that sizes a replaced element
  must join that list. Found by the first consumer, 2026-07-28: a 20px icon
  painting 15×15 in a table column that was narrow *because* the icon was its
  only content.
- **A token that references itself** (`--x: max(var(--x), …)`) is a cycle and
  computes to guaranteed-invalid everywhere — an inherited value does not
  break it. The pointer-coarse touch floor shipped this way and silently
  destroyed `--lt-control-height` on all touch hardware. Derive through a
  second name instead (the `-base` pattern in the density section);
  `conformance.py` now fails the pattern as `token-self-cycle`.

## Outside the design-system repo

This skill exists in two forms, and which one you are reading decides where
the files are:

- **The published copy at `~/.claude/skills/`** is self-contained: the
  shippable files are in `dist/` and the tooling in `scripts/`, so it works in
  empty folders that have never seen the design-system repo. It is published
  by the design-system repo's `run-all.sh`, only after every check has passed.
  Never edit it; it is overwritten on every green run.
- **A copy pinned inside an app repo** (under the app's `.claude/skills/`)
  carries only these rules. There is no `dist/` or `scripts/` next to it,
  deliberately: the app already owns its vendored copies of the system (see
  its CLAUDE.md for where) and its own `conformance.py` at the repo root, and
  those are the ones to use. Scaffolding has no job inside an existing app.

How to tell where you are: if `tokens/verify-tokens.py` exists, you are in the
design-system repo itself, and its project skill shadows this one anyway.
Anywhere else you are in (or starting) a consumer app, and of the check
commands above two apply — every scaffolded app carries its own copy of both at
the repo root:

```bash
python conformance.py .              # source: tokens, markup, accessibility basics
python lt_dom_audit.py rendered.html # rendered output: field errors only half wired
python smoke-measure.py --page rendered.html   # computed paint: geometry contracts
```

Three checks, three different things read, and none of them replaces another.

`conformance.py` reads the source you wrote.

`lt_dom_audit.py` reads HTML a server or a build actually produced, because the
defect it catches lives across a template boundary that no per-file check can
see: a macro emits the error chip and a call site in another file owns the
control. Import `audit()` and point it at a response in the test suite you
already have, and make sure the test drives a **failing** submit — a happy-path
page has no chips to audit and passes forever.

`smoke-measure.py` renders a page in a headless Chromium and measures what was
actually painted. It exists because markup and CSS can each be individually
correct while the computed geometry is wrong, and every defect of that kind so
far has been invisible to the other two: an icon squashed by the reset's media
clamp, a touch floor destroyed by a self-referencing token, and a stepper button
that measured exactly its token on the block axis while shrinking to the WCAG
minimum on the inline one. Point it at a saved page of your own. It needs a
Chromium-based browser (Edge counts, so any Windows box qualifies) and prints a
loud SKIPPED line and exits 0 when there is none, so a machine without a browser
degrades to the static checks rather than failing.

### The hooks, and what they are for

A scaffolded or adopted app carries two agent hooks in `.claude/settings.json`,
both running `conformance.py` over the whole repository:

- after any `Write` or `Edit`, so a finding lands on the edit that caused it
- before a session finishes, so nothing is declared done over a red gate

They add no rules. They run the check you already have, earlier. That is the
entire idea: the same finding delivered at commit time arrives behind a dozen
later edits, when whatever wrote the offending line has moved on and has to
reconstruct why. Delivered on the edit itself it is one correction, and the next
edit in the session is already right. The gain is largest when migrating markup
that was never written to this system, because there the violations arrive in
volume and the alternative is a hundred of them swept at the end.

**They check the DIRECTORY and report on the EDIT.** Both halves matter and they
pull against each other. `conformance.py` resolves the token graph across
everything in scope, so pointing it at one file leaves the token layer out of
scope and reports every token in that file as undefined: 626 errors against a
repository that is green. So the check runs over the root. But reporting
everything the root check finds is wrong in the case the hook is most wanted:
an app part-way through a migration has a backlog, and every edit would come
back with hundreds of findings that edit did not cause. The wood calculator
removed an earlier version of these hooks for exactly that reason and was right
to. So the report is filtered to the file just edited, the rest is summarised as
a count, and the exit code turns on the edited file alone.

**They are therefore silent unless YOU broke something**, printing nothing and
exiting 0 otherwise, so the common path costs nothing and a backlog never blocks
you. The `Stop` hook applies the same rule at the end of a turn, using `git` to
decide what the session touched.

Cost, measured 2026-08-20: about 0.33s on a small app, 0.5s on a repo with three
1MB built sheets, and 0.24s for an edit to a file conformance does not read,
where the hook exits early.

Turn them off in `/hooks` if they get in the way; the pre-commit gate still
holds either way.

### Exempting your own files

`conformance.py` carries this system's exempt list, and it is a vendored file,
so **never add your app's exemptions to it**: the next re-copy deletes them and
the app goes from green to a wall of findings with nothing to explain why.

Write `.conformance-exempt` at the root you check instead, one entry a line:

```
# Exemptions this app owns. Survives every re-vendor.
cnc-router-speeds-feeds-reference_4.html: archived third-party source; rewriting it would break provenance
```

The reason after the colon is required, because an exemption with no argument is
how an exempt list turns into a way of making findings disappear. Every run
names what is exempted and why, so nobody has to go looking for it. Matched on
the base name, the same way the built-in list is, so it cannot silence a whole
tree.

Exempt a file because it is genuinely not yours to fix - archived third-party
source, a vendor's stylesheet, a fixture that is deliberately wrong. Never
because it is inconvenient.

### When the system has no answer

The rules say a gap gets fixed in the token layer rather than worked around in a
component, and they point at the `livetools-design-tokens` skill. **That skill is
not installed here.** A pinned copy carries the rules only, by design, so inside
an application that instruction has nowhere to go. Here is where it goes instead.

`app-tokens.css` is this application's own token layer. It loads between
`lt-tokens.css` and `lt-components.css`, so the components can read what it
defines, and it is the one file outside `lt-tokens.css` that `conformance.py`
exempts from the literal-value rules, by name:

```python
"app-tokens.css": "an app's own token extensions; brand literals are its job"
```

Two kinds of value belong there. Brand literals such as `--lt-icon-accent`, and
any token the design system does not define yet. So when you hit a real gap:

1. Define the token you actually mean, in `app-tokens.css`, with a comment
   saying what it is for and how you arrived at the value.
2. Report the gap to the design-system repo, so the second application does not
   invent a different answer to the same question.
3. Carry on. Do not wait on the upstream answer, and do not substitute a token
   that belongs to another job. A border token used as the fill of a data bar
   passes every check in this system and is the same mistake as writing a raw
   hex: a value chosen because it was near rather than because it was right.

A scaffolded app has an `app-tokens.css` already. A hand-vendored one may not;
create it and link it in the right position.

### Starting a new app

Do not hand-assemble the setup. Run the bundled scaffold:

```bash
python <this-skill-dir>/scripts/scaffold.py <target-dir> --name "App name"
```

It copies `tokens/`, `components/`, `fonts/` and the starter icon sprite
(`icons/lt/sprite.svg`) into the target, writes an `index.html` with the
documented load order, an empty `app.css`, a `CLAUDE.md`, and
`conformance.py`, pins this skill into the target's `.claude/skills/` (so the
repo carries its own rules and a clone gets them from git), and installs a
pre-commit conformance hook if the target is already a git repository. Build
the app on top of what it produces.

The app owns its copies from then on. Upgrading it to a newer token set is a
deliberate re-copy of `dist/` from a newer skill, never an ambient change.

### Adopting the system in an app that already exists

An app that vendored the files by hand never receives any of the above, so every
session in it rediscovers the same facts: which directories are copies, which
check reads what, and where a token gap is supposed to go. `--adopt` fits those
out without touching a line of the app's own source:

```bash
python <this-skill-dir>/scripts/scaffold.py <existing-dir> --adopt --name "App name"
```

It writes `CLAUDE.md` and `app-tokens.css`, copies the three checks
(`conformance.py`, `lt_dom_audit.py`, `smoke-measure.py`), pins this skill into
the app's `.claude/skills/`, and installs the pre-commit hook if the target is a
git repository. It writes no `index.html` and no `app.css`, and copies **no**
`tokens/`, `components/` or `fonts/`: the app either already has them or is
choosing when to take them, and an ambient re-copy is the one thing this system
promises never to do.

Afterwards, link `app-tokens.css` between `lt-tokens.css` and
`lt-components.css` in whatever the app's entry point is, then run
`python conformance.py .` and work the count down to zero with a no-new-findings
rule.

### Density and the token graph

`data-lt-density` selects a density; it is not load-bearing. The comfortable
values are `:root` defaults inside the vendored `lt-tokens.css` (the
comfortable block's selector is `:root, [data-lt-density="comfortable"]`), so
a page that sets nothing gets comfortable rather than nothing. Set the
attribute to change density and to persist the user's choice. On a coarse
pointer the tokens floor themselves at `--lt-target-touch`; read
`--lt-control-height`, never the internal `-base` names, which skip that
floor.

`conformance.py` checks the token graph across the whole repo, not just one
line at a time: a `var(--lt-*)` that nothing in the repo defines
(`undefined-token`), the same name carrying a fallback
(`undefined-token-fallback`), a token whose every definition sits inside a
conditional context consumed with no fallback
(`conditional-token-no-fallback`), and a token that references itself
(`token-self-cycle`) all fail the gate. An unresolvable `var()` never errors in
the browser — the declaration just computes to the property's initial value,
silently — which is exactly why these are checked statically.

`undefined-token-fallback` is the one that catches an invented token. A fallback
is a fair hedge on a name that EXISTS and might not have landed in the version
you pinned. Against a name nothing defines, it is a typo or an invention, and
the fallback value is a raw value wearing a token's name — including in places
no other rule looks, since a unitless `z-index` is neither a colour nor a length.
Define the token in `app-tokens.css` instead.

Run conformance over a DIRECTORY, not a single file. The graph resolves against
everything in scope, so pointing it at one file leaves the token layer out of
scope and reports every token in that file as undefined.

### Custom icons

The icon standard (decided 2026-07-28) in one breath: two grids only —
`0 0 24 24` rendered at 16–24px via `.lt-icon`, `0 0 48 48` rendered at
32–48px via `.lt-pictogram` — every element painted through the `lt-ic-*`
layer classes (`ink`, `tint`, `accent`, `emphasis`, `accent-fill`), never a
literal `fill=`/`stroke=`/`opacity`, and every icon must stay tellable apart
with the accent collapsed to ink. `conformance.py` fails violations
(`icon-raw-colour`, `icon-grid`, `icon-opacity`, `icon-raw-size`,
`icon-unnamed`).

An app's brand accent is pinned in `app-tokens.css` (see "When the system has no
answer" above):

```css
/* app-tokens.css */
:root { --lt-icon-accent: #2F8DCB; /* Evolute blue, confirmed 2026-07-28 */ }
```

Domain sprites live in `dist/icons/<app>/sprite.svg`; an app vendors the sets
it uses, inlines the sprite once per page, and references symbols with
`<svg class="lt-icon" aria-hidden="true" focusable="false"><use
href="#ev-ic-slot"/></svg>`. New sets are authored in the app to the standard
and contributed back to the design-system repo's `icons/` directory, where
`verify-icons.py` gates them.
