"""Every Fusion-facing name the add-in depends on, in one place.

The parameter-name table in fusion-addin/protocol.md is the ground
truth for this file. On 2026-09-01 the Fusion connector read every
name below inside Fusion 2704 on Windows and recorded the readings in
fusion-addin/spike-results-windows.md. A name that file confirmed
carries "Confirmed 2026-09-01" and the section number. A fact the
connector could not reach still carries a SPIKE_CONFIRM comment. When
a name is wrong, one edit in this file fixes it everywhere (decision,
2026-09-01).
"""

# ---------------------------------------------------------------------------
# Identity and transport.
# ---------------------------------------------------------------------------

ADDIN_VERSION = "0.1.0"
PROTOCOL_VERSION = 1

# The build tag rides the panel address as a cache-bust key. The
# palette's browser serves a stale copy of the page after an update
# (spike-results-windows.md section 11, wait-code item 6). Bump the
# date on every add-in change that ships.
ADDIN_BUILD = ADDIN_VERSION + "-2026-09-02"

PANEL_ID = "wsfPanel"
PANEL_NAME = "Wood speeds and feeds"
# The palette's opening size in pixels. 420 wide was too narrow for the
# operation cards, so the default doubled (Scott, 2026-09-01, first live
# run). The API sets an opening size only: no documented property fixes
# a minimum, so the page must still read well when the user drags the
# palette narrower.
PANEL_WIDTH = 840
PANEL_HEIGHT = 640
# The add-in version rides the address, so the "too old" screen works
# even when messaging itself is broken (protocol.md, versioning rule 5).
# WoodSpeedsFeeds._panel_url appends "&build=" and "&theme=" at open
# time, because the theme is read from Fusion's preferences then.
# SPIKE_CONFIRM: the live URL round trip. The Windows pass loaded the
# page from a local server only (section 11). The spike add-in serves
# the live URL and the Mac pass.
PANEL_URL = (
    "https://wood.fusioncam.co/fusion.html?protocol="
    + str(PROTOCOL_VERSION)
    + "&addin="
    + ADDIN_VERSION
)

# The Fusion user interface themes that count as dark. The page
# receives "dark" or "light" in the address and sets data-theme from
# it (section 11, wait-code item 8).
DARK_THEME_NAMES = ("DarkBlueUserInterfaceTheme", "DarkGrayUserInterfaceTheme")

# Ten seconds from palette open to the page's hello. On expiry the
# add-in closes the palette and shows OFFLINE_MESSAGE (plan, step 2).
HELLO_TIMEOUT_SECONDS = 10.0
OFFLINE_MESSAGE = (
    "The add-in needs an internet connection to wood.fusioncam.co. "
    "Connect, then run the command again."
)

# ---------------------------------------------------------------------------
# Fusion UI ids.
# ---------------------------------------------------------------------------

# Confirmed 2026-09-01, spike-results-windows.md section 11 (wait-code
# item 9) and "Other readings": CAMEnvironment is the Manufacture
# workspace and CAMActionPanel is its Actions panel on the Milling tab.
WORKSPACE_ID = "CAMEnvironment"
PANEL_HOST_ID = "CAMActionPanel"

CMD_OPEN_ID = "wsfOpenPanel"
CMD_DUMP_ID = "wsfDumpJob"
# The apply command stays out of every toolbar. It exists so one command
# execution wraps the whole write batch in one undo step.
CMD_APPLY_ID = "wsfApplyBatch"

# Custom event ids. Background threads re-enter the main thread through
# these, via app.fireCustomEvent.
EVENT_HELLO_TIMEOUT = "wsfHelloTimeout"
EVENT_REGEN_POLL = "wsfRegenPoll"

# ---------------------------------------------------------------------------
# Memory locations (protocol.md, persist).
# ---------------------------------------------------------------------------

DOC_ATTR_GROUP = "wood-speeds-feeds"
DOC_ATTR_NAME = "docBlob"
USER_DIR_NAME = "wood-speeds-feeds"
USER_FILE_NAME = "user.json"

# ---------------------------------------------------------------------------
# Document identity (persist pinning).
# ---------------------------------------------------------------------------

