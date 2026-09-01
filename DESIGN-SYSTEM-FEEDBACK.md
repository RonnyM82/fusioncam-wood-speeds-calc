# Second consumer report: Livetools Design System

Feedback from migrating a live application onto the system. Written for the
design-system repo to assess and act on.

- **Consumer:** wood speeds and feeds calculator, a public static page at
  wood.fusioncam.co. Vendored `tokens/`, `components/`, `fonts/`,
  `icons/lt/sprite.svg`, `conformance.py` and `lt_dom_audit.py`.
- **Date:** 20 August 2026.
- **Outcome:** the migration finished green. `conformance.py` reports zero
  findings over 28 files, `lt_dom_audit.py` passes on six rendered pages, and
  the app's own 67 tests pass.

These are the things that cost time or shipped wrong on the way. Nothing here
is a preference.

## How to read this

**Verify each finding rather than trusting it.** Every one below states how to
reproduce it, and several were measured in a headless browser rather than
reasoned about, which is this system's own stated preference. Two findings are
one-line changes with a real accessibility consequence. Several are wording
changes that no checker can enforce. One is a hole in a check that already runs.

Ranked by leverage, highest first. The ranking weights "a machine can catch
this" heavily, because the failures a machine catches do not depend on somebody
reading carefully at the end of a long session.

| # | Finding | Lands in | Catchable |
|---|---|---|---|
| A1 | `.lt-input-group` children shrink, taking the touch floor with them | `lt-components.css` | yes |
| B1 | A `var()` fallback hides an undefined token and a raw value | `conformance.py` | yes, cheaply |
| B2 | `smoke-measure.py` measures the block axis, so it never saw A1 | `smoke-measure.py` | it is the check |
| D1 | Gap handling points consumers at a skill they do not have | `SKILL.md` | no |
| A2 | The documented alert example does not render | `reference.md` | yes |
| D2 | The "nearest hex" rule does not cover the nearest wrong token | `SKILL.md` | no |
| D3 | The system never declares what it does not cover | `SKILL.md` | no |
| C1 | No data-mark token family, and the blue ramp cannot supply one | `lt-tokens.css` | partly |
| E | The scaffold could ship the guards it currently trusts people to keep | `scaffold.py` | yes |
| D4 | An attribute list is not a migration checklist | `reference.md` | no |
| C2 | An uppercased label mangles a symbol | `reference.md` | no |
| D5 | "Do not stack" is filed under toasts, and banners need it | `SKILL.md` | no |
| A3 | ~~A unit-less number field prints a stray space~~ | fixed in 80edf32 | closed |

Two entries are no longer open. **A3** was fixed upstream and re-vendored here on
2026-08-19, before this report was compiled. **E2**, which proposed hooks that
refuse edits to the vendored files, was assessed and rejected; the section
records the two reasons so it does not get proposed again.

---

## A. Shipped defects

### A1. `.lt-input-group` children shrink, and take the touch floor with them

`.lt-input-group` is `display: flex`. Nothing pins its buttons or its affix to
`flex: none`. `.lt-input` is `inline-size: 100%`, so the line always overflows
and every child shrinks. How far each child shrinks depends on how wide its
neighbour's unit text happens to be, so no two steppers in one form come out the
same width.

Measured across a 17-field form, against the 36px `--lt-control-height` that
`.lt-btn--icon` asks for:

```
Flutes (no affix)     29.41px
Grip factor           26.78px
Board thickness       25.77px
Spindle speed         25.63px
Machine max feed      24.00px   <- floored on --lt-target-min
```

The last row is why this is a defect rather than a wobble. The widest affix in
the form squeezed its buttons onto `--lt-target-min`, the WCAG floor. Shrinking
also defeats the coarse-pointer floor, which is the entire purpose of
`--lt-target-touch`. A control that is supposed to reach 44px on touch hardware
does not.

**Proposed:**

```css
.lt-input-group > .lt-btn,
.lt-input-group > .lt-affix { flex: none; }
```

Only the input should flex. `.lt-input` already carries `min-inline-size: 0`, so
it absorbs the shrinkage with no overflow.

**Reproduce:** put a `stepper` `lt-number-field` with a wide `unit` next to one
with no unit, render, and measure the buttons on the inline axis.

The consumer corrected this in its own app layer rather than in the vendored
copy, so its upgrade stays a clean re-copy.

