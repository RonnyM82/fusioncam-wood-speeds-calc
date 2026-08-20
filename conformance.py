#!/usr/bin/env python3
"""
Livetools design system conformance checker.

Point it at a file or a directory and it reports anything that has drifted off
the system. Exit code 1 on any error, so it can gate a commit or a CI step.

    python3 conformance.py                    # check this repo
    python3 conformance.py ../my-app          # check an app built on the system
    python3 conformance.py --warnings         # show advisories too

An app exempts its OWN files by writing .conformance-exempt at the root it
checks, one "filename: reason" a line. Never by editing this file, which is
vendored: the next re-copy would delete the exemption and the app would go from
green to a wall of findings with nothing to explain it.

WHY THIS EXISTS
A design system that relies on people remembering it decays. Worse, an AI coding
agent asked to "make the button red" will happily write #ED1C24 into a component,
and the result looks correct in the moment and is wrong forever. Documentation
does not catch that. This does.

The rules below are the ones that actually got broken during this build, not a
generic lint list:

  raw-hex          a colour written as a literal instead of a token. This is the
                   big one. Every hex outside the token file is a colour that
                   will not follow the theme, will not follow the scheme, and
                   will not be caught by the contrast checks.
  raw-font-size    a px or pt font size instead of a --lt-text-* token, which
                   breaks the density modes and ignores the user's browser
                   setting. Read across the whole declaration value, not just
                   what follows the colon, so a literal cannot hide one bracket
                   deep in a var() fallback slot.
  inline-style-state
                   an inline style on an interactive element. Inline styles carry
                   no :hover, :focus or :active, so a control styled this way
                   looks fine and is dead. This is exactly how a Cancel button
                   shipped without a hover state.
  page-surface-in-field
                   an input reading --lt-surface-page. Fields must read the field
                   tokens or they invert against their own card when the colour
                   scheme flips.
  icon-button-unnamed
                   an icon-only button with no accessible name. A screen reader
                   announces it as "button" and nothing else.
  unlabelled-input
                   an input with no label, aria-label or aria-labelledby.
  undefined-element
                   an lt- custom element used in markup but never registered,
                   which renders as an inert unknown element.
  brand-red-small-text
                   var(--lt-brand-red) used as a text or fill colour without the
                   large-text sizing that makes it pass AA at 4.38:1.

The icon rules (added 2026-07-28, see ICONS-PROPOSAL.md). The Evolute
pictogram review found 18 icons carrying 7 raw hexes behind a green
conformance run, because an SVG presentation attribute is neither a <style>
block nor a style= attribute, so css_regions() never saw it. These rules
close that route and enforce the icon standard decided the same day:

  icon-raw-colour  a fill= or stroke= attribute holding a literal colour.
                   The exact way an agent writes an inline SVG, and the
                   demonstrated hole: fill="#A66B1F" and fill="steelblue"
                   both passed before this rule existed.
  icon-grid        a viewBox that is not one of the two tiers, 0 0 24 24
                   (renders 16-24px) or 0 0 48 48 (renders 32-48px). Any
                   other grid renders strokes at broken widths: the 44-grid
                   Evolute set drew a "2px" stroke at 1.09px in its own
                   tables. data-lt-decorative exempts a non-icon graphic.
  icon-opacity     opacity inside icon markup. A translucent fill has no
                   value until composited, composites differently on every
                   surface, cannot be contrast-checked, and is discarded by
                   forced colours. The Evolute engagement tints measured
                   1.17-1.38:1 against their own backdrops.
  icon-raw-size    an icon sized with literal px instead of --lt-icon-size /
                   --lt-pictogram-size, which opts it out of density.
  icon-unnamed     an inline <svg> neither declared decorative (aria-hidden)
                   nor named (aria-label, aria-labelledby, or a <title>).

The token-graph rules (added 2026-07-28, prompted by the first consumer
report, Evolute tool-manager). The defects that report chased are ABSENCE
bugs: nothing wrong is written, something necessary is missing, and every
rule above looks for a wrong value present. These three look at the whole
checked set at once. An unresolvable var() does not error; the declaration
is invalid at computed-value time and the property silently takes its
initial value, which is why this class of bug reaches a rendered page:

  undefined-token  a var(--lt-*) with no fallback that nothing in the
                   checked set defines. A typo (--lt-space-04) or a token
                   dropped by a version bump computes to nothing, silently.
  undefined-token-fallback
                   the same undefined name, but carrying a fallback. Skipping
                   these looked sound, because a fallback is exactly what stops
                   a declaration computing to nothing. It also stops the check
                   seeing an invented token: write a name the system has never
                   defined, put a raw value in the fallback slot, and the page
                   renders correctly while every rule here stays green. The
                   second consumer report (2026-08-20) shipped
                   z-index: var(--lt-z-tooltip, 60) through the gate, where no
                   --lt-z-tooltip exists and a unitless z-index is neither a
                   colour nor a length, so nothing caught the 60 either. A
                   fallback is a legitimate hedge on a token that EXISTS and may
                   not have landed in this version; against a name nothing
                   defines it is a typo or an invention. This fails rather than
                   warns because the false-positive rate is zero by
                   construction: the name is in the checked set or it is not.
  conditional-token-no-fallback
                   a var(--lt-*) with no fallback whose definitions ALL sit
                   inside conditional contexts: an @media / @supports /
                   @container block, or a selector that only matches when an
                   attribute is present. If the condition does not hold, the
                   token does not exist. Two classification subtleties are
                   load-bearing, and the consumer report's own hand analysis
                   got both backwards, which is the best argument for the
                   rule being machine-run: a selector LIST is unconditional
                   if ANY alternative is bare :root or html (so
                   ":root, [data-lt-density=comfortable]" IS a root
                   default), and a bare :root INSIDE @media is still
                   conditional (so the pointer-coarse block is not).
  token-self-cycle a custom property whose value references itself, e.g.
                   --x: max(var(--x), 44px). That is a cycle (CSS Variables
                   §3.4) and computes to guaranteed-invalid on EVERY
                   element; an inherited value does not break it. Exactly
                   this pattern sat in the token file's pointer-coarse
                   block and invalidated --lt-control-height on all touch
                   hardware, measured 2026-07-28. Checked in every file
                   including lt-tokens.css: the raw-hex exemption is about
                   literal colours being that file's job, and a cycle is
                   never anyone's job.
"""

