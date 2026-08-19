#!/usr/bin/env python3
"""
PreToolUse guard: refuse edits to the vendored design-system files.

tokens/, components/, fonts/ and icons/ are copies of the Livetools Design
System, not this repo's source. Upgrading is a deliberate re-copy from a newer
published skill, and a local edit turns that re-copy into a merge.

The risk is not hypothetical. Two upstream defects were found during the
migration onto the system, and the fix for each was a one-line change that would
have been far easier to make in the vendored file than in the app layer. Both
went into styles.css instead, on purpose. That decision should not depend on
whoever is editing remembering it at the time.

Reads the PreToolUse payload on stdin, denies with a reason naming where the fix
belongs. Anything it cannot parse is allowed: a guard that blocks work because
it failed to read its own input is worse than no guard.
"""

import json
import pathlib
import sys

VENDORED = ("tokens/", "components/", "fonts/", "icons/")
ROOT = pathlib.Path(__file__).resolve().parents[2]

REASON = (
    "{rel} is a vendored copy of the Livetools Design System, not this repo's "
    "source. Editing it makes the next upgrade a merge instead of a re-copy.\n\n"
    "Put the fix in the app layer instead:\n"
    "  styles.css      app CSS, and corrections to a component's own CSS\n"
    "  app-tokens.css  tokens the system does not define\n\n"
    "Write the measurement that found it above the rule, and report the defect "
    "upstream. See CLAUDE.md."
)


def main():
    try:
        payload = json.load(sys.stdin)
        raw = payload.get("tool_input", {}).get("file_path", "")
    except Exception:
        return 0
    if not raw:
        return 0

    try:
        rel = pathlib.Path(raw).resolve().relative_to(ROOT).as_posix()
    except (ValueError, OSError):
        return 0   # outside this repo, not ours to police

    if not rel.startswith(VENDORED):
        return 0

    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": REASON.format(rel=rel),
        }
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
