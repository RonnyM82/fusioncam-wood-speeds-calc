#!/usr/bin/env python3
"""
Audit RENDERED HTML for field errors that only half exist.

A field error is two things: the chip a person sees (.lt-field__error) and the
attributes everything else reads (aria-invalid on the control, aria-describedby
pointing at the chip). Written separately, they come apart, and when they do the
field looks wrong and reports perfectly valid.

That is not only an accessibility fault. <lt-wizard> decides whether a step may
advance by looking for aria-invalid="true" inside it, so a step whose fields
carry only chips lets the user walk straight past a bad value.

WHY THIS IS NOT A conformance.py RULE, which is the obvious place for it:
conformance is a static, per-file scan. It can catch the inline shape, where the
control and the chip sit in one .lt-field in one file. It cannot catch the shape
that actually ships, where a template macro emits the chip and the call site in
another file owns the control. Pointed at templates it would report the macro
file forever, a file that cannot be fixed, while passing every call site that
can. The first consumer's own macro layer documents that same limitation for
labels, and has kept .lt-field__label at call sites because of it.

Rendering is what resolves the macro boundary, so this checks the output rather
than the source. Point it at a saved page, or import audit() and hand it the
body of a response in a test:

    from lt_dom_audit import audit
    assert audit(client.post("/coatings", data=bad).text) == []

It parses fragments, so an htmx panel response works unchanged. Stdlib only, one
file, no browser: a consumer copies it in beside conformance.py and runs it in
the test suite it already has.

Its mirror image is auditFields() in lt-elements.js, which applies the same rule
to a live DOM after custom elements have upgraded. Change one, change the other.
The two are kept deliberately narrow so they can agree: neither knows about
contenteditable, and neither treats a custom element as a control.
"""

import argparse
import pathlib
import sys
from html.parser import HTMLParser

VOID = {
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
    "meta", "param", "source", "track", "wbr",
}

# Buttons and hidden inputs are not the control a chip is about.
SKIP_INPUT_TYPES = {"hidden", "submit", "button", "reset", "image"}

CONTROL_TAGS = {"input", "select", "textarea"}

# Their content is text, not markup, but html.parser only knows that about
# script and style. Without this, a server that echoes a user's draft into a
# <textarea> can invent an error chip out of the words inside it.
RAW_TEXT = {"textarea", "title", "script", "style"}

# A <template> is inert: its children are a separate fragment that
# querySelectorAll never reaches, so auditing them would report markup that
# cannot be on screen.
INERT = {"template"}


class Node:
    __slots__ = ("tag", "attrs", "children", "parent", "line")

    def __init__(self, tag, attrs, line, parent=None):
        self.tag = tag
        self.attrs = attrs
        self.children = []
        self.parent = parent
        self.line = line

    def classes(self):
        return set((self.attrs.get("class") or "").split())

    def text(self):
        out = []

        def collect(node):
            for child in node.children:
                if isinstance(child, str):
                    out.append(child)
                else:
                    collect(child)

        collect(self)
        return " ".join("".join(out).split())

    def walk(self):
        for child in self.children:
            if isinstance(child, Node):
                if child.tag in INERT:
                    continue
                yield child
                yield from child.walk()

    def closest(self, cls):
        node = self.parent
        while node is not None:
            if cls in node.classes():
                return node
            node = node.parent
        return None


class Tree(HTMLParser):
    """A light DOM. Tolerant by design: this reads real server output, which
    may be a fragment with no <html>, and unclosed tags must not lose the rest
    of the document."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root", {}, 0)
        self.stack = [self.root]
        self.raw_depth = 0

    @staticmethod
    def _attrs(attrs):
        # FIRST occurrence wins, which is what an HTML parser does with a
        # duplicate attribute. Taking the last would let a stray second
        # aria-invalid="true" overrule the "false" the page actually applies.
        out = {}
        for k, v in attrs:
            if k not in out:
                out[k] = v or ""
        return out

    def handle_starttag(self, tag, attrs):
        if self.raw_depth:
            return
        node = Node(tag, self._attrs(attrs), self.getpos()[0], self.stack[-1])
        self.stack[-1].children.append(node)
        if tag in RAW_TEXT:
            self.raw_depth = 1
        elif tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        if self.raw_depth:
            return
        node = Node(tag, self._attrs(attrs), self.getpos()[0], self.stack[-1])
        self.stack[-1].children.append(node)

    def handle_endtag(self, tag):
        if self.raw_depth:
            if tag in RAW_TEXT:
                self.raw_depth = 0
            return
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return
        # stray close tag: ignore rather than unwind the document

    def handle_data(self, data):
        if self.raw_depth:
            return
        self.stack[-1].children.append(data)


class Finding:
    """Same shape as conformance.py's, so output reads the same."""

    __slots__ = ("path", "line", "rule", "detail", "level")

    def __init__(self, path, line, rule, detail, level="error"):
        self.path = path
        self.line = line
        self.rule = rule
        self.detail = detail
        self.level = level

    def _key(self):
        return (self.path, self.line, self.rule, self.detail, self.level)

    def __repr__(self):
        return f"{self.path}:{self.line}  {self.rule}  {self.detail}"

    def __eq__(self, other):
        return isinstance(other, Finding) and self._key() == other._key()

    def __hash__(self):
        return hash(self._key())