import argparse
import pathlib
import re
import sys

# Files the rules do not apply to, with the reason.
EXEMPT = {
    "lt-tokens.css": "the token file is where literal colours are supposed to live",
    "generate-ramps.py": "generates the token values",
    "verify-tokens.py": "reads and checks the token values",
    "conformance.py": "this file quotes the patterns it looks for",
    "build.py": "inlines the token file verbatim",
    "test-elements.mjs": "tests assert on literal values",
    # Build outputs. These embed the whole token file, so every token value in
    # them reads as a raw hex. Check the sources in src/ instead.
    "proof.html": "generated by build.py with the token file inlined",
    "red-decision.html": "generated by build.py with the token file inlined",
    "components.html": "generated by build.py with the token file inlined",
    # An archived decision record. Its job is to show three specific colours side
    # by side, so literal hexes are the content rather than a mistake. Kept as the
    # written record of why blue acts and red identifies.
    "red-decision.src.html": "archived decision record; the literal colours are its subject",
    # The sanctioned home for an app's own brand values: --lt-icon-accent and
    # anything else identity-literal. Loads after lt-tokens.css. Everywhere
    # else a literal colour is still a finding; here it is the file's job,
    # exactly as it is for lt-tokens.css. Decided with the icon standard,
    # 2026-07-28 (ICONS-PROPOSAL.md D2/D5).
    "app-tokens.css": "an app's own token extensions; brand literals are its job",
}

# An app's OWN exemptions, read from a file the app owns.
#
# EXEMPT above is this system's list and ships inside a vendored file, so until
# 2026-08-20 the only way for an app to exempt one of its own files was to edit
# conformance.py in place. That is forbidden by the same rules that tell people
# to vendor it, and it does not survive: the next re-copy silently deletes the
# exemption and the app goes from green to hundreds of findings with no hint
# why. The wood calculator hit exactly this. It keeps an archived third-party
# article in the repo for data provenance, saved byte-for-byte so a reader can
# check a number against what it was read from, and rewriting it to pass would
# destroy the one property that makes it worth keeping. Its only option was to
# patch the vendored checker, and a re-vendor would have taken it from passing
# to 239 errors behind a pre-commit hook.
#
# So: an app writes .conformance-exempt at the root it checks, one entry a line
# as "filename: reason". The reason is required, because an exemption with no
# argument is how an exempt list becomes a way to make findings go away. Blank
# lines and # comments are ignored. Matched on the BASE NAME, the same way
# EXEMPT is, so it reads the same and cannot be used to exempt a whole tree.
APP_EXEMPT_FILE = ".conformance-exempt"


def load_app_exempt(root):
    """{basename: reason} from the app's own list, or {} when there is none."""
    root = pathlib.Path(root)
    path = (root if root.is_dir() else root.parent) / APP_EXEMPT_FILE
    if not path.is_file():
        return {}
    out = {}
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        name, _, reason = line.partition(":")
        name, reason = name.strip(), reason.strip()
        if not name:
            continue
        if not reason:
            # Loud rather than ignored. A silently-dropped entry reads as the
            # checker being wrong, and the whole point of this file is that an
            # exemption is a decision somebody wrote down.
            print(f"{APP_EXEMPT_FILE}: {name} has no reason after the colon; "
                  f"an exemption without one is not accepted")
            continue
        out[name] = reason
    return out