### A2. The documented alert example does not render

`reference.md` §6 shows an alert as a title and a paragraph, both direct
children of `.lt-alert`. That element is `display: flex` with no wrap, so the
two land side by side on one line. The example also carries no icon, while the
component's own CSS section header states that both an alert and a badge
"require an icon and a text label, which is why the icon is a required slot in
the markup rather than an option".

Rendered from the documented markup verbatim against the vendored stylesheets:

```
title  top 28.0   left  31.0
body   top 28.0   left 227.0     -> same line, no icon
```

`.lt-alert__body` exists in the stylesheet and is the wrapper that makes the
documented shape work. It appears in no example. The consumer found it by
reading the CSS.

**Proposed:** correct the example to carry the icon and the `.lt-alert__body`
wrapper, and add a single-line variant beside it. An example that does not
render is worse than no example, because it is confidently wrong and it is the
first thing anybody copies.

### A3. FIXED ALREADY: a unit-less number field printed a stray space

`#validate` built the range message as `Must be between ${lo} and ${hi}
${spec.unit}.`. On a field declaring neither `measure` nor `unit`, the unit was
an empty string, so the message rendered with a gap before its full stop:
`Must be between 1 and 6 .`

**Fixed upstream in 80edf32 and re-vendored into this consumer on 2026-08-19.**
The message now reads `Must be between ${lo} and ${hi}${u}.` and this consumer's
Flutes field is correct. Listed only so the report accounts for it; no action
needed.

Worth keeping the second half of the original suggestion: a unit-less field in
`test-elements.mjs`, so the case has a test rather than a fix.

---

## B. Tooling

### B1. A `var()` fallback hides an undefined token, and a raw value with it

The token graph skips any use that carries a fallback:

```python
# conformance.py, in check_token_graph
for path, line, name, has_fallback in uses:
    if has_fallback:
        continue
```

The intent is sound. A fallback means the declaration cannot compute to nothing,
which is what `undefined-token` exists to prevent. The side effect is not sound.
An author can invent a token name the system has never defined, put a raw value
in the fallback slot, and pass every check.

The consumer shipped exactly this and the gate stayed green:

```css
z-index: var(--lt-z-tooltip, 60);   /* nothing defines --lt-z-tooltip */
```

Nothing catches the `60` either. `raw-hex` looks for colours and
`raw-font-size` looks for lengths, and a unitless z-index is neither.

**Proposed:** add `undefined-token-fallback`. Fail a `var(--lt-*)` whose name
nothing in the checked set defines, whether or not it carries a fallback. A
fallback is a legitimate hedge against version skew on a token that exists.
Against a name that does not exist it is either a typo or an invention, and both
deserve to fail.

This is the only change in this report that closes a hole in "never write a raw
value" rather than describing one. It is also cheap: the use sites and the
definitions are already collected.

Worth deciding whether it fails or warns. The consumer's view is that it should
fail, because the false-positive rate is zero by construction — the name either
exists in the checked set or it does not.

### B2. `smoke-measure.py` measures the block axis, so it never saw A1

Every one of those stepper buttons was exactly 36px **tall**. An assertion that
every control hits `--lt-control-height` passes on all of them, because an icon
button is square by `inline-size` and that axis was not being read.

The system already holds the principle this needs. `smoke-measure.py` exists
because markup and CSS can each be correct while the computed result is wrong.
This is that principle with a fixture missing.

**Proposed:**

1. Add a fixture that puts a stepper and an affix in one `.lt-input-group`,
   alongside a unit-less one, so the crowding that causes A1 is present.
2. Assert an icon button is square at `--lt-control-height` on **both** axes.
3. Keep the coarse-pointer variant, where the same assertion becomes the 44px
   `--lt-target-touch` check.

The consumer wrote a local `smoke-measure.py` covering this and verified it is
load-bearing by reverting the `flex: none` fix and watching it fail with eleven
distinct widths. Its assertions, for reference:

```
every control hits the control height          [36]
every stepper is square at the control height  [(36, 36)]
both charts share one track height             [16]
both charts share one mark height              [12]
a mark never fills its whole track             mark [12] in track [16]
no hit area under the minimum                  0 under
steppers reach the touch floor                 0 under 44px   (coarse only)
```