def is_control(node):
    """Native form controls only.

    A custom element is deliberately NOT a control here. <lt-number-field>
    builds its own input and marks it at upgrade, so the server's HTML carries
    no attributes for this to read; treating the host as a control would demand
    aria-invalid on an element that never reads it, and putting one there would
    jam lt-wizard's gate open forever, since the element only ever writes the
    attribute on its inner input. A chip whose field holds no native control is
    skipped instead, which is what "the element wires itself" actually means.
    """
    if node.tag not in CONTROL_TAGS:
        return False
    if node.tag == "input":
        return (node.attrs.get("type") or "text").lower() not in SKIP_INPUT_TYPES
    return True


def owning_field(node, cls="lt-field"):
    return node.closest(cls)


def field_name(field, controls):
    for node in field.walk():
        if "lt-field__label" in node.classes():
            label = node.text()
            if label:
                return label
    for key in ("aria-label", "name", "id"):
        if controls and controls[0].attrs.get(key):
            return controls[0].attrs[key]
    return "(unnamed field)"


def audit(markup, source="<response>"):
    """Return a list of Findings. Empty means the rendered markup is clean."""
    tree = Tree()
    tree.feed(markup)
    tree.close()

    findings = []
    for chip in tree.root.walk():
        if "lt-field__error" not in chip.classes():
            continue
        # Only the error chip. A .lt-field__warning is a value that is legal but
        # worth a second look, so it stays valid on purpose and must NOT carry
        # aria-invalid.

        field = owning_field(chip)
        if field is None:
            # No .lt-field to scope to. Falling back to the chip's parent was
            # the original behaviour and it was worse than useless: the parent
            # of a form-level chip is the form, so the chip was judged against
            # every unrelated control in it, and one correctly-marked field
            # elsewhere in that form made a genuinely broken one audit clean.
            # A message that belongs to no field belongs in .lt-alert.
            findings.append(Finding(
                source, chip.line, "field-error-orphan",
                f'error chip outside any .lt-field, so it names no control '
                f'(chip reads "{chip.text()[:60]}"). A form-level message is an '
                f'.lt-alert, not a field error.'))
            continue

        # Controls belonging to THIS field, not to a .lt-field nested inside it.
        # Without that test an inner field's control satisfied the outer chip.
        controls = [n for n in field.walk()
                    if is_control(n) and owning_field(n) is field]
        if not controls:
            # No control of its own. Legitimate only when a custom element owns
            # one and writes it at upgrade; otherwise the chip describes nothing.
            if any("-" in n.tag for n in field.walk()):
                continue
            findings.append(Finding(
                source, chip.line, "field-error-controlless",
                f'{field_name(field, [])}: error chip in a .lt-field that holds '
                f'no control of its own (chip reads "{chip.text()[:60]}")'))
            continue

        name = field_name(field, controls)
        quoted = chip.text()[:60]

        invalid = [c for c in controls if c.attrs.get("aria-invalid") == "true"]
        if not invalid:
            findings.append(Finding(
                source, chip.line, "field-error-unpaired",
                f'{name}: error chip with no aria-invalid="true" on its control '
                f'(chip reads "{quoted}")'))
            continue

        if not chip.attrs.get("id"):
            findings.append(Finding(
                source, chip.line, "field-error-unreferenced",
                f"{name}: error chip has no id, so aria-describedby cannot point at it"))
            continue

        # The SAME control has to carry both halves. Checking the two
        # independently let one control be invalid while a different one
        # described the chip, which describes nothing useful to anybody.
        described = any(
            chip.attrs["id"] in (c.attrs.get("aria-describedby") or "").split()
            for c in invalid)
        if not described:
            findings.append(Finding(
                source, chip.line, "field-error-unreferenced",
                f"{name}: the invalid control's aria-describedby does not "
                f"reference the error chip"))

    return findings


def count_chips(markup):
    """How many error chips the markup contained, audited or not.

    A caller that audits a happy-path page sees zero findings and concludes it
    is covered, when in fact it never rendered an error at all. Nothing here can
    stop that, but it can hand back the number that makes it visible.
    """
    tree = Tree()
    tree.feed(markup)
    tree.close()
    return sum(1 for n in tree.root.walk() if "lt-field__error" in n.classes())