CHECK_SUFFIXES = {".css", ".html", ".js", ".mjs", ".htm", ".svg"}

# Colour keywords that are as unthemeable as a hex and just as easy to slip in.
COLOUR_KEYWORDS = (
    "red", "blue", "green", "yellow", "orange", "purple", "grey", "gray",
    "black", "white", "pink", "brown", "cyan", "magenta",
)

SYSTEM_COLOURS = {
    "canvas", "canvastext", "buttonface", "buttontext", "buttonborder",
    "highlight", "highlighttext", "linktext", "visitedtext", "graytext",
    "activetext", "field", "fieldtext", "mark", "marktext", "accentcolor",
    "accentcolortext", "currentcolor", "transparent", "inherit", "initial",
    "unset", "revert", "none", "auto",
}


class Finding:
    __slots__ = ("path", "line", "rule", "detail", "level")

    def __init__(self, path, line, rule, detail, level="error"):
        self.path = path
        self.line = line
        self.rule = rule
        self.detail = detail
        self.level = level


def strip_css_comments(text):
    return re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)


def strip_js_comments(text):
    text = re.sub(r"/\*.*?\*/", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)
    # line comments, but not the // inside a string or a URL
    return re.sub(r"(?<![:\"'\\])//[^\n]*", "", text)


def strip_html_comments(text):
    return re.sub(r"<!--.*?-->", lambda m: "\n" * m.group(0).count("\n"), text, flags=re.S)


def lines_of(text):
    return text.split("\n")


def css_regions(text):
    """
    The parts of an HTML file where a colour literal would actually be a style:
    <style> blocks and style attributes. Everything else is content, and a hex
    quoted in a paragraph of prose is documentation rather than a mistake.
    Returns text with non-CSS regions blanked but line numbers preserved.
    """
    keep = ["\n" if c == "\n" else " " for c in text]

    def copy_span(start, end):
        for k in range(start, end):
            keep[k] = text[k]

    for m in re.finditer(r"<style\b[^>]*>(.*?)</style>", text, re.S | re.I):
        copy_span(m.start(1), m.end(1))
    for m in re.finditer(r'\bstyle\s*=\s*"([^"]*)"', text, re.I):
        copy_span(m.start(1), m.end(1))
    return "".join(keep)


def check_raw_colours(path, text, findings):
    """Hex literals and bare colour keywords outside the token file."""
    for i, line in enumerate(lines_of(text), 1):
        for m in re.finditer(r"#[0-9A-Fa-f]{3,8}\b", line):
            hexval = m.group(0)
            # an id selector or a fragment URL is not a colour
            if re.match(r"^#[0-9A-Fa-f]{3,8}$", hexval) and len(hexval) in (4, 7, 9):
                findings.append(Finding(
                    path, i, "raw-hex",
                    f"{hexval} is a literal colour; use a --lt-* token"))
        # colour keywords in a colour-ish property
        for m in re.finditer(
                r"(?:^|[;{\s])(color|background|background-color|border-color|fill|stroke|outline-color)\s*:\s*([a-z-]+)",
                line, re.I):
            value = m.group(2).lower()
            if value in COLOUR_KEYWORDS and value not in SYSTEM_COLOURS:
                findings.append(Finding(
                    path, i, "raw-hex",
                    f"{m.group(1)}: {value} is a literal colour; use a --lt-* token"))


def check_font_sizes(path, text, findings):
    for i, line in enumerate(lines_of(text), 1):
        # Read the WHOLE declaration value, not just what follows the colon. The
        # old form anchored the number to the colon, so a raw size could hide one
        # bracket deep - font-size: var(--lt-text-invented, 13px) passed, exactly
        # as the undefined name beside it did (second consumer report, 2026-08-20).
        # Anywhere in a font-size value, a px or pt literal is the finding.
        for decl in re.finditer(r"font-size\s*:\s*([^;}]*)", line, re.I):
            for m in re.finditer(r"([0-9.]+)(px|pt)\b", decl.group(1), re.I):
                findings.append(Finding(
                    path, i, "raw-font-size",
                    f"font-size: {m.group(1)}{m.group(2)}; use a --lt-text-* token"))
        # a px value inside a font shorthand
        for m in re.finditer(r"font\s*:\s*[^;]*?([0-9.]+)px", line, re.I):
            findings.append(Finding(
                path, i, "raw-font-size",
                f"font shorthand hardcodes {m.group(1)}px; use a --lt-text-* token"))


