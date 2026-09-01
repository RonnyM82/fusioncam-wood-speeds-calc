"""Builds the job message: the raw facts of the active document.

The wire shapes come from fusion-addin/protocol.md. The rules that
govern every reader here:

1. A fact the add-in cannot read is None, never omitted and never
   guessed. The page treats a null it needs as a reason to refuse
   that operation with a plain sentence.
2. Python ships raw facts only. It never decides machining policy
   (decision A2, 2026-09-01). The depth arithmetic, the mapping and
   the tool matching all live in js/fusion/ on the page.
3. Unit conversion happens in units.py alone.
"""

import hashlib
import json

import adsk.cam
import adsk.core
import adsk.fusion

from . import constants, log, memory, units

# The job counter. A new snapshot always carries a new jobId, an
# increasing integer kept on this module (protocol.md, job).
_job_counter = 0
_current_job_id = None

# Raw-fact hashes for the current job only, keyed by opId. apply.py
# compares them against a fresh read to detect an operation that
# changed after the snapshot. A stale job is rejected before hashes
# matter, so only the latest job's hashes are kept.
_op_hashes = {}

# The document the current job snapshotted, and its identity token.
# A document-scope persist may only land in this document (review
# finding, 2026-09-01).
_current_document = None
_current_document_token = None


def current_job_id():
    """Return the jobId of the latest snapshot, or None."""
    return _current_job_id


def stored_hash(job_id, op_id_value):
    """Return the snapshot-time hash for one operation, or None."""
    if job_id != _current_job_id:
        return None
    return _op_hashes.get(op_id_value)


def document_token(document):
    """Return an identity token for a document, or None.

    The two attribute names live in constants.py
    (DOC_IDENTITY_CREATION_ID, DOC_IDENTITY_DATA_FILE). Confirmed
    2026-09-01, spike-results-windows.md section 8: both read on a
    saved document. SPIKE_CONFIRM: identity on an unsaved document.
    It may expose neither, and then the token is None.
    """
    if document is None:
        return None
    try:
        creation_id = getattr(
            document, constants.DOC_IDENTITY_CREATION_ID, None
        )
        if creation_id:
            return "creation:" + str(creation_id)
    except Exception:
        pass
    try:
        data_file = getattr(document, constants.DOC_IDENTITY_DATA_FILE, None)
        if data_file is not None and data_file.id:
            return "datafile:" + str(data_file.id)
    except Exception:
        pass
    return None


def doc_persist_target(app):
    """Return the snapshotted document while it is still active, else None.

    A document-scope persist may only land in the document the current
    job snapshotted (review finding, 2026-09-01). The caller refuses
    and logs when this returns None.
    """
    if _current_document is None:
        return None
    try:
        active = app.activeDocument
    except Exception:
        return None
    if active is None:
        return None
    active_token = document_token(active)
    # On a match the FRESH active wrapper returns, not the cached one:
    # a document closed and reopened between snapshot and persist can
    # leave the cached wrapper stale (verifier finding, 2026-09-01).
    if _current_document_token is not None:
        if active_token == _current_document_token:
            return active
        return None
    if active_token is None:
        # Neither document carries a readable token. The API object
        # comparison is the last resort. A comparison that fails or
        # raises refuses, it never guesses.
        try:
            if active == _current_document:
                return active
        except Exception:
            pass
    return None


def get_cam(app):
    """Return the CAM product of the active document, or None."""
    try:
        document = app.activeDocument
        if document is None:
            return None
        product = document.products.itemByProductType("CAMProductType")
        if product is None:
            return None
        return adsk.cam.CAM.cast(product)
    except Exception:
        log.log_exception("snapshot.get_cam")
        return None


# ---------------------------------------------------------------------------
# Safe parameter readers. Each returns None on any failure.
# ---------------------------------------------------------------------------


def get_parameter(owner, name):
    """Return the named CAM parameter of an operation or setup, or None."""
    try:
        parameters = owner.parameters
        if parameters is None:
            return None
        return parameters.itemByName(name)
    except Exception:
        return None


def read_raw(owner, name):
    """Return a parameter's raw value in internal units, or None."""
    try:
        parameter = get_parameter(owner, name)
        if parameter is None:
            return None
        return parameter.value.value
    except Exception:
        return None


def read_expression(owner, name):
    """Return a parameter's expression string, or None."""
    try:
        parameter = get_parameter(owner, name)
        if parameter is None:
            return None
        return parameter.expression
    except Exception:
        return None