One note from writing it. The hit-area check must measure the **hit area**, not
the painted box. A checkbox draws at `--lt-check-size`, 18px, and the `.lt-check`
label wrapping it is the target. Measuring the input reports every tickbox in the
system as undersized, which is a bug in the check rather than in the page.

---

## C. Tokens

### C1. No data-mark family, and the blue ramp cannot supply one

The system carries 272 tokens and no chart family. Section 2 states that
components should almost never reference the primitives directly, so the raw
ramps are not the answer either.

Naming the gap is the obvious half. The sharper half is that the ramp cannot
currently answer it. Measured against a chart track of `#F8F8F8`, which is what
`--lt-surface-subtle` computes to inside `.lt-panel` in **both** schemes:

```
--lt-blue-8  #89A5FF   2.36:1              too pale to be a mark at all
--lt-blue-9  #1F1BAB  10.97:1   L 0.365    darker than a validated
                                           categorical palette's band
```

There is no step in between. An emphasis chart is fine on step 9 today, and the
consumer ships two. A genuine categorical chart in any Livetools application
needs ramp steps that do not exist yet.

One useful property fell out of the measurement. Because both charts sit on
`.lt-panel`, and the panel re-declares `--lt-surface-subtle` unconditionally, the
chart track is `#F8F8F8` in the light scheme and in the dark one. A chart palette
solved against the panel therefore needs solving once, not twice.

**Interim in the consumer:** four tokens in `app-tokens.css`, which is already
the sanctioned home and already exempt in `conformance.py`.

```css
--lt-chart-track:         var(--lt-grey-2);    /* the track a bar sits in  */
--lt-chart-mark:          var(--lt-grey-11);   /* 7.00:1 neutral mark      */
--lt-chart-mark-context:  var(--lt-grey-9);    /* 3.43:1 quieter mark      */
--lt-chart-mark-emphasis: var(--lt-action-bg); /* 10.97:1 the one that matters */
```

Worth deciding upstream before a third application invents its own.

### C2. An uppercased label mangles a symbol

`.lt-field__label` sets `text-transform: uppercase`. CSS uppercase is lossy. It
maps Greek mu to capital Mu, which renders as a Latin M. A field labelled
"Grip factor μ" shipped reading "GRIP FACTOR M", which is a different quantity.

**Proposed:** a trap entry. The remedy already exists in the system — the symbol
belongs in the affix, which is not uppercased, and the hint slot already exists
for the qualifier. This is the argument the hint section already makes about
parentheticals, taken one step further.

---

## D. The skill and the reference

### D1. Gap handling points consumers at a skill they do not have

`SKILL.md` is unambiguous that a gap in the token layer gets fixed at the token
layer, and it sends the reader to `livetools-design-tokens`. Inside a consumer
application that skill is not installed. The skill's own closing section says so:
a pinned copy carries only the rules, with no `dist/` and no `scripts/`,
deliberately.

So the instruction terminates. The consumer hit a real token gap, could not reach
the named next step, and did the thing the same page forbids: it read a border
token as a data-mark fill and wrote a comment excusing it.

The answer existed the whole time. `app-tokens.css` is already the sanctioned
home for an application's own token extensions, already loads between the tokens
and the components, and is already exempt in `conformance.py` by name:

```python
"app-tokens.css": "an app's own token extensions; brand literals are its job"
```

**Proposed:** in the consumer-facing copy, route a gap to `app-tokens.css` first,
with the upstream request as the follow-up rather than the only step.
`app-tokens.css` currently appears only under "Custom icons", framed as the place
to pin a brand accent, which reads far narrower than the exemption it is given.

### D2. The nearest wrong token is the same mistake as the nearest hex

Rule number one ends: "If no token fits, stop and say so. Do not approximate with
the nearest hex."

The consumer did not write a hex. It wrote `var(--lt-border-strong)` as the fill
of a data bar, which is a border token doing a mark's job. That reads as
compliant, passes every check, and is the same failure the rule exists to
prevent: a value chosen because it was near rather than because it was right.

**Proposed:** extend the sentence.

> …nor with the nearest token from another job. A border token used as a fill
> passes every check and is the same mistake wearing a token's name.

No checker can catch this one, which is exactly why it needs saying.

### D3. The system never declares what it does not cover

The system has no chart, plot or dense data-visualisation component, and nothing
says so. The consumer built two bar visualisations without going to look for
external guidance, because nothing prompted it to.

