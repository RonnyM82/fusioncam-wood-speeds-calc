"""Writes the approved numbers into the ticked operations.

The rules come from protocol.md and the plan (2026-09-01):

1. A stale jobId writes nothing. The report says so and a fresh job
   follows.
2. All writes for one batch run inside one command execution, so the
   whole batch is exactly one undo step.
3. Per operation: first check every target parameter exists and
   carries a usable value, then write every value through an
   expression string with an explicit unit, then read each back and
   compare within tolerance. The write order is spindle speed,
   cutting feed, plunge, ramp, lead-in, lead-out. tool_feedPerTooth
   is never written: Fusion keeps it linked to the cutting feed, the
   last write becomes the literal, and a per-tooth write rewrites the
   cutting feed (spike-results-windows.md section 6, 2026-09-01). The
   feedPerToothMm in an apply row is information the add-in ignores.
   A drill row writes the spindle speed and the plunge feed only,
   because the cutting feed is not editable on a drill (section 2).
4. Statuses: written, failed, inconsistent, skipped_changed.
   inconsistent means a write failed after another write in the same
   operation succeeded. The page renders it loudest.
5. After the write report, an operation whose toolpath is still valid
   reports its regenReport row "ok" at once: a feed-only write never
   invalidates the toolpath (section 7). generateToolpath runs only
   for a written operation that did go invalid, and those completions
   stream back as regenReport rows, marshalled to the main thread
   through a custom event.
"""

import math
import threading
import time

from . import bridge, constants, log, snapshot, units

UNDO_HINT = "One undo step reverses every write."

# Read-back tolerances. The band is the larger of the relative and
# the absolute part (units.within_tolerance).
RELATIVE_TOLERANCE = 0.001
ABSOLUTE_FEED_TOLERANCE = 0.05  # mm/min
ABSOLUTE_RPM_TOLERANCE = 0.5  # rpm
ABSOLUTE_LENGTH_TOLERANCE = 0.0005  # mm

# How long the regeneration poll keeps trying, and how often.
REGEN_POLL_SECONDS = 1.0
REGEN_DEADLINE_SECONDS = 600.0

# The batch the hidden apply command will execute. handle_apply fills
# it, the command's execute handler consumes it. Main thread only.
_pending = None

# Regeneration in flight: {"jobId": str, "rows": [(opId, operation,
# future)], "deadline": float}. Main thread only.
_regen = None
_regen_timer = None

# The palette the reports go to. Set per batch by handle_apply.
_palette = None


def _row_targets(row, strategy):
    """Return the write targets for one apply row, in write order.

    Each target is (parameter name, value, unit string, kind). The
    unit string makes the expression explicit, so no write depends on
    the internal-unit factors in units.py. The order is spindle,
    cutting, plunge, ramp, lead-in, lead-out. tool_feedPerTooth is
    never written (module header, rule 3). A drill writes the spindle
    speed and the plunge feed only.
    """
    spindle = (constants.PARAM_SPINDLE_SPEED, row.get("rpm"), "rpm", "rpm")
    plunge = (
        constants.PARAM_FEED_PLUNGE,
        row.get("plungeMmMin"),
        "mm/min",
        "feed",
    )
    if strategy == constants.STRATEGY_DRILL:
        return [spindle, plunge]
    return [
        spindle,
        (
            constants.PARAM_FEED_CUTTING,
            row.get("cuttingMmMin"),
            "mm/min",
            "feed",
        ),
        plunge,
        (constants.PARAM_FEED_RAMP, row.get("rampMmMin"), "mm/min", "feed"),
        (
            constants.PARAM_FEED_ENTRY,
            row.get("leadInMmMin"),
            "mm/min",
            "feed",
        ),
        (
            constants.PARAM_FEED_EXIT,
            row.get("leadOutMmMin"),
            "mm/min",
            "feed",
        ),
    ]


def _read_back(operation, name, kind):
    """Return the written parameter in wire units, for the compare."""
    if kind == "rpm":
        return snapshot.read_rpm(operation, name)
    if kind == "feed":
        return snapshot.read_feed_mm_min(operation, name)
    return snapshot.read_length_mm(operation, name)