def read_number(owner, name):
    """Return a unitless numeric parameter as a float, or None."""
    value = read_raw(owner, name)
    try:
        return None if value is None else float(value)
    except Exception:
        return None


def read_int(owner, name):
    """Return an integer parameter, or None."""
    value = read_raw(owner, name)
    try:
        return None if value is None else int(value)
    except Exception:
        return None


def read_bool(owner, name):
    """Return a boolean parameter, or None."""
    value = read_raw(owner, name)
    return None if value is None else bool(value)


def read_string(owner, name):
    """Return a string or choice parameter as a string, or None."""
    value = read_raw(owner, name)
    return None if value is None else str(value)


def read_length_mm(owner, name):
    """Return a length parameter in millimetres, or None."""
    value = read_raw(owner, name)
    try:
        return units.internal_length_to_mm(value)
    except Exception:
        return None


def read_feed_mm_min(owner, name):
    """Return a feed parameter in millimetres per minute, or None."""
    value = read_raw(owner, name)
    try:
        return units.internal_feed_to_mm_min(value)
    except Exception:
        return None


def read_rpm(owner, name):
    """Return a spindle-speed parameter in rpm, or None."""
    value = read_raw(owner, name)
    try:
        return units.internal_rpm_to_rpm(value)
    except Exception:
        return None


def read_angle_deg(owner, name):
    """Return an angle parameter in degrees, or None."""
    value = read_raw(owner, name)
    try:
        return units.internal_angle_to_deg(value)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Identity.
# ---------------------------------------------------------------------------


def op_id(operation):
    """Return the stable id of an operation, or None.

    Confirmed 2026-09-01, spike-results-windows.md section 8:
    OperationBase.operationId is the id. It is unique in the document,
    it does not change on reorder or reparent, and it survives save
    and reload. Neither entityToken nor id exists on an operation.
    This is the single place the choice lives.
    """
    try:
        return str(operation.operationId)
    except Exception:
        return None


def setup_id(setup, index):
    """Return the stable id of a setup, else a positional fallback.

    Confirmed 2026-09-01, spike-results-windows.md section 8: the
    setup carries operationId too.
    """
    try:
        return str(setup.operationId)
    except Exception:
        return "s" + str(index + 1)


def find_operation(cam, wanted_id):
    """Return the operation whose id matches, or None.

    Operations.itemByOperationId is the fast lookup (section 8). It
    takes the integer form of the id. The walk over allOperations is
    the fallback, so an operation inside a folder is still found.
    """
    wanted_int = None
    try:
        wanted_int = int(wanted_id)
    except (TypeError, ValueError):
        wanted_int = None
    try:
        for setup in cam.setups:
            if wanted_int is not None:
                try:
                    found = setup.operations.itemByOperationId(wanted_int)
                except Exception:
                    found = None
                if found is not None and op_id(found) == wanted_id:
                    return found
            for operation in setup.allOperations:
                if op_id(operation) == wanted_id:
                    return operation
    except Exception:
        log.log_exception("snapshot.find_operation")
    return None


def read_strategy(operation):
    """Return the strategy id string of an operation, or None.

    Confirmed 2026-09-01, spike-results-windows.md section 1: the
    strategy attribute returns the id string on an existing operation,
    the same string Operations.createInput accepts. The strategy
    parameter is the fallback.
    """
    try:
        value = getattr(operation, "strategy", None)
        if isinstance(value, str) and value:
            return value
    except Exception:
        pass
    return read_string(operation, constants.PARAM_STRATEGY)


# ---------------------------------------------------------------------------
# Operation pieces.
# ---------------------------------------------------------------------------


def _read_flag(operation, names):
    """Return the first readable boolean attribute in names, or None."""
    for name in names:
        try:
            value = getattr(operation, name, None)
            if value is not None:
                return bool(value)
        except Exception:
            pass
    return None


def read_tool(operation):
    """Return the tool shape from the operation's tool_ parameters."""
    return {
        "typeString": read_string(operation, constants.PARAM_TOOL_TYPE),
        "diameterMm": read_length_mm(operation, constants.PARAM_TOOL_DIAMETER),
        "cornerRadiusMm": read_length_mm(
            operation, constants.PARAM_TOOL_CORNER_RADIUS
        ),
        "flutes": read_int(operation, constants.PARAM_TOOL_FLUTES),
        "fluteLengthMm": read_length_mm(
            operation, constants.PARAM_TOOL_FLUTE_LENGTH
        ),
        "shoulderLengthMm": read_length_mm(
            operation, constants.PARAM_TOOL_SHOULDER_LENGTH
        ),
        "vendor": read_string(operation, constants.PARAM_TOOL_VENDOR),
        "productId": read_string(operation, constants.PARAM_TOOL_PRODUCT_ID),
        "description": read_string(operation, constants.PARAM_TOOL_DESCRIPTION),
        "comment": read_string(operation, constants.PARAM_TOOL_COMMENT),
    }