# The attributes that identify a document, so a document-scope persist
# can refuse when the active document is not the one the current job
# snapshotted (review finding, 2026-09-01). Confirmed 2026-09-01,
# spike-results-windows.md section 8: document.creationId and
# document.dataFile.id both read on a saved document.
# SPIKE_CONFIRM: identity on an unsaved document. No unsaved document
# was allowed in the Windows pass, so the token may be None there.
DOC_IDENTITY_CREATION_ID = "creationId"
DOC_IDENTITY_DATA_FILE = "dataFile"

# ---------------------------------------------------------------------------
# CAM operation parameters: speeds and feeds.
# ---------------------------------------------------------------------------

# Confirmed by the API fact-check of 2026-09-01 and again by the
# connector, spike-results-windows.md section 5.
PARAM_SPINDLE_SPEED = "tool_spindleSpeed"
PARAM_SURFACE_SPEED = "tool_surfaceSpeed"
PARAM_FEED_CUTTING = "tool_feedCutting"
# Read only. apply.py never writes it: Fusion links the feed per tooth
# to the cutting feed and the last write becomes the literal, so a
# per-tooth write rewrites the cutting feed (section 6).
PARAM_FEED_PER_TOOTH = "tool_feedPerTooth"

# Confirmed 2026-09-01, spike-results-windows.md section 2: present on
# all seven strategies. On a drill only the plunge feed is editable.
PARAM_FEED_PLUNGE = "tool_feedPlunge"
PARAM_FEED_RAMP = "tool_feedRamp"
PARAM_FEED_ENTRY = "tool_feedEntry"
PARAM_FEED_EXIT = "tool_feedExit"

# The strategy whose apply row writes the spindle speed and the plunge
# feed only (section 2: the cutting feed is not editable on a drill).
STRATEGY_DRILL = "drill"

# ---------------------------------------------------------------------------
# CAM operation parameters: the cut.
# ---------------------------------------------------------------------------

# Confirmed 2026-09-01, spike-results-windows.md section 2. The pocket
# and contour width is maximumStepover. Only the 3D parallel has
# stepover, so snapshot.read_params reads the first, then the second.
PARAM_STEPOVER = "maximumStepover"
PARAM_STEPOVER_3D = "stepover"
PARAM_OPTIMAL_LOAD = "optimalLoad"
PARAM_MAX_STEPDOWN = "maximumStepdown"
PARAM_DO_MULTIPLE_DEPTHS = "doMultipleDepths"
PARAM_STOCK_TO_LEAVE = "stockToLeave"
PARAM_VERTICAL_STOCK_TO_LEAVE = "verticalStockToLeave"
# The switch in front of both stock-to-leave values. When it is off,
# both raw values read 0.0 (section 2).
PARAM_USE_STOCK_TO_LEAVE = "useStockToLeave"
PARAM_FINISHING_STEPOVER = "finishingStepover"
PARAM_RAMP_ANGLE = "rampAngle"

# Confirmed 2026-09-01, spike-results-windows.md section 2. The
# finishing switch has one name on the contour and another on the
# pocket. snapshot.read_params reads the first that exists. The pass
# count has one name on both.
PARAM_FINISHING_ENABLED_CONTOUR = "doMultipleFinishingPasses"
PARAM_FINISHING_ENABLED_POCKET = "doFinishingPasses"
PARAM_FINISHING_PASSES = "numberOfFinishingStepovers"

# Confirmed 2026-09-01, spike-results-windows.md sections 2 and 3.
# direction exists on adaptive2d (climb, conventional) and on parallel.
# compensation exists on contour2d and pocket2d (left, right), and
# left is the climb side.
PARAM_DIRECTION = "direction"
PARAM_COMPENSATION = "compensation"

# Confirmed 2026-09-01, spike-results-windows.md section 1. The
# strategy attribute returns the id string on an existing operation.
# snapshot.read_strategy tries the attribute first, then this
# parameter name.
PARAM_STRATEGY = "strategy"

# ---------------------------------------------------------------------------
# CAM operation parameters: heights. Confirmed 2026-09-01, section 2.
# ---------------------------------------------------------------------------

PARAM_TOP_MODE = "topHeight_mode"
PARAM_TOP_OFFSET = "topHeight_offset"
PARAM_TOP_VALUE = "topHeight_value"
PARAM_BOTTOM_MODE = "bottomHeight_mode"
PARAM_BOTTOM_OFFSET = "bottomHeight_offset"
PARAM_BOTTOM_VALUE = "bottomHeight_value"

