"""WSFSpike: the throwaway phase-0 spike for the wood add-in.

This add-in is self-contained on purpose. It exists to answer the
numbered checklist in fusion-addin/protocol.md ("Confirm in the
spike", 2026-09-01) and it will be deleted afterwards. It never
writes anything except one feed value, which it restores.

On 2026-09-01 the Fusion connector settled every API fact on Windows
(fusion-addin/spike-results-windows.md), so the parameter and unit
probes below are a cross-check now, not the source. What this add-in
still serves: the Mac pass, and the round trip with the live URL,
which the connector could not drive (section 11). The name lists
below carry the confirmed names.

On run it:
1. Opens the palette on the live page with ?spike=1 and logs whether
   hello arrives inside ten seconds (checklist items 1 to 3).
2. Sends one ping message to the page (item 3).
3. Logs every operation's strategy string (item 5).
4. Logs every parameter internal name the first operation exposes,
   and every setup parameter name (item 4 and the guessed stock
   names).
5. Logs the tool JSON of the first operation's tool.
6. Probes every guessed name from the protocol table and logs hit or
   miss (items 4 and 8).
7. Logs what the setup machine and its spindle expose (item 6).
8. Writes tool_feedCutting through an expression, reads it back, logs
   both, and restores the old expression (item 7 groundwork and the
   unit-factor check for units.py).
9. After the ten-second wait, shows one report in a message box and
   writes the same report to the log file.

A human runs this once on Windows and once on Mac and pastes the log
back. The panel render check (fonts, tokens, components) is a human
check: look at the panel while the spike waits.
"""

import json
import os
import platform
import tempfile
import threading
import traceback

import adsk.cam
import adsk.core

SPIKE_LOG_NAME = "wood-speeds-feeds-spike.log"
PANEL_ID = "wsfSpikePanel"
PANEL_URL = "https://wood.fusioncam.co/fusion.html?protocol=1&addin=0.1.0&spike=1"
EVENT_REPORT = "wsfSpikeReport"
HELLO_WAIT_SECONDS = 10.0

# The names WoodSpeedsFeeds/lib/constants.py uses, confirmed on
# Windows on 2026-09-01. The spike logs hit or miss for each on the
# first operation, so the Mac log shows the same names resolve there.
OPERATION_SPIKE_NAMES = [
    "tool_feedPlunge",
    "tool_feedRamp",
    "tool_feedEntry",
    "tool_feedExit",
    "direction",
    "compensation",
    "strategy",
    "doMultipleFinishingPasses",
    "doFinishingPasses",
    "numberOfFinishingStepovers",
    "useStockToLeave",
    "tool_type",
    "tool_diameter",
    "tool_cornerRadius",
    "tool_numberOfFlutes",
    "tool_fluteLength",
    "tool_shoulderLength",
    "tool_vendor",
    "tool_productId",
    "tool_description",
    "tool_comment",
]

# Confirmed names, read alongside so the log shows raw internal
# values next to the dialog values. That comparison pins the unit
# factors in WoodSpeedsFeeds/lib/units.py.
OPERATION_CONFIRMED_NAMES = [
    "tool_spindleSpeed",
    "tool_surfaceSpeed",
    "tool_feedCutting",
    "tool_feedPerTooth",
    "maximumStepover",
    "stepover",
    "optimalLoad",
    "maximumStepdown",
    "doMultipleDepths",
    "rampAngle",
    "topHeight_mode",
    "topHeight_offset",
    "topHeight_value",
    "bottomHeight_mode",
    "bottomHeight_offset",
    "bottomHeight_value",
]

SETUP_SPIKE_NAMES = [
    "job_stockFixedX",
    "job_stockFixedY",
    "job_stockFixedZ",
    "stockZHigh",
    "stockZLow",
    "surfaceZHigh",
    "surfaceZLow",
]

# Handlers must be owned at module level or Python collects them and
# the add-in goes deaf.
_handlers = []
_app = None
_ui = None
_palette = None
_timer = None
_report_lines = []
_hello = {"received": False, "pageBuild": None}


def _log_path():
    return os.path.join(tempfile.gettempdir(), SPIKE_LOG_NAME)