def _read_first(reader, operation, names):
    """Return the first non-None reading among names, or None.

    Some parameters carry one name on one strategy and another name
    on the next (spike-results-windows.md section 2). The reader is
    one of the read_* helpers above.
    """
    for name in names:
        value = reader(operation, name)
        if value is not None:
            return value
    return None


def read_params(operation):
    """Return the cut parameters shape. A missing parameter is None.

    Names confirmed 2026-09-01, spike-results-windows.md section 2.
    The stepover is maximumStepover on the 2D strategies and stepover
    on the 3D parallel. The finishing switch is
    doMultipleFinishingPasses on the contour and doFinishingPasses on
    the pocket. useStockToLeave is additive (protocol.md, no bump).
    """
    return {
        "stepdownMm": read_length_mm(operation, constants.PARAM_MAX_STEPDOWN),
        "doMultipleDepths": read_bool(
            operation, constants.PARAM_DO_MULTIPLE_DEPTHS
        ),
        "stepoverMm": _read_first(
            read_length_mm,
            operation,
            (constants.PARAM_STEPOVER, constants.PARAM_STEPOVER_3D),
        ),
        "optimalLoadMm": read_length_mm(
            operation, constants.PARAM_OPTIMAL_LOAD
        ),
        "useStockToLeave": read_bool(
            operation, constants.PARAM_USE_STOCK_TO_LEAVE
        ),
        "stockToLeaveMm": read_length_mm(
            operation, constants.PARAM_STOCK_TO_LEAVE
        ),
        "verticalStockToLeaveMm": read_length_mm(
            operation, constants.PARAM_VERTICAL_STOCK_TO_LEAVE
        ),
        "finishing": {
            "enabled": _read_first(
                read_bool,
                operation,
                (
                    constants.PARAM_FINISHING_ENABLED_CONTOUR,
                    constants.PARAM_FINISHING_ENABLED_POCKET,
                ),
            ),
            "stepoverMm": read_length_mm(
                operation, constants.PARAM_FINISHING_STEPOVER
            ),
            "passes": read_int(operation, constants.PARAM_FINISHING_PASSES),
        },
        "direction": read_string(operation, constants.PARAM_DIRECTION),
        "compensation": read_string(operation, constants.PARAM_COMPENSATION),
        "rampAngleDeg": read_angle_deg(operation, constants.PARAM_RAMP_ANGLE),
    }


def read_heights(operation):
    """Return the heights shape: mode, offset and resolved value.

    Fusion resolves each height into a computed value, so the page
    does the depth arithmetic and Python does none (plan, part 3,
    2026-09-01).
    """
    return {
        "top": {
            "mode": read_string(operation, constants.PARAM_TOP_MODE),
            "offsetMm": read_length_mm(operation, constants.PARAM_TOP_OFFSET),
            "zMm": read_length_mm(operation, constants.PARAM_TOP_VALUE),
        },
        "bottom": {
            "mode": read_string(operation, constants.PARAM_BOTTOM_MODE),
            "offsetMm": read_length_mm(
                operation, constants.PARAM_BOTTOM_OFFSET
            ),
            "zMm": read_length_mm(operation, constants.PARAM_BOTTOM_VALUE),
        },
    }


def read_current_feeds(operation):
    """Return the operation's current speeds and feeds."""
    return {
        "rpm": read_rpm(operation, constants.PARAM_SPINDLE_SPEED),
        "cuttingMmMin": read_feed_mm_min(
            operation, constants.PARAM_FEED_CUTTING
        ),
        "plungeMmMin": read_feed_mm_min(operation, constants.PARAM_FEED_PLUNGE),
        "rampMmMin": read_feed_mm_min(operation, constants.PARAM_FEED_RAMP),
        "leadInMmMin": read_feed_mm_min(operation, constants.PARAM_FEED_ENTRY),
        "leadOutMmMin": read_feed_mm_min(operation, constants.PARAM_FEED_EXIT),
    }