A system that states its boundaries routes the work. A system that stays silent
gets a consumer inventing inside the gap, which is how a second application ends
up guessing differently from the first.

**Proposed:** a short "what this system does not cover" section, naming charts
and anything else out of scope, and saying what to reach for instead. Six lines
would have redirected the whole of that work.

### D4. An attribute list is not a migration checklist

`stepper` is documented, in the attribute list, in alphabetical company. What is
not documented is that it is the **replacement** for the native spinners the
element exists to avoid.

The consumer swapped every `<input type="number">` for an `lt-number-field`, did
not add `stepper`, and shipped a form with no way to nudge a value at all. The
element's header comment explains the reasoning. Nothing connects that reasoning
to the attribute that acts on it.

**Proposed:** a "replacing a native control" note on `lt-number-field`. What the
native element gave the user, and which attribute gives it back.

### D5. "Do not stack them" is filed under toasts, and banners need it

The rule reads: "Do not stack them either. Three at once means you are reporting
a stream, and a stream belongs in the page." It sits inside the toast rules.

The consumer followed the lifetime table correctly, judged each message a
condition rather than a receipt, and rendered every one as a banner. One
calculation produced nine, and they buried the numbers they sat under.

The reasoning transfers exactly. The lifetime table says which component to
reach for. Nothing says what to do when the correct component arrives nine
times.

**Proposed:** move the no-stacking rule up to the lifetime table so it governs
every status visual, with the remedy attached. Past about three, it is a stream,
and a stream is a list.

---

## E. The scaffold could ship the guards it currently trusts people to keep

`scaffold.py` already writes a `CLAUDE.md` and installs a pre-commit conformance
hook. Three additions are worth considering, all learned from this migration.

### E1. The pre-commit hook needs a working interpreter, not a resolvable name

On Windows, `python3` resolves to the Microsoft Store app-execution alias. It
exists, it answers `command -v`, and it then refuses to run anything. A hook that
selects an interpreter by name selects a broken one.

```sh
# Test that the interpreter RUNS, not just that the name resolves.
PY=""
for candidate in python3 python py; do
  if "$candidate" -c "import sys" >/dev/null 2>&1; then
    PY="$candidate"; break
  fi
done
[ -z "$PY" ] && { echo "pre-commit: no working Python, conformance did not run."; exit 1; }
"$PY" conformance.py . || exit 1
```

### E2. WITHDRAWN: hooks that refuse edits to the vendored files

**An earlier draft of this report proposed shipping two Claude Code hooks into
scaffolded applications: a `PreToolUse` hook refusing edits under `tokens/`,
`components/`, `fonts/` and `icons/`, and a `PostToolUse` hook running
`conformance.py` after every source edit. The design-system repo assessed and
rejected both, on two grounds, and both are right.**

Recorded here so nobody proposes it again without answering them.

**It blocks the documented upgrade path.** An upgrade *is* a re-copy into those
four directories. A hook that denies writes there denies the only sanctioned way
to update an application. The proposal's own deny message read "upgrading is a
clean re-copy" while blocking exactly that, which should have been caught before
it was written down.

**Whole-repo conformance on every edit reports work you did not do.** The
`PostToolUse` hook ran `conformance.py .` across the repository, with no notion
of a baseline. Any application that is mid-migration, or that has a pre-existing
finding anywhere, gets every one of them back on every single edit. This
consumer started its migration at 262 findings. Installed then, the hook would
have blocked every edit with 262 errors, none caused by that edit, during
precisely the work it was meant to help.

The underlying problem in the first half is still real: the vendoring fence is
honour-system, and it was tested twice during this migration. Both upstream
defects above would have been a one-line change in the vendored file, and both
went to the app layer only because the consumer happened to remember the rule.

If that is worth closing, the shape that survives both objections is a **check,
not a fence**. Record the published files' hashes in a manifest at vendor time
and have `conformance.py` report a vendored file that no longer matches. An
upgrade re-copies and re-records, so the sanctioned path stays open. Drift gets
named instead of forbidden, which is the same posture the rest of this system
already takes. Offered as a direction, not a design.

### E3. A hand-vendored application never gets the scaffold's output

This consumer was not scaffolded. The system was copied in by hand, so it had no
`CLAUDE.md` at all until the migration was finished. Every session rediscovered
the same facts: which directories are copies, which check reads what, and that
the system has no chart component.