def _log(line):
    """Record one line in the report and in the log file."""
    text = str(line)
    _report_lines.append(text)
    try:
        with open(_log_path(), "a", encoding="utf-8") as handle:
            handle.write(text + "\n")
    except Exception:
        pass


def _log_error(context):
    _log("ERROR in " + context)
    _log(traceback.format_exc())


def _clip(value, limit=300):
    text = repr(value)
    return text if len(text) <= limit else text[:limit] + "...[clipped]"


# ---------------------------------------------------------------------------
# Guarded probes.
# ---------------------------------------------------------------------------


def _probe_parameter(owner, name):
    """Log hit or miss for one parameter name, with value and expression."""
    try:
        parameter = owner.parameters.itemByName(name)
    except Exception:
        parameter = None
    if parameter is None:
        _log("  MISS " + name)
        return
    raw = expression = None
    try:
        raw = parameter.value.value
    except Exception:
        pass
    try:
        expression = parameter.expression
    except Exception:
        pass
    _log("  HIT  " + name + " raw=" + _clip(raw) + " expr=" + _clip(expression))


def _first_operation(cam):
    try:
        for setup in cam.setups:
            for operation in setup.allOperations:
                return setup, operation
    except Exception:
        _log_error("_first_operation")
    return None, None


def _probe_strategies(cam):
    _log("-- strategies of every operation --")
    try:
        for setup in cam.setups:
            for operation in setup.allOperations:
                by_attribute = None
                try:
                    by_attribute = getattr(operation, "strategy", None)
                except Exception:
                    pass
                by_parameter = None
                try:
                    parameter = operation.parameters.itemByName("strategy")
                    if parameter is not None:
                        by_parameter = parameter.value.value
                except Exception:
                    pass
                _log(
                    "  "
                    + _clip(operation.name)
                    + " attribute=" + _clip(by_attribute)
                    + " parameter=" + _clip(by_parameter)
                )
    except Exception:
        _log_error("_probe_strategies")


def _probe_parameter_names(owner, label):
    _log("-- every parameter internal name of " + label + " --")
    try:
        parameters = owner.parameters
        _log("  count=" + str(parameters.count))
        names = []
        for index in range(parameters.count):
            try:
                names.append(parameters.item(index).name)
            except Exception:
                names.append("<unreadable at " + str(index) + ">")
        _log("  " + json.dumps(names))
    except Exception:
        _log_error("_probe_parameter_names " + label)


def _probe_tool_json(operation):
    _log("-- tool JSON of the first operation --")
    try:
        tool = operation.tool
        if tool is None:
            _log("  no tool object")
            return
        try:
            _log("  " + _clip(tool.toJson(), 4000))
        except Exception:
            _log("  toJson failed, probing tool_ parameters instead")
    except Exception:
        _log_error("_probe_tool_json")


def _probe_machine(setup):
    _log("-- setup machine and spindle --")
    try:
        machine = setup.machine
        if machine is None:
            _log("  no machine on the setup")
            return
        _log("  machine type=" + type(machine).__name__)
        for attribute in dir(machine):
            if attribute.startswith("_"):
                continue
            try:
                value = getattr(machine, attribute)
            except Exception:
                value = "<raised>"
            if callable(value):
                continue
            _log("  machine." + attribute + " = " + _clip(value))
            # Anything spindle-shaped gets one level of detail, for
            # protocol.md item 6: spindle power and torque.
            if "spindle" in attribute.lower():
                for inner in dir(value):
                    if inner.startswith("_"):
                        continue
                    try:
                        inner_value = getattr(value, inner)
                    except Exception:
                        inner_value = "<raised>"
                    if callable(inner_value):
                        continue
                    _log(
                        "    spindle." + inner + " = " + _clip(inner_value)
                    )
        # The spindle does not hang off the machine directly. It sits on
        # the kinematics part with partType 2, the head (confirmed
        # 2026-09-01, spike-results-windows.md section 9). Walk the tree
        # so the Mac log carries the same reading.
        _probe_kinematics_spindle(machine)
    except Exception:
        _log_error("_probe_machine")