def check_inline_state_styles(path, text, findings):
    """
    An inline style on an interactive element. Inline styles cannot express a
    hover, focus or active state, so anything styled this way is visually inert.
    """
    for i, line in enumerate(lines_of(text), 1):
        for m in re.finditer(r"<(button|a|input|select|textarea|summary)\b[^>]*\bstyle=\"([^\"]+)\"", line, re.I):
            decls = m.group(2)
            # Geometry inline is tolerable. A background or border-colour inline
            # implies a filled affordance, which needs hover and active states an
            # inline style cannot carry. A literal colour is always a finding.
            literal = re.search(r"#[0-9A-Fa-f]{3,8}\b", decls) is not None
            filled = re.search(r"\b(background|background-color|border-color)\s*:", decls) is not None
            if literal or filled:
                findings.append(Finding(
                    path, i, "inline-style-state",
                    f"<{m.group(1).lower()}> is styled inline, so it has no hover or focus state; "
                    f"use a .lt-btn variant or a class"))


def check_field_surfaces(path, text, findings):
    for i, line in enumerate(lines_of(text), 1):
        if re.search(r"\.(lt-)?input|input\s*\{|\.field input", line) and "--lt-surface-page" in line:
            findings.append(Finding(
                path, i, "page-surface-in-field",
                "a field is reading --lt-surface-page; use --lt-field-bg so it does not "
                "invert against its own card when the scheme flips"))


def check_icon_buttons(path, text, findings):
    """
    An icon-only button needs an accessible name. Detected by a button whose
    content is only an svg, an entity, or a single glyph.
    """
    for m in re.finditer(r"<button\b([^>]*)>(.*?)</button>", text, re.S | re.I):
        attrs, inner = m.group(1), m.group(2)
        line = text[: m.start()].count("\n") + 1
        text_content = re.sub(r"<[^>]+>", "", inner).strip()
        # entities and single glyphs do not make an accessible name
        looks_iconic = (
            ("<svg" in inner.lower() and not text_content)
            or re.fullmatch(r"&[a-z]+;|&#\d+;|.", text_content or "", re.I) is not None
        )
        has_name = (
            "aria-label" in attrs
            or "aria-labelledby" in attrs
            or "lt-sr-only" in inner
            or "title=" in attrs
        )
        if looks_iconic and not has_name and text_content != "":
            continue
        if looks_iconic and not has_name:
            findings.append(Finding(
                path, line, "icon-button-unnamed",
                "icon-only <button> has no accessible name; add aria-label or an "
                "lt-sr-only span"))


def check_input_labels(path, text, findings):
    for m in re.finditer(r"<(input|select|textarea)\b([^>]*)>", text, re.I):
        tag, attrs = m.group(1).lower(), m.group(2)
        line = text[: m.start()].count("\n") + 1
        if tag == "input":
            type_m = re.search(r'type\s*=\s*"([^"]+)"', attrs, re.I)
            if type_m and type_m.group(1).lower() in ("hidden", "submit", "button", "reset", "image"):
                continue
        if "aria-label" in attrs or "aria-labelledby" in attrs:
            continue
        id_m = re.search(r'\bid\s*=\s*"([^"]+)"', attrs)
        if id_m and re.search(rf'for\s*=\s*"{re.escape(id_m.group(1))}"', text):
            continue
        # Implicit labelling: an input nested inside a <label> takes that label's
        # text as its accessible name. Valid HTML, and the pattern .lt-check uses.
        before = text[: m.start()]
        open_labels = before.count("<label") - before.count("</label")
        if open_labels > 0:
            continue
        # a control generated by a component gets its label from the component
        if "data-affix" in attrs or "data-step" in attrs:
            continue
        findings.append(Finding(
            path, line, "unlabelled-input",
            f"<{tag}> has no label, aria-label or aria-labelledby"))


def check_brand_red_text(path, text, findings):
    """
    Brand red measures 4.38:1 on white, so it fails AA for normal-size text. It
    is legitimate as a large label or a non-text accent, which is what the
    variant class and the large type sizes express.
    """
    for i, line in enumerate(lines_of(text), 1):
        if "--lt-brand-red" not in line:
            continue
        if re.search(r"(^|[;{\s])color\s*:\s*var\(--lt-brand-red\)", line):
            nearby = "\n".join(lines_of(text)[max(0, i - 8): i + 8])
            large = re.search(r"--lt-text-(2xl|3xl|4xl|5xl)", nearby)
            # WCAG 1.4.3 exempts text that is part of a logo or brand name from
            # the contrast requirement. Declared explicitly with data-lt-logotype
            # so the exemption is a decision on the record, not an assumption.
            logotype = "data-lt-logotype" in line or "data-lt-logotype" in nearby
            if not large and not logotype:
                findings.append(Finding(
                    path, i, "brand-red-small-text",
                    "var(--lt-brand-red) as text measures 4.38:1 and fails AA below 24px; "
                    "use --lt-danger-text, or size the text at --lt-text-2xl or above"))


# Values legitimate in an SVG paint attribute. Everything else is a colour
# that will not follow the surface, the scheme, or forced colours.
SVG_PAINT_ALLOWED = {
    "none", "currentcolor", "transparent", "inherit",
    "context-fill", "context-stroke", "freeze",
}