def _absolute_tolerance(kind):
    if kind == "rpm":
        return ABSOLUTE_RPM_TOLERANCE
    if kind == "feed":
        return ABSOLUTE_FEED_TOLERANCE
    return ABSOLUTE_LENGTH_TOLERANCE


def _usable_number(value):
    """True for a finite number greater than zero."""
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(number) and number > 0


def _apply_row(cam, job_id, row):
    """Write one operation. Returns (report_row, operation_or_None).

    The operation comes back only when the row status is written, so
    the caller knows what to regenerate.
    """
    op_id_value = row.get("opId")

    operation = snapshot.find_operation(cam, op_id_value)
    if operation is None:
        return (
            {
                "opId": op_id_value,
                "status": "failed",
                "reason": "the operation was not found in the document",
            },
            None,
        )

    # skipped_changed: the raw facts moved since the snapshot
    # (protocol.md, writeReport). The hash is cheap on purpose.
    fresh_hash = snapshot.op_facts_hash(snapshot.read_operation(operation))
    if fresh_hash != snapshot.stored_hash(job_id, op_id_value):
        return (
            {
                "opId": op_id_value,
                "status": "skipped_changed",
                "reason": "the operation changed after the snapshot",
            },
            None,
        )

    targets = _row_targets(row, snapshot.read_strategy(operation))

    # Check phase: every target parameter must exist and every value
    # must be usable before the first write. A failure here is a clean
    # refusal, nothing has changed yet.
    for name, value, _unit, _kind in targets:
        if not _usable_number(value):
            return (
                {
                    "opId": op_id_value,
                    "status": "failed",
                    "reason": "no usable value for " + name,
                },
                None,
            )
        if snapshot.get_parameter(operation, name) is None:
            return (
                {
                    "opId": op_id_value,
                    "status": "failed",
                    "reason": "the parameter " + name + " is missing",
                },
                None,
            )

    # Write phase. After the first successful write, any failure makes
    # the row inconsistent: a new spindle speed against an old feed is
    # a dangerous chip load, so the page renders it loudest.
    wrote_any = False
    for name, value, unit, kind in targets:
        expression = str(value) + " " + unit
        try:
            parameter = snapshot.get_parameter(operation, name)
            parameter.expression = expression
        except Exception:
            log.log_exception("apply write " + name)
            status = "inconsistent" if wrote_any else "failed"
            return (
                {
                    "opId": op_id_value,
                    "status": status,
                    "reason": "writing " + name + " failed",
                },
                None,
            )
        wrote_any = True

        back = _read_back(operation, name, kind)
        if not units.within_tolerance(
            value, back, RELATIVE_TOLERANCE, _absolute_tolerance(kind)
        ):
            # The write landed but the read-back does not match. The
            # operation state is uncertain, so this is inconsistent,
            # never silently accepted. A wrong internal-unit factor in
            # units.py also lands here, which fails safe: the report
            # refuses, it never mislabels a write as good. With the
            # factors confirmed on 2026-09-01 (section 5) the read-back
            # matches on Windows; an inch document stays untested.
            return (
                {
                    "opId": op_id_value,
                    "status": "inconsistent",
                    "reason": "the read-back of "
                    + name
                    + " did not match the written value",
                },
                None,
            )

    return ({"opId": op_id_value, "status": "written"}, operation)


