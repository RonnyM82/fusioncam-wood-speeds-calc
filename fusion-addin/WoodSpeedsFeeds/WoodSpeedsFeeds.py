"""Wood speeds and feeds: the Fusion add-in entry point.

One button in the Manufacture workspace opens a palette on
wood.fusioncam.co. The page owns the machining policy. This side
moves data: it snapshots the document, carries the stored choices,
writes the approved numbers, and never decides anything about a cut
(decision A2, 2026-09-01).

Structural rules, from the plan (2026-09-01):
1. The Fusion API is called only from the main thread. Timers re-enter
   through app.fireCustomEvent and a registered custom event.
2. Every handler is owned by the module-level list in lib/bridge.py.
3. stop() deletes the palette and the command definitions, unregisters
   the custom events, disconnects the recorded event handlers and
   clears the handler list, so a reload does not leak.
4. Every handler wraps its body in try/except and logs to the file in
   lib/log.py, because Fusion swallows unlogged exceptions.
"""

import json
import threading

import adsk.core

from .lib import apply as apply_batch
from .lib import bridge, constants, dump, log, memory, snapshot

_app = None
_ui = None

# The open palette, or None.
_palette = None

# The hello timer and its outcome. The timer thread never touches the
# Fusion API: it only fires the custom event (bridge.fire).
_hello_timer = None
_hello_received = False

# True once the page reported a pageError for the open palette. The
# hello timeout then stays quiet and the palette stays open, so the
# page's own banner stays visible (protocol.md pageError, 2026-09-01).
_page_error_seen = False

# Toolbar controls this add-in created, as (panel, control id), so
# stop() removes exactly what run() added.
_created_controls = []


def _quiet(action, context):
    """Run one cleanup step and log a failure instead of raising."""
    try:
        action()
    except Exception:
        log.log_exception(context)


# ---------------------------------------------------------------------------
# Palette lifecycle.
# ---------------------------------------------------------------------------


def _read_theme():
    """Return "dark" or "light" from Fusion's resolved theme preference.

    activeUserInterfaceTheme is already resolved when the user picked
    "match device" (spike-results-windows.md section 11, wait-code
    item 8). The two dark themes are named in constants.py. Any
    failure reads as light, so the page always gets a value.
    """
    try:
        active = _app.preferences.generalPreferences.activeUserInterfaceTheme
        themes = adsk.core.UserInterfaceThemes
        dark_values = []
        for name in constants.DARK_THEME_NAMES:
            value = getattr(themes, name, None)
            if value is not None:
                dark_values.append(value)
        return "dark" if active in dark_values else "light"
    except Exception:
        log.log_exception("read theme")
        return "light"


def _delete_palette(context):
    """Delete any palette with our id, so no deaf palette survives.

    A palette left over from a previous add-in run has no handler
    attached and answers every page message with an empty string
    (section 11, wait-code item 3).
    """

    def delete():
        palette = _ui.palettes.itemById(constants.PANEL_ID)
        if palette is not None:
            palette.deleteMe()

    _quiet(delete, context)


def _panel_url():
    """Return the panel address with the build tag and the theme.

    The build tag is the cache-bust key for the palette's browser and
    the theme lets the page set data-theme before it paints (section
    11, wait-code items 6 and 8).
    """
    return (
        constants.PANEL_URL
        + "&build="
        + constants.ADDIN_BUILD
        + "&theme="
        + _read_theme()
    )


def _open_palette():
    """Create the palette, hook its messages, arm the hello timer."""
    global _palette, _hello_received, _page_error_seen

    _delete_palette("delete stale palette")

    url = _panel_url()
    # The ninth argument selects the Qt WebEngine browser. It is
    # required for the promise that adsk.fusionSendData returns and
    # for modern CSS (section 11, wait-code item 2).
    _palette = _ui.palettes.add(
        constants.PANEL_ID,
        constants.PANEL_NAME,
        url,
        True,  # visible
        True,  # close button
        True,  # resizable
        constants.PANEL_WIDTH,
        constants.PANEL_HEIGHT,
        True,  # useNewWebBrowser
    )
    _palette.dockingState = adsk.core.PaletteDockingStates.PaletteDockStateRight

    handler = bridge.make_handler(
        adsk.core.HTMLEventHandler, _on_html_event, "incomingFromHTML"
    )
    _palette.incomingFromHTML.add(handler)

    _hello_received = False
    _page_error_seen = False
    _start_hello_timer()
    log.log("palette opened on " + url)


def _start_hello_timer():
    """Arm the ten-second hello timer (plan, session step 2)."""
    global _hello_timer
    _cancel_hello_timer()
    app = _app
    timer = threading.Timer(
        constants.HELLO_TIMEOUT_SECONDS,
        lambda: bridge.fire(app, constants.EVENT_HELLO_TIMEOUT),
    )
    timer.daemon = True
    timer.start()
    _hello_timer = timer