# The two icon grids. DECIDED 2026-07-28 (Scott Moyse): 24 renders at
# 16-24px, 48 at 32-48px. See ICONS-PROPOSAL.md D1.
ICON_GRIDS = {"0 0 24 24", "0 0 48 48"}


def check_empty_swatch(path, text, findings):
    """
    A .lt-swatch with nothing in it. The code is the signal and the colour is
    reinforcement, which for this component is a measured constraint rather than
    a stylistic one: the palette is ISO 513's six roots plus the W and O
    extension roots Scott Moyse added 2026-07-30, and under Brettel protanopia
    simulation the fills for K and W land within dE2000 2.1 of one another, the
    closest pair the palette has ever carried, with K, N and S still inside 5.4
    under deuteranopia. An empty box therefore says nothing at all to roughly 8%
    of the men on a shop floor. There is no colour-only variant for that reason,
    and a legend key or a bare dot built out of one is the shape this goes wrong
    in.

    Checked here rather than only in smoke-measure.py because this is the
    checker that ships to consumer apps, and an app's templates never reach the
    design system's headless render.
    """
    for m in re.finditer(
            r"<(\w+)([^>]*\bclass\s*=\s*[\"'][^\"']*\blt-swatch\b[^\"']*[\"'][^>]*)>(.*?)</\1>",
            text, re.S):
        # a template expression is content the renderer fills in, not an empty box
        inner = re.sub(r"\s+", "", m.group(3))
        if inner:
            continue
        line = text[: m.start()].count("\n") + 1
        findings.append(Finding(
            path, line, "empty-swatch",
            "a .lt-swatch with no code in it; the fill cannot carry the meaning "
            "alone (K and W are dE2000 2.1 apart under protanopia). Put the "
            "taxonomy code inside the box"))


def check_svg_attr_colours(path, text, findings):
    """
    icon-raw-colour. A fill= or stroke= presentation attribute holding a
    literal colour. css_regions() keeps only <style> blocks and style=
    attributes, so this was the one route into a codebase the raw-hex check
    could not see — demonstrated on 2026-07-28 with fill="#A66B1F" and
    fill="steelblue" both passing. Icons paint with currentColor or a class
    reading a --lt-* token, never a literal.
    """
    for i, line in enumerate(lines_of(text), 1):
        for m in re.finditer(r'\b(fill|stroke)\s*=\s*"([^"]*)"', line):
            value = m.group(2).strip().lower()
            if value in SVG_PAINT_ALLOWED:
                continue
            if value.startswith("var(") or value.startswith("url("):
                continue
            findings.append(Finding(
                path, i, "icon-raw-colour",
                f'{m.group(1)}="{m.group(2)}" is a literal colour on an SVG '
                f"attribute; use currentColor or a class reading a --lt-* token"))


def check_icon_grid(path, text, findings):
    """
    icon-grid. Every svg/symbol viewBox must be one of the two tiers. Any
    other grid renders strokes at broken widths at the production sizes: the
    44-grid Evolute set drew its "2px" stroke at 1.09px in its own tables.
    A genuinely non-icon graphic (a chart, a brand device) declares itself
    with data-lt-decorative.
    """
    for m in re.finditer(r"<(svg|symbol)\b([^>]*)>", text, re.I):
        attrs = m.group(2)
        if "data-lt-decorative" in attrs:
            continue
        vb = re.search(r'viewBox\s*=\s*"([^"]*)"', attrs, re.I)
        if not vb:
            continue
        norm = re.sub(r"[\s,]+", " ", vb.group(1)).strip()
        if norm not in ICON_GRIDS:
            line = text[: m.start()].count("\n") + 1
            findings.append(Finding(
                path, line, "icon-grid",
                f'viewBox="{vb.group(1)}" is not an icon tier; draw on '
                f'"0 0 24 24" or "0 0 48 48", or mark a non-icon graphic '
                f"with data-lt-decorative"))


def check_icon_opacity(path, text, findings):
    """
    icon-opacity. A translucent paint has no value until it is composited,
    composites differently on every surface, cannot be contrast-checked, and
    is discarded entirely by forced colours. The Evolute engagement tints
    (bronze @18%, steel @22%) measured 1.17-1.38:1 against their backdrops.
    Catches the attribute form and the single-line CSS form
    (`fill: ...; opacity: ...`), which is how those tints were written.
    """
    for i, line in enumerate(lines_of(text), 1):
        for m in re.finditer(r'\b(opacity|fill-opacity|stroke-opacity)\s*=\s*"([^"]+)"', line):
            if m.group(2).strip() in ("1", "1.0"):
                continue
            findings.append(Finding(
                path, i, "icon-opacity",
                f'{m.group(1)}="{m.group(2)}" on icon markup; tints are solid '
                f"tokens, never opacity"))
        if (re.search(r"\b(fill|stroke)\s*:", line)
                and re.search(r"[;{\s]opacity\s*:\s*(?!1\s*[;}\s])", line)):
            findings.append(Finding(
                path, i, "icon-opacity",
                "a rule that paints and fades at once; tints are solid tokens, "
                "never opacity"))