def _probe_kinematics_spindle(machine):
    """Log the MachineSpindle found under the kinematics head part."""
    try:
        parts = machine.kinematics.parts
    except Exception:
        _log("  machine.kinematics.parts unreadable")
        return
    pending = []
    try:
        pending = [parts.item(i) for i in range(parts.count)]
    except Exception:
        _log("  kinematics parts not iterable")
        return
    while pending:
        part = pending.pop(0)
        try:
            part_type = part.partType
        except Exception:
            part_type = None
        if part_type == 2:
            try:
                spindle = part.spindle
            except Exception:
                spindle = None
            if spindle is None:
                _log("  head part has no spindle")
                continue
            for name in (
                "description", "minSpeed", "maxSpeed", "power",
                "peakTorque", "peakTorqueSpeed",
            ):
                try:
                    _log("  kinematics spindle." + name + " = " + _clip(getattr(spindle, name)))
                except Exception:
                    _log("  kinematics spindle." + name + " raised")
        try:
            children = part.children
            pending.extend(children.item(i) for i in range(children.count))
        except Exception:
            pass


def _probe_feed_write(operation):
    """Write tool_feedCutting by expression, read back, restore."""
    _log("-- expression write of tool_feedCutting --")
    try:
        parameter = operation.parameters.itemByName("tool_feedCutting")
        if parameter is None:
            _log("  tool_feedCutting is missing, no write test possible")
            return
        old_expression = parameter.expression
        old_raw = parameter.value.value
        _log("  before: raw=" + _clip(old_raw) + " expr=" + _clip(old_expression))
        parameter.expression = "1234 mm/min"
        # The write landed. From here the restore must run even when
        # a read-back raises, and a failed restore is reported loudly
        # in the report text (review finding, 2026-09-01).
        try:
            new_raw = parameter.value.value
            new_expression = parameter.expression
            _log("  after 1234 mm/min: raw=" + _clip(new_raw) + " expr=" + _clip(new_expression))
            # Confirmed 2026-09-01, spike-results-windows.md section
            # 5: the raw feed is mm/min, so the ratio reads 1.0 on
            # Windows. The Mac log shows whether it holds there.
            _log(
                "  unit factor check: raw/1234="
                + _clip(float(new_raw) / 1234.0 if new_raw else None)
                + " (1.0 means internal mm/min, as on Windows)"
            )
        finally:
            try:
                parameter.expression = old_expression
                _log("  restored: expr=" + _clip(parameter.expression))
            except Exception:
                _log(
                    "  RESTORE FAILED: tool_feedCutting still carries "
                    "the test value 1234 mm/min. Undo, or set the old "
                    "value back by hand: " + _clip(old_expression)
                )
                _log(traceback.format_exc())
    except Exception:
        _log_error("_probe_feed_write")


def _probe_document():
    """Run every CAM probe. Main thread, from run()."""
    try:
        document = _app.activeDocument
        if document is None:
            _log("no active document")
            return
        product = document.products.itemByProductType("CAMProductType")
        if product is None:
            _log("the active document has no CAM product")
            return
        cam = adsk.cam.CAM.cast(product)

        _probe_strategies(cam)

        setup, operation = _first_operation(cam)
        if operation is None:
            _log("no operation found, the parameter probes need one")
            return

        _probe_parameter_names(operation, "the first operation")
        _probe_tool_json(operation)

        _log("-- guessed names on the first operation (protocol.md: spike) --")
        for name in OPERATION_SPIKE_NAMES:
            _probe_parameter(operation, name)

        _log("-- confirmed names, raw values next to dialog values --")
        for name in OPERATION_CONFIRMED_NAMES:
            _probe_parameter(operation, name)

        _probe_parameter_names(setup, "the first setup")
        _log("-- guessed names on the first setup --")
        for name in SETUP_SPIKE_NAMES:
            _probe_parameter(setup, name)

        _probe_machine(setup)
        _probe_feed_write(operation)
    except Exception:
        _log_error("_probe_document")


# ---------------------------------------------------------------------------
# Palette and messaging.
# ---------------------------------------------------------------------------