def handle_apply(app, palette, message):
    """Entry point for an apply message from the page. Main thread.

    Stale jobs are rejected here. Current jobs are queued for the
    hidden command, whose execution wraps the batch in one undo step.
    """
    global _pending, _palette

    job_id = message.get("jobId")
    if job_id != snapshot.current_job_id():
        log.log("apply rejected: stale jobId " + str(job_id))
        bridge.send_to_page(
            palette,
            "writeReport",
            {"jobId": job_id, "stale": True, "undoHint": UNDO_HINT, "rows": []},
        )
        bridge.send_to_page(palette, "job", snapshot.build_job(app))
        return

    _pending = {"jobId": job_id, "rows": message.get("rows") or []}
    _palette = palette

    # commandDefinition.execute() queues the command. The writes run
    # in the execute handler, so run_batch sends the reports itself.
    command_definition = app.userInterface.commandDefinitions.itemById(
        constants.CMD_APPLY_ID
    )
    if command_definition is None:
        log.log("apply failed: the apply command definition is missing")
        bridge.send_to_page(
            palette,
            "writeReport",
            {
                "jobId": job_id,
                "stale": False,
                "undoHint": UNDO_HINT,
                "rows": [
                    {
                        "opId": row.get("opId"),
                        "status": "failed",
                        "reason": "the apply command is not available",
                    }
                    for row in _pending["rows"]
                ],
            },
        )
        _pending = None
        return
    command_definition.execute()


def run_batch(app):
    """The body of the hidden apply command's execute handler.

    Confirmed 2026-09-01, spike-results-windows.md section 10: Fusion
    groups every change made inside one transaction into one undo
    step. Two writes on one operation reversed together. The connector
    wraps each script in one transaction, the same shape as this
    command's execution. The caveat from the same section: after any
    undo, re-check hasMissingReferences() on the setup and on every
    operation before trusting the document. The first live Apply shows
    that a command with no inputs executes without a dialog.
    """
    global _pending

    if _pending is None:
        log.log("run_batch called with no pending apply")
        return
    batch = _pending
    _pending = None

    palette = _palette
    job_id = batch["jobId"]

    if job_id != snapshot.current_job_id():
        # The document moved between the queue and the execution.
        log.log("apply batch stale at execution time")
        if palette is not None:
            bridge.send_to_page(
                palette,
                "writeReport",
                {
                    "jobId": job_id,
                    "stale": True,
                    "undoHint": UNDO_HINT,
                    "rows": [],
                },
            )
            bridge.send_to_page(palette, "job", snapshot.build_job(app))
        return

    cam = snapshot.get_cam(app)
    report_rows = []
    written = []
    try:
        for row in batch["rows"]:
            # A malformed row must not abort the batch after earlier
            # writes (review finding, 2026-09-01). A non-dict row and
            # an unexpected exception each become a failed report row
            # with the reason.
            if not isinstance(row, dict):
                log.log("apply row refused: the row is not an object")
                report_rows.append(
                    {
                        "opId": None,
                        "status": "failed",
                        "reason": "the row is not an object",
                    }
                )
                continue
            try:
                report_row, operation = _apply_row(cam, job_id, row)
            except Exception:
                log.log_exception("apply row " + str(row.get("opId")))
                report_row = {
                    "opId": row.get("opId"),
                    "status": "failed",
                    "reason": "an unexpected error stopped this row",
                }
                operation = None
            report_rows.append(report_row)
            if operation is not None:
                written.append((row.get("opId"), operation))
            log.log(
                "apply "
                + str(row.get("opId"))
                + ": "
                + report_row["status"]
                + (" (" + report_row.get("reason", "") + ")" if "reason" in report_row else "")
            )
    finally:
        # A batch that started always reports, with the undo hint
        # (review finding, 2026-09-01). The report send and the
        # regeneration start are independent: a send that raises (the
        # palette closed mid-batch) must not stop regeneration for rows
        # that were really written (verifier finding, 2026-09-01).
        try:
            if palette is not None:
                bridge.send_to_page(
                    palette,
                    "writeReport",
                    {
                        "jobId": job_id,
                        "stale": False,
                        "undoHint": UNDO_HINT,
                        "rows": report_rows,
                    },
                )
        except Exception:
            log.log_exception("writeReport send")
        _start_regen(app, cam, job_id, written)


# ---------------------------------------------------------------------------
# Regeneration. Fusion regenerates asynchronously, so a timer thread
# re-enters the main thread through the regen custom event and the
# completions stream back row by row.
# ---------------------------------------------------------------------------


