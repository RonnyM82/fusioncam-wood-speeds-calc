# Wood speeds and feeds calculator

A public, deployed calculator at wood.fusioncam.co. Static page, no build step,
no dependencies. A wrong number here goes to someone's spindle, so a data or
behaviour regression is worse than any styling gap.

## The design system is vendored. Do not edit it.

`tokens/`, `components/`, `fonts/` and `icons/` are copies of the Livetools
Design System. They are not this repo's source.

**Never edit a file in those four directories.** Upgrading is a deliberate
re-copy from a newer published skill, and a local edit turns that into a merge
nobody signed up for. No hook enforces this: guard hooks were tried and
removed on 2026-08-20 (the commit records why), so the fence is this file and
the pre-commit conformance run.

When the system itself is wrong, fix it in the app layer and say so in a
comment:

| the fix belongs in | for |
|---|---|
| `styles.css` | app CSS, and corrections to a component's own CSS. Loads last, unlayered, so it wins without a specificity fight. |
| `app-tokens.css` | tokens the system does not define. Loads between the tokens and the components, and `conformance.py` exempts it by name. |

One correction is live today: `.lt-field[hidden]` in `styles.css`
(2026-08-29), because the field class sets its own display and beats the
hidden attribute. It is reported in DESIGN-SYSTEM-FEEDBACK.md (the addendum).
Everything this app corrected before that was adopted upstream on 2026-08-20
and arrived back in a re-vendor: the stepper-width fix, the chart tokens and
the forced-colours emphasis class. When the next defect appears, fix it in
the app layer with the measurement that found it written above the rule, and
report it upstream rather than patching the vendored copy.

## The four checks

Run the first two on any change. Run all four before calling a UI change done.

```bash
python conformance.py .        # source: tokens, markup, accessibility basics
node tests/run.js              # 75 tests, data and behaviour
python smoke-measure.py        # rendered geometry; needs a server, see below
python lt_dom_audit.py <dir>   # rendered HTML: field errors only half wired
```

They read different things and none replaces another. `conformance.py` reads the
source you wrote. `lt_dom_audit.py` reads HTML a browser produced, and only
reports on a page that carries a **failing** field, so drive one. `smoke-measure.py`
computes a layout, which is the only way to catch a control whose markup and CSS
are each right and whose painted result is wrong.

```bash
node tools/serve.js 8081       # smoke-measure.py needs this running
```

`.git/hooks/pre-commit` runs conformance. It is not a substitute for looking at
the page.

## What the system does not cover

It has **no chart, plot or data-visualisation component**, though since
2026-08-20 it does own the chart colours: the track, the marks, the series
slots and the `.lt-chart-emphasis` class all live in the vendored copies. The
chip-load ladder and the capacity cascade are bespoke, built strictly on those
system tokens, and each highlighted bar carries `.lt-chart-emphasis` so the
emphasis survives forced colours. Before touching either chart, load the
`dataviz` skill: they follow its emphasis pattern, its mark specs and its
hover-plus-table-twin rule, and `smoke-measure.py` asserts they share a
geometry.

## Boundaries inside the app

- `js/core/*` is pure calculation. **No DOM, no fetch, no CSS.** `tests/run.js`
  enforces it and fails the whole suite if that breaks.
- `js/ui/app.js` renders every result. Markup and CSS change together; the class
  names live in template strings here, not in the HTML.
- `reference/cnc-router-speeds-feeds-reference_4.html` is an archived
  third-party article kept for provenance. It is exempt in `conformance.py` and
  must stay byte-for-byte what was published.

## Before writing markup or CSS

Load the `livetools-design-system` skill. It is pinned at `.claude/skills/` so a
clone carries it. Its first rule is that no raw value ever gets written, and its
harder rule is that the nearest *wrong token* is the same mistake as the nearest
hex: a border token used as a fill passes every check and is still wrong.