class _HtmlHandler(adsk.core.HTMLEventHandler):
    def notify(self, args):
        try:
            html_args = adsk.core.HTMLEventArgs.cast(args)
            _log("page message: action=" + _clip(html_args.action) + " data=" + _clip(html_args.data, 500))
            # The page's adsk.fusionSendData resolves to this string.
            # An empty string means no handler is attached (section
            # 11, wait-code item 3), so every message gets an answer.
            try:
                html_args.returnData = json.dumps(
                    {"ok": True, "type": html_args.action}
                )
            except Exception:
                _log_error("returnData")
            if html_args.action == "hello":
                _hello["received"] = True
                try:
                    _hello["pageBuild"] = json.loads(html_args.data).get(
                        "pageBuild"
                    )
                except Exception:
                    pass
                # Item 3: one message each way. The page may ignore an
                # unknown type, arrival is what the spike proves.
                _palette.sendInfoToHTML(
                    "ping", json.dumps({"protocol": 1, "type": "ping"})
                )
                _log("ping sent")
        except Exception:
            _log_error("_HtmlHandler")


class _ReportHandler(adsk.core.CustomEventHandler):
    def notify(self, _args):
        try:
            _show_report()
        except Exception:
            _log_error("_ReportHandler")


def _open_palette():
    global _palette
    existing = _ui.palettes.itemById(PANEL_ID)
    if existing is not None:
        try:
            existing.deleteMe()
        except Exception:
            pass
    # The ninth argument selects the Qt WebEngine browser, which the
    # promise-based adsk.fusionSendData needs (section 11, wait-code
    # item 2).
    _palette = _ui.palettes.add(
        PANEL_ID, "WSF spike", PANEL_URL, True, True, True, 840, 640, True
    )
    _palette.dockingState = adsk.core.PaletteDockingStates.PaletteDockStateRight
    handler = _HtmlHandler()
    _handlers.append(handler)
    _palette.incomingFromHTML.add(handler)
    _log("palette opened on " + PANEL_URL)


def _show_report():
    """The ten seconds are up: finish the report. Main thread."""
    if _hello["received"]:
        _log(
            "hello: RECEIVED inside ten seconds, pageBuild="
            + _clip(_hello["pageBuild"])
        )
    else:
        _log("hello: NOT received inside ten seconds")
    _log("look at the panel now: do the fonts and components render?")
    _log("spike finished, full report in " + _log_path())

    block = "\n".join(_report_lines)
    if len(block) > 6000:
        block = block[:6000] + "\n...[clipped, the log file has everything]"
    _ui.messageBox(block, "WSF spike report")


# ---------------------------------------------------------------------------
# Entry points.
# ---------------------------------------------------------------------------


def run(_context):
    global _app, _ui, _timer
    try:
        _app = adsk.core.Application.get()
        _ui = _app.userInterface

        _log("==== WSF spike run ====")
        _log("platform=" + platform.platform())
        _log("fusion version=" + str(_app.version))

        # The report event: the timer thread only fires it, the
        # handler runs on the main thread.
        try:
            _app.unregisterCustomEvent(EVENT_REPORT)
        except Exception:
            pass
        event = _app.registerCustomEvent(EVENT_REPORT)
        report_handler = _ReportHandler()
        _handlers.append(report_handler)
        event.add(report_handler)

        _open_palette()

        app = _app
        _timer = threading.Timer(
            HELLO_WAIT_SECONDS,
            lambda: app.fireCustomEvent(EVENT_REPORT, ""),
        )
        _timer.daemon = True
        _timer.start()

        _probe_document()
        _log("probes done, waiting ten seconds for hello")
    except Exception:
        _log_error("run")
        if _ui is not None:
            _ui.messageBox(
                "The spike failed. The log file has the details:\n"
                + _log_path()
            )


def stop(_context):
    global _palette, _timer
    try:
        if _timer is not None:
            try:
                _timer.cancel()
            except Exception:
                pass
            _timer = None
        palette = _ui.palettes.itemById(PANEL_ID)
        if palette is not None:
            palette.deleteMe()
        _palette = None
        try:
            _app.unregisterCustomEvent(EVENT_REPORT)
        except Exception:
            pass
        _handlers.clear()
        _log("spike stopped clean")
    except Exception:
        _log_error("stop")
