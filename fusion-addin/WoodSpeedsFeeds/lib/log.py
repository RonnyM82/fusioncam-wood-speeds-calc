"""File logging for the add-in.

Fusion swallows an exception that no handler catches. Every handler in
this add-in therefore wraps its body in try/except and reports here.
The log file lives in the platform temp folder, so a public user can
find it and paste it into a bug report.

Logging must never raise. A logging failure would mask the error that
was being logged, so every function here swallows its own errors.
"""

import datetime
import os
import tempfile
import traceback

LOG_FILE_NAME = "wood-speeds-feeds-addin.log"


def log_path():
    """Return the full path of the log file.

    Windows resolves this under %TEMP%. Mac resolves it under $TMPDIR.
    """
    return os.path.join(tempfile.gettempdir(), LOG_FILE_NAME)


def log(message):
    """Append one timestamped line to the log file."""
    try:
        stamp = datetime.datetime.now().isoformat(timespec="seconds")
        with open(log_path(), "a", encoding="utf-8") as handle:
            handle.write(stamp + " " + str(message) + "\n")
    except Exception:
        pass


def debug(message):
    """Append one debug-level line: expected, ignored traffic.

    Unknown message types land here (2026-09-01), so the log shows
    them without treating them as errors.
    """
    log("DEBUG " + str(message))


def log_exception(context):
    """Log the current exception with its full traceback.

    Call this from inside an except block. The context string names the
    handler or the step that failed.
    """
    try:
        log("ERROR in " + str(context) + "\n" + traceback.format_exc())
    except Exception:
        pass