# Every case below was a real defect in an earlier draft of this file, found by
# review on 2026-07-29. A checker with no tests is a checker that quietly stops
# checking, and the worst of these made audit() return CLEAN on exactly the
# split the module exists to catch.
SELF_TEST = [
    ("an unpaired chip is caught", 1,
     '<div class="lt-field"><label class="lt-field__label">Code</label>'
     '<input class="lt-input" id="a"><p class="lt-field__error">Bad.</p></div>'),
    ("a fully wired field passes", 0,
     '<div class="lt-field"><label class="lt-field__label">Code</label>'
     '<input class="lt-input" id="a" aria-invalid="true" aria-describedby="e">'
     '<p class="lt-field__error" id="e">Bad.</p></div>'),
    ("a warning chip is exempt", 0,
     '<div class="lt-field"><label class="lt-field__label">Feed</label>'
     '<input class="lt-input"><p class="lt-field__warning">High.</p></div>'),
    ("a correct field does not mask a broken one in the same form", 1,
     '<form><div class="lt-field"><label class="lt-field__label">A</label>'
     '<input id="a" aria-invalid="true" aria-describedby="ea">'
     '<p class="lt-field__error" id="ea">x</p></div>'
     '<div class="lt-field"><label class="lt-field__label">B</label><input id="b">'
     '<p class="lt-field__error">y</p></div></form>'),
    ("a form-level chip is an orphan, not a field's fault", 1,
     '<form><div class="lt-field"><label class="lt-field__label">A</label>'
     '<input id="a"></div><p class="lt-field__error">Could not save.</p></form>'),
    ("a nested field's control does not satisfy the outer chip", 1,
     '<div class="lt-field"><label class="lt-field__label">Outer</label>'
     '<p class="lt-field__error">o</p><div class="lt-field">'
     '<label class="lt-field__label">Inner</label>'
     '<input id="i" aria-invalid="true" aria-describedby="ei">'
     '<p class="lt-field__error" id="ei">i</p></div></div>'),
    ("the same control must carry both halves", 1,
     '<div class="lt-field"><label class="lt-field__label">R</label>'
     '<input id="lo" aria-invalid="true"><input id="hi" aria-describedby="er">'
     '<p class="lt-field__error" id="er">z</p></div>'),
    ("an un-upgraded custom element is not a missing control", 0,
     '<div class="lt-field"><label class="lt-field__label">Feed</label>'
     '<lt-number-field value="900"></lt-number-field>'
     '<span class="lt-field__error" id="n">Server said no</span></div>'),
    ("markup inside a textarea is text, not a chip", 0,
     '<div class="lt-field"><label class="lt-field__label">N</label>'
     '<textarea id="t" aria-invalid="true" aria-describedby="e">'
     '&lt;p class="lt-field__error"&gt;fake&lt;/p&gt;</textarea>'
     '<p class="lt-field__error" id="e">real</p></div>'),
    ("a <template> is inert and is not audited", 0,
     '<template><div class="lt-field"><label class="lt-field__label">T</label>'
     '<input id="x"><p class="lt-field__error">t</p></div></template>'),
    ("a duplicate attribute keeps the first, as a browser does", 1,
     '<div class="lt-field"><label class="lt-field__label">D</label>'
     '<input id="d" aria-invalid="false" aria-invalid="true">'
     '<p class="lt-field__error" id="e">x</p></div>'),
]


def self_test():
    bad = 0
    for name, expected, markup in SELF_TEST:
        got = audit(markup, source="self-test")
        if len(got) != expected:
            bad += 1
            print(f"  FAILED: {name} — expected {expected} finding(s), got "
                  f"{len(got)}: {[f.rule for f in got]}")
    if bad:
        print(f"\nFAILED: {bad} of {len(SELF_TEST)} self-tests")
        return 1
    print(f"lt-dom-audit self-test passed ({len(SELF_TEST)} cases)")
    return 0


def main():
    ap = argparse.ArgumentParser(
        description="Audit rendered HTML for field errors that are only half wired.")
    ap.add_argument("paths", nargs="*", help="rendered .html files, or directories of them")
    ap.add_argument("--quiet", action="store_true", help="only print the summary")
    ap.add_argument("--self-test", action="store_true",
                    help="check the auditor's own rules and exit")
    args = ap.parse_args()

    if args.self_test:
        return self_test()
    if not args.paths:
        ap.error("give at least one path, or --self-test")

    files = []
    for raw in args.paths:
        p = pathlib.Path(raw)
        if p.is_dir():
            files.extend(sorted(q for q in p.rglob("*.htm*") if q.is_file()))
        elif p.is_file():
            files.append(p)
        else:
            sys.exit(f"lt-dom-audit: {raw} does not exist")

    if not files:
        print("nothing to audit")
        return 0

    findings, chips = [], 0
    for f in files:
        markup = f.read_text(encoding="utf-8", errors="replace")
        findings.extend(audit(markup, source=str(f)))
        chips += count_chips(markup)

    if findings and not args.quiet:
        by_rule = {}
        for f in findings:
            by_rule.setdefault(f.rule, []).append(f)
        for rule in sorted(by_rule):
            group = by_rule[rule]
            print(f"\n{rule}  ({len(group)})")
            for f in group[:12]:
                print(f"  {f.path}:{f.line}  {f.detail}")
            if len(group) > 12:
                print(f"  ... and {len(group) - 12} more")

    print(f"\naudited {len(files)} file(s), {chips} error chip(s)")
    if findings:
        print(f"FAILED: {len(findings)} finding(s)")
        return 1
    print("field audit passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