def read_operation(operation):
    """Return one full operation shape from protocol.md."""
    name = None
    try:
        name = operation.name
    except Exception:
        pass
    return {
        "opId": op_id(operation),
        "name": name,
        "strategy": read_strategy(operation),
        "suppressed": _read_flag(operation, ("isSuppressed",)),
        # Confirmed 2026-09-01, spike-results-windows.md "Other
        # readings": isToolpathValid reports the toolpath. isValid is
        # the API object's own validity and stays a fallback only.
        "isValid": _read_flag(operation, ("isToolpathValid", "isValid")),
        "hasToolpath": _read_flag(operation, ("hasToolpath",)),
        "tool": read_tool(operation),
        "params": read_params(operation),
        "heights": read_heights(operation),
        "currentFeeds": read_current_feeds(operation),
    }


def read_stock(setup):
    """Return the setup stock shape. Absent values are None.

    The fixed sizes exist only when the stock mode is a fixed box.
    The Z extents are confirmed 2026-09-01, spike-results-windows.md
    section 2. They are relative to the setup WCS origin, whose place
    the setup's wcs_origin_mode and wcs_origin_boxPoint decide.
    """
    return {
        "xMm": read_length_mm(setup, constants.PARAM_STOCK_FIXED_X),
        "yMm": read_length_mm(setup, constants.PARAM_STOCK_FIXED_Y),
        "zMm": read_length_mm(setup, constants.PARAM_STOCK_FIXED_Z),
        "stockTopZMm": read_length_mm(setup, constants.PARAM_STOCK_Z_HIGH),
        "stockBottomZMm": read_length_mm(setup, constants.PARAM_STOCK_Z_LOW),
        "modelTopZMm": read_length_mm(setup, constants.PARAM_MODEL_Z_HIGH),
        "modelBottomZMm": read_length_mm(setup, constants.PARAM_MODEL_Z_LOW),
    }


def _read_attribute(owner, name):
    """Return one attribute of an API object, or None on any failure."""
    try:
        return getattr(owner, name, None)
    except Exception:
        return None


def _read_number_or_none(owner, name):
    """Return a numeric attribute as a float, with 0.0 as None.

    A zero on a machine spindle means the field was left empty, not
    zero power (spike-results-windows.md section 9), so it ships as
    null.
    """
    value = _read_attribute(owner, name)
    try:
        number = None if value is None else float(value)
    except Exception:
        return None
    if number is None or number == 0.0:
        return None
    return number


def _find_head_part(parts, depth=0):
    """Return the kinematics part whose partType is the head, or None.

    Walks parts and their children. The depth cap stops a cycle in a
    malformed tree.
    """
    if parts is None or depth > 16:
        return None
    items = []
    try:
        for index in range(parts.count):
            items.append(parts.item(index))
    except Exception:
        # Not a count-and-item collection. A plain iterable is the
        # other shape the API hands out.
        try:
            items = list(parts)
        except Exception:
            return None
    for part in items:
        if part is None:
            continue
        try:
            if int(part.partType) == constants.MACHINE_HEAD_PART_TYPE:
                return part
        except Exception:
            pass
        found = _find_head_part(_read_attribute(part, "children"), depth + 1)
        if found is not None:
            return found
    return None


def read_machine(setup):
    """Return the setup machine shape. Absent values are None.

    Confirmed 2026-09-01, spike-results-windows.md section 9. The
    spindle hangs off machine.kinematics.parts: the part with the
    head partType carries it. Power is kW, torque Nm, speeds rpm, so
    no unit conversion applies. Additive setup field (protocol.md, no
    bump). Every read is guarded and a failure ships null.
    """
    spindle_shape = {
        "minRpm": None,
        "maxRpm": None,
        "powerKw": None,
        "peakTorqueNm": None,
        "peakTorqueRpm": None,
    }
    shape = {"vendor": None, "model": None, "spindle": spindle_shape}
    machine = _read_attribute(setup, "machine")
    if machine is None:
        return shape
    vendor = _read_attribute(machine, "vendor")
    model = _read_attribute(machine, "model")
    shape["vendor"] = None if vendor is None else str(vendor)
    shape["model"] = None if model is None else str(model)
    kinematics = _read_attribute(machine, "kinematics")
    head = _find_head_part(_read_attribute(kinematics, "parts"))
    spindle = _read_attribute(head, "spindle")
    if spindle is None:
        return shape
    spindle_shape["minRpm"] = _read_number_or_none(spindle, "minSpeed")
    spindle_shape["maxRpm"] = _read_number_or_none(spindle, "maxSpeed")
    spindle_shape["powerKw"] = _read_number_or_none(spindle, "power")
    spindle_shape["peakTorqueNm"] = _read_number_or_none(spindle, "peakTorque")
    spindle_shape["peakTorqueRpm"] = _read_number_or_none(
        spindle, "peakTorqueSpeed"
    )
    return shape