def _toolpath_still_valid(operation):
    """True when the operation reports a valid toolpath after the writes.

    Confirmed 2026-09-01, spike-results-windows.md section 7: a
    feed-only write leaves isToolpathValid True, so there is nothing
    to regenerate. An unreadable flag counts as invalid, so the row
    goes through the regeneration path and is verified there.
    """
    try:
        return operation.isToolpathValid is True
    except Exception:
        return False


def _start_regen(app, cam, job_id, written):
    """Report the still-valid rows and regenerate the rest."""
    global _regen

    if not written:
        return

    rows = []
    immediate_rows = []
    for op_id_value, operation in written:
        if _toolpath_still_valid(operation):
            # A feed-only write never invalidates (section 7). Report
            # ok at once and skip generateToolpath.
            immediate_rows.append({"opId": op_id_value, "status": "ok"})
            continue
        try:
            future = cam.generateToolpath(operation)
            rows.append((op_id_value, operation, future))
        except Exception:
            log.log_exception("generateToolpath " + str(op_id_value))
            immediate_rows.append(
                {
                    "opId": op_id_value,
                    "status": "failed",
                    "reason": "regeneration did not start",
                }
            )

    if immediate_rows and _palette is not None:
        try:
            bridge.send_to_page(
                _palette,
                "regenReport",
                {"jobId": job_id, "rows": immediate_rows},
            )
        except Exception:
            log.log_exception("regenReport send")

    if rows:
        _regen = {
            "jobId": job_id,
            "rows": rows,
            "deadline": time.time() + REGEN_DEADLINE_SECONDS,
        }
        _schedule_regen_poll(app)


def _schedule_regen_poll(app):
    """Arm the poll timer. The timer thread only fires the event."""
    global _regen_timer
    timer = threading.Timer(
        REGEN_POLL_SECONDS,
        lambda: bridge.fire(app, constants.EVENT_REGEN_POLL),
    )
    timer.daemon = True
    timer.start()
    _regen_timer = timer


def on_regen_poll(app):
    """Main-thread poll body, entered through the regen custom event."""
    global _regen

    if _regen is None:
        return

    finished = []
    still_pending = []
    for op_id_value, operation, future in _regen["rows"]:
        try:
            done = bool(future.isGenerationCompleted)
        except Exception:
            # The future is unreadable, so the outcome is unknown.
            # Report failed, never fall through to hasToolpath and
            # report ok unverified (review finding, 2026-09-01).
            log.log_exception("regen poll " + str(op_id_value))
            finished.append(
                {
                    "opId": op_id_value,
                    "status": "failed",
                    "reason": "could not confirm regeneration",
                }
            )
            continue
        if not done:
            still_pending.append((op_id_value, operation, future))
            continue
        ok = False
        try:
            ok = bool(operation.hasToolpath)
        except Exception:
            pass
        if ok:
            finished.append({"opId": op_id_value, "status": "ok"})
        else:
            finished.append(
                {
                    "opId": op_id_value,
                    "status": "failed",
                    "reason": "the operation has no toolpath after regeneration",
                }
            )

    if finished and _palette is not None:
        bridge.send_to_page(
            _palette,
            "regenReport",
            {"jobId": _regen["jobId"], "rows": finished},
        )

    if not still_pending:
        _regen = None
        return

    if time.time() > _regen["deadline"]:
        log.log("regen poll deadline passed with rows still pending")
        if _palette is not None:
            bridge.send_to_page(
                _palette,
                "regenReport",
                {
                    "jobId": _regen["jobId"],
                    "rows": [
                        {
                            "opId": op_id_value,
                            "status": "failed",
                            "reason": "regeneration did not finish in time",
                        }
                        for op_id_value, _op, _f in still_pending
                    ],
                },
            )
        _regen = None
        return

    _regen["rows"] = still_pending
    _schedule_regen_poll(app)


def cancel():
    """Drop any pending batch and stop the regen poll. For stop()."""
    global _pending, _regen, _regen_timer, _palette
    _pending = None
    _regen = None
    _palette = None
    if _regen_timer is not None:
        try:
            _regen_timer.cancel()
        except Exception:
            pass
        _regen_timer = None