def _cancel_hello_timer():
    global _hello_timer
    if _hello_timer is not None:
        _quiet(_hello_timer.cancel, "cancel hello timer")
        _hello_timer = None


def _on_hello_timeout(_args):
    """Main-thread body of the hello-timeout custom event."""
    global _palette
    if _hello_received:
        return
    if _page_error_seen:
        # The page reported its own error: the pageError message box
        # already carried the reason and the palette stays open
        # (protocol.md pageError, 2026-09-01).
        return
    log.log("hello timeout: no hello within ten seconds")
    if _palette is not None:
        _quiet(_palette.deleteMe, "delete palette on timeout")
        _palette = None
    _ui.messageBox(constants.OFFLINE_MESSAGE)


# ---------------------------------------------------------------------------
# Messages from the page.
# ---------------------------------------------------------------------------


def _acknowledge(html_args, message_type, ok):
    """Put the return value of the page's send on the event args.

    adsk.fusionSendData resolves to this string. An empty string means
    no handler is attached, which is a palette that outlived its
    add-in run, so every branch answers, unknown types included
    (section 11, wait-code item 3). The protocol still carries every
    real reply as its own message.
    """
    try:
        html_args.returnData = json.dumps({"ok": ok, "type": message_type})
    except Exception:
        log.log_exception("set returnData")


def _on_html_event(args):
    """Route one incomingFromHTML message. Main thread."""
    html_args = adsk.core.HTMLEventArgs.cast(args)
    message_type = html_args.action
    try:
        message = json.loads(html_args.data) if html_args.data else {}
    except ValueError:
        log.log("unparseable message of type " + str(message_type))
        _acknowledge(html_args, message_type, False)
        return

    log.log("received " + str(message_type))
    _acknowledge(html_args, message_type, True)
    if message_type == "hello":
        _on_hello(message)
    elif message_type == "persist":
        _on_persist(message)
    elif message_type == "refresh":
        _send_job()
    elif message_type == "apply":
        apply_batch.handle_apply(_app, _palette, message)
    elif message_type == "pageError":
        _on_page_error(message)
    else:
        # Unknown types are ignored, never treated as an error
        # (protocol.md, envelope). Debug level on purpose (2026-09-01).
        log.debug("ignored unknown message type " + str(message_type))


def _on_hello(message):
    """The page announced itself: stop the timer, send the job."""
    global _hello_received
    _hello_received = True
    _cancel_hello_timer()
    log.log("hello from page build " + str(message.get("pageBuild")))
    _send_job()


def _on_page_error(message):
    """The page loaded but cannot serve (protocol.md, pageError).

    Added 2026-09-01. Without this branch the hello timeout misreads
    a page data failure as no internet. The hello timer stops, one
    native message box carries the page's reason instead of the
    offline message, and the palette stays open so the page's own
    banner stays visible.
    """
    global _page_error_seen
    _cancel_hello_timer()
    reason = message.get("reason")
    if not isinstance(reason, str) or not reason:
        reason = "The page reported an error without a reason."
    log.log("pageError from the page: " + reason)
    if _page_error_seen:
        # One message box only. A repeated pageError is logged above
        # and shows nothing new.
        return
    _page_error_seen = True
    _ui.messageBox(reason)


def _on_persist(message):
    """Store a blob verbatim. The add-in never reads its contents."""
    scope = message.get("scope")
    blob = message.get("blob")
    if not isinstance(blob, str):
        log.log("persist refused: the blob is not a string")
        return
    if scope == "doc":
        # A document-scope persist may only land in the document the
        # current job snapshotted (review finding, 2026-09-01). When
        # the active document no longer matches, refuse and log: the
        # blob belongs to the snapshot the page is showing.
        target = snapshot.doc_persist_target(_app)
        if target is None:
            log.log(
                "persist refused: the active document is not the "
                "document the current job snapshotted"
            )
            return
        memory.write_doc_blob(target, blob)
    elif scope == "user":
        memory.write_user_blob(blob)
    else:
        log.log("persist refused: unknown scope " + str(scope))


def _send_job():
    """Build a fresh snapshot and send it to the page."""
    if _palette is None:
        log.log("no palette to send a job to")
        return
    bridge.send_to_page(_palette, "job", snapshot.build_job(_app))


def _on_document_activated(_args):
    """A document switch sends a fresh job (protocol.md, job).

    Snapshots on in-document edits land with the first live milestone
    (plan, phase 3). A stale job is already rejected safely at apply
    time, so the switch event is the one that matters now.
    """
    if _palette is not None and _hello_received:
        _send_job()


# ---------------------------------------------------------------------------
# Commands.
# ---------------------------------------------------------------------------


def _on_open_execute(_args):
    _open_palette()


def _on_dump_execute(_args):
    dump.run_dump(_app, _ui)


def _on_apply_execute(_args):
    apply_batch.run_batch(_app)


