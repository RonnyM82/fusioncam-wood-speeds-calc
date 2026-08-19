#!/usr/bin/env python3
"""
PostToolUse: run conformance.py the moment a source file changes.

conformance.py takes 0.14s over this repo, which is cheap enough to pay on every
edit, and the feedback lands attached to the edit that caused it rather than at
commit time behind a dozen other changes.

Only fires for the suffixes conformance.py actually reads. Exits 2 on a finding
so the output is fed back for correction; exits 0 otherwise, silently.

WHAT THIS CANNOT CATCH, so nobody reads a green edit as a correct one:
a token used for the wrong job (a border token as a data-mark fill reads as
compliant), a component attribute left off, a rendered geometry. Those are
smoke-measure.py, lt_dom_audit.py and judgement, in that order.
"""

import json
import pathlib
import subprocess
import sys

SUFFIXES = {".css", ".html", ".htm", ".js", ".mjs", ".svg"}
ROOT = pathlib.Path(__file__).resolve().parents[2]


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        return 0

    raw = (payload.get("tool_input", {}).get("file_path")
           or payload.get("tool_response", {}).get("filePath") or "")
    if pathlib.Path(raw).suffix.lower() not in SUFFIXES:
        return 0

    result = subprocess.run(
        [sys.executable, "conformance.py", "."],
        cwd=ROOT, capture_output=True, text=True,
    )
    if result.returncode == 0:
        return 0

    sys.stderr.write(
        "conformance.py failed after this edit. Fix the cause; do not add the "
        "file to EXEMPT to make it pass.\n\n" + result.stdout[-3000:]
    )
    return 2


if __name__ == "__main__":
    sys.exit(main())
