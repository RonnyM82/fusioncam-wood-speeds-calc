"""The dump command: the current job message written to a JSON file.

A committed dump pairs with a human-approved expected file, and the
Node suite runs the mapping module over every pair (plan, recorded
operations). Because the dump IS the wire format, a format change
that breaks old dumps fails the suite immediately.

Scrubbing follows protocol.md exactly (2026-09-01): document, setup
and operation names are replaced, tool description and comment keep
only geometry and series words from the allowlist below, and the
dump, capturedAt and scrubbed envelope fields are added. A human
reads every dump before it is committed.
"""

import copy
import datetime
import json
import re

import adsk.core

from . import constants, log, snapshot

# The committed allowlist (2026-09-01). Tokens that name a tool
# geometry or a series survive the scrub. Everything else in a
# description or comment could be customer data and is dropped.
WORD_ALLOWLIST = frozenset(
    {
        # spiral direction and geometry
        "upcut",
        "up",
        "downcut",
        "down",
        "compression",
        "straight",
        "spiral",
        "flat",
        "ball",
        "ballnose",
        "vee",
        "v",
        "chipbreaker",
        "mortise",
        "o",
        "oflute",
        # role words
        "finisher",
        "finishing",
        "finish",
        "rougher",
        "roughing",
        # flute counts and series words
        "single",
        "double",
        "triple",
        "flute",
        "flutes",
        "1fl",
        "2fl",
        "3fl",
        "4fl",
        "fl",
        "series",
    }
)

_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9]+")


def scrub_text(text):
    """Reduce free text to allowlisted geometry and series words."""
    if text is None:
        return None
    kept = [
        token
        for token in _TOKEN_PATTERN.findall(str(text))
        if token.lower() in WORD_ALLOWLIST
    ]
    return " ".join(kept)


def scrub_job(job):
    """Return a scrubbed deep copy of a job message.

    Vendor and product id stay: they are the matching keys and are
    not customer data (protocol.md, dump format). The opId stays too:
    it is Fusion's integer operation id as a string (spike, section
    8), it carries no customer data, and the expected file pairs with
    it.
    """
    scrubbed = copy.deepcopy(job)
    scrubbed["documentName"] = "doc-1"
    operation_counter = 0
    for setup_index, setup in enumerate(scrubbed.get("setups", [])):
        setup["name"] = "setup-" + str(setup_index + 1)
        for operation in setup.get("operations", []):
            operation_counter += 1
            operation["name"] = "op-" + str(operation_counter)
            tool = operation.get("tool")
            if tool is not None:
                tool["description"] = scrub_text(tool.get("description"))
                tool["comment"] = scrub_text(tool.get("comment"))
    return scrubbed


def build_dump(app):
    """Return the scrubbed dump message for the active document.

    The document is read without jobId bookkeeping, so dumping never
    invalidates the panel's current job. capturedAt comes from the
    clock at dump time.
    """
    message = {
        "protocol": constants.PROTOCOL_VERSION,
        "type": "job",
        "jobId": snapshot.current_job_id() or "0",
    }
    message.update(snapshot.read_document(app))
    # The stored blobs stay out of a dump (decision, 2026-09-01). A
    # blob carries the user's saved choices, and a public test input
    # does not need them.
    message["memory"] = {"docBlob": None, "userBlob": None}

    dump_message = scrub_job(message)
    dump_message["dump"] = True
    dump_message["capturedAt"] = (
        datetime.datetime.now(datetime.timezone.utc)
        .replace(microsecond=0)
        .isoformat()
        .replace("+00:00", "Z")
    )
    dump_message["scrubbed"] = True
    return dump_message


def run_dump(app, ui):
    """The body of the dump command. Main thread only."""
    dump_message = build_dump(app)

    dialog = ui.createFileDialog()
    dialog.title = "Dump operations for wood speeds and feeds"
    dialog.filter = "JSON files (*.json)"
    dialog.initialFilename = "wood-speeds-feeds-dump.json"
    result = dialog.showSave()
    if result != adsk.core.DialogResults.DialogOK:
        log.log("dump cancelled")
        return

    path = dialog.filename
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(dump_message, handle, indent=2)
        handle.write("\n")
    log.log("dump written to " + path)
    ui.messageBox(
        "The dump was written to:\n"
        + path
        + "\n\nNames were replaced and free text was reduced to geometry "
        + "words. Read the file before you share it."
    )