# ---------------------------------------------------------------------------
# Change detection.
# ---------------------------------------------------------------------------


def op_facts_hash(op_dict):
    """Return a cheap hash of one operation's raw facts.

    currentFeeds are excluded on purpose (decision, 2026-09-01): the
    apply batch writes every feed explicitly, so a stale feed cannot
    leak through, and including them would mark every operation as
    changed straight after the add-in's own apply.
    """
    facts = {key: op_dict[key] for key in op_dict if key != "currentFeeds"}
    text = json.dumps(facts, sort_keys=True, default=str)
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Document readers.
# ---------------------------------------------------------------------------


def read_document_units(app):
    """Return "mm" or "in" for display, or None when unreadable.

    Display only: the page computes in millimetres regardless
    (protocol.md, units). Metric defaults map to "mm" and imperial
    defaults map to "in" (decision, 2026-09-01).
    """
    try:
        document = app.activeDocument
        product = document.products.itemByProductType("DesignProductType")
        design = adsk.fusion.Design.cast(product)
        unit = design.unitsManager.defaultLengthUnits
        if unit in ("in", "ft"):
            return "in"
        if unit in ("mm", "cm", "m"):
            return "mm"
        return None
    except Exception:
        return None


def read_document(app):
    """Return the document facts every job and every dump share.

    No jobId bookkeeping happens here, so the dump command can read
    the document without invalidating the panel's current job.
    """
    document_name = None
    fusion_version = None
    try:
        document_name = app.activeDocument.name
    except Exception:
        pass
    try:
        fusion_version = app.version
    except Exception:
        pass

    setups = []
    cam = get_cam(app)
    if cam is not None:
        try:
            for index, setup in enumerate(cam.setups):
                setup_name = None
                try:
                    setup_name = setup.name
                except Exception:
                    pass
                operations = []
                for operation in setup.allOperations:
                    op_dict = read_operation(operation)
                    if op_dict.get("opId") is None:
                        # opId must never ship null (protocol.md, job,
                        # 2026-09-01): drop the operation and log its
                        # name, so Apply never receives a row it
                        # cannot address.
                        log.log(
                            "dropped an operation with no usable "
                            "identity: " + str(op_dict.get("name"))
                        )
                        continue
                    operations.append(op_dict)
                setups.append(
                    {
                        "setupId": setup_id(setup, index),
                        "name": setup_name,
                        "stock": read_stock(setup),
                        "machine": read_machine(setup),
                        "operations": operations,
                    }
                )
        except Exception:
            log.log_exception("snapshot.read_document")

    return {
        "addinVersion": constants.ADDIN_VERSION,
        "fusionVersion": fusion_version,
        "documentUnits": read_document_units(app),
        "documentName": document_name,
        "setups": setups,
    }


def build_job(app):
    """Return a fresh job message and remember its hashes.

    A new snapshot always carries a new jobId. The stored blobs ride
    along verbatim (protocol.md, job).
    """
    global _job_counter, _current_job_id
    global _current_document, _current_document_token

    facts = read_document(app)

    _job_counter += 1
    job_id = str(_job_counter)
    _current_job_id = job_id

    _op_hashes.clear()
    for setup in facts["setups"]:
        for op_dict in setup["operations"]:
            key = op_dict.get("opId")
            if key is not None:
                _op_hashes[key] = op_facts_hash(op_dict)

    document = None
    try:
        document = app.activeDocument
    except Exception:
        pass
    # The snapshotted document identity rides next to the job id, so
    # a document-scope persist can refuse a switched document (review
    # finding, 2026-09-01).
    _current_document = document
    _current_document_token = document_token(document)

    job = {"jobId": job_id}
    job.update(facts)
    job["memory"] = {
        "docBlob": memory.read_doc_blob(document),
        "userBlob": memory.read_user_blob(),
    }
    operation_count = sum(len(s["operations"]) for s in facts["setups"])
    log.log("built job " + job_id + " with " + str(operation_count) + " operations")
    return job
