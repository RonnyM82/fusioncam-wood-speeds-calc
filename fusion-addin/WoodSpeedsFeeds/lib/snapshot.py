"""Builds the job message: the raw facts of the active document.

The wire shapes come from fusion-addin/protocol.md. The rules that
govern every reader here:

1. A fact the add-in cannot read is None, never omitted and never
   guessed. The page treats a null it needs as a reason to refuse
   that operation with a plain sentence.
2. Python ships raw facts only. It never decides machining policy
   (decision A2, 2026-09-01). The depth arithmetic, the mapping and
   the tool matching all live in js/fusion/ on the page. Resolving a
   height from the selected geometry (read_frame, _read_height,
   2026-09-02) is a reading, not a policy: it is the number Fusion
   itself uses and never writes into the parameter.
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


# ---------------------------------------------------------------------------
# The setup frame. A height whose mode rests on selected geometry never
# reaches the _value parameter (constants.GEOMETRY_HEIGHT_MODES), so the
# add-in resolves it from the selection itself. The API hands selections
# out in model space, and the setup frame takes them to the space every
# other height is in (spike-results-windows.md section 12, 2026-09-02).
# ---------------------------------------------------------------------------


def _box_corners(box):
    """Yield the eight corners of a BoundingBox3D."""
    low = box.minPoint
    high = box.maxPoint
    for x in (low.x, high.x):
        for y in (low.y, high.y):
            for z in (low.z, high.z):
                yield adsk.core.Point3D.create(x, y, z)


def _frame_z(frame, point):
    """Return the setup-frame Z of a model-space point, in centimetres."""
    ox, oy, oz = frame["origin"]
    zx, zy, zz = frame["z"]
    return (point.x - ox) * zx + (point.y - oy) * zy + (point.z - oz) * zz


def _items(collection):
    """Return the members of an API collection or vector as a list."""
    if collection is None:
        return []
    try:
        return [collection.item(i) for i in range(collection.count)]
    except Exception:
        pass
    try:
        return list(collection)
    except Exception:
        return []


def _sketch_points(entity):
    """Return model-space points along a sketch entity, or None.

    A sketch curve's boundingBox read as an empty box on every circle
    of the test document (section 12), so the box is no use there. Its
    worldGeometry is the curve in model space, and the curve evaluator
    strokes it to within a hundredth of a millimetre. A sketch point's
    worldGeometry is the point itself.
    """
    try:
        geometry = entity.worldGeometry
    except Exception:
        return None
    if geometry is None:
        return None
    if isinstance(geometry, adsk.core.Point3D):
        return [geometry]
    try:
        evaluator = geometry.evaluator
        ok, start, end = evaluator.getParameterExtents()
        if not ok:
            return None
        ok, points = evaluator.getStrokes(start, end, 0.001)
        if not ok or not points:
            return None
        return list(points)
    except Exception:
        return None


def _entity_z_range(entity, frame):
    """Return (low, high) setup-frame Z in centimetres of one entity, or None.

    A B-Rep face, edge, vertex or body carries a model-space bounding
    box, and its eight corners go through the frame. A sketch entity
    goes through its world geometry instead (_sketch_points), and one
    whose geometry does not read is None rather than a box in the wrong
    space. The extremes come back equal for a planar contour, apart for
    a chain that climbs.
    """
    if _read_attribute(entity, "parentSketch") is not None:
        points = _sketch_points(entity)
        if points is None:
            return None
    else:
        try:
            box = entity.boundingBox
        except Exception:
            return None
        if box is None:
            return None
        points = list(_box_corners(box))
    values = [_frame_z(frame, point) for point in points]
    if not values:
        return None
    return (min(values), max(values))


def _entities_z_range(entities, frame):
    """Return the combined (low, high) of several entities, or None."""
    low = None
    high = None
    for entity in entities:
        found = _entity_z_range(entity, frame)
        if found is None:
            continue
        low = found[0] if low is None else min(low, found[0])
        high = found[1] if high is None else max(high, found[1])
    if low is None:
        return None
    return (low, high)


def read_frame(setup):
    """Return the setup frame for height resolution, or None.

    Confirmed 2026-09-02, spike-results-windows.md section 12:
    Setup.workCoordinateSystem is a Matrix3D, and its translation read
    in millimetres while every bounding box reads in centimetres. The
    frame is trusted only after a check: the setup models, taken
    through it, must reproduce surfaceZLow and surfaceZHigh. Without
    models the stock solids stand in against stockZLow and stockZHigh.
    Each translation unit factor is tried in turn. A frame that passes
    no check is None, and every geometry height then ships null: a
    refusal, never a guess.

    The frame is {"origin": (x, y, z) in centimetres, "z": unit vector}.
    """
    try:
        matrix = setup.workCoordinateSystem
        origin, _x_axis, _y_axis, z_axis = matrix.getAsCoordinateSystem()
    except Exception:
        log.log_exception("snapshot.read_frame")
        return None
    z = (z_axis.x, z_axis.y, z_axis.z)
    checks = (
        ("models", constants.PARAM_MODEL_Z_LOW, constants.PARAM_MODEL_Z_HIGH),
        (
            "stockSolids",
            constants.PARAM_STOCK_Z_LOW,
            constants.PARAM_STOCK_Z_HIGH,
        ),
    )
    tolerance = constants.FRAME_CHECK_TOLERANCE_CM
    checked = False
    for factor in constants.FRAME_TRANSLATION_FACTORS:
        frame = {
            "origin": (origin.x * factor, origin.y * factor, origin.z * factor),
            "z": z,
        }
        for attribute, low_name, high_name in checks:
            expected_low = read_raw(setup, low_name)
            expected_high = read_raw(setup, high_name)
            if expected_low is None or expected_high is None:
                continue
            bodies = _items(_read_attribute(setup, attribute))
            found = _entities_z_range(bodies, frame)
            if found is None:
                continue
            checked = True
            if (
                abs(found[0] - float(expected_low)) <= tolerance
                and abs(found[1] - float(expected_high)) <= tolerance
            ):
                return frame
    log.log(
        "setup frame not verified"
        + ("" if checked else " (nothing to check it against)")
        + ": geometry heights ship null"
    )
    return None


def _selection_entities(parameter):
    """Return the entities a selection parameter holds, or an empty list.

    A 2D contour selection (contours, pockets) is a
    CadContours2dParameterValue whose curve selections each carry their
    input geometry: B-Rep edges, sketch curves or a face. A cad object
    selection (holeFaces, the height _ref parameters) is a
    CadObjectParameterValue whose value is the entity list.
    """
    try:
        value = parameter.value
    except Exception:
        return []
    entities = []
    try:
        if isinstance(value, adsk.cam.CadContours2dParameterValue):
            for selection in _items(value.getCurveSelections()):
                entities.extend(_items(selection.inputGeometry))
        elif isinstance(value, adsk.cam.CadObjectParameterValue):
            entities.extend(_items(value.value))
    except Exception:
        log.log_exception("snapshot._selection_entities")
    return entities


def _height_geometry(operation, side, mode):
    """Return the entities a geometry height mode refers to."""
    if mode == constants.HEIGHT_MODE_CONTOUR:
        names = (constants.PARAM_CONTOURS, constants.PARAM_POCKETS)
    elif mode in (
        constants.HEIGHT_MODE_HOLE_TOP,
        constants.HEIGHT_MODE_HOLE_BOTTOM,
    ):
        names = (constants.PARAM_HOLE_FACES,)
    elif mode == constants.HEIGHT_MODE_POINT:
        names = (
            constants.PARAM_TOP_REF if side == "top" else constants.PARAM_BOTTOM_REF,
        )
    else:
        return []
    for name in names:
        parameter = get_parameter(operation, name)
        if parameter is None:
            continue
        entities = _selection_entities(parameter)
        if entities:
            return entities
    return []


def _read_height(operation, side, frame):
    """Return one height shape: mode, offset, resolved Z and its source.

    zSource is "parameter" when Fusion resolved the height into its
    _value parameter, "geometry" when this reader resolved it from the
    selection, and null when neither could. zSpreadMm is the distance
    between the highest and the lowest level the selection offered:
    0 for one level, null unless the source is geometry. The page reads
    both (protocol.md, heights).
    """
    if side == "top":
        mode_name = constants.PARAM_TOP_MODE
        offset_name = constants.PARAM_TOP_OFFSET
        value_name = constants.PARAM_TOP_VALUE
        absolute_name = constants.PARAM_TOP_ABSOLUTE
    else:
        mode_name = constants.PARAM_BOTTOM_MODE
        offset_name = constants.PARAM_BOTTOM_OFFSET
        value_name = constants.PARAM_BOTTOM_VALUE
        absolute_name = constants.PARAM_BOTTOM_ABSOLUTE
    mode = read_string(operation, mode_name)
    offset = read_length_mm(operation, offset_name)
    absolute = read_bool(operation, absolute_name)
    shape = {
        "mode": mode,
        "offsetMm": offset,
        "zMm": None,
        "zSource": None,
        "zSpreadMm": None,
    }
    geometry_mode = mode in constants.GEOMETRY_HEIGHT_MODES
    if absolute is True or (absolute is None and not geometry_mode):
        value = read_length_mm(operation, value_name)
        shape["zMm"] = value
        shape["zSource"] = None if value is None else "parameter"
        return shape
    if not geometry_mode or frame is None or offset is None:
        return shape
    ranges = []
    for entity in _height_geometry(operation, side, mode):
        found = _entity_z_range(entity, frame)
        if found is not None:
            ranges.append(found)
    if not ranges:
        return shape
    lows = [found[0] for found in ranges]
    highs = [found[1] for found in ranges]
    # A hole top is the high end of each hole face and a hole bottom the
    # low end, whichever side asks. A contour or a point takes the
    # extreme its side means: the highest for the top, the lowest for
    # the bottom. The spread covers the levels the mode compares: the
    # hole tops among themselves, the hole bottoms among themselves,
    # and for a contour the whole Z extent of the selection, so a chain
    # that climbs reports it.
    if mode == constants.HEIGHT_MODE_HOLE_TOP:
        level = max(highs)
        spread = max(highs) - min(highs)
    elif mode == constants.HEIGHT_MODE_HOLE_BOTTOM:
        level = min(lows)
        spread = max(lows) - min(lows)
    else:
        level = max(highs) if side == "top" else min(lows)
        spread = max(highs) - min(lows)
    shape["zMm"] = round(units.internal_length_to_mm(level) + offset, 6)
    shape["zSource"] = "geometry"
    shape["zSpreadMm"] = units.internal_length_to_mm(spread)
    return shape


def read_heights(operation, frame=None):
    """Return the heights shape: mode, offset, resolved value and source.

    Fusion resolves a plane-mode height into a computed value and the
    add-in resolves a geometry-mode height through the setup frame
    (2026-09-02). The page does the depth arithmetic and Python does
    none (plan, part 3, 2026-09-01).
    """
    return {
        "top": _read_height(operation, "top", frame),
        "bottom": _read_height(operation, "bottom", frame),
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


def read_operation(operation, frame=None):
    """Return one full operation shape from protocol.md.

    frame is the setup frame from read_frame. read_document passes it
    once per setup. A caller without one, apply.py re-reading a single
    operation for its change check, gets it from the operation's own
    setup, so both reads resolve the same heights and the hashes agree.
    """
    if frame is None:
        setup = _read_attribute(operation, "parentSetup")
        if setup is not None:
            frame = read_frame(setup)
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
        "heights": read_heights(operation, frame),
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
                frame = read_frame(setup)
                for operation in setup.allOperations:
                    op_dict = read_operation(operation, frame)
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
