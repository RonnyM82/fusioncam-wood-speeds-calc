# Spike results, Windows: the Fusion API facts behind the wood add-in

Status: recorded 2026-09-01 through the Fusion connector (the Fusion MCP
server at 127.0.0.1:27182), not through the spike add-in. Fusion 2704.1.53
on Windows 11 Pro. The connector runs Python inside Fusion, so every reading
below is a firsthand API reading. Nothing in the repo was edited except this
file. A follow-up session folds the verdicts into protocol.md, constants.py,
units.py, snapshot.py, apply.py and fusion-panel.js.

Verdict key: CONFIRMED means the guess holds as written. DIFFERENT means the
guess is wrong and the section says what to change. UNTESTABLE means the
connector cannot reach the fact and says who can.

## The short list of changes

1. Operation identity: use `operationId`. Neither `Operation` nor `Setup`
   has `entityToken` or `id`. As written, `snapshot.op_id()` returns None for
   every operation and the job message ships no operations (section 8).
2. Feeds are stored in mm/min, not cm/min. `units.internal_feed_to_mm_min`
   must not multiply by ten (section 5).
3. Angles are stored in degrees, not radians. `units.internal_angle_to_deg`
   must return the value unchanged (section 5).
4. The page must wait for `window.adsk` before it decides it is outside
   Fusion. The bridge appeared 32 ms after the page's script ran, so the
   current page never sends hello inside Fusion and the add-in's ten-second
   timeout always fires (section 11).
5. The 2D pocket has no `direction`. It uses `compensation` (`left` or
   `right`) like the 2D contour. Only the 2D adaptive has `direction`
   (`climb` or `conventional`) (section 2).
6. The setup Z extents are `stockZHigh`, `stockZLow`, `surfaceZHigh` and
   `surfaceZLow`. The four `job_*Z*` guesses do not exist (section 2).
7. The pocket stepover is `maximumStepover`. `stepover` exists only on the
   3D parallel. The finishing switch is `doFinishingPasses` on the pocket
   and `doMultipleFinishingPasses` on the contour, and the pass count is
   `numberOfFinishingStepovers` on both (section 2).
8. Writing `tool_feedPerTooth` after `tool_feedCutting` turns the cutting
   feed into a derived expression. The last write wins. Write the spindle
   speed, then the cutting feed, and let the feed per tooth follow
   (section 6).

## What the test document carries now

Document "Speeds and Feeds Test Wood" (project "Livetools Fusion Support"),
creationId `454233a6-3b73-4466-b69f-5cc91662ce99`, dataFile id
`urn:adsk.wipprod:dm.lineage:dSFqHvyZSuKhAierDBCy3A`. It had one body
(500 × 600 × 16 mm, a pocket, three holes) and no setup. The design body and
the sketch are untouched. Added:

- One milling setup, "WSF spike setup". Stock mode fixed box, the default
  size the box rounding produced: 500 × 600 × 20 mm, model centred, so the
  stock has a 2 mm skin above and below the model. WCS origin at the stock
  top centre. Machine: "Generic 3-axis" from the local machine library
  (`user://Generic 3-axis.mch`, vendor Matsuura, model Camplete, id
  `cb9b01c6-4736-65ec-4404-72a9991e8b8f`). The two system-library machines
  tried first (CR Onsrud 122C and the Autodesk generic router) refused:
  "Setting a simulation ready machine from an external library is currently
  not supported. Try copying this machine to your local library." Setting the
  machine inside `SetupInput` raised `InternalValidationError
  setMachineResult.has_value()`. Assigning `setup.machine` after creation
  worked for the local machine.
- Seven operations, in this order, all with a valid toolpath. Tools come
  from the local "rigg" libraries.

| Name | Strategy | Tool | Geometry and settings |
|---|---|---|---|
| WSF contour compression multidepth | `contour2d` | 9.5 Compression Cutter (T7) | outer loop of the top face, multiple depths on, stepdown 6 mm, bottom = stock bottom −0.5 mm |
| WSF contour upcut single depth left | `contour2d` | 9.5 up cutt (T8) | same loop, multiple depths off, compensation `left`, bottom = stock bottom −0.5 mm |
| WSF pocket upcut | `pocket2d` | 9.5 up cutt (T8) | pocket floor face, multiple depths on, stepdown 4 mm |
| WSF adaptive upcut | `adaptive2d` | 9.5 up cutt (T8) | pocket floor face, defaults |
| WSF slot compression | `slot` | 9.5 Compression Cutter (T7) | pocket floor contour, defaults |
| WSF drill brad 3mm | `drill` | 3dia Brad Point (T1) | the 5 mm hole face, `holeMode` `selection-faces` |
| WSF parallel bullnose | `parallel` | 9.5dia Bullnose (T2) | whole model, defaults |

The slot refused an open centreline twice, from a sketch line and from a
straight floor edge: "The current contour selection is not wide enough to
fit the tool." The closed floor contour generated.

The document was saved twice (Fusion version 2 after the second save, see
section 8). Two palettes I opened for section 11 were deleted again. The
scratch dumps, the posted NC file and the window captures live in the session
scratch directory, outside the repo. The full parameter name lists are in
Appendix A at the end of this file.

## 1. Strategy id strings and where they come from

Verdict: CONFIRMED.

`OperationBase.strategy` returns the id string on an existing operation. The
seven operations returned `contour2d`, `contour2d`, `pocket2d`,
`adaptive2d`, `slot`, `drill`, `parallel`. The same strings are what
`Operations.createInput(strategy)` accepts. The hidden `strategy` parameter
(a `ChoiceParameterValue`, `isVisible` false) returns the same string, and
returns `setup` on the setup. `snapshot.read_strategy` tries the attribute
first, so it works as written.

`Operation.strategyType` returns the `OperationStrategyTypes` enum:
`adaptive2d` 0, `pocket2d` 1, `contour2d` 3, `slot` 4, `parallel` 12,
`drill` 22. The string is the better key: it is what the protocol already
uses and it needs no enum table.

## 2. Parameter internal names

Every name below was read from the operation's own `parameters` collection.
The counts: contour2d 451, pocket2d 431, adaptive2d 397, slot 358, drill
564, parallel 512, setup 287.

### Feeds

Verdict: CONFIRMED.

| Name | Title | Present on |
|---|---|---|
| `tool_feedPlunge` | Plunge Feedrate | all seven |
| `tool_feedRamp` | Ramp Feedrate | all seven (not editable on the drill) |
| `tool_feedEntry` | Lead-In Feedrate | all seven (not editable on the drill) |
| `tool_feedExit` | Lead-Out Feedrate | all seven (not editable on the drill) |

Also present: `tool_feedRetract`, `tool_feedTransition`,
`tool_feedPerRevolution`. On the drill, `tool_feedCutting` and
`tool_feedPerTooth` are not editable (`isEditable` false) and the feed per
tooth reads 0.0. A drill row must write `tool_feedPlunge`, not the cutting
feed.

### Direction and compensation

Verdict: DIFFERENT for the pocket, CONFIRMED for the adaptive and the contour.

| Strategy | Parameter | Value strings | Titles the API returns |
|---|---|---|---|
| `contour2d` | `compensation` (Sideways Compensation) | `left`, `right` | Left, Right |
| `pocket2d` | `compensation` (Sideways Compensation) | `left`, `right` | Left, Right |
| `adaptive2d` | `direction` (Direction) | `climb`, `conventional` | Climb, Conventional |
| `slot` | none | | |
| `drill` | `cycleDirection` (not a cut direction) | | |
| `parallel` | `direction` (Direction) | `one way`, `other way`, `both ways` | One way, Other way, Both ways |

The 2D pocket has no `direction`. The mapping must read `compensation` on
the pocket the same way it reads it on the contour. No `center` value exists
on `compensation` in this build. `compensationType` is a separate parameter
(`computer`, `control`, `wear`, `inverseWear`, `off`).

### Depth, stock to leave, finishing

| Guess | Verdict | Finding |
|---|---|---|
| `doMultipleDepths` | CONFIRMED | On contour2d, pocket2d, adaptive2d, slot, parallel. Absent on drill. |
| `maximumStepdown` | CONFIRMED | Same five. Raw 0.6 cm for the dialog's 6 mm. When `doMultipleDepths` is false the parameter is disabled and its raw value reads 0.0, not the value its default expression would give. The depth rule that gates on `doMultipleDepths` stays right. |
| `stockToLeave` | CONFIRMED, except slot | On contour2d, pocket2d, adaptive2d, drill, parallel. The slot has only `verticalStockToLeave`. |
| `verticalStockToLeave` | CONFIRMED | On all except drill. |
| `useStockToLeave` | new | The switch in front of both. When false, both raw values read 0.0 (contour: `stockToLeave` raw 0.0, expression `0.1mm`, disabled). |
| `finishingStepover` | CONFIRMED | On contour2d and pocket2d only. |
| `doFinishingPasses` | DIFFERENT | Exists on pocket2d only. The contour's switch is `doMultipleFinishingPasses` (Multiple Finishing Passes). |
| `numberOfFinishingPasses` | DIFFERENT | Does not exist. The count is `numberOfFinishingStepovers` (Number of Finishing Passes) on contour2d and pocket2d. |
| `stepover` | DIFFERENT | Only the 3D parallel has `stepover`. The pocket width is `maximumStepover` (Maximum Stepover, default `tool_diameter * 0.6`, raw 0.57 cm on the 9.5 mm tool). The contour also has `maximumStepover` under `doRoughingPasses`. |
| `optimalLoad` | CONFIRMED | adaptive2d only, default `tool_diameter * 0.4`, raw 0.38 cm. |
| `rampAngle` | CONFIRMED | On contour2d, pocket2d, adaptive2d, slot. Absent on drill and parallel. Default expression `tool_rampAngle`. |

### Heights

Verdict: CONFIRMED.

`topHeight_mode`, `topHeight_offset`, `topHeight_value`,
`bottomHeight_mode`, `bottomHeight_offset`, `bottomHeight_value` exist on all
seven, plus `topHeight_absolute` and `bottomHeight_absolute`. The `_value`
fields have an empty title and are not editable. Values are relative to the
setup WCS origin, which sits at the stock top centre here: `topHeight_value`
0.0 is the stock top, `bottomHeight_value` −2.05 cm on the contours is the
stock bottom minus 0.5 mm, and the parallel's `from surface bottom` reads
−1.8 cm, the model bottom, 2 mm above the stock bottom.

Mode value strings and their titles, as `getChoices()` returned them on the
contour (drill adds `from hole top`, `from hole bottom`, `from reference
operation`, `from component top`, `from component bottom`, `to chamfer
width`, `to chamfer diameter`):

| Value string | Title |
|---|---|
| `from clearance height` | Clearance height |
| `from retract height` | Retract height |
| `from feed height` | Feed height |
| `from bottom` (top) / `from top` (bottom) | Bottom height / Top height |
| `from surface top` | Model top |
| `from surface bottom` | Model bottom |
| `from stock top` | Stock top |
| `from stock bottom` | Stock bottom |
| `from fixture top`, `from fixture bottom` | Fixture top, Fixture bottom |
| `from contour` | Selected contour(s) |
| `from point` | Selection |
| `from wcs` | Origin (absolute) |
| `from highest of`, `from lowest of` | Highest of..., Lowest of... |

Note `getChoices()` returns a three-tuple: a bool, the titles, then the
value strings with their quotes (`"'from stock top'"`). The spike script's
two-value unpack raises on it.

### Setup stock

Verdict: CONFIRMED for the fixed box size, DIFFERENT for the Z extents.

| Name | Title | Raw (cm) | Meaning |
|---|---|---|---|
| `job_stockMode` | Mode | `fixedbox` | other values: `default`, `fixedcylinder`, `relativecylinder`, `fixedtube`, `relativetube`, `solid`, `arrange`, `boundingSolid`, ... |
| `job_stockFixedX` / `Y` / `Z` | Width (X), Depth (Y), Height (Z) | 50.0, 60.0, 2.0 | the fixed box |
| `job_stockFixedXMode` / `YMode` / `ZMode` | Model Position | `center` | Z choices `top`, `center`, `bottom`, `model` |
| `job_stockFixedXOffset` / `YOffset` / `ZOffset` | Offset | 0.0, 0.0, 0.2 | |
| `stockZHigh`, `stockZLow` | (no title) | 0.0, −2.0 | stock top and bottom, WCS relative |
| `surfaceZHigh`, `surfaceZLow` | (no title) | −0.2, −1.8 | model top and bottom, WCS relative |
| `stockXLow`, `stockXHigh`, `stockYLow`, `stockYHigh` | Stock X Low, ... | ±25.0, ±30.0 | |
| `surfaceXLow`, `surfaceXHigh`, `surfaceYLow`, `surfaceYHigh` | Surface X Low, ... | ±25.0, ±30.0 | |
| `job_stockInfoDimensionX` / `Y` / `Z` | Stock Width (X), ... | 50.0, 60.0, 2.0 | `stockXHigh - stockXLow` etc. |
| `job_modelInfoDimensionX` / `Y` / `Z` | Model Width (X), ... | 50.0, 60.0, 1.6 | |
| `wcs_origin_mode`, `wcs_origin_boxPoint` | Origin, Bounding Box Point | `stockPoint`, `top center` | where the zero of every height sits |

`job_stockZHigh`, `job_stockZLow`, `job_modelZHigh` and `job_modelZLow` do
not exist. Replace the four constants with `stockZHigh`, `stockZLow`,
`surfaceZHigh`, `surfaceZLow`.

## 3. Compensation `left` is the climb side

Verdict: CONFIRMED.

Three pieces of evidence:

1. Fusion's own help page for the parameter, shipped in the install at
   `NeuCAM/UI/NeuCAMUI/Resources/Help/en-html/compensation_xxxx.html`, says:
   "Choose between Left (climb milling) sideways compensation or Right
   (conventional milling) sideways compensation." That is the text the
   dialog's help shows. The `getChoices()` titles are the bare words "Left"
   and "Right". The connector cannot open the modal edit dialog, so the
   dropdown wording itself was not read on screen.
2. The posted G-code. "WSF contour upcut single depth left" was posted with
   `haas.cps` (program 1001). It starts the spindle with `S5000 M3`
   (clockwise) and runs the outside profile clockwise viewed from +Z: the
   signed area of the cutting moves at Z −19.55 and −20.5 is −297,138 mm².
   Clockwise around an outside profile with a clockwise spindle keeps the
   material on the right of the travel, which is climb milling.
3. The 2D adaptive's own `direction` defaults to `climb`, and its help text
   ("Climb milling pulls the tool into the part") matches the convention.

## 4. Tool fields

Verdict: CONFIRMED.

All ten names exist as operation parameters on all seven operations. None is
editable through the operation. Raw values on the compression cutter
operation:

| Name | Raw | Note |
|---|---|---|
| `tool_type` | `flat end mill` | the bullnose reads `ball end mill`, the drill `drill` |
| `tool_diameter` | 0.95 | cm |
| `tool_cornerRadius` | 0.0 | bullnose 0.475 cm (4.75 mm); the library types the "9.5dia Bullnose" as a ball end mill with RE = DC / 2 |
| `tool_numberOfFlutes` | 2 | integer |
| `tool_fluteLength` | 2.5 | cm |
| `tool_shoulderLength` | 3.6 | cm |
| `tool_vendor` | `R&S` | |
| `tool_productId` | `` | empty on every rigg tool |
| `tool_description` | `9.5 Compression Cutter` | the plain library description |
| `tool_comment` | `` | |

`Tool.description` on the tool object is a formatted string, for example
`#7 - Ø9.5mm flat (9.5 Compression Cutter)`. Match tools on the parameter or
on the JSON, not on that property. The spike's tool lookup by
`Tool.description` failed for this reason.

`op.tool.toJson()` of the compression cutter, trimmed to the keys that
matter:

```json
{"type": "flat end mill", "unit": "millimeters", "vendor": "R&S",
 "product-id": "", "description": "9.5 Compression Cutter",
 "guid": "545f557a-7560-4b2a-9eb9-c93971d36fea", "BMC": "carbide",
 "geometry": {"DC": 9.5, "RE": 0, "NOF": 2, "LCF": 25, "shoulder-length": 36,
              "LB": 40, "OAL": 70, "SFDM": 9.5, "HAND": true},
 "expressions": {"tool_diameter": "9.5 mm", "tool_fluteLength": "25 mm",
                 "tool_shoulderLength": "36 mm", "tool_numberOfFlutes": "2"},
 "start-values": {"presets": [{"name": "Default preset", "n": 5000,
   "v_f": 1000, "f_z": 0.1, "v_f_plunge": 333.3, "v_f_ramp": 333.3,
   "v_f_leadIn": 1000, "v_f_leadOut": 1000, "ramp-angle": 2}]}}
```

The JSON geometry is in the tool's own unit (millimetres here). The bullnose
geometry reads `DC 9.5, RE 4.75, LCF 40, shoulder-length 40`; the 3 mm brad
point reads `DC 3, LCF 35, SIG 180`.

## 5. Unit factors

| Kind | Verdict | Evidence | Factor |
|---|---|---|---|
| Length | CONFIRMED | `tool_diameter` raw 0.95 for the dialog's 9.5 mm; `maximumStepdown` raw 0.6 for the expression `6 mm`; `tool_feedPerTooth` raw 0.01 for 0.1 mm | raw cm × 10 = mm |
| Feed | DIFFERENT | `tool_feedCutting` raw 1000.0 for the dialog's 1000 mm/min; the write `1234 mm/min` read back raw 1234.0; `tool_surfaceSpeed` raw 149225.65 = 9.5 mm × π × 5000 | raw is already mm/min, factor 1 |
| Spindle speed | CONFIRMED | `tool_spindleSpeed` raw 5000.0 for 5000 rpm; the write `12345 rpm` read back 12345.0 | factor 1 |
| Angle | DIFFERENT | `rampAngle` raw 2.0 for the dialog's 2 deg; the write `10 deg` read back raw 10.0 | raw is degrees, factor 1 |

`FloatParameterValue.type` reports the kind: 1 length, 2 angle, 3 linear
velocity, 4 rotational velocity (`FloatParameterValueTypes`). The API
documentation of that enum says angles are radians and lengths centimetres.
The readings agree on centimetres and disagree on radians. Trust the
reading. Whether feeds stay in mm/min in an inch document is untested: no
inch document was allowed in this session.

Changes: `internal_feed_to_mm_min` and `mm_to_internal_length`'s feed twin
must pass the value through, and `internal_angle_to_deg` must pass the value
through. The read-back tolerance check in apply.py would otherwise fail
every row by a factor of ten.

## 6. Writing `tool_feedCutting` by expression

Verdict: CONFIRMED for the write, DIFFERENT for the feed-per-tooth claim.

On "WSF pocket upcut":

- Before: expression `1000.`, raw 1000.0. `tool_feedPerTooth` expression
  `tool_spindleSpeed > 0 ? tool_feedCutting/(tool_spindleSpeed * tool_numberOfFlutes) : 0.0`,
  raw 0.01.
- Write `parameter.expression = "1234 mm/min"`: accepted at the first try.
  Read back: expression `1234 mm/min`, raw 1234.0.
- `tool_feedPerTooth` changed to raw 0.01234 (0.1234 mm). The plunge feed
  (`tool_feedCutting/3`), the ramp, the lead-in and the lead-out followed
  too, because their defaults are expressions on the cutting feed.
- Restore: `parameter.expression = "1000."`. Read back: expression `1000.`,
  raw 1000.0, feed per tooth raw 0.01 again. The restore ran in a `finally`
  block and was confirmed.

The inverse write: `tool_feedPerTooth = "0.2 mm"` rewrote the cutting feed's
expression to `tool_feedPerTooth * tool_spindleSpeed * tool_numberOfFlutes`
(raw 2000.0). Fusion keeps the pair linked and the last write becomes the
literal. Both were restored and confirmed.

So protocol.md's line "writing one does not recompute the other in Fusion"
is wrong. For apply.py: write `tool_spindleSpeed`, then `tool_feedCutting`,
and do not write `tool_feedPerTooth`. If the page's feed per tooth is not
exactly cutting feed / (rpm × flutes), a later feed-per-tooth write silently
replaces the cutting feed. The plunge, ramp, lead-in and lead-out writes stay
explicit as designed, because their defaults are expressions that a literal
write detaches.

## 7. Does the feed edit invalidate the toolpath

Verdict: CONFIRMED that it does not.

Around the write in section 6: `hasToolpath` True before and after,
`isToolpathValid` True before and after, `cam.checkToolpath(op)` True after.
A feed-only write leaves the toolpath standing, so the regen poll will see
nothing to wait for.

For contrast, a `rampAngle` write on the same pocket set `isToolpathValid`
False and `operationState` 1, and restoring the expression did not restore
the validity. The operation needed a regenerate.

## 8. Operation identity

Verdict: DIFFERENT.

- `Operation.entityToken` raises `AttributeError`. So does `Operation.id`.
  So do `Setup.entityToken` and `Setup.id`.
- `OperationBase.operationId` exists on operations and on the setup. Read
  twice in one script: identical. Values: setup 3, operations 4 to 10 in
  creation order.
- After the first `document.save()`: identical. After the second save
  (Fusion reported version 2): identical. `Operations.itemByOperationId(6)`
  returned "WSF pocket upcut" and `Setups.itemByOperationId(3)` returned the
  setup. The API documentation says the id is unique in the document, does
  not change on reorder or reparent, and survives save and reload.

As written, `snapshot.op_id()` returns None: the `entityToken` read gives
None, the `operation.id` read raises, the except returns None, and
`read_document` drops the operation. Change `op_id` to
`str(operation.operationId)` and `setup_id` to `str(setup.operationId)`.
`find_operation` then works, and `Operations.itemByOperationId` is a faster
lookup.

Document identity for the persist pinning: `document.creationId` and
`document.dataFile.id` both read on this saved document. An unsaved document
was not tested, because no other document was allowed.

## 9. The setup machine and its spindle

Verdict: CONFIRMED, spindle power and torque are readable.

`setup.machine` returns an `adsk.cam.Machine` with `vendor`, `model`,
`description`, `id`, `hasPost`, `postURL`, `hasSimulationModel`,
`capabilities` (`isMillingSupported` etc.), `kinematics` and `elements`
(controller, fusion, interactions, kinematics, machining, post, tooling).
`cam.allMachines` had one entry.

The spindle hangs off the kinematics tree: walk `machine.kinematics.parts`
and their `children`; the part with `partType` 2 (the head) has `spindle`,
an `adsk.cam.MachineSpindle` with `description`, `minSpeed`, `maxSpeed`
(rpm), `power` (kW), `peakTorque` (Nm) and `peakTorqueSpeed` (rpm).

| Machine | Spindle | min, max rpm | power | peak torque |
|---|---|---|---|---|
| Generic 3-axis (assigned, local library) | `` | 0, 0 | 0.0 | 0.0 at 0 |
| CR Onsrud 122C (system library, read only) | ES951 | 50, 24000 | 13.2 kW | 8.4 Nm at 12000 rpm |
| Autodesk generic router xyz (system library) | `` | 0, 24000 | 0.0 | 0.0 at 0 |

A zero means the field was left empty, not zero power. The add-in must ship
0.0 as null.

## 10. Undo grouping

Verdict: CONFIRMED that one script execution is one undo step, with a caveat
on what else the undo touched.

Two writes in one connector script on "WSF adaptive upcut":
`tool_feedCutting = "2222 mm/min"` (raw 2222.0) and
`tool_spindleSpeed = "12345 rpm"` (raw 12345.0). One connector undo. Read
back: cutting feed expression `1000.`, raw 1000.0, spindle speed back to its
default expression, raw 5000.0. Both writes reversed in one step. The
connector wraps each script in one transaction, which is the same shape as
the add-in's hidden apply command.

The caveat. At the next full check, a few scripts later, the setup's model
selection was empty (`job_model` held nothing, `setup.hasMissingReferences()`
True, "Model has one or more missing selections") and the four operations
with face selections (pocket, adaptive, slot, drill) reported missing
references, while the two contours (edge chains) and the parallel did not.
The undo is the likely cause, but the step could not be isolated: the redo
stack was already empty and a ramp-angle write sat between the undo and the
check. I re-linked the body (`setup.models` takes an `ObjectCollection`, not
a list), re-selected the faces, regenerated all seven and saved. Lesson for
the add-in: after any undo, re-check `hasMissingReferences()` on the setup
and on every operation before trusting the document.

## 11. The panel page inside a Fusion palette

Verdict: the page loads and renders, CONFIRMED. The bridge timing is
DIFFERENT and breaks hello. The page-to-add-in half is UNTESTABLE through the
connector.

Server: a node process from another session already listened on port 8081
and served this repo (fusion.html 7336 bytes, `text/html`; the module and
the token stylesheet with the right types), so no second server ran. The
live URL was not touched.

A palette on `http://localhost:8081/fusion.html?protocol=1&addin=0.1.0&spike=1`
loaded. A window capture of the palette shows the header "Wood speeds &
feeds" with the tagline, and the prose box "This page runs inside Fusion"
with its link, in the design system's Inter face on the panel surface. Fonts
and components render over HTTP inside the palette's browser.

The page took its outside-Fusion branch, so it never sent hello. A probe page
from the scratch directory (a local file path also loads in a palette) timed
the bridge with a 10 ms poll:

```
adskAtScriptStart "undefined", sendAtScriptStart "absent",
readyStateAtScriptStart "loading", domContentLoadedMs 1, loadMs 23,
firstSeenMs 32, seenAtReadyState "complete", polls 2, sentProbe true
```

`window.adsk.fusionSendData` appears after the load event, 32 ms after the
page's first script ran. The same probe in a palette created with
`useNewWebBrowser` true read `loadMs 12, firstSeenMs 20`: the bridge is
still absent while the page's scripts run and arrives after load. The panel's `init()` tests it at module time and
renders "This page runs inside Fusion". Change `init()` to poll for
`window.adsk.fusionSendData` for a few seconds before it decides, then send
hello. Until then the add-in's ten-second hello timeout always fires.

Messaging: Fusion to page works. Two `palette.sendInfoToHTML("report", ...)`
calls reached the probe's `window.fusionJavaScriptHandler.handle`, recorded
in its `handlerCalls` list. The page's `adsk.fusionSendData("probe", ...)`
call did not throw. But the `incomingFromHTML` handler registered from a
connector script never fired, and `sendInfoToHTML` returned an empty string
to Python although the handler returned JSON. The same held with the palette
created through the nine-argument form with `useNewWebBrowser` true. The
connector's script context does not keep the JavaScript bridge events wired,
so the page-to-add-in half and the return value need the real add-in.
Protocol items 1 to 3 (the live URL, the round trip, the offline timeout)
stay for the add-in runs on Windows and Mac.

### What the wait-code add-in already solved

`c:\source\fusion-wait-code-addin` (the Multi-Channel Sync Planner, proven
inside Fusion 2703) carries the working palette pattern. Copy it rather than
rediscover it:

1. Poll for the bridge on first use, never at load. Its `adskReady()` polls
   `window.adsk.fusionSendData` every 50 ms for up to 8 s and resolves false
   after that, and `send()` awaits it before every message
   (`resources/palette/app.js`, "The new Qt WebEngine palette injects
   window.adsk asynchronously, AFTER the page scripts have run").
2. Create the palette with the ninth argument `useNewWebBrowser=True`
   (`palettes.add(id, title, url, True, True, True, w, h, True)`). Its
   comment: the Qt WebEngine browser is required for the promise-based
   `adsk.fusionSendData` and modern CSS. The eight-argument form in
   `WSFSpike.py` and in `WoodSpeedsFeeds.py` must gain that argument.
3. `adsk.fusionSendData(action, json)` returns a promise that resolves to
   the string the Python handler put in `htmlArgs.returnData`. An empty
   string means no handler is attached: a palette that survived a previous
   add-in run. So `run()` deletes any palette with its id before it creates
   a new one, and the page tells the user to stop and re-run the add-in when
   a reply comes back empty. Our protocol's "every reply is its own message"
   rule still holds, but the return value is a free liveness check.
4. Keep `window.fusionJavaScriptHandler.handle` defined even when unused,
   returning a string, so a push from Python never throws.
5. The palette has no visible console. `index.html` installs `error` and
   `unhandledrejection` listeners that print the error into the page, so a
   startup exception is readable instead of a blank panel.
6. Cache-bust the stylesheet and script URLs with a query string and bump it
   on every change: the Qt WebEngine palette serves a stale cached copy after
   an update, and a full Fusion restart is the only other clear. Our
   `PANEL_URL` should carry the page build too, not only the protocol and
   add-in versions.
7. Classic scripts with globals are "the most reliable loading pattern
   inside the Qt WebEngine palette" (`MIGRATING-TO-VITE.md`). Our page's ES
   module did run in the palette (section 11's capture came from it), so
   modules are not blocked, but a load failure inside a module is silent
   without item 5.
8. Fusion's theme is readable:
   `app.preferences.generalPreferences.activeUserInterfaceTheme`, already
   resolved when the user picked "match device"; `DarkBlueUserInterfaceTheme`
   and `DarkGrayUserInterfaceTheme` are dark, the rest light
   (`lib/sync_planner/persistence.py`, `read_theme`). The page can carry
   `data-theme` from that instead of guessing.
9. Its `WORKSPACE_ID` and `PANEL_ID` are `CAMEnvironment` and
   `CAMActionPanel`, the same as our constants, confirmed on 2703.
10. Identity: it stamps its own GUID into an operation attribute
    (`op.attributes.add("mcSyncPlanner", "opGuid", uuid4)`) and reads it back
    with `attributes.itemByName`, and uses `operationId` for the Manual NC
    entries. Attributes survive save and are readable from a non-active
    document (`resources/cross-document-access-verification.md`). For our
    opId the `operationId` in section 8 is enough within a session; the
    attribute GUID is the pattern if an id must survive a copy of the
    operation.
11. A post operation property declared as `syncId` appears in
    `operation.parameters` as `opProp_syncId`, and only when the post
    declares it visible. Not needed by this add-in, but it explains a
    missing `opProp_` name if one ever comes up.

## Other readings worth keeping

- `Operation.isValid` exists but is the API object's validity, not the
  toolpath's. `isToolpathValid`, `hasToolpath`, `isSuppressed`,
  `isGenerating`, `operationState`, `hasError`, `error`, `hasWarning`,
  `warning` and `hasMissingReferences()` all exist. `snapshot` reads
  `isToolpathValid` first, which is right.
- `getChoices()` returns `(bool, titles, values)`. The value strings carry
  their quotes.
- `CAM.generateToolpath(setup)` returns a future; poll
  `isGenerationCompleted` with `adsk.doEvents()`. Seven operations generated
  in 4.6 s.
- `Setup.models` needs an `adsk.core.ObjectCollection`; a Python list raises
  a `TypeError`. `SetupInput.models` accepts a list.
- Geometry parameter names: `contours` on contour2d, `pockets` on pocket2d,
  adaptive2d and slot, `holeFaces` with `holeMode` `selection-faces` on the
  drill, nothing needed on the parallel. Chain selections take B-Rep edges
  or sketch lines. Face contour selections take a face.
- `document.save(description)` returned True and cleared `isModified`; the
  `dataFile.versionNumber` read lagged one save behind.
- The `strategy` parameter and the `job_spindle` parameter (`primary`,
  `secondary`) exist on the setup.
- The UI ids in constants.py resolve: `ui.workspaces.itemById("CAMEnvironment")`
  is the Manufacture workspace and `CAMActionPanel` is its Actions panel,
  present on the Milling tab (`MillingTab`) next to `CAMJobPanel`,
  `CAM2DPanel`, `CAM3DPanel`, `CAMDrillingPanel`, `CAMManagePanel` and
  `CAMInspectPanel`.
- Fusion's own expression syntax for feeds is `mmpm` (default expressions
  read `1000mmpm`), but `mm/min`, `rpm`, `mm` and `deg` all parsed on write.

## Appendix A: every parameter internal name, per strategy

Read on 2026-09-01 from the operations in "Speeds and Feeds Test Wood" through the Fusion connector, Fusion 2704.1.53. The two 2D contour operations expose the same names, so the list appears once. Names are in the order `CAMParameters.item(i)` returns them.


### WSF contour compression multidepth (`contour2d`, 451 names)

```
advancedMode, betaMode, alphaMode, isXpress, licenseMultiaxis, license3D, metric
isAssemblyDocument, context, strategy, operation_description, group_tool, isOperationTemplate
isTappingOperation, isDrillingOperation, tool_selectionMethod, tool_searchMethod
tool_exactDiameter, tool_diameterRatio, tool_searchTolerance, tool_minDiameter, tool_maxDiameter
tool_minDiameterRatio, tool_maxDiameterRatio, tool_checkLengthBelowHolder
tool_minLengthBelowHolder, tool_maxLengthBelowHolder, tool_checkChamferAngle, tool_minChamferAngle
tool_maxChamferAngle, tool_checkCornerRadius, tool_minCornerRadius, tool_maxCornerRadius
tool_type, undercut, tool_isTurning, tool_isMill, tool_isDrill, tool_isJet, tool_isDepositing
tool_taperedType, tool_unit, tool_number, tool_diameterOffset, tool_lengthOffset
tool_compensationOffset, tool_turret, tool_manualToolChange, tool_breakControl, tool_live
tool_material, tool_description, tool_comment, tool_vendor, tool_productId, tool_productLink
tool_diameter, tool_maximumCuttingDiameter, tool_tipDiameter, tool_tipOffset, tool_cornerRadius
tool_inclusiveAngle, tool_taperAngle, tool_tipAngle, tool_threadTipType, tool_threadTipWidth
tool_threadTipRadius, tool_threadProfileAngle, tool_tipLength, tool_fluteLength
tool_shoulderLength, tool_bodyLength, tool_overallLength, tool_shaftDiameter, tool_segmentHeight
tool_segmentDiameterLower, tool_segmentDiameterUpper, tool_shaftSegmentHeight
tool_shaftSegmentDiameterLower, tool_shaftSegmentDiameterUpper, tool_threadPitch
tool_maximumThreadPitch, tool_minimumThreadPitch, tool_numberOfTeeth, tool_numberOfFlutes
tool_shoulderDiameter, tool_upperRadius, tool_profileRadius, tool_lowerRadius, tool_axialDistance
tool_chamferWidth, tool_chamferAngle, holder_attached, holder_description, holder_comment
holder_vendor, holder_productId, holder_productLink, holder_libraryName, tool_holderGaugeLength
tool_assemblyGaugeLength, group_feedspeed, preset_search, preset_contains, tool_spindleSpeed
tool_stockDiameter, tool_surfaceSpeed, tool_rampSpindleSpeed, tool_feedCutting, tool_feedPerTooth
tool_feedEntry, tool_feedExit, tool_feedTransition, tool_feedRamp, tool_feedPlunge
tool_feedPerRevolution, tool_feedRetract, tool_clockwise, tool_coolant, featureOperationId
surfaceZHigh, surfaceZLow, surfaceXLow, surfaceXHigh, surfaceYLow, surfaceYHigh, stockZHigh
stockZLow, stockXLow, stockXHigh, stockYLow, stockYHigh, machiningTypeGroup
multiAxisMachiningType, overrideToolView, view_orientation_mode, view_orientation_axisZ
view_orientation_flipZ, view_orientation_axesZX_unselected_default
view_orientation_axesZY_unselected_default, view_orientation_axesXY_unselected_default
view_orientation_cSys, view_orientation_surfaceNormal, view_orientation_axisX
view_orientation_flipX, view_orientation_axisY, view_orientation_flipY
view_align_to_view_direction, view_select_angles, view_turn_from_recipe, view_tilt_from_recipe
view_origin_mode, view_origin_point, view_model_point, view_origin_boxPoint, view_stock_point
show_machine, wrapGroup, unwrap, wrap_cylinder, wrap_cylinder_radius, wrap_nominalRadius_offset
wrap_nominalRadius_value, leadLean, tiltTool, useRotaryAxisMoves, usePolarWhenNecessary
threeAxisPolarMode, threeAxisPolarLineAngle, polarMachiningGroup, polarMode, polarLineAngle
group_geometry, canBeFallbackOperation, isFallbackOperation, isContourGeometry, geometryType
contours, auto_holeTopDiameter, group_tabs, tabShape, tabWidth, tabHeight, tabPositioning
tabApproach, tabsPerContour, tabDistance, tabPositions, noTabZones, useRestMachining
restMaterialCutterDiameter, restMaterialCornerRadius, restMaterialTaperAngle
restMaterialShoulderLength, restMaterialStockToLeave, restMaterialTool, useStockContours
stockContours, isClearanceAreaEnabled, clearanceHeight_group, clearanceHeight_mode
clearanceHeight_ref, clearanceHeightFromHighest_checkStock, clearanceHeightFromLowest_checkStock
clearanceHeightFromHighest_checkModel, clearanceHeightFromLowest_checkModel
clearanceHeightFromHighest_checkFixture, clearanceHeightFromLowest_checkFixture
clearanceHeight_offset, clearanceHeight_value, clearanceHeight_absolute, retractHeight_group
retractHeight_mode, retractHeight_ref, retractHeightFromHighest_checkStock
retractHeightFromLowest_checkStock, retractHeightFromHighest_checkModel
retractHeightFromLowest_checkModel, retractHeightFromHighest_checkFixture
retractHeightFromLowest_checkFixture, retractHeight_offset, retractHeight_value
retractHeight_absolute, feedHeight_group, feedHeight_mode, feedHeight_ref
feedHeightFromHighest_checkStock, feedHeightFromLowest_checkStock
feedHeightFromHighest_checkModel, feedHeightFromLowest_checkModel
feedHeightFromHighest_checkFixture, feedHeightFromLowest_checkFixture, feedHeight_offset
feedHeight_value, useZFeed, feedHeight_absolute, topHeight_group, topHeight_mode, topHeight_ref
topHeightFromHighest_checkStock, topHeightFromLowest_checkStock, topHeightFromHighest_checkModel
topHeightFromLowest_checkModel, topHeightFromHighest_checkFixture
topHeightFromLowest_checkFixture, topHeight_offset, topHeight_value, topHeight_absolute
bottomHeight_group, bottomHeight_mode, bottomHeight_ref, bottomHeightFromHighest_checkStock
bottomHeightFromLowest_checkStock, bottomHeightFromHighest_checkModel
bottomHeightFromLowest_checkModel, bottomHeightFromHighest_checkFixture
bottomHeightFromLowest_checkFixture, bottomHeight_offset, bottomHeight_value
bottomHeight_absolute, group_passes, tolerance, contourTolerance, calculationTolerance
thinningTolerance, chainingTolerance, gougingTolerance, compensation, rightCompensation
compensationType, compensationDeltaRadius, makeSharpCorners, minimumCuttingRadius
finishingSmoothingDeviation, doMultipleFinishingPasses, numberOfFinishingStepovers
finishingStepover, leadsForAllFinishingPasses, finishFeedrate, nullPass, finishingOverlap
leadEndDistance, cornerMode, fragmentExtensionDistance, tangentialFragmentExtensionDistance
preserveOrder, bothWays, doRoughingPasses, maximumStepover, minimumCuttingRadiusJl
minimumRoughingStepover, flatTipRadius, maximumEnsureCutRadius, ensureCutRadius
applyFinalSmoothingDeviation, smoothingDeviation, maximumRoughingSteps, minimumFinishingStepover
spiralCircularPockets, doMultipleDepths, maximumStepdown, numberOfFinishingStepdowns
finishingStepdown, slopeAngle, taperApproachMode, wallTaperAngle, onlyFinishFinal, roughFinal
useEvenStepdowns, orderByDepth, orderByIslands, pathDependencyDistance, orderByStep, useThinWall
thinWallWidth, doChamfer, chamferWidth, chamferTipOffset, chamferWidthBall, chamferDepthBall
useStockToLeave, stockToLeave, verticalStockToLeave, simpleStockToLeave, useCombinedFilter
useDMKSmoothing, smoothingFilter, smoothingFilterMode, smoothingFilterMaxSpacing
smoothingFilterMaxAngle, smoothingFilterTolerance, useFeedOptimization, reducedFeedChange
reducedFeedRadius, reducedFeedDistance, reducedFeedrate, reduceOnlyInnerCorners
surfaceSpeedOnArcs, maximumReducedFeedrateInternalArcFinishing
maximumIncreasedFeedrateExternalArcFinishing, maximumReducedFeedrateInternalArc
maximumIncreasedFeedrateExternalArc, group_linking, highFeedrateMode, highFeedrateModeProxy
highFeedrate, allowRapidRetract, safeDistance, keepToolDown, stayDownDistance, liftHeight
group_leadsTranstions, smoothTransitions, doLeadIn, entry_radius, entry_sweep, entry_distance
entry_perpendicular, entry_verticalRadius, leadInRadius, leadInVerticalRadius, doLeadOut
exit_sameAsEntry, exit_radius, exit_sweep, exit_distance, exit_perpendicular, exit_verticalRadius
leadOutRadius, leadOutVerticalRadius, doRamp, rampType, rampAngle, maximumRampZStepdown
rampClearanceHeight, helicalRampDiameter, minimumRampDiameter, alwaysMakeContourRamp
allowPlunging, allowHelicalRamps, allowContourRamps, allowSmoothContourRamps, allowZigZagRamps
group_entry_drill_positions, predrillPositions, entryPositions, exitPositions
generate_connections, connections_retraction_type, connectionMoveClearanceAreaType
connectionMoveClearanceArea_orientation_mode, connectionMoveClearanceArea_orientation_selAxis
connectionMoveClearanceArea_orientation_flipAxis, connectionMoveClearanceArea_flipDirection
connectionMoveClearanceAreaUp_orientation_mode, connectionMoveClearanceAreaUp_orientation_selAxis
connectionMoveClearanceAreaUp_orientation_flipAxis, connectionMoveClearanceAreaUp_flipDirection
connectionMoveClearanceArea_origin_mode, connectionMoveClearanceArea_origin_point
connectionMoveClearanceAreaHeight_mode, connectionMoveClearanceAreaHeight_ref
connectionMoveClearanceAreaHeight_offset, connectionMoveClearanceAreaHeight_value
connectionMoveClearanceAreaHeight_absolute, connectionMoveClearanceAreaCylinderRadius_mode
connectionMoveClearanceAreaCylinderRadius_ref
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkStock
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkModel
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaCylinderRadius_offset, connectionMoveClearanceAreaCylinderRadius_direct
connectionMoveClearanceAreaCylinderRadius_value
connectionMoveClearanceAreaCylinderRadius_absolute
connectionMoveClearanceAreaCylinderCapPosZHeight_mode
connectionMoveClearanceAreaCylinderCapPosZHeight_ref
connectionMoveClearanceAreaCylinderCapPosZHeight_offset
connectionMoveClearanceAreaCylinderCapPosZHeight_value
connectionMoveClearanceAreaCylinderCapPosZHeight_absolute
connectionMoveClearanceAreaSphereRadius_mode, connectionMoveClearanceAreaSphereRadius_ref
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkStock
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkModel
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaSphereRadius_offset, connectionMoveClearanceAreaSphereRadius_direct
connectionMoveClearanceAreaSphereRadius_value, connectionMoveClearanceAreaSphereRadius_absolute
connectionMoveClearanceAreaCuboid_mode, connectionMoveClearanceAreaCuboid_symmetricalOffsets
connectionMoveClearanceAreaCuboidPosX_value, connectionMoveClearanceAreaCuboidPosX_offset
connectionMoveClearanceAreaCuboidNegX_value, connectionMoveClearanceAreaCuboidNegX_offset
connectionMoveClearanceAreaCuboidPosY_value, connectionMoveClearanceAreaCuboidPosY_offset
connectionMoveClearanceAreaCuboidNegY_value, connectionMoveClearanceAreaCuboidNegY_offset
connectionMoveClearanceAreaCuboidPosZ_value, connectionMoveClearanceAreaCuboidPosZ_offset
connectionMoveClearanceAreaCuboidNegZ_value, connectionMoveClearanceAreaCuboidNegZ_offset
use_tool_stepdown, tool_stepdown, tool_finishingStepdown, use_tool_stepover, tool_stepover
tool_finishingStepover, tool_rampType, tool_rampAngle, associatedView
```

### WSF contour upcut single depth left (`contour2d`)

Same 451 names as the first `contour2d` operation: yes.


### WSF pocket upcut (`pocket2d`, 431 names)

```
advancedMode, betaMode, alphaMode, isXpress, licenseMultiaxis, license3D, metric
isAssemblyDocument, context, strategy, operation_description, group_tool, isOperationTemplate
isTappingOperation, isDrillingOperation, tool_selectionMethod, tool_searchMethod
tool_exactDiameter, tool_diameterRatio, tool_searchTolerance, tool_minDiameter, tool_maxDiameter
tool_minDiameterRatio, tool_maxDiameterRatio, tool_checkLengthBelowHolder
tool_minLengthBelowHolder, tool_maxLengthBelowHolder, tool_checkCornerRadius, tool_minCornerRadius
tool_maxCornerRadius, tool_type, undercut, tool_isTurning, tool_isMill, tool_isDrill, tool_isJet
tool_isDepositing, tool_taperedType, tool_unit, tool_number, tool_diameterOffset
tool_lengthOffset, tool_compensationOffset, tool_turret, tool_manualToolChange, tool_breakControl
tool_live, tool_material, tool_description, tool_comment, tool_vendor, tool_productId
tool_productLink, tool_diameter, tool_maximumCuttingDiameter, tool_tipDiameter, tool_tipOffset
tool_cornerRadius, tool_inclusiveAngle, tool_taperAngle, tool_tipAngle, tool_threadTipType
tool_threadTipWidth, tool_threadTipRadius, tool_threadProfileAngle, tool_tipLength
tool_fluteLength, tool_shoulderLength, tool_bodyLength, tool_overallLength, tool_shaftDiameter
tool_segmentHeight, tool_segmentDiameterLower, tool_segmentDiameterUpper, tool_shaftSegmentHeight
tool_shaftSegmentDiameterLower, tool_shaftSegmentDiameterUpper, tool_threadPitch
tool_maximumThreadPitch, tool_minimumThreadPitch, tool_numberOfTeeth, tool_numberOfFlutes
tool_shoulderDiameter, tool_upperRadius, tool_profileRadius, tool_lowerRadius, tool_axialDistance
tool_chamferWidth, tool_chamferAngle, holder_attached, holder_description, holder_comment
holder_vendor, holder_productId, holder_productLink, holder_libraryName, tool_holderGaugeLength
tool_assemblyGaugeLength, group_feedspeed, preset_search, preset_contains, tool_spindleSpeed
tool_stockDiameter, tool_surfaceSpeed, tool_rampSpindleSpeed, tool_feedCutting, tool_feedPerTooth
tool_feedEntry, tool_feedExit, tool_feedTransition, tool_feedRamp, tool_feedPlunge
tool_feedPerRevolution, tool_feedRetract, tool_clockwise, tool_coolant, featureOperationId
surfaceZHigh, surfaceZLow, surfaceXLow, surfaceXHigh, surfaceYLow, surfaceYHigh, stockZHigh
stockZLow, stockXLow, stockXHigh, stockYLow, stockYHigh, machiningTypeGroup
multiAxisMachiningType, overrideToolView, view_orientation_mode, view_orientation_axisZ
view_orientation_flipZ, view_orientation_axesZX_unselected_default
view_orientation_axesZY_unselected_default, view_orientation_axesXY_unselected_default
view_orientation_cSys, view_orientation_surfaceNormal, view_orientation_axisX
view_orientation_flipX, view_orientation_axisY, view_orientation_flipY
view_align_to_view_direction, view_select_angles, view_turn_from_recipe, view_tilt_from_recipe
view_origin_mode, view_origin_point, view_model_point, view_origin_boxPoint, view_stock_point
show_machine, wrapGroup, unwrap, wrap_cylinder, wrap_cylinder_radius, wrap_nominalRadius_offset
wrap_nominalRadius_value, leadLean, tiltTool, useRotaryAxisMoves, usePolarWhenNecessary
threeAxisPolarMode, threeAxisPolarLineAngle, polarMachiningGroup, polarMode, polarLineAngle
group_geometry, canBeFallbackOperation, isFallbackOperation, isContourGeometry, geometryType
pockets, pockets_detectOpenPockets, pockets_connectOpenPockets, pockets_errorCheck
pockets_detectOverlaps, auto_holeTopDiameter, useRestMachining, restMaterialCutterDiameter
restMaterialCornerRadius, restMaterialTaperAngle, restMaterialShoulderLength
restMaterialStockToLeave, restMaterialTool, useStockContours, stockContours
isClearanceAreaEnabled, clearanceHeight_group, clearanceHeight_mode, clearanceHeight_ref
clearanceHeightFromHighest_checkStock, clearanceHeightFromLowest_checkStock
clearanceHeightFromHighest_checkModel, clearanceHeightFromLowest_checkModel
clearanceHeightFromHighest_checkFixture, clearanceHeightFromLowest_checkFixture
clearanceHeight_offset, clearanceHeight_value, clearanceHeight_absolute, retractHeight_group
retractHeight_mode, retractHeight_ref, retractHeightFromHighest_checkStock
retractHeightFromLowest_checkStock, retractHeightFromHighest_checkModel
retractHeightFromLowest_checkModel, retractHeightFromHighest_checkFixture
retractHeightFromLowest_checkFixture, retractHeight_offset, retractHeight_value
retractHeight_absolute, feedHeight_group, feedHeight_mode, feedHeight_ref
feedHeightFromHighest_checkStock, feedHeightFromLowest_checkStock
feedHeightFromHighest_checkModel, feedHeightFromLowest_checkModel
feedHeightFromHighest_checkFixture, feedHeightFromLowest_checkFixture, feedHeight_offset
feedHeight_value, useZFeed, feedHeight_absolute, topHeight_group, topHeight_mode, topHeight_ref
topHeightFromHighest_checkStock, topHeightFromLowest_checkStock, topHeightFromHighest_checkModel
topHeightFromLowest_checkModel, topHeightFromHighest_checkFixture
topHeightFromLowest_checkFixture, topHeight_offset, topHeight_value, topHeight_absolute
bottomHeight_group, bottomHeight_mode, bottomHeight_ref, bottomHeightFromHighest_checkStock
bottomHeightFromLowest_checkStock, bottomHeightFromHighest_checkModel
bottomHeightFromLowest_checkModel, bottomHeightFromHighest_checkFixture
bottomHeightFromLowest_checkFixture, bottomHeight_offset, bottomHeight_value
bottomHeight_absolute, group_passes, tolerance, contourTolerance, calculationTolerance
thinningTolerance, chainingTolerance, gougingTolerance, compensation, rightCompensation
minimumCuttingRadius, fragmentExtensionDistance, preserveOrder, bothWays, maximumStepover
minimumCuttingRadiusJl, useMorphedSpiralMachining, minimumRoughingStepover, allowStepoverCusps
flatTipRadius, maximumEnsureCutRadius, ensureCutRadius, applyFinalSmoothingDeviation
smoothingDeviation, minimumFinishingStepover, spiralCircularPockets, doMultipleDepths
maximumStepdown, numberOfFinishingStepdowns, finishingStepdown, slopeAngle, wallTaperAngle
onlyFinishFinal, roughFinal, useEvenStepdowns, orderByDepth, orderByStep, doFinishingPasses
compensationType, compensationTypeProxy, compensationDeltaRadius, finishingSmoothingDeviation
numberOfFinishingStepovers, finishingStepover, leadsForAllFinishingPasses, finishFeedrate
nullPass, finishingOverlap, useStockToLeave, stockToLeave, verticalStockToLeave
simpleStockToLeave, useCombinedFilter, useDMKSmoothing, smoothingFilter, smoothingFilterMode
smoothingFilterMaxSpacing, smoothingFilterMaxAngle, smoothingFilterTolerance, useFeedOptimization
reducedFeedChange, reducedFeedRadius, reducedFeedDistance, reducedFeedrate, reduceOnlyInnerCorners
surfaceSpeedOnArcs, maximumReducedFeedrateInternalArcFinishing
maximumIncreasedFeedrateExternalArcFinishing, maximumReducedFeedrateInternalArc
maximumIncreasedFeedrateExternalArc, group_linking, highFeedrateMode, highFeedrateModeProxy
highFeedrate, allowRapidRetract, safeDistance, keepToolDown, stayDownDistance, liftHeight
group_leadsTranstions, smoothTransitions, doLeadIn, entry_radius, entry_sweep, entry_distance
entry_perpendicular, entry_verticalRadius, leadInRadius, leadInVerticalRadius, doLeadOut
exit_sameAsEntry, exit_radius, exit_sweep, exit_distance, exit_perpendicular, exit_verticalRadius
leadOutRadius, leadOutVerticalRadius, doRamp, rampType, allowPlungingOutsideStockJl, rampAngle
maximumRampZStepdown, rampClearanceHeight, rampRadialClearance, helicalRampDiameter
minimumRampDiameter, smoothRampJl, allowPlunging, allowHelicalRamps, allowContourRamps
allowSmoothContourRamps, allowZigZagRamps, group_entry_drill_positions, predrillPositions
entryPositions, exitPositions, generate_connections, connections_retraction_type
connectionMoveClearanceAreaType, connectionMoveClearanceArea_orientation_mode
connectionMoveClearanceArea_orientation_selAxis, connectionMoveClearanceArea_orientation_flipAxis
connectionMoveClearanceArea_flipDirection, connectionMoveClearanceAreaUp_orientation_mode
connectionMoveClearanceAreaUp_orientation_selAxis
connectionMoveClearanceAreaUp_orientation_flipAxis, connectionMoveClearanceAreaUp_flipDirection
connectionMoveClearanceArea_origin_mode, connectionMoveClearanceArea_origin_point
connectionMoveClearanceAreaHeight_mode, connectionMoveClearanceAreaHeight_ref
connectionMoveClearanceAreaHeight_offset, connectionMoveClearanceAreaHeight_value
connectionMoveClearanceAreaHeight_absolute, connectionMoveClearanceAreaCylinderRadius_mode
connectionMoveClearanceAreaCylinderRadius_ref
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkStock
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkModel
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaCylinderRadius_offset, connectionMoveClearanceAreaCylinderRadius_direct
connectionMoveClearanceAreaCylinderRadius_value
connectionMoveClearanceAreaCylinderRadius_absolute
connectionMoveClearanceAreaCylinderCapPosZHeight_mode
connectionMoveClearanceAreaCylinderCapPosZHeight_ref
connectionMoveClearanceAreaCylinderCapPosZHeight_offset
connectionMoveClearanceAreaCylinderCapPosZHeight_value
connectionMoveClearanceAreaCylinderCapPosZHeight_absolute
connectionMoveClearanceAreaSphereRadius_mode, connectionMoveClearanceAreaSphereRadius_ref
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkStock
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkModel
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaSphereRadius_offset, connectionMoveClearanceAreaSphereRadius_direct
connectionMoveClearanceAreaSphereRadius_value, connectionMoveClearanceAreaSphereRadius_absolute
connectionMoveClearanceAreaCuboid_mode, connectionMoveClearanceAreaCuboid_symmetricalOffsets
connectionMoveClearanceAreaCuboidPosX_value, connectionMoveClearanceAreaCuboidPosX_offset
connectionMoveClearanceAreaCuboidNegX_value, connectionMoveClearanceAreaCuboidNegX_offset
connectionMoveClearanceAreaCuboidPosY_value, connectionMoveClearanceAreaCuboidPosY_offset
connectionMoveClearanceAreaCuboidNegY_value, connectionMoveClearanceAreaCuboidNegY_offset
connectionMoveClearanceAreaCuboidPosZ_value, connectionMoveClearanceAreaCuboidPosZ_offset
connectionMoveClearanceAreaCuboidNegZ_value, connectionMoveClearanceAreaCuboidNegZ_offset
use_tool_stepdown, tool_stepdown, tool_finishingStepdown, use_tool_stepover, tool_stepover
tool_finishingStepover, tool_rampType, tool_rampAngle, associatedView
```

### WSF adaptive upcut (`adaptive2d`, 397 names)

```
advancedMode, betaMode, alphaMode, isXpress, licenseMultiaxis, license3D, metric
isAssemblyDocument, context, strategy, operation_description, group_tool, isOperationTemplate
isTappingOperation, isDrillingOperation, tool_selectionMethod, tool_searchMethod
tool_exactDiameter, tool_diameterRatio, tool_searchTolerance, tool_minDiameter, tool_maxDiameter
tool_minDiameterRatio, tool_maxDiameterRatio, tool_checkLengthBelowHolder
tool_minLengthBelowHolder, tool_maxLengthBelowHolder, tool_checkCornerRadius, tool_minCornerRadius
tool_maxCornerRadius, tool_type, undercut, tool_isTurning, tool_isMill, tool_isDrill, tool_isJet
tool_isDepositing, tool_taperedType, tool_unit, tool_number, tool_diameterOffset
tool_lengthOffset, tool_compensationOffset, tool_turret, tool_manualToolChange, tool_breakControl
tool_live, tool_material, tool_description, tool_comment, tool_vendor, tool_productId
tool_productLink, tool_diameter, tool_maximumCuttingDiameter, tool_tipDiameter, tool_tipOffset
tool_cornerRadius, tool_inclusiveAngle, tool_taperAngle, tool_tipAngle, tool_threadTipType
tool_threadTipWidth, tool_threadTipRadius, tool_threadProfileAngle, tool_tipLength
tool_fluteLength, tool_shoulderLength, tool_bodyLength, tool_overallLength, tool_shaftDiameter
tool_segmentHeight, tool_segmentDiameterLower, tool_segmentDiameterUpper, tool_shaftSegmentHeight
tool_shaftSegmentDiameterLower, tool_shaftSegmentDiameterUpper, tool_threadPitch
tool_maximumThreadPitch, tool_minimumThreadPitch, tool_numberOfTeeth, tool_numberOfFlutes
tool_shoulderDiameter, tool_upperRadius, tool_profileRadius, tool_lowerRadius, tool_axialDistance
tool_chamferWidth, tool_chamferAngle, holder_attached, holder_description, holder_comment
holder_vendor, holder_productId, holder_productLink, holder_libraryName, tool_holderGaugeLength
tool_assemblyGaugeLength, group_feedspeed, preset_search, preset_contains, tool_spindleSpeed
tool_stockDiameter, tool_surfaceSpeed, tool_rampSpindleSpeed, tool_feedCutting, tool_feedPerTooth
tool_feedEntry, tool_feedExit, tool_feedTransition, tool_feedRamp, tool_feedPlunge
tool_feedPerRevolution, tool_feedRetract, tool_clockwise, tool_coolant, featureOperationId
surfaceZHigh, surfaceZLow, surfaceXLow, surfaceXHigh, surfaceYLow, surfaceYHigh, stockZHigh
stockZLow, stockXLow, stockXHigh, stockYLow, stockYHigh, machiningTypeGroup
multiAxisMachiningType, overrideToolView, view_orientation_mode, view_orientation_axisZ
view_orientation_flipZ, view_orientation_axesZX_unselected_default
view_orientation_axesZY_unselected_default, view_orientation_axesXY_unselected_default
view_orientation_cSys, view_orientation_surfaceNormal, view_orientation_axisX
view_orientation_flipX, view_orientation_axisY, view_orientation_flipY
view_align_to_view_direction, view_select_angles, view_turn_from_recipe, view_tilt_from_recipe
view_origin_mode, view_origin_point, view_model_point, view_origin_boxPoint, view_stock_point
show_machine, wrapGroup, unwrap, wrap_cylinder, wrap_cylinder_radius, wrap_nominalRadius_offset
wrap_nominalRadius_value, leadLean, tiltTool, useRotaryAxisMoves, usePolarWhenNecessary
threeAxisPolarMode, threeAxisPolarLineAngle, polarMachiningGroup, polarMode, polarLineAngle
group_geometry, canBeFallbackOperation, isFallbackOperation, isContourGeometry, geometryType
pockets, pockets_detectOpenPockets, pockets_connectOpenPockets, pockets_errorCheck
pockets_detectOverlaps, auto_holeTopDiameter, useRestMachining, restMaterialCutterDiameter
restMaterialCornerRadius, restMaterialTaperAngle, restMaterialShoulderLength
restMaterialStockToLeave, restMaterialTool, useStockContours, stockContours
isClearanceAreaEnabled, clearanceHeight_group, clearanceHeight_mode, clearanceHeight_ref
clearanceHeightFromHighest_checkStock, clearanceHeightFromLowest_checkStock
clearanceHeightFromHighest_checkModel, clearanceHeightFromLowest_checkModel
clearanceHeightFromHighest_checkFixture, clearanceHeightFromLowest_checkFixture
clearanceHeight_offset, clearanceHeight_value, clearanceHeight_absolute, retractHeight_group
retractHeight_mode, retractHeight_ref, retractHeightFromHighest_checkStock
retractHeightFromLowest_checkStock, retractHeightFromHighest_checkModel
retractHeightFromLowest_checkModel, retractHeightFromHighest_checkFixture
retractHeightFromLowest_checkFixture, retractHeight_offset, retractHeight_value
retractHeight_absolute, topHeight_group, topHeight_mode, topHeight_ref
topHeightFromHighest_checkStock, topHeightFromLowest_checkStock, topHeightFromHighest_checkModel
topHeightFromLowest_checkModel, topHeightFromHighest_checkFixture
topHeightFromLowest_checkFixture, topHeight_offset, topHeight_value, topHeight_absolute
bottomHeight_group, bottomHeight_mode, bottomHeight_ref, bottomHeightFromHighest_checkStock
bottomHeightFromLowest_checkStock, bottomHeightFromHighest_checkModel
bottomHeightFromLowest_checkModel, bottomHeightFromHighest_checkFixture
bottomHeightFromLowest_checkFixture, bottomHeight_offset, bottomHeight_value
bottomHeight_absolute, group_passes, tolerance, contourTolerance, totalSurfaceTolerance
surfaceTriangulationTolerance, calculationTolerance, thinningTolerance, chainingTolerance
gougingTolerance, optimalLoad, optimalLoadWeight, speedWeight, feedWeight, loadDeviation
maximumLoad, bothWays, optimalLoadOtherWay, loadDeviationOtherWay, maximumLoadOtherWay
otherWayFeedrate, maximumCuspHeight, minimumCuttingRadius, minimumCuttingRadiusJl, machineCavities
useSlotClearing, slotClearingWidth, direction, doMultipleDepths, maximumStepdown
maximumStepdownJl, slopeAngle, useEvenStepdowns, curveInRadius, fineStepdown, fineStepdownJl
minimumStepdownJobline, useSilhouetteAsStockBoundary, orderByDepth, orderByArea
orderByAreaBufferSize, useStockToLeave, stockToLeave, verticalStockToLeave, simpleStockToLeave
useCombinedFilter, useDMKSmoothing, smoothingFilter, smoothingFilterMode
smoothingFilterMaxSpacing, smoothingFilterMaxAngle, smoothingFilterTolerance, useFeedOptimization
reducedFeedChange, reducedFeedRadius, reducedFeedDistance, reducedFeedrate, reduceOnlyInnerCorners
surfaceSpeedOnArcs, maximumReducedFeedrateInternalArcFinishing
maximumIncreasedFeedrateExternalArcFinishing, maximumReducedFeedrateInternalArc
maximumIncreasedFeedrateExternalArc, group_linking, retractionPolicy, highFeedrateMode
highFeedrateModeProxy, highFeedrate, allowRapidRetract, stayDownDistance, minimumStayDownClearance
stayDownLevel, astarSpeedRatioJl, liftHeight, noEngagementFeedrate, group_leadsTranstions
leadRadius, verticalLeadRadius, leadInRadius, leadInVerticalRadius, leadOutRadius
leadOutVerticalRadius, doRamp, rampType, allowPlungingOutsideStockJl, rampAngle, rampTaperAngle
rampClearanceHeight, helicalRampDiameter, minimumRampDiameter, allowPlunging, allowHelicalRamps
group_entry_drill_positions, predrillPositions, entryPositions, exitPositions
generate_connections, connections_retraction_type, connectionMoveClearanceAreaType
connectionMoveClearanceArea_orientation_mode, connectionMoveClearanceArea_orientation_selAxis
connectionMoveClearanceArea_orientation_flipAxis, connectionMoveClearanceArea_flipDirection
connectionMoveClearanceAreaUp_orientation_mode, connectionMoveClearanceAreaUp_orientation_selAxis
connectionMoveClearanceAreaUp_orientation_flipAxis, connectionMoveClearanceAreaUp_flipDirection
connectionMoveClearanceArea_origin_mode, connectionMoveClearanceArea_origin_point
connectionMoveClearanceAreaHeight_mode, connectionMoveClearanceAreaHeight_ref
connectionMoveClearanceAreaHeight_offset, connectionMoveClearanceAreaHeight_value
connectionMoveClearanceAreaHeight_absolute, connectionMoveClearanceAreaCylinderRadius_mode
connectionMoveClearanceAreaCylinderRadius_ref
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkStock
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkModel
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaCylinderRadius_offset, connectionMoveClearanceAreaCylinderRadius_direct
connectionMoveClearanceAreaCylinderRadius_value
connectionMoveClearanceAreaCylinderRadius_absolute
connectionMoveClearanceAreaCylinderCapPosZHeight_mode
connectionMoveClearanceAreaCylinderCapPosZHeight_ref
connectionMoveClearanceAreaCylinderCapPosZHeight_offset
connectionMoveClearanceAreaCylinderCapPosZHeight_value
connectionMoveClearanceAreaCylinderCapPosZHeight_absolute
connectionMoveClearanceAreaSphereRadius_mode, connectionMoveClearanceAreaSphereRadius_ref
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkStock
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkModel
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaSphereRadius_offset, connectionMoveClearanceAreaSphereRadius_direct
connectionMoveClearanceAreaSphereRadius_value, connectionMoveClearanceAreaSphereRadius_absolute
connectionMoveClearanceAreaCuboid_mode, connectionMoveClearanceAreaCuboid_symmetricalOffsets
connectionMoveClearanceAreaCuboidPosX_value, connectionMoveClearanceAreaCuboidPosX_offset
connectionMoveClearanceAreaCuboidNegX_value, connectionMoveClearanceAreaCuboidNegX_offset
connectionMoveClearanceAreaCuboidPosY_value, connectionMoveClearanceAreaCuboidPosY_offset
connectionMoveClearanceAreaCuboidNegY_value, connectionMoveClearanceAreaCuboidNegY_offset
connectionMoveClearanceAreaCuboidPosZ_value, connectionMoveClearanceAreaCuboidPosZ_offset
connectionMoveClearanceAreaCuboidNegZ_value, connectionMoveClearanceAreaCuboidNegZ_offset
use_tool_stepdown, tool_stepdown, tool_finishingStepdown, use_tool_stepover, tool_stepover
tool_finishingStepover, tool_rampType, tool_rampAngle, associatedView
```

### WSF slot compression (`slot`, 358 names)

```
advancedMode, betaMode, alphaMode, isXpress, licenseMultiaxis, license3D, metric
isAssemblyDocument, context, strategy, operation_description, group_tool, isOperationTemplate
tool_type, undercut, tool_isTurning, tool_isMill, tool_isDrill, tool_isJet, tool_isDepositing
tool_taperedType, tool_unit, tool_number, tool_diameterOffset, tool_lengthOffset
tool_compensationOffset, tool_turret, tool_manualToolChange, tool_breakControl, tool_live
tool_material, tool_description, tool_comment, tool_vendor, tool_productId, tool_productLink
tool_diameter, tool_maximumCuttingDiameter, tool_tipDiameter, tool_tipOffset, tool_cornerRadius
tool_inclusiveAngle, tool_taperAngle, tool_tipAngle, tool_threadTipType, tool_threadTipWidth
tool_threadTipRadius, tool_threadProfileAngle, tool_tipLength, tool_fluteLength
tool_shoulderLength, tool_bodyLength, tool_overallLength, tool_shaftDiameter, tool_segmentHeight
tool_segmentDiameterLower, tool_segmentDiameterUpper, tool_shaftSegmentHeight
tool_shaftSegmentDiameterLower, tool_shaftSegmentDiameterUpper, tool_threadPitch
tool_maximumThreadPitch, tool_minimumThreadPitch, tool_numberOfTeeth, tool_numberOfFlutes
tool_shoulderDiameter, tool_upperRadius, tool_profileRadius, tool_lowerRadius, tool_axialDistance
tool_chamferWidth, tool_chamferAngle, holder_attached, holder_description, holder_comment
holder_vendor, holder_productId, holder_productLink, holder_libraryName, tool_holderGaugeLength
tool_assemblyGaugeLength, group_feedspeed, tool_spindleSpeed, tool_stockDiameter
tool_surfaceSpeed, tool_rampSpindleSpeed, tool_feedCutting, tool_feedPerTooth, tool_feedEntry
tool_feedExit, tool_feedTransition, tool_feedRamp, tool_feedPlunge, tool_feedPerRevolution
tool_feedRetract, tool_clockwise, tool_coolant, featureOperationId, surfaceZHigh, surfaceZLow
surfaceXLow, surfaceXHigh, surfaceYLow, surfaceYHigh, stockZHigh, stockZLow, stockXLow, stockXHigh
stockYLow, stockYHigh, machiningTypeGroup, multiAxisMachiningType, overrideToolView
view_orientation_mode, view_orientation_axisZ, view_orientation_flipZ
view_orientation_axesZX_unselected_default, view_orientation_axesZY_unselected_default
view_orientation_axesXY_unselected_default, view_orientation_cSys, view_orientation_surfaceNormal
view_orientation_axisX, view_orientation_flipX, view_orientation_axisY, view_orientation_flipY
view_align_to_view_direction, view_select_angles, view_turn_from_recipe, view_tilt_from_recipe
view_origin_mode, view_origin_point, view_model_point, view_origin_boxPoint, view_stock_point
show_machine, wrapGroup, unwrap, wrap_cylinder, wrap_cylinder_radius, wrap_nominalRadius_offset
wrap_nominalRadius_value, leadLean, tiltTool, useRotaryAxisMoves, usePolarWhenNecessary
threeAxisPolarMode, threeAxisPolarLineAngle, polarMachiningGroup, polarMode, polarLineAngle
group_geometry, pockets, pockets_detectOpenPockets, pockets_connectOpenPockets, pockets_errorCheck
pockets_detectOverlaps, isClearanceAreaEnabled, clearanceHeight_group, clearanceHeight_mode
clearanceHeight_ref, clearanceHeightFromHighest_checkStock, clearanceHeightFromLowest_checkStock
clearanceHeightFromHighest_checkModel, clearanceHeightFromLowest_checkModel
clearanceHeightFromHighest_checkFixture, clearanceHeightFromLowest_checkFixture
clearanceHeight_offset, clearanceHeight_value, zClearance, relativeZClearance
clearanceHeight_absolute, retractHeight_group, retractHeight_mode, retractHeight_ref
retractHeightFromHighest_checkStock, retractHeightFromLowest_checkStock
retractHeightFromHighest_checkModel, retractHeightFromLowest_checkModel
retractHeightFromHighest_checkFixture, retractHeightFromLowest_checkFixture, retractHeight_offset
retractHeight_value, zRetract, relativeZRetract, retractHeight_absolute, feedHeight_group
feedHeight_mode, feedHeight_ref, feedHeightFromHighest_checkStock, feedHeightFromLowest_checkStock
feedHeightFromHighest_checkModel, feedHeightFromLowest_checkModel
feedHeightFromHighest_checkFixture, feedHeightFromLowest_checkFixture, feedHeight_offset
feedHeight_value, useZFeed, feedHeight_absolute, topHeight_group, topHeight_mode, topHeight_ref
topHeightFromHighest_checkStock, topHeightFromLowest_checkStock, topHeightFromHighest_checkModel
topHeightFromLowest_checkModel, topHeightFromHighest_checkFixture
topHeightFromLowest_checkFixture, topHeight_offset, topHeight_value, topHeight_absolute
bottomHeight_group, bottomHeight_mode, bottomHeight_ref, bottomHeightFromHighest_checkStock
bottomHeightFromLowest_checkStock, bottomHeightFromHighest_checkModel
bottomHeightFromLowest_checkModel, bottomHeightFromHighest_checkFixture
bottomHeightFromLowest_checkFixture, bottomHeight_offset, bottomHeight_value
bottomHeight_absolute, group_passes, tolerance, contourTolerance, calculationTolerance
thinningTolerance, chainingTolerance, gougingTolerance, backoffDistance
maximumFinishingStepoverJl, nullPass, tangentialFragmentExtensionDistance, preserveOrder
bothWaysJL, maximumStepover, minimumRoughingStepover, flatTipRadius, maximumEnsureCutRadius
ensureCutRadius, applyFinalSmoothingDeviation, roughingSmoothingDeviationJl
maximumRoughingStepsJl, minimumFinishingStepover, doMultipleDepths, maximumStepdown
useStockToLeave, verticalStockToLeave, simpleStockToLeave, useCombinedFilter, useDMKSmoothing
smoothingFilter, smoothingFilterMode, smoothingFilterMaxSpacing, smoothingFilterMaxAngle
smoothingFilterTolerance, useFeedOptimization, reducedFeedChange, reducedFeedRadius
reducedFeedDistance, reducedFeedrate, reduceOnlyInnerCorners, group_linking, highFeedrateMode
highFeedrateModeProxy, highFeedrate, allowRapidRetract, safeDistance, stayDownDistance
group_leadsTranstions, smoothTransitions, leadInSweepJl, leadInDistanceJl, leadInRadius
leadInVerticalRadius, leadOutDistanceJL, leadOutSweepJl, leadOutRadius, doRamp, rampType
allowPlungingOutsideStockJl, rampAngle, maximumRampZStepdown, rampClearanceHeight
helicalRampDiameter, smoothRampJl, allowPlunging, allowHelicalRamps, allowContourRamps
allowSmoothContourRamps, allowZigZagRamps, group_entry_drill_positions, predrillPositions
entryPositions, generate_connections, connections_retraction_type, connectionMoveClearanceAreaType
connectionMoveClearanceArea_orientation_mode, connectionMoveClearanceArea_orientation_selAxis
connectionMoveClearanceArea_orientation_flipAxis, connectionMoveClearanceArea_flipDirection
connectionMoveClearanceAreaUp_orientation_mode, connectionMoveClearanceAreaUp_orientation_selAxis
connectionMoveClearanceAreaUp_orientation_flipAxis, connectionMoveClearanceAreaUp_flipDirection
connectionMoveClearanceArea_origin_mode, connectionMoveClearanceArea_origin_point
connectionMoveClearanceAreaHeight_mode, connectionMoveClearanceAreaHeight_ref
connectionMoveClearanceAreaHeight_offset, connectionMoveClearanceAreaHeight_value
connectionMoveClearanceAreaHeight_absolute, connectionMoveClearanceAreaCylinderRadius_mode
connectionMoveClearanceAreaCylinderRadius_ref
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkStock
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkModel
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaCylinderRadius_offset, connectionMoveClearanceAreaCylinderRadius_direct
connectionMoveClearanceAreaCylinderRadius_value
connectionMoveClearanceAreaCylinderRadius_absolute
connectionMoveClearanceAreaCylinderCapPosZHeight_mode
connectionMoveClearanceAreaCylinderCapPosZHeight_ref
connectionMoveClearanceAreaCylinderCapPosZHeight_offset
connectionMoveClearanceAreaCylinderCapPosZHeight_value
connectionMoveClearanceAreaCylinderCapPosZHeight_absolute
connectionMoveClearanceAreaSphereRadius_mode, connectionMoveClearanceAreaSphereRadius_ref
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkStock
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkModel
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaSphereRadius_offset, connectionMoveClearanceAreaSphereRadius_direct
connectionMoveClearanceAreaSphereRadius_value, connectionMoveClearanceAreaSphereRadius_absolute
connectionMoveClearanceAreaCuboid_mode, connectionMoveClearanceAreaCuboid_symmetricalOffsets
connectionMoveClearanceAreaCuboidPosX_value, connectionMoveClearanceAreaCuboidPosX_offset
connectionMoveClearanceAreaCuboidNegX_value, connectionMoveClearanceAreaCuboidNegX_offset
connectionMoveClearanceAreaCuboidPosY_value, connectionMoveClearanceAreaCuboidPosY_offset
connectionMoveClearanceAreaCuboidNegY_value, connectionMoveClearanceAreaCuboidNegY_offset
connectionMoveClearanceAreaCuboidPosZ_value, connectionMoveClearanceAreaCuboidPosZ_offset
connectionMoveClearanceAreaCuboidNegZ_value, connectionMoveClearanceAreaCuboidNegZ_offset
use_tool_stepdown, tool_stepdown, tool_finishingStepdown, use_tool_stepover, tool_stepover
tool_finishingStepover, tool_rampType, tool_rampAngle, associatedView
```

### WSF drill brad 3mm (`drill`, 564 names)

```
advancedMode, betaMode, alphaMode, isXpress, licenseMultiaxis, license3D, metric
isAssemblyDocument, context, strategy, operation_description, group_tool, isOperationTemplate
isTappingOperation, isDrillingOperation, tool_selectionMethod, tool_searchMethod
tool_exactDiameter, tool_diameterRatio, tool_searchTolerance, tool_minDiameter, tool_maxDiameter
tool_minDiameterRatio, tool_maxDiameterRatio, tool_isFormTapping, tool_minFluteLengthAboveTop
tool_checkLengthBelowHolder, tool_minLengthBelowHolder, tool_maxLengthBelowHolder
tool_checkTipAngle, tool_minTipAngle, tool_maxTipAngle, tool_checkCornerRadius
tool_minCornerRadius, tool_maxCornerRadius, autoToolSelection, tool_type, undercut, tool_isTurning
tool_isMill, tool_isDrill, tool_isJet, tool_isDepositing, tool_taperedType, tool_unit, tool_number
tool_diameterOffset, tool_lengthOffset, tool_compensationOffset, tool_turret
tool_manualToolChange, tool_breakControl, tool_live, tool_material, tool_description, tool_comment
tool_vendor, tool_productId, tool_productLink, tool_diameter, tool_maximumCuttingDiameter
tool_tipDiameter, tool_tipOffset, tool_cornerRadius, tool_inclusiveAngle, tool_taperAngle
tool_tipAngle, tool_threadTipType, tool_threadTipWidth, tool_threadTipRadius
tool_threadProfileAngle, tool_tipLength, tool_fluteLength, tool_shoulderLength, tool_bodyLength
tool_overallLength, tool_shaftDiameter, tool_segmentHeight, tool_segmentDiameterLower
tool_segmentDiameterUpper, tool_shaftSegmentHeight, tool_shaftSegmentDiameterLower
tool_shaftSegmentDiameterUpper, tool_threadPitch, tool_maximumThreadPitch, tool_minimumThreadPitch
tool_numberOfTeeth, tool_numberOfFlutes, tool_shoulderDiameter, tool_upperRadius
tool_profileRadius, tool_lowerRadius, tool_axialDistance, tool_chamferWidth, tool_chamferAngle
holder_attached, holder_description, holder_comment, holder_vendor, holder_productId
holder_productLink, holder_libraryName, tool_holderGaugeLength, tool_assemblyGaugeLength
group_feedspeed, preset_search, preset_contains, tool_spindleSpeed, tool_stockDiameter
tool_surfaceSpeed, tool_rampSpindleSpeed, tool_useFeedPerRevolution, tool_feedCutting
tool_feedPerTooth, tool_feedEntry, tool_feedExit, tool_feedTransition, tool_feedRamp
tool_feedPlunge, tool_feedPerRevolution, tool_feedRetract, tool_feedRetractPerRevolution
tool_clockwise, tool_coolant, featureOperationId, surfaceZHigh, surfaceZLow, surfaceXLow
surfaceXHigh, surfaceYLow, surfaceYHigh, stockZHigh, stockZLow, stockXLow, stockXHigh, stockYLow
stockYHigh, auto_threadAngle, auto_threadPitch, auto_threadMinorDiameter, auto_threadMajorDiameter
auto_threadCrestDiameter, auto_threadRootDiameter, auto_threadPitchDiameter
auto_threadModeledDiameter, auto_threadDepth, auto_threadSide, auto_threadIsInternal
auto_threadIsExternal, auto_threadHeightSharpTip, auto_threadDepthSharpTip, auto_threadHandedness
auto_threadIsLeftHanded, auto_threadIsRightHanded, auto_threadClass, auto_threadStandard
auto_threadDesignation, auto_threadIsFullLength, auto_threadFrontOffset, auto_threadTopOffset
auto_threadBackOffset, auto_threadBottomOffset, auto_threadLength, auto_hasThreadData
auto_threadDataState, auto_hasThreadLengthData, useShaftAndHolder, shaftAndHolderMode
checkShaftAndHolder, useShoulder, shoulderClearance, useShaft, shaftClearance, useHolder
holderClearance, headClearance, minPenetration, fullDepthShortfall, checkTool, useMachineSpindle
machineSpindleClearance, useMachineTable, machineTableClearance, machiningTypeGroup
multiAxisMachiningType, machineAnglesInToolpaths, overrideToolView, view_orientation_mode
view_orientation_axisZ, view_orientation_flipZ, view_orientation_axesZX_unselected_default
view_orientation_axesZY_unselected_default, view_orientation_axesXY_unselected_default
view_orientation_cSys, view_orientation_surfaceNormal, view_orientation_axisX
view_orientation_flipX, view_orientation_axisY, view_orientation_flipY
view_align_to_view_direction, view_select_angles, view_turn_from_recipe, view_tilt_from_recipe
view_origin_mode, view_origin_point, view_model_point, view_origin_boxPoint, view_stock_point
show_machine, rotaryAxis_group, multiAxisRotaryAxis_orientation_mode
multiAxisRotaryAxis_orientation_axisRotary, multiAxisRotaryAxis_orientation_cSys
multiAxisRotaryAxis_origin_mode, multiAxisRotaryAxis_origin_point, leadLean, toRotaryAxis
multiAxisTiltAngleFixed, toolAxisLimits, toolAxisLimitReferenceZ, minimumTilt5Axis
maximumTilt5Axis, useRotaryAxisMoves, usePolarWhenNecessary, threeAxisPolarMode
threeAxisPolarLineAngle, polarMachiningGroup, polarMode, polarLineAngle, group_geometry
canBeFallbackOperation, isFallbackOperation, isContourGeometry, geometryType, isFallback, holeMode
holeSignatureSelection, operationHoleSignature, holePoints, holeFaces, selectSameDiameter
selectSameOrientation, selectSameDepth, selectSameTopZ, selectSameDiameters, selectSameDepths
checkForOcclusions, holeDiameterMinimum, holeDiameterMaximum, containmentBoundary
autoMergeHoleSegments, drillingReference, isDrillingRefTrimming, orderHolesByAxis
orderHolesByDepth, holeToolpathOrder, holeToolpathOrder_bidirectional, reverseOrder, numberOfHoles
useMultiAxisDrilling, doLimitAngle, limitAngleMinimum, limitAngleMaximum, drillMode
drillLinkPasses, compareTolerance, auto_holeTopDiameter, auto_holeMinComponentCount
auto_holeIsThrough, overrideModel, holeModel, includeSetupModel, useCheckSurface
modelRadialClearance, modelAxialClearance, viewAbsoluteClearances, checkSurfaceSelectionSets
radialClearanceInfo, axialClearanceInfo, clearanceInfo, isClearanceAreaEnabled
clearanceArea_group, clearanceAreaType, clearanceArea_orientation_mode
clearanceArea_orientation_selAxis, clearanceArea_orientation_flipAxis, clearanceArea_origin_mode
clearanceArea_origin_point, clearanceArea_origin_pointUseOffset, clearanceArea_origin_pointXOffset
clearanceArea_origin_pointYOffset, clearanceArea_origin_pointZOffset, clearanceArea_model_point
clearanceArea_origin_boxPoint, clearanceArea_stock_point, clearanceHeight_group
clearanceHeight_mode, clearanceHeight_componentIndex, clearanceHeight_ref
clearanceHeightFromHighest_checkStock, clearanceHeightFromLowest_checkStock
clearanceHeightFromHighest_checkModel, clearanceHeightFromLowest_checkModel
clearanceHeightFromHighest_checkFixture, clearanceHeightFromLowest_checkFixture
clearanceHeight_offset, clearanceHeight_value, zClearance, relativeZClearance
clearanceHeight_absolute, clearanceAreaSize_group, clearanceAreaHeight_mode
clearanceAreaHeight_componentIndex, clearanceAreaHeight_ref
clearanceAreaHeightFromHighest_checkStock, clearanceAreaHeightFromLowest_checkStock
clearanceAreaHeightFromHighest_checkModel, clearanceAreaHeightFromLowest_checkModel
clearanceAreaHeightFromHighest_checkFixture, clearanceAreaHeightFromLowest_checkFixture
clearanceAreaHeight_offset, clearanceAreaHeight_value, clearanceAreaHeight_absolute
clearanceAreaCylinderRadius_mode, clearanceAreaCylinderRadius_ref
clearanceAreaCylinderRadiusFromOutermost_checkStock
clearanceAreaCylinderRadiusFromOutermost_checkModel
clearanceAreaCylinderRadiusFromOutermost_checkFixture, clearanceAreaCylinderRadius_offset
clearanceAreaCylinderRadius_direct, clearanceAreaCylinderRadius_value
clearanceAreaCylinderRadius_absolute, clearanceAreaSphereRadius_mode
clearanceAreaSphereRadius_ref, clearanceAreaSphereRadiusFromOutermost_checkStock
clearanceAreaSphereRadiusFromOutermost_checkModel
clearanceAreaSphereRadiusFromOutermost_checkFixture, clearanceAreaSphereRadius_offset
clearanceAreaSphereRadius_direct, clearanceAreaSphereRadius_value
clearanceAreaSphereRadius_absolute, clearanceAreaCuboid_mode, symmetricalOffsets
clearanceAreaCuboidPosZ_value, clearanceAreaCuboidPosZ_offset, clearanceAreaCuboidNegZ_value
clearanceAreaCuboidNegZ_offset, clearanceAreaCuboidPosY_value, clearanceAreaCuboidPosY_offset
clearanceAreaCuboidNegY_value, clearanceAreaCuboidNegY_offset, clearanceAreaCuboidPosX_value
clearanceAreaCuboidPosX_offset, clearanceAreaCuboidNegX_value, clearanceAreaCuboidNegX_offset
retractHeight_group, retractHeight_mode, retractHeight_componentIndex, retractHeight_ref
retractHeightFromHighest_checkStock, retractHeightFromLowest_checkStock
retractHeightFromHighest_checkModel, retractHeightFromLowest_checkModel
retractHeightFromHighest_checkFixture, retractHeightFromLowest_checkFixture, retractHeight_offset
retractHeight_value, zRetract, relativeZRetract, retractHeight_absolute, retractAreaType
retractAreaSize_group, retractAreaHeight_mode, retractAreaHeight_componentIndex
retractAreaHeight_ref, retractAreaHeightFromHighest_checkStock
retractAreaHeightFromLowest_checkStock, retractAreaHeightFromHighest_checkModel
retractAreaHeightFromLowest_checkModel, retractAreaHeightFromHighest_checkFixture
retractAreaHeightFromLowest_checkFixture, retractAreaHeight_offset, retractAreaHeight_value
retractAreaHeight_absolute, retractAreaCylinderRadius_mode, retractAreaCylinderRadius_ref
retractAreaCylinderRadiusFromOutermost_checkStock
retractAreaCylinderRadiusFromOutermost_checkModel
retractAreaCylinderRadiusFromOutermost_checkFixture, retractAreaCylinderRadius_offset
retractAreaCylinderRadius_direct, retractAreaCylinderRadius_value
retractAreaCylinderRadius_absolute, retractAreaSphereRadius_mode, retractAreaSphereRadius_ref
retractAreaSphereRadiusFromOutermost_checkStock, retractAreaSphereRadiusFromOutermost_checkModel
retractAreaSphereRadiusFromOutermost_checkFixture, retractAreaSphereRadius_offset
retractAreaSphereRadius_direct, retractAreaSphereRadius_value, retractAreaSphereRadius_absolute
feedHeight_group, feedHeight_mode, feedHeight_componentIndex, feedHeight_ref
feedHeightFromHighest_checkStock, feedHeightFromLowest_checkStock
feedHeightFromHighest_checkModel, feedHeightFromLowest_checkModel
feedHeightFromHighest_checkFixture, feedHeightFromLowest_checkFixture, feedHeight_offset
feedHeight_value, useZFeed, feedHeight_absolute, topHeight_group, topHeight_mode
topHeight_componentIndex, topHeight_ref, topHeightFromHighest_checkStock
topHeightFromLowest_checkStock, topHeightFromHighest_checkModel, topHeightFromLowest_checkModel
topHeightFromHighest_checkFixture, topHeightFromLowest_checkFixture, topHeight_offset
topHeight_value, topHeight_absolute, bottomHeight_group, bottomHeight_mode
bottomHeight_componentIndex, bottomHeight_ref, bottomHeightFromHighest_checkStock
bottomHeightFromLowest_checkStock, bottomHeightFromHighest_checkModel
bottomHeightFromLowest_checkModel, bottomHeightFromHighest_checkFixture
bottomHeightFromLowest_checkFixture, bottomHeight_offset, bottomHeight_value
bottomHeight_absolute, toChamferWidth, toChamferDiameter, drillTipThroughBottom, breakThroughDepth
group_cycle, drillingCycle, cycleType, cycle_isSpotDrill, cycle_tappingDirection, cycleOutput
incrementalDepth, threading, cycleDirection, pitch, useHoleDiameter, diameter, peckingDepth
peckingDepthReduction, minimumPeckingDepth, accumulatedPeckingDepth, chipBreakDistance
dwellBeforeRetract, dwellingPeriod, boringShift, shiftOrientation, backBoreDistance
useMultipleSteps, numberOfSteps, cycleStepover, cycleCompensationType, cycleRepeatPass
startingDepth, dwellDepth, stopSpindle, positioningSpindleSpeed, breakThroughDistance
breakThroughFeedrate, breakThroughFeedPerRevolution, breakThroughSpindleSpeed, positioningFeedrate
positioningFeedPerRevolution, trimmedHoles_group, startingDepthOffset, holePositioningFeedrate
holePositioningSpindleSpeed, reverseSpindle, tolerance, useStockToLeave, stockToLeave
group_linking, ignoreLinkGouges, retractionPolicy, usePolarRapidLinks
polarRotationCenter_origin_mode, polarRotationCenter_origin_point, highFeedrateMode
highFeedrateModeProxy, highFeedrate, safeDistance, generate_connections
connections_retraction_type, connectionMoveClearanceAreaType
connectionMoveClearanceArea_orientation_mode, connectionMoveClearanceArea_orientation_selAxis
connectionMoveClearanceArea_orientation_flipAxis, connectionMoveClearanceArea_flipDirection
connectionMoveClearanceAreaUp_orientation_mode, connectionMoveClearanceAreaUp_orientation_selAxis
connectionMoveClearanceAreaUp_orientation_flipAxis, connectionMoveClearanceAreaUp_flipDirection
connectionMoveClearanceArea_origin_mode, connectionMoveClearanceArea_origin_point
connectionMoveClearanceAreaHeight_mode, connectionMoveClearanceAreaHeight_ref
connectionMoveClearanceAreaHeight_offset, connectionMoveClearanceAreaHeight_value
connectionMoveClearanceAreaHeight_absolute, connectionMoveClearanceAreaCylinderRadius_mode
connectionMoveClearanceAreaCylinderRadius_ref
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkStock
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkModel
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaCylinderRadius_offset, connectionMoveClearanceAreaCylinderRadius_direct
connectionMoveClearanceAreaCylinderRadius_value
connectionMoveClearanceAreaCylinderRadius_absolute
connectionMoveClearanceAreaCylinderCapPosZHeight_mode
connectionMoveClearanceAreaCylinderCapPosZHeight_ref
connectionMoveClearanceAreaCylinderCapPosZHeight_offset
connectionMoveClearanceAreaCylinderCapPosZHeight_value
connectionMoveClearanceAreaCylinderCapPosZHeight_absolute
connectionMoveClearanceAreaSphereRadius_mode, connectionMoveClearanceAreaSphereRadius_ref
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkStock
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkModel
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaSphereRadius_offset, connectionMoveClearanceAreaSphereRadius_direct
connectionMoveClearanceAreaSphereRadius_value, connectionMoveClearanceAreaSphereRadius_absolute
connectionMoveClearanceAreaCuboid_mode, connectionMoveClearanceAreaCuboid_symmetricalOffsets
connectionMoveClearanceAreaCuboidPosX_value, connectionMoveClearanceAreaCuboidPosX_offset
connectionMoveClearanceAreaCuboidNegX_value, connectionMoveClearanceAreaCuboidNegX_offset
connectionMoveClearanceAreaCuboidPosY_value, connectionMoveClearanceAreaCuboidPosY_offset
connectionMoveClearanceAreaCuboidNegY_value, connectionMoveClearanceAreaCuboidNegY_offset
connectionMoveClearanceAreaCuboidPosZ_value, connectionMoveClearanceAreaCuboidPosZ_offset
connectionMoveClearanceAreaCuboidNegZ_value, connectionMoveClearanceAreaCuboidNegZ_offset
use_tool_stepdown, tool_stepdown, tool_finishingStepdown, use_tool_stepover, tool_stepover
tool_finishingStepover, tool_rampType, associatedView
```

### WSF parallel bullnose (`parallel`, 512 names)

```
advancedMode, betaMode, alphaMode, isXpress, licenseMultiaxis, license3D, metric
isAssemblyDocument, context, strategy, operation_description, group_tool, isOperationTemplate
tool_type, undercut, tool_isTurning, tool_isMill, tool_isDrill, tool_isJet, tool_isDepositing
tool_taperedType, tool_unit, tool_number, tool_diameterOffset, tool_lengthOffset
tool_compensationOffset, tool_turret, tool_manualToolChange, tool_breakControl, tool_live
tool_material, tool_description, tool_comment, tool_vendor, tool_productId, tool_productLink
tool_diameter, tool_maximumCuttingDiameter, tool_tipDiameter, tool_tipOffset, tool_cornerRadius
tool_inclusiveAngle, tool_taperAngle, tool_tipAngle, tool_threadTipType, tool_threadTipWidth
tool_threadTipRadius, tool_threadProfileAngle, tool_tipLength, tool_fluteLength
tool_shoulderLength, tool_bodyLength, tool_overallLength, tool_shaftDiameter, tool_segmentHeight
tool_segmentDiameterLower, tool_segmentDiameterUpper, tool_shaftSegmentHeight
tool_shaftSegmentDiameterLower, tool_shaftSegmentDiameterUpper, tool_threadPitch
tool_maximumThreadPitch, tool_minimumThreadPitch, tool_numberOfTeeth, tool_numberOfFlutes
tool_shoulderDiameter, tool_upperRadius, tool_profileRadius, tool_lowerRadius, tool_axialDistance
tool_chamferWidth, tool_chamferAngle, holder_attached, holder_description, holder_comment
holder_vendor, holder_productId, holder_productLink, holder_libraryName, tool_holderGaugeLength
tool_assemblyGaugeLength, group_feedspeed, tool_spindleSpeed, tool_stockDiameter
tool_surfaceSpeed, tool_rampSpindleSpeed, tool_feedCutting, tool_feedPerTooth, tool_feedEntry
tool_feedExit, tool_feedTransition, tool_feedRamp, tool_feedPlunge, tool_feedPerRevolution
tool_feedRetract, tool_clockwise, tool_coolant, featureOperationId, surfaceZHigh, surfaceZLow
surfaceXLow, surfaceXHigh, surfaceYLow, surfaceYHigh, stockZHigh, stockZLow, stockXLow, stockXHigh
stockYLow, stockYHigh, useShaftAndHolder, shaftAndHolderMode, useShoulder, shoulderClearance
useShaft, shaftClearance, useHolder, holderClearance, headClearance, useMachineSpindle
machineSpindleClearance, useMachineTable, machineTableClearance, machiningTypeGroup
multiAxisMachiningType, overrideToolView, view_orientation_mode, view_orientation_axisZ
view_orientation_flipZ, view_orientation_axesZX_unselected_default
view_orientation_axesZY_unselected_default, view_orientation_axesXY_unselected_default
view_orientation_cSys, view_orientation_surfaceNormal, view_orientation_axisX
view_orientation_flipX, view_orientation_axisY, view_orientation_flipY
view_align_to_view_direction, view_select_angles, view_turn_from_recipe, view_tilt_from_recipe
view_origin_mode, view_origin_point, view_model_point, view_origin_boxPoint, view_stock_point
show_machine, rotaryAxis_group, multiAxisRotaryAxis_orientation_mode
multiAxisRotaryAxis_orientation_axisRotary, multiAxisRotaryAxis_orientation_cSys
multiAxisRotaryAxis_origin_mode, multiAxisRotaryAxis_origin_point, leadLean, toolAxisMode
leadAngle, leanAngle, toFromPoint, toFromPointUseOffset, toFromPointXOffset, toFromPointYOffset
toFromPointZOffset, toFromCurve, multiAxisTiltAngleFixed, toolAxisLimitReferenceZ
smoothingDistance, smoothingAngle, fixedAngle, tiltAngle, tiltTool, applyMicroTilt, tiltToolMode
useCurveFittedACA, tiltToolToFromPoint, tiltToolToFromPointUseOffset, tiltToolToFromPointXOffset
tiltToolToFromPointYOffset, tiltToolToFromPointZOffset, tiltToolToFromCurve, group_axislimits
maximumTiltValidation, minimumTilt5Axis, maximumTilt5Axis, tiltLimitMode, useRotaryAxisMoves
usePolarWhenNecessary, threeAxisPolarMode, threeAxisPolarLineAngle, polarMachiningGroup, polarMode
polarLineAngle, group_geometry, boundaryMode, useSilhouetteAsMachiningBoundary, silhouetteAperture
minimumSilhouetteArea, machiningBoundarySel, boundaryContainment, boundaryOffset
machiningBoundaryOffset, boundaryConfineTool, contactOnly, slopeConfinement, slopeAngleFrom
slopeAngleTo, useRestMachining, restMaterialSource, restMaterialBodies, restMaterialFromJob
restMaterialOperation, restMaterialUnion, restMaterialPrevious, restMaterialCutterDiameter
restMaterialCornerRadius, restMaterialTaperAngle, restMaterialShoulderLength
restMaterialStockToLeave, restMaterialResolution, restMaterialOverlap, restMaterialFile
restMaterialTool, restMaterialAdjustment, restMaterialAdjustmentOffset, ignoreStockLessThan
overrideModel, model, includeSetupModel, useCheckSurface, touchAvoidMode, checkSurfaceSelection
viewAbsoluteClearances, checkSurfaceSelectionSets, radialClearanceInfo, axialClearanceInfo
clearanceInfo, checkSurfaceClearance, trimCheckSurfaces, isClearanceAreaEnabled
clearanceArea_group, clearanceAreaType, clearanceArea_orientation_mode
clearanceArea_orientation_selAxis, clearanceArea_orientation_flipAxis, clearanceArea_origin_mode
clearanceArea_origin_point, clearanceArea_origin_pointUseOffset, clearanceArea_origin_pointXOffset
clearanceArea_origin_pointYOffset, clearanceArea_origin_pointZOffset, clearanceArea_model_point
clearanceArea_origin_boxPoint, clearanceArea_stock_point, clearanceHeight_group
clearanceHeight_mode, clearanceHeight_ref, clearanceHeightFromHighest_checkStock
clearanceHeightFromLowest_checkStock, clearanceHeightFromHighest_checkModel
clearanceHeightFromLowest_checkModel, clearanceHeightFromHighest_checkFixture
clearanceHeightFromLowest_checkFixture, clearanceHeight_offset, clearanceHeight_value, zClearance
relativeZClearance, clearanceHeight_absolute, clearanceAreaSize_group, clearanceAreaHeight_mode
clearanceAreaHeight_ref, clearanceAreaHeightFromHighest_checkStock
clearanceAreaHeightFromLowest_checkStock, clearanceAreaHeightFromHighest_checkModel
clearanceAreaHeightFromLowest_checkModel, clearanceAreaHeightFromHighest_checkFixture
clearanceAreaHeightFromLowest_checkFixture, clearanceAreaHeight_offset, clearanceAreaHeight_value
clearanceAreaHeight_absolute, clearanceAreaCylinderRadius_mode, clearanceAreaCylinderRadius_ref
clearanceAreaCylinderRadiusFromOutermost_checkStock
clearanceAreaCylinderRadiusFromOutermost_checkModel
clearanceAreaCylinderRadiusFromOutermost_checkFixture, clearanceAreaCylinderRadius_offset
clearanceAreaCylinderRadius_direct, clearanceAreaCylinderRadius_value
clearanceAreaCylinderRadius_absolute, clearanceAreaSphereRadius_mode
clearanceAreaSphereRadius_ref, clearanceAreaSphereRadiusFromOutermost_checkStock
clearanceAreaSphereRadiusFromOutermost_checkModel
clearanceAreaSphereRadiusFromOutermost_checkFixture, clearanceAreaSphereRadius_offset
clearanceAreaSphereRadius_direct, clearanceAreaSphereRadius_value
clearanceAreaSphereRadius_absolute, clearanceAreaCuboid_mode, symmetricalOffsets
clearanceAreaCuboidPosZ_value, clearanceAreaCuboidPosZ_offset, clearanceAreaCuboidNegZ_value
clearanceAreaCuboidNegZ_offset, clearanceAreaCuboidPosY_value, clearanceAreaCuboidPosY_offset
clearanceAreaCuboidNegY_value, clearanceAreaCuboidNegY_offset, clearanceAreaCuboidPosX_value
clearanceAreaCuboidPosX_offset, clearanceAreaCuboidNegX_value, clearanceAreaCuboidNegX_offset
retractHeight_group, retractHeight_mode, retractHeight_ref, retractHeightFromHighest_checkStock
retractHeightFromLowest_checkStock, retractHeightFromHighest_checkModel
retractHeightFromLowest_checkModel, retractHeightFromHighest_checkFixture
retractHeightFromLowest_checkFixture, retractHeight_offset, retractHeight_value, zRetract
relativeZRetract, retractHeight_absolute, retractAreaType, retractAreaSize_group
retractAreaHeight_mode, retractAreaHeight_ref, retractAreaHeightFromHighest_checkStock
retractAreaHeightFromLowest_checkStock, retractAreaHeightFromHighest_checkModel
retractAreaHeightFromLowest_checkModel, retractAreaHeightFromHighest_checkFixture
retractAreaHeightFromLowest_checkFixture, retractAreaHeight_offset, retractAreaHeight_value
retractAreaHeight_absolute, retractAreaCylinderRadius_mode, retractAreaCylinderRadius_ref
retractAreaCylinderRadiusFromOutermost_checkStock
retractAreaCylinderRadiusFromOutermost_checkModel
retractAreaCylinderRadiusFromOutermost_checkFixture, retractAreaCylinderRadius_offset
retractAreaCylinderRadius_direct, retractAreaCylinderRadius_value
retractAreaCylinderRadius_absolute, retractAreaSphereRadius_mode, retractAreaSphereRadius_ref
retractAreaSphereRadiusFromOutermost_checkStock, retractAreaSphereRadiusFromOutermost_checkModel
retractAreaSphereRadiusFromOutermost_checkFixture, retractAreaSphereRadius_offset
retractAreaSphereRadius_direct, retractAreaSphereRadius_value, retractAreaSphereRadius_absolute
retractAreaCuboidOffset, topHeight_group, topHeight_mode, topHeight_ref
topHeightFromHighest_checkStock, topHeightFromLowest_checkStock, topHeightFromHighest_checkModel
topHeightFromLowest_checkModel, topHeightFromHighest_checkFixture
topHeightFromLowest_checkFixture, topHeight_offset, topHeight_value, topHeight_absolute
bottomHeight_group, bottomHeight_mode, bottomHeight_ref, bottomHeightFromHighest_checkStock
bottomHeightFromLowest_checkStock, bottomHeightFromHighest_checkModel
bottomHeightFromLowest_checkModel, bottomHeightFromHighest_checkFixture
bottomHeightFromLowest_checkFixture, bottomHeight_offset, bottomHeight_value
bottomHeight_absolute, group_passes, tolerance, contourTolerance, totalSurfaceTolerance
surfaceTriangulationTolerance, calculationTolerance, thinningTolerance, chainingTolerance
gougingTolerance, machineSteepAreas, steepMinimumStepover, steepStepdown, perpendicularPasses
machineStraightOn, simpleOrdering, totalPassAngle, passReference, passAngle, stepover
cuspHeightStepover, minimumFragmentLength, fragmentExtensionDistance, direction, upDownMilling
upDownMillingShallowAngle, doMultipleDepths, maximumStepdown, numberOfStepdowns, orderByDepth
useStockToLeave, stockToLeave, verticalStockToLeave, simpleStockToLeave, filletsEnabled
filletsCornerRadius, useCombinedFilter, useDMKSmoothing, smoothingFilter, smoothingFilterMode
smoothingFilterMaxSpacing, smoothingFilterMaxAngle, smoothingFilterTolerance, useFeedOptimization
reducedFeedChange, reducedFeedRadius, reducedFeedDistance, reducedFeedrate, reduceOnlyInnerCorners
group_linking, retractionPolicy, highFeedrateMode, highFeedrateModeProxy, highFeedrate
allowRapidRetract, safeDistance, stayDownDistance, linkingZLow, group_leadsTranstions
entry_verticalRadius, leadInRadius, leadInVerticalRadius, exit_verticalRadius, leadOutRadius
leadOutVerticalRadius, transitionType, group_entry_drill_positions, entryPositions
generate_connections, connections_retraction_type, connectionMoveClearanceAreaType
connectionMoveClearanceArea_orientation_mode, connectionMoveClearanceArea_orientation_selAxis
connectionMoveClearanceArea_orientation_flipAxis, connectionMoveClearanceArea_flipDirection
connectionMoveClearanceAreaUp_orientation_mode, connectionMoveClearanceAreaUp_orientation_selAxis
connectionMoveClearanceAreaUp_orientation_flipAxis, connectionMoveClearanceAreaUp_flipDirection
connectionMoveClearanceArea_origin_mode, connectionMoveClearanceArea_origin_point
connectionMoveClearanceAreaHeight_mode, connectionMoveClearanceAreaHeight_ref
connectionMoveClearanceAreaHeight_offset, connectionMoveClearanceAreaHeight_value
connectionMoveClearanceAreaHeight_absolute, connectionMoveClearanceAreaCylinderRadius_mode
connectionMoveClearanceAreaCylinderRadius_ref
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkStock
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkModel
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaCylinderRadius_offset, connectionMoveClearanceAreaCylinderRadius_direct
connectionMoveClearanceAreaCylinderRadius_value
connectionMoveClearanceAreaCylinderRadius_absolute
connectionMoveClearanceAreaCylinderCapPosZHeight_mode
connectionMoveClearanceAreaCylinderCapPosZHeight_ref
connectionMoveClearanceAreaCylinderCapPosZHeight_offset
connectionMoveClearanceAreaCylinderCapPosZHeight_value
connectionMoveClearanceAreaCylinderCapPosZHeight_absolute
connectionMoveClearanceAreaSphereRadius_mode, connectionMoveClearanceAreaSphereRadius_ref
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkStock
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkModel
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaSphereRadius_offset, connectionMoveClearanceAreaSphereRadius_direct
connectionMoveClearanceAreaSphereRadius_value, connectionMoveClearanceAreaSphereRadius_absolute
connectionMoveClearanceAreaCuboid_mode, connectionMoveClearanceAreaCuboid_symmetricalOffsets
connectionMoveClearanceAreaCuboidPosX_value, connectionMoveClearanceAreaCuboidPosX_offset
connectionMoveClearanceAreaCuboidNegX_value, connectionMoveClearanceAreaCuboidNegX_offset
connectionMoveClearanceAreaCuboidPosY_value, connectionMoveClearanceAreaCuboidPosY_offset
connectionMoveClearanceAreaCuboidNegY_value, connectionMoveClearanceAreaCuboidNegY_offset
connectionMoveClearanceAreaCuboidPosZ_value, connectionMoveClearanceAreaCuboidPosZ_offset
connectionMoveClearanceAreaCuboidNegZ_value, connectionMoveClearanceAreaCuboidNegZ_offset
use_tool_stepdown, tool_stepdown, tool_finishingStepdown, use_tool_stepover, tool_stepover
tool_finishingStepover, tool_rampType, tool_rampAngle, associatedView
```

### Setup `WSF spike setup` (287 names)

```
advancedMode, betaMode, alphaMode, isXpress, licenseMultiaxis, license3D, metric
isAssemblyDocument, strategy, operation_description, isOperationTemplate, surfaceZHigh
surfaceZLow, surfaceXLow, surfaceXHigh, surfaceYLow, surfaceYHigh, stockZHigh, stockZLow
stockXLow, stockXHigh, stockYLow, stockYHigh, modelDiameter, modelDiameterInner, modelLength
stockDiameter, stockDiameterInner, stockLength, job_machine, job_groupSetup, job_type
job_enableWCSForAdditive, arrange_setup, job_boolArrange, job_spindle, machineMaxTilt
machineMaxTiltValidation, machine_dimension_x, machine_dimension_y, machine_dimension_z
job_groupWCS, wcs_orientation_mode, job_rotaryAxis, wcs_orientation_axisZ, wcs_orientation_flipZ
wcs_orientation_axesZX_unselected_default, wcs_orientation_axesZY_unselected_default
wcs_orientation_axesXY_unselected_default, wcs_orientation_axesXZ_unselected_default
wcs_orientation_cSys, job_axisXPosition, wcs_orientation_axisX, wcs_orientation_flipX
wcs_orientation_axisY, wcs_orientation_flipY, wcs_origin_turning, wcs_origin_mode
wcs_origin_point, wcs_model_point, wcs_origin_boxPoint, wcs_stock_point, job_homePosition
job_safeZ_group, jobSafeZ_mode, jobSafeZ_offset, jobSafeZ_value, jobSafeZ_absolute
chuckFront_mode, chuckFront_offset, chuckFront_value, chuckFront_absolute, chuckFront_ref
job_groupMachine, job_machine_manufacturer, job_machine_type, job_machine_configuration
job_machine_configuration_id, job_machine_build_strategy_id, job_groupWorkflow, job_slmOptimized
job_useModel, job_workingModel, job_model, job_useSpunProfile, job_spunProfileTolerance
job_spunProfileSmoothing, job_spunProfileConvertToSketch, job_fixtureGroup, job_fixture
radialFixtureClearanceSetup, axialFixtureClearanceSetup, job_fixtureAttachment
job_enableStockSimForAdditive, job_groupStock, job_stockMode, job_groundStockModelOrigin
job_stockOffsetMode, job_isSameComponent, job_continueMachining, job_stockSolid, job_boundingSolid
job_useBoundingSolidWCS, job_stockOffsetSides, job_stockOffsetTop, job_stockOffsetBottom
job_stockOffsetXBack, job_stockOffsetXFront, job_stockOffsetYBack, job_stockOffsetYFront
job_stockOffsetZBack, job_stockOffsetZFront, job_stockFixedX, job_stockFixedXMode
job_stockFixedXOffset, job_stockFixedY, job_stockFixedYMode, job_stockFixedYOffset
job_stockFixedZ, job_stockFixedZMode, job_stockFixedZOffset, job_stockOffset, job_stockHeight
job_stockAxisEnabled, job_stockAxis, job_stockDiameter, job_stockDiameterInner, job_stockLength
job_stockLengthMode, job_stockLengthOffset, job_stockRadialOffset, job_stockOffsetFront
job_stockOffsetBack, job_stockFixedRoundingValue, job_groupCuttingForce
job_stockSpecificCuttingForce, job_stockSpecificCuttingForceUnit, job_stockInitialToolWear
job_stockInitialToolWearUnit, job_stockCuttingForceOutputFolder, job_groupStockMaterial
job_groupStockInfo, job_stockInfoDiameter, job_stockInfoLength, job_stockInfoDimensionX
job_stockInfoDimensionY, job_stockInfoDimensionZ, job_groupModelInfo, job_modelInfoDiameter
job_modelInfoLength, job_modelInfoDimensionX, job_modelInfoDimensionY, job_modelInfoDimensionZ
job_position, job_positionReference_origin_mode, job_positionReference_origin_point
job_positionReference_model_point, job_positionReference_origin_boxPoint
job_positionReference_fixture_point, job_positionReference_stock_point, job_positionAttach
job_positionXOffset, job_positionYOffset, job_positionZOffset, generate_connections
connections_retraction_type, connectionMoveClearanceAreaType
connectionMoveClearanceArea_orientation_mode, connectionMoveClearanceArea_orientation_selAxis
connectionMoveClearanceArea_orientation_flipAxis, connectionMoveClearanceArea_flipDirection
connectionMoveClearanceAreaUp_orientation_mode, connectionMoveClearanceAreaUp_orientation_selAxis
connectionMoveClearanceAreaUp_orientation_flipAxis, connectionMoveClearanceAreaUp_flipDirection
connectionMoveClearanceArea_origin_mode, connectionMoveClearanceArea_origin_point
connectionMoveClearanceAreaHeight_mode, connectionMoveClearanceAreaHeight_ref
connectionMoveClearanceAreaHeight_offset, connectionMoveClearanceAreaHeight_value
connectionMoveClearanceAreaHeight_absolute, connectionMoveClearanceAreaCylinderRadius_mode
connectionMoveClearanceAreaCylinderRadius_ref
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkStock
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkModel
connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaCylinderRadius_offset, connectionMoveClearanceAreaCylinderRadius_direct
connectionMoveClearanceAreaCylinderRadius_value
connectionMoveClearanceAreaCylinderRadius_absolute, connectionMoveClearanceAreaCylinderCappingMode
connectionMoveClearanceAreaCylinderCapPosZHeight_mode
connectionMoveClearanceAreaCylinderCapPosZHeight_ref
connectionMoveClearanceAreaCylinderCapPosZHeight_offset
connectionMoveClearanceAreaCylinderCapPosZHeight_value
connectionMoveClearanceAreaCylinderCapPosZHeight_absolute
connectionMoveClearanceAreaSphereRadius_mode, connectionMoveClearanceAreaSphereRadius_ref
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkStock
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkModel
connectionMoveClearanceAreaSphereRadiusFromOutermost_checkFixture
connectionMoveClearanceAreaSphereRadius_offset, connectionMoveClearanceAreaSphereRadius_direct
connectionMoveClearanceAreaSphereRadius_value, connectionMoveClearanceAreaSphereRadius_absolute
connectionMoveClearanceAreaCuboid_mode, connectionMoveClearanceAreaCuboid_symmetricalOffsets
connectionMoveClearanceAreaCuboidPosX_value, connectionMoveClearanceAreaCuboidPosX_offset
connectionMoveClearanceAreaCuboidNegX_value, connectionMoveClearanceAreaCuboidNegX_offset
connectionMoveClearanceAreaCuboidPosY_value, connectionMoveClearanceAreaCuboidPosY_offset
connectionMoveClearanceAreaCuboidNegY_value, connectionMoveClearanceAreaCuboidNegY_offset
connectionMoveClearanceAreaCuboidPosZ_value, connectionMoveClearanceAreaCuboidPosZ_offset
connectionMoveClearanceAreaCuboidNegZ_value, connectionMoveClearanceAreaCuboidNegZ_offset
setupHasMillingOperations, milling_generate_connections, milling_connections_retraction_type
milling_connectionMoveClearanceAreaType, milling_connectionMoveClearanceArea_orientation_mode
milling_connectionMoveClearanceArea_orientation_selAxis
milling_connectionMoveClearanceArea_orientation_flipAxis
milling_connectionMoveClearanceArea_flipDirection
milling_connectionMoveClearanceAreaUp_orientation_mode
milling_connectionMoveClearanceAreaUp_orientation_selAxis
milling_connectionMoveClearanceAreaUp_orientation_flipAxis
milling_connectionMoveClearanceAreaUp_flipDirection
milling_connectionMoveClearanceArea_origin_mode, milling_connectionMoveClearanceArea_origin_point
milling_connectionMoveClearanceAreaHeight_mode, milling_connectionMoveClearanceAreaHeight_ref
milling_connectionMoveClearanceAreaHeight_offset, milling_connectionMoveClearanceAreaHeight_value
milling_connectionMoveClearanceAreaHeight_absolute
milling_connectionMoveClearanceAreaCylinderRadius_mode
milling_connectionMoveClearanceAreaCylinderRadius_ref
milling_connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkStock
milling_connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkModel
milling_connectionMoveClearanceAreaCylinderRadiusFromOutermost_checkFixture
milling_connectionMoveClearanceAreaCylinderRadius_offset
milling_connectionMoveClearanceAreaCylinderRadius_direct
milling_connectionMoveClearanceAreaCylinderRadius_value
milling_connectionMoveClearanceAreaCylinderRadius_absolute
milling_connectionMoveClearanceAreaSphereRadius_mode
milling_connectionMoveClearanceAreaSphereRadius_ref
milling_connectionMoveClearanceAreaSphereRadiusFromOutermost_checkStock
milling_connectionMoveClearanceAreaSphereRadiusFromOutermost_checkModel
milling_connectionMoveClearanceAreaSphereRadiusFromOutermost_checkFixture
milling_connectionMoveClearanceAreaSphereRadius_offset
milling_connectionMoveClearanceAreaSphereRadius_direct
milling_connectionMoveClearanceAreaSphereRadius_value
milling_connectionMoveClearanceAreaSphereRadius_absolute
milling_connectionMoveClearanceAreaCuboid_mode
milling_connectionMoveClearanceAreaCuboid_symmetricalOffsets
milling_connectionMoveClearanceAreaCuboidPosX_value
milling_connectionMoveClearanceAreaCuboidPosX_offset
milling_connectionMoveClearanceAreaCuboidNegX_value
milling_connectionMoveClearanceAreaCuboidNegX_offset
milling_connectionMoveClearanceAreaCuboidPosY_value
milling_connectionMoveClearanceAreaCuboidPosY_offset
milling_connectionMoveClearanceAreaCuboidNegY_value
milling_connectionMoveClearanceAreaCuboidNegY_offset
milling_connectionMoveClearanceAreaCuboidPosZ_value
milling_connectionMoveClearanceAreaCuboidPosZ_offset
milling_connectionMoveClearanceAreaCuboidNegZ_value
milling_connectionMoveClearanceAreaCuboidNegZ_offset, job_groupPostVars, job_programName
job_programComment, job_groupMachineWCS, job_workOffset, job_probeWorkOffset
job_multipleWorkOffsets, job_numberOfWorkDuplicates, job_workOffsetIncrement, job_workOrder
platformVisibilityState, noBuildZoneVisibilityState, outOfBoundsModels, lastKnownCollisions
additiveMachineTechnology, associatedView
```