def check_icon_raw_size(path, text, findings):
    """
    icon-raw-size. An icon sized with a literal px opts out of density.
    Sizes come from --lt-icon-size (or the xs/sm chip steps) and
    --lt-pictogram-size. Heuristic on the selector: applies to rules whose
    selector names an icon or pictogram class.
    """
    for i, line in enumerate(lines_of(text), 1):
        sel = re.search(r"\.[a-z][a-z0-9_-]*(?:icon|pictogram)[a-z0-9_-]*", line, re.I)
        if sel and re.search(r"\b(?:inline-size|block-size|width|height)\s*:\s*\d+(?:\.\d+)?px", line):
            findings.append(Finding(
                path, i, "icon-raw-size",
                f"{sel.group(0)} is sized in raw px; read --lt-icon-size or "
                f"--lt-pictogram-size so it follows density"))


def check_svg_names(path, text, findings):
    """
    icon-unnamed. An inline <svg> must either declare itself decorative
    (aria-hidden="true", the right answer when a text label sits beside it)
    or carry a name (aria-label, aria-labelledby, or a <title>). A bare svg
    is announced unpredictably by screen readers, and legacy engines put it
    in the tab order; focusable="false" travels with aria-hidden.
    """
    for m in re.finditer(r"<svg\b([^>]*)>", text, re.I):
        attrs = m.group(1)
        if ("aria-hidden" in attrs or "aria-label" in attrs
                or "aria-labelledby" in attrs):
            continue
        if "<title" in text[m.end(): m.end() + 160]:
            continue
        line = text[: m.start()].count("\n") + 1
        findings.append(Finding(
            path, line, "icon-unnamed",
            '<svg> is neither decorative nor named; add aria-hidden="true" '
            '(with focusable="false") or a <title>/aria-label'))


# --- token graph -------------------------------------------------------------
# Build outputs are excluded from the graph: they inline the whole token file,
# so they are self-consistent by construction and their sources are what get
# checked. Derived from EXEMPT so the two lists cannot drift apart.
GENERATED = {name for name, why in EXEMPT.items() if "generated by build.py" in why}

TOKEN_USE_RE = re.compile(r"var\(\s*(--lt-[A-Za-z0-9-]+)\s*([,)])")
TOKEN_DECL_RE = re.compile(r"\s*(--lt-[A-Za-z0-9-]+)\s*:(.*)$", re.S)
JS_SETPROP_RE = re.compile(r"setProperty\(\s*['\"](--lt-[A-Za-z0-9-]+)['\"]")

# At-rules whose body only applies under a condition. @layer is absent on
# purpose: it changes priority, not applicability.
COND_AT = ("@media", "@supports", "@container", "@scope", "@keyframes")


def css_declarations(css_text):
    """
    Yield (pos, token, value, contexts) for every --lt-* declaration in CSS
    text, where contexts is the tuple of enclosing rule preludes, outermost
    first. A brace walker, not a CSS parser; comments must already be
    stripped (newline-preserving) so a brace in prose cannot corrupt the
    stack. Quoted strings are skipped so content: "}" cannot either. Template
    noise in consumer files (a Jinja {{ }} inside a style attribute) can
    momentarily confuse the stack, but declarations are only recorded inside
    a rule body, and template files do not declare --lt-* tokens.
    """
    out = []
    stack = []
    buf_start = 0
    in_str = None
    i, n = 0, len(css_text)

    def flush(start, end):
        m = TOKEN_DECL_RE.match(css_text[start:end])
        if m and stack:
            out.append((start + m.start(1), m.group(1), m.group(2), tuple(stack)))

    while i < n:
        ch = css_text[i]
        if in_str:
            if ch == "\\":
                i += 2
                continue
            if ch == in_str or ch == "\n":
                in_str = None
        elif ch in "\"'":
            in_str = ch
        elif ch == "{":
            stack.append(css_text[buf_start:i].strip())
            buf_start = i + 1
        elif ch == "}":
            flush(buf_start, i)
            if stack:
                stack.pop()
            buf_start = i + 1
        elif ch == ";":
            flush(buf_start, i)
            buf_start = i + 1
        i += 1
    return out


def declaration_is_unconditional(contexts):
    """
    True only when the declaration applies on every page load: no conditional
    at-rule anywhere in the chain, and the selector list contains a bare
    :root or html alternative. Both halves matter — see the docstring.
    """
    if any(c.startswith(COND_AT) for c in contexts):
        return False
    sel = contexts[-1]
    if sel.startswith("@"):
        return False
    return any(part.strip() in (":root", "html") for part in sel.split(","))