**Proposed:** either an `--adopt` mode on `scaffold.py` that writes the
`CLAUDE.md`, the hooks and the checks into an existing repository without
touching its source, or a short checklist in the skill's "Outside the
design-system repo" section for somebody vendoring by hand.

---

## What worked, and should not change

A report of only faults would misrepresent the system. Three things did real
work here, and two changed an outcome.

**Recorded decisions, carrying the measurement and the date.** The consumer's
own brief instructed it to map status ink to `--lt-*-text`. That is the pairing
the system measured at 3.35–3.44:1 and fixed on 2026-07-27, and it is written
down in three places with the figure and the date attached. The consumer
overrode a written instruction because the record let it verify rather than
weigh opinions. This is the system's single strongest feature.

**The traps list.** The floating-panel ink trap was live in this work, because a
chart tooltip is a light card over the page. It shipped correct on the first
attempt purely because the trap named the exact 1.09:1 pairing to avoid.

**Making the chip and `aria-invalid` one operation.** `lt_dom_audit.py` found
nothing across six rendered pages, two of which carry real error chips. That is
not care on the consumer's part. Every field is an `lt-number-field`, which
cannot paint a chip without also marking the control, because one pass does
both. Designing the failure out beats checking for it.

## What was the consumer's fault, not the system's

Three findings above describe documentation that could have caught a mistake. It
would be convenient to file all of them that way, and it would be wrong.

Missing `stepper` was the consumer's error, because it is documented and the
consumer read the page it is on. Reading a border token as a fill was the
consumer's error most of all, because the rule against it is the first rule in
the file. Not reaching for available external guidance on charts was the
consumer's error too.

That matters for how this list is read. Better wording reduces this class of
mistake and will never remove it. The findings worth spending on first are the
ones that end in a check, because a check does not read carelessly at the end of
a long session. That is why B1 and B2 sit near the top rather than the more
interesting wording changes below them.

# Addendum, 29 August 2026: the hidden attribute loses to every component that sets its own display

Found while adding a fourth calculation profile, which hides one form field
while it is active.

- **Finding:** `.lt-field` sets `display: grid`, so an author rule beats the
  user agent's `[hidden] { display: none }` and `el.hidden = true` leaves the
  field painted. The vendored sheet knows this fight and guards its own two
  cases (`.lt-affix[hidden]`, `.lt-calendar[hidden]`), but there is no general
  guard, so the first app-owned hide of a component element hits it again.
- **Measured:** driven page over :8081 on 2026-08-29. Set `hidden` on a
  `.lt-field` div, the field still painted, and a Playwright `is_hidden()`
  assertion failed on it.
- **Suggested landing:** one `[hidden]:not([hidden="until-found"])` guard at
  the reset layer, or the per-class guard extended to every component class
  that sets `display`. A machine can catch the class of bug: flag any class
  that sets `display` and has no `[hidden]` twin.
- **Until then:** this app carries `.lt-field[hidden] { display: none; }` in
  `styles.css` with the measurement written above the rule, per the correction
  policy.

# Addendum, 1 September 2026: three tokens a narrow docked panel needed

Found while laying out the calculator as a panel inside a Fusion palette
(fusion.html), 400 to 840 px wide, driven headless at 400, 460 and 520 px.

- **Finding:** the system defines no page reading measure, no maximum width
  for a floating tip, and no border for a record the user has selected for
  an action. The panel needed all three: a `max-width` on the page, a cap on
  the machine-note tip so it cannot overflow a 400 px palette, and an outline
  on an operation card whose Apply tick is set. The first build wrote `48rem`
  and `22rem` as literals and borrowed `--lt-action-bg` for the outline, which
  is the button fill doing a second job.
- **Measured:** conformance passes a literal length, so nothing caught the
  two rem values, and the borrowed token passes every check while coupling a
  selection outline to a retheme of the button (the same shape as the chart
  emphasis mark this app once pointed at the action colour).
- **Suggested landing:** `--lt-measure-panel` (or a general reading-measure
  family), `--lt-tip-max-inline-size`, and a selected-record border beside the
  existing `--lt-table-row-bg-selected` fill, so a selected card and a
  selected row read as one state.
- **Until then:** this app defines `--lt-page-measure-panel`,
  `--lt-tip-max-inline-size` and `--lt-card-selected-border` in
  `app-tokens.css`, each with its reasoning, and `fusion.css` reads them.