def _connect_command(command_definition, execute_callback, context):
    """Connect a definition so each run executes the callback."""

    def on_created(args):
        created_args = adsk.core.CommandCreatedEventArgs.cast(args)
        execute_handler = bridge.make_handler(
            adsk.core.CommandEventHandler, execute_callback, context
        )
        created_args.command.execute.add(execute_handler)

    created_handler = bridge.make_handler(
        adsk.core.CommandCreatedEventHandler, on_created, context + " created"
    )
    command_definition.commandCreated.add(created_handler)


def _create_commands():
    """Create the command definitions and the toolbar buttons."""
    definitions = _ui.commandDefinitions

    for command_id in (
        constants.CMD_OPEN_ID,
        constants.CMD_DUMP_ID,
        constants.CMD_APPLY_ID,
    ):
        stale = definitions.itemById(command_id)
        if stale is not None:
            _quiet(stale.deleteMe, "delete stale command " + command_id)

    open_definition = definitions.addButtonDefinition(
        constants.CMD_OPEN_ID,
        "Wood speeds and feeds",
        "Open the wood speeds and feeds panel.",
    )
    _connect_command(open_definition, _on_open_execute, "open command")

    dump_definition = definitions.addButtonDefinition(
        constants.CMD_DUMP_ID,
        "Dump operations for wood speeds and feeds",
        "Write the document's operations to a JSON file for a bug "
        "report or a test case. Names are scrubbed.",
    )
    _connect_command(dump_definition, _on_dump_execute, "dump command")

    # The apply command has no button and no inputs. Executing it
    # wraps the write batch in one undo step (lib/apply.py).
    apply_definition = definitions.addButtonDefinition(
        constants.CMD_APPLY_ID,
        "Apply wood speeds and feeds",
        "Internal: writes the approved numbers as one undo step.",
    )
    _connect_command(apply_definition, _on_apply_execute, "apply command")

    workspace = _ui.workspaces.itemById(constants.WORKSPACE_ID)
    if workspace is None:
        # Confirmed 2026-09-01, spike-results-windows.md section 11
        # (wait-code item 9): the id resolves on Windows.
        log.log("workspace " + constants.WORKSPACE_ID + " was not found")
        return
    panel = workspace.toolbarPanels.itemById(constants.PANEL_HOST_ID)
    if panel is None:
        # Confirmed 2026-09-01, spike-results-windows.md "Other
        # readings": the Actions panel sits on the Milling tab.
        log.log("toolbar panel " + constants.PANEL_HOST_ID + " was not found")
        return
    for definition in (open_definition, dump_definition):
        control = panel.controls.addCommand(definition)
        _created_controls.append((panel, control.id))


def _delete_commands():
    """Remove the buttons and the definitions this add-in created."""
    for panel, control_id in _created_controls:
        def remove_control(panel=panel, control_id=control_id):
            control = panel.controls.itemById(control_id)
            if control is not None:
                control.deleteMe()

        _quiet(remove_control, "remove control " + control_id)
    _created_controls.clear()

    for command_id in (
        constants.CMD_OPEN_ID,
        constants.CMD_DUMP_ID,
        constants.CMD_APPLY_ID,
    ):
        def remove_definition(command_id=command_id):
            definition = _ui.commandDefinitions.itemById(command_id)
            if definition is not None:
                definition.deleteMe()

        _quiet(remove_definition, "delete command " + command_id)


# ---------------------------------------------------------------------------
# Entry points.
# ---------------------------------------------------------------------------


def run(_context):
    global _app, _ui, _palette
    try:
        _app = adsk.core.Application.get()
        _ui = _app.userInterface
        log.log("run: add-in " + constants.ADDIN_VERSION)

        bridge.register_custom_event(
            _app, constants.EVENT_HELLO_TIMEOUT, _on_hello_timeout
        )
        bridge.register_custom_event(
            _app,
            constants.EVENT_REGEN_POLL,
            lambda _args: apply_batch.on_regen_poll(_app),
        )

        document_handler = bridge.make_handler(
            adsk.core.DocumentEventHandler,
            _on_document_activated,
            "documentActivated",
        )
        # bridge.connect records the (event, handler) pair, so stop()
        # disconnects this handler in bridge.cleanup (review finding,
        # 2026-09-01).
        bridge.connect(_app.documentActivated, document_handler)

        # A palette that survived a previous run has no handler and
        # answers the page with an empty string (section 11, wait-code
        # item 3). Delete it before the commands exist.
        _delete_palette("delete palette from a previous run")
        _palette = None

        _create_commands()
    except Exception:
        log.log_exception("run")
        if _ui is not None:
            _ui.messageBox(
                "Wood speeds and feeds failed to start. The log file "
                "has the details:\n" + log.log_path()
            )


def stop(_context):
    global _palette
    try:
        _cancel_hello_timer()
        apply_batch.cancel()

        _delete_palette("delete palette")
        _palette = None

        _delete_commands()
        bridge.cleanup(_app)
        log.log("stop: clean")
    except Exception:
        log.log_exception("stop")