def css_text_of(path, raw):
    """The regions of a file where CSS lives, line count preserved."""
    if path.suffix == ".css":
        return strip_css_comments(raw)
    if path.suffix in (".js", ".mjs"):
        return strip_js_comments(raw)
    return css_regions(strip_html_comments(raw))


def check_token_graph(paths, findings):
    """
    undefined-token, conditional-token-no-fallback, token-self-cycle.
    Definitions are collected from EVERY file in the set (the token file and
    app-tokens.css included: they are exempt from the style rules, not from
    existing), then each bare var(--lt-*) is resolved against the whole set,
    the same shape as check_custom_elements.
    """
    defs = {}          # name -> True once any unconditional site is seen
    cond_example = {}  # name -> a conditional context string, for the message
    uses = []          # (path, line, name, has_fallback)

    for p in paths:
        if p.name in GENERATED:
            continue
        raw = p.read_text(errors="replace")
        text = css_text_of(p, raw)
        if p.suffix in (".js", ".mjs"):
            # No selector context to reason about in JS. Any declaration or
            # setProperty registers as unconditional: erring that way costs a
            # missed finding, the other way costs a false positive in a gate.
            for m in re.finditer(r"(--lt-[A-Za-z0-9-]+)\s*:", text):
                defs[m.group(1)] = True
            for m in JS_SETPROP_RE.finditer(text):
                defs[m.group(1)] = True
        else:
            for pos, name, value, contexts in css_declarations(text):
                line = text.count("\n", 0, pos) + 1
                if re.search(r"var\(\s*" + re.escape(name) + r"\s*[,)]", value):
                    findings.append(Finding(
                        p, line, "token-self-cycle",
                        f"{name} references itself; a self-reference is a "
                        f"cycle and computes to guaranteed-invalid on every "
                        f"element, even with an inherited value present. "
                        f"Derive from a second token (a -base name) instead"))
                if declaration_is_unconditional(contexts):
                    defs[name] = True
                else:
                    defs.setdefault(name, False)
                    # name the at-rule when that is what makes it conditional,
                    # otherwise the selector
                    cond_example.setdefault(name, next(
                        (c for c in contexts if c.startswith(COND_AT)),
                        contexts[-1]))
        for m in TOKEN_USE_RE.finditer(text):
            uses.append((p, text.count("\n", 0, m.start()) + 1,
                         m.group(1), m.group(2) == ","))

    if not defs:
        # a lone page was checked with no token layer in scope; there is no
        # graph to resolve against, and guessing would only produce noise
        return

    for path, line, name, has_fallback in uses:
        if name not in defs:
            # A fallback answers "this could compute to nothing", which is what
            # undefined-token exists to prevent, so skipping it looked sound. It
            # is not, because it also answers nothing at all: invent a name the
            # system has never defined, put a raw value in the fallback slot, and
            # the declaration computes correctly forever while every check stays
            # green. Second consumer report, 2026-08-20, shipped exactly that:
            # z-index: var(--lt-z-tooltip, 60), where no --lt-z-tooltip exists and
            # the 60 is a raw value no other rule looks for.
            if has_fallback:
                findings.append(Finding(
                    path, line, "undefined-token-fallback",
                    f"var({name}, ...) carries a fallback, but nothing in the "
                    f"checked set defines {name}. A fallback is a legitimate "
                    f"hedge on a token that EXISTS and may not have landed in "
                    f"this version yet; against a name that exists nowhere it is "
                    f"a typo or an invented token, and the fallback is a raw "
                    f"value wearing a token's name. Define it, or use the token "
                    f"that already does this job"))
            else:
                findings.append(Finding(
                    path, line, "undefined-token",
                    f"var({name}) has no fallback and nothing in the checked set "
                    f"defines it; it computes to nothing, silently. A typo, or a "
                    f"token dropped by a version bump"))
        elif not defs[name] and not has_fallback:
            findings.append(Finding(
                path, line, "conditional-token-no-fallback",
                f"every definition of {name} sits inside a conditional "
                f"context (e.g. \"{cond_example.get(name, '?')}\"); when the "
                f"condition does not hold this var() is invalid at "
                f"computed-value time and the property silently takes its "
                f"initial value. Give the token a :root default, or this "
                f"usage a fallback"))


def check_custom_elements(paths, findings):
    """Every lt- element used in markup must be registered somewhere in the set."""
    registered = set()
    used = {}
    for p in paths:
        text = p.read_text(errors="replace")
        if p.suffix in (".js", ".mjs"):
            for m in re.finditer(r'define\(\s*"(lt-[a-z-]+)"', text):
                registered.add(m.group(1))
            for m in re.finditer(r'customElements\.define\(\s*"(lt-[a-z-]+)"', text):
                registered.add(m.group(1))
        if p.suffix in (".html", ".htm"):
            for m in re.finditer(r"<(lt-[a-z-]+)\b", text):
                used.setdefault(m.group(1), []).append(
                    (p, text[: m.start()].count("\n") + 1))
    for tag, spots in used.items():
        if tag not in registered:
            path, line = spots[0]
            findings.append(Finding(
                path, line, "undefined-element",
                f"<{tag}> is used but never registered; the browser will render it inert"))