# Fusion resolves a height into its _value parameter only when the mode
# rests on a plane it knows: a stock or model face, another height, the
# origin. The _absolute flag says so. For the geometry modes below the
# flag reads false, the _value stays 0.0, and Fusion resolves the height
# from the selected geometry at generation time. snapshot.read_heights
# does the same from the selection parameters (confirmed 2026-09-02,
# spike-results-windows.md section 12).
PARAM_TOP_ABSOLUTE = "topHeight_absolute"
PARAM_BOTTOM_ABSOLUTE = "bottomHeight_absolute"
# The selection a "from point" height refers to.
PARAM_TOP_REF = "topHeight_ref"
PARAM_BOTTOM_REF = "bottomHeight_ref"
# The geometry selections: contours on contour2d, pockets on pocket2d,
# adaptive2d and slot, holeFaces on drill (section 12).
PARAM_CONTOURS = "contours"
PARAM_POCKETS = "pockets"
PARAM_HOLE_FACES = "holeFaces"

HEIGHT_MODE_CONTOUR = "from contour"
HEIGHT_MODE_HOLE_TOP = "from hole top"
HEIGHT_MODE_HOLE_BOTTOM = "from hole bottom"
HEIGHT_MODE_POINT = "from point"
GEOMETRY_HEIGHT_MODES = (
    HEIGHT_MODE_CONTOUR,
    HEIGHT_MODE_HOLE_TOP,
    HEIGHT_MODE_HOLE_BOTTOM,
    HEIGHT_MODE_POINT,
)

# Setup.workCoordinateSystem is a Matrix3D. Its translation read in
# millimetres on the millimetre test document while every bounding box
# reads in centimetres (section 12). snapshot.read_frame trusts the
# frame only after it reproduces the setup's own Z extents, and these
# are the translation factors to centimetres it tries, in order:
# millimetres, centimetres, inches. An inch document is untested.
FRAME_TRANSLATION_FACTORS = (0.1, 1.0, 2.54)
# The check tolerance, in centimetres: a hundredth of a millimetre.
FRAME_CHECK_TOLERANCE_CM = 0.001

# ---------------------------------------------------------------------------
# Setup parameters: stock.
# ---------------------------------------------------------------------------

# Confirmed 2026-09-01, spike-results-windows.md section 2. Present
# when the stock mode is a fixed box, absent otherwise. An absent
# value ships as null, never guessed.
PARAM_STOCK_FIXED_X = "job_stockFixedX"
PARAM_STOCK_FIXED_Y = "job_stockFixedY"
PARAM_STOCK_FIXED_Z = "job_stockFixedZ"

# Confirmed 2026-09-01, spike-results-windows.md section 2. The stock
# and model Z extents, relative to the setup WCS origin. The origin
# sits where wcs_origin_mode and wcs_origin_boxPoint put it.
PARAM_STOCK_Z_HIGH = "stockZHigh"
PARAM_STOCK_Z_LOW = "stockZLow"
PARAM_MODEL_Z_HIGH = "surfaceZHigh"
PARAM_MODEL_Z_LOW = "surfaceZLow"

# ---------------------------------------------------------------------------
# Setup machine (spike-results-windows.md section 9).
# ---------------------------------------------------------------------------

# The kinematics part that carries the spindle: partType 2 is the
# head. snapshot.read_machine walks machine.kinematics.parts and their
# children for it.
MACHINE_HEAD_PART_TYPE = 2

# ---------------------------------------------------------------------------
# Tool parameters, read through the operation's parameter list.
# ---------------------------------------------------------------------------

# Confirmed 2026-09-01, spike-results-windows.md section 4: all ten
# exist on all seven strategies. None is editable through the
# operation. Lengths are raw centimetres like every other length.
PARAM_TOOL_TYPE = "tool_type"
PARAM_TOOL_DIAMETER = "tool_diameter"
PARAM_TOOL_CORNER_RADIUS = "tool_cornerRadius"
PARAM_TOOL_FLUTES = "tool_numberOfFlutes"
PARAM_TOOL_FLUTE_LENGTH = "tool_fluteLength"
PARAM_TOOL_SHOULDER_LENGTH = "tool_shoulderLength"
PARAM_TOOL_VENDOR = "tool_vendor"
PARAM_TOOL_PRODUCT_ID = "tool_productId"
PARAM_TOOL_DESCRIPTION = "tool_description"
PARAM_TOOL_COMMENT = "tool_comment"