def check_file(path, findings):
    raw = path.read_text(errors="replace")
    if path.suffix == ".css":
        clean = strip_css_comments(raw)
        check_raw_colours(path, clean, findings)
        check_font_sizes(path, clean, findings)
        check_field_surfaces(path, clean, findings)
        check_brand_red_text(path, clean, findings)
        check_icon_opacity(path, clean, findings)
        check_icon_raw_size(path, clean, findings)
    elif path.suffix in (".js", ".mjs"):
        clean = strip_js_comments(raw)
        check_raw_colours(path, clean, findings)
        check_font_sizes(path, clean, findings)
    elif path.suffix == ".svg":
        # a sprite or icon file is markup: the icon rules apply, and any
        # <style> block inside it is held to the raw-colour rule
        clean = strip_html_comments(raw)
        check_raw_colours(path, css_regions(clean), findings)
        check_svg_attr_colours(path, clean, findings)
        check_icon_grid(path, clean, findings)
        check_icon_opacity(path, clean, findings)
    else:
        clean = strip_html_comments(raw)
        check_raw_colours(path, css_regions(clean), findings)
        check_font_sizes(path, clean, findings)
        check_field_surfaces(path, clean, findings)
        check_inline_state_styles(path, clean, findings)
        check_icon_buttons(path, clean, findings)
        check_input_labels(path, clean, findings)
        check_brand_red_text(path, clean, findings)
        check_svg_attr_colours(path, clean, findings)
        check_icon_grid(path, clean, findings)
        check_icon_opacity(path, clean, findings)
        check_icon_raw_size(path, clean, findings)
        check_svg_names(path, clean, findings)
        check_empty_swatch(path, clean, findings)


def collect(root):
    root = pathlib.Path(root)
    if root.is_file():
        return [root]
    out = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.suffix not in CHECK_SUFFIXES:
            continue
        if any(part in ("node_modules", ".git", "dist", "vendor") for part in p.parts):
            continue
        # Exempt files stay in the set: the per-file style rules skip them in
        # main(), but the token graph reads them, because lt-tokens.css and
        # app-tokens.css are where the definitions live.
        out.append(p)
    return out


def main():
    ap = argparse.ArgumentParser(description="Check code against the Livetools design system.")
    ap.add_argument("target", nargs="?", default=".", help="file or directory to check")
    ap.add_argument("--warnings", action="store_true", help="show advisories as well as errors")
    ap.add_argument("--quiet", action="store_true", help="only print the summary")
    args = ap.parse_args()

    paths = collect(args.target)
    if not paths:
        print(f"nothing to check under {args.target}")
        return 0

    findings = []
    app_exempt = load_app_exempt(args.target)
    exempt = dict(EXEMPT)
    exempt.update(app_exempt)
    checkable = [p for p in paths if p.name not in exempt]
    for p in checkable:
        check_file(p, findings)
    check_custom_elements(checkable, findings)
    check_token_graph(paths, findings)

    errors = [f for f in findings if f.level == "error"]
    warnings = [f for f in findings if f.level != "error"]

    shown = errors + (warnings if args.warnings else [])
    if shown and not args.quiet:
        by_rule = {}
        for f in shown:
            by_rule.setdefault(f.rule, []).append(f)
        for rule in sorted(by_rule):
            group = by_rule[rule]
            print(f"\n{rule}  ({len(group)})")
            for f in group[:12]:
                try:
                    rel = f.path.resolve().relative_to(pathlib.Path.cwd())
                except ValueError:
                    rel = f.path
                print(f"  {rel}:{f.line}  {f.detail}")
            if len(group) > 12:
                print(f"  ... and {len(group) - 12} more")

    if app_exempt:
        # Named out loud on every run. An exemption nobody sees is an exemption
        # nobody re-examines, which is how an exempt list turns into a way of
        # hiding drift rather than recording a decision.
        print(f"\n{APP_EXEMPT_FILE}: {len(app_exempt)} file(s) exempted by this app")
        for name, reason in sorted(app_exempt.items()):
            print(f"  {name}  -  {reason}")
    print(f"\nchecked {len(paths)} file(s)")
    if errors:
        print(f"FAILED: {len(errors)} error(s)"
              + (f", {len(warnings)} warning(s)" if warnings else ""))
        return 1
    print("conformance passed"
          + (f", {len(warnings)} warning(s)" if warnings and not args.warnings else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
