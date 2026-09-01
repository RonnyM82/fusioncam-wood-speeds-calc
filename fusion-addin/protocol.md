# Message format between the Fusion add-in and the panel page

Status: draft 1, written 2026-09-01. The spike (build phase 0) must confirm the
items in "Confirm in the spike" before the first public build. This file is the
single source of truth for every message shape, every field name, and every
unit. Both sides pin these shapes with tests.

## Change log

| Date | Protocol | Change |
|---|---|---|
| 2026-09-01 | 1 | First draft. |
| 2026-09-01 | 1 | Corrections from the adversarial review, before any release, so no bump: the depth rule gates on `doMultipleDepths` for every levelled 2D strategy, an ambiguous cut direction serves the climb force model, `pageError` added, `opId` may never be null, regenReport rows carry `failed` with a reason, dumps ship null memory blobs. |
| 2026-09-01 | 1 | The Windows spike folded in, no bump: identity is `operationId`; feeds and angles are raw mm/min and degrees; the pocket reads `compensation`; the setup Z extents are `stockZHigh`, `stockZLow`, `surfaceZHigh`, `surfaceZLow`; pocket width is `maximumStepover`; the finishing names corrected; the write order is spindle then cutting feed with the feed per tooth never written; drill rows write the plunge feed; `params.useStockToLeave` and `setup.machine` added as optional fields; the panel address carries `build` and `theme`. |
| 2026-09-02 | 1 | Heights corrected, no bump: a `from contour`, `from hole top`, `from hole bottom` or `from point` height never reaches Fusion's `_value` parameter, so the add-in resolves it from the selected geometry through the setup frame and ships `zSource` and `zSpreadMm` beside `zMm` (additive). Drilling serves: the `drill` row of the mapping table maps to the drilling core, the tool identity guesses a drill family, and a drill apply row carries `rpm` and `plungeMmMin` only. |
| 2026-09-02 | 1 | A drill described as a brad point auto-confirms as a dowel drill (Scott's rule): `identifyTool` returns `guessCertain` and the panel skips that one confirmation. Page-side only, no wire change. |

## Versioning rules

1. Every message carries one integer `protocol` field. Both sides ignore fields
   they do not know, so adding a field never bumps the version. The version
   bumps only when a field the add-in reads is removed, renamed, or changes
   meaning or units.
2. The page is always the newest party. It accepts every version from the floor
   up and answers each add-in in the add-in's own version. The down-converters
   live in `js/fusion/protocol.js` and are pinned by one committed example
   message per historical version in the Node suite.
3. The floor starts at 1 and stays there as long as feasible. App Store review
   takes weeks, so the site must serve version N while N+1 sits in review.
4. The page carries a short list of known-bad add-in builds
   (`BAD_ADDIN_BUILDS` in `js/fusion/protocol.js`). For those builds the page
   refuses Apply, with the reason and the update link. Viewing still works.
5. The add-in's own version rides the panel address as a query string
   (`fusion.html?protocol=1&addin=0.1.0`), so the "too old" screen works even
   when messaging itself is broken.

## Transport

The add-in talks to the page with `palette.sendInfoToHTML(type, json)`. The
page receives it in `window.fusionJavaScriptHandler.handle(type, json)`. The
page talks to the add-in with `adsk.fusionSendData(type, json)`, which the
add-in receives as an `incomingFromHTML` event. Neither side relies on a
synchronous return value: every exchange is a message, and every reply is its
own message. The `type` argument is the message type below. The `json`
argument is the envelope, serialised.

## Envelope

Every message is a JSON object with at least:

```json
{ "protocol": 1, "type": "job" }
```

Messages about a specific snapshot also carry `"jobId"`. Unknown fields must
be ignored, never treated as an error.

## Units

Every length is millimetres. Every feed is millimetres per minute. Every
spindle speed is revolutions per minute. Every angle is degrees. The Python
side converts before sending and after receiving. `documentUnits` ("mm" or
"in") is for display only: the page computes in millimetres and shows the
document's unit first using the existing display pairs in `js/ui/format.js`.

## Message types

### hello (page to add-in)

Sent once the page has loaded its data files and registered its handler.

```json
{ "protocol": 1, "type": "hello", "pageBuild": "2026-09-01" }
```

The add-in starts a ten-second timer when it opens the panel. If no hello
arrives, it closes the panel and shows a native Fusion message: the add-in
needs an internet connection to wood.fusioncam.co.

### pageError (page to add-in)

Added 2026-09-01 after the adversarial review. The page loaded but cannot
serve: its data files failed to load or failed validation. Without this
message the add-in's hello timeout misreads a data failure as no internet.
The add-in shows the carried reason instead of the offline message. An
add-in that does not know this type ignores it and times out, which stays
safe.

```json
{ "protocol": 1, "type": "pageError", "reason": "..." }
```

### job (add-in to page)

The full document snapshot. Sent after hello, after a document switch, after a
document change, and on a refresh request. A new snapshot always carries a new
`jobId` (an increasing integer as a string).

```json
{
  "protocol": 1,
  "type": "job",
  "jobId": "3",
  "addinVersion": "0.1.0",
  "fusionVersion": "2.0.xxxxx",
  "documentUnits": "mm",
  "documentName": "scrubbed-or-real name",
  "memory": { "docBlob": "<string or null>", "userBlob": "<string or null>" },
  "setups": [ <setup> ]
}
```

Setup shape:

```json
{
  "setupId": "s1",
  "name": "Setup1",
  "stock": {
    "xMm": 2400, "yMm": 1200, "zMm": 18,
    "stockTopZMm": 18, "stockBottomZMm": 0,
    "modelTopZMm": 18, "modelBottomZMm": 0
  },
  "machine": {
    "vendor": "Matsuura", "model": "Camplete",
    "spindle": { "minRpm": null, "maxRpm": 24000, "powerKw": 13.2,
                 "peakTorqueNm": 8.4, "peakTorqueRpm": 12000 }
  },
  "operations": [ <operation> ]
}
```

`machine` is optional (added 2026-09-01). A field the machine definition
left empty is `null`, never zero.

Operation shape (the raw facts; the page decides everything from these):

```json
{
  "opId": "op-12",
  "name": "2D Contour1",
  "strategy": "contour2d",
  "suppressed": false,
  "isValid": true,
  "hasToolpath": true,
  "tool": {
    "typeString": "flat end mill",
    "diameterMm": 12.7,
    "cornerRadiusMm": 0,
    "flutes": 2,
    "fluteLengthMm": 32,
    "shoulderLengthMm": 36,
    "vendor": "Onsrud",
    "productId": "60-123",
    "description": "1/2 compression 2FL",
    "comment": ""
  },
  "params": {
    "stepdownMm": 9,
    "doMultipleDepths": true,
    "stepoverMm": null,
    "optimalLoadMm": null,
    "useStockToLeave": false,
    "stockToLeaveMm": 0,
    "verticalStockToLeaveMm": 0,
    "finishing": { "enabled": false, "stepoverMm": null, "passes": null },
    "direction": null,
    "compensation": "left",
    "rampAngleDeg": 4
  },
  "heights": {
    "top":    { "mode": "from stock top",    "offsetMm": 0,    "zMm": 18,   "zSource": "parameter", "zSpreadMm": null },
    "bottom": { "mode": "from stock bottom", "offsetMm": -0.5, "zMm": -0.5, "zSource": "parameter", "zSpreadMm": null }
  },
  "currentFeeds": {
    "rpm": 18000, "cuttingMmMin": 5000, "plungeMmMin": 1000,
    "rampMmMin": 1000, "leadInMmMin": 5000, "leadOutMmMin": 5000
  }
}
```

Any raw fact the add-in could not read is `null`, never omitted and never
guessed. A parameter a strategy does not have is `null`. The page treats a
`null` it needs as a reason to refuse that operation with a plain sentence.
`opId` is the one field that must never be null: the add-in drops an
operation it cannot identify and says so in its log, and the page refuses a
row without an `opId`, because Apply could not address it (recorded
2026-09-01). It is the string form of Fusion's `operationId`, which is
stable across saves (spike, section 8). `setupId` is the setup's
`operationId` the same way.

Heights (corrected 2026-09-02, spike-results-windows.md section 12). Fusion
resolves a height into its `_value` parameter only when the mode rests on a
plane it knows: a stock or model face, another height, the origin. For the
geometry modes, `from contour`, `from hole top`, `from hole bottom` and
`from point`, the `_absolute` flag reads false, `_value` stays 0.0, and
Fusion resolves the height from the selected geometry when it generates. The
first build shipped that 0.0 as a reading, and every 2D operation whose
bottom sat on a selected face refused with "no positive depth". The add-in
now resolves those heights itself. It takes the selected geometry through
the setup frame (`Setup.workCoordinateSystem`, trusted only after it
reproduces the setup's own Z extents) and ships the extreme, the highest
level for a top and the lowest for a bottom, plus the mode's offset.
`zSource` says which happened: `"parameter"` when Fusion resolved it,
`"geometry"` when the add-in did, `null` when neither could and `zMm` is
`null`. `zSpreadMm` is the distance between the highest and the lowest level
the selection offered, 0 for one level, `null` unless the source is
geometry. Both fields are additive: an older add-in sends neither and the
page reads `null`. The page's mapping notes a spread above a hundredth of a
millimetre in the reading line, and a `null` height in a geometry mode names
the mode in its refusal.

### persist (page to add-in)

Sent whenever the user confirms a choice worth keeping. The add-in stores the
blob without reading it: document scope goes into a document attribute group
(`wood-speeds-feeds`), user scope into one per-user JSON file. The blobs come
back verbatim in the next job message.

```json
{ "protocol": 1, "type": "persist", "scope": "user", "blob": "<string>" }
```

Blob contents are the page's business alone. Current page-side shapes (may
change without a protocol bump, because only the page reads them):

- user blob: `{ "tools": { "<toolKey>": { "geometry": "compression", "upcutLengthMm": 12.7 } } }`
- doc blob: `{ "materialBySetup": {"s1": "mdf"}, "machineId": "Generic Heavy nesting router (default)", "profile": "standard", "rpm": 18000, "firstCut": true, "finishRows": ["op-12"], "toolOverrides": {} }`

The machine is stored by its name string, never by its position in the preset
list, because the list order changes (schema.md records the same trap for the
website's share links).

### refresh (page to add-in)

The user asked for a fresh snapshot. The add-in answers with a new job.

```json
{ "protocol": 1, "type": "refresh" }
```

### apply (page to add-in)

The ticked rows and their numbers. Every value the add-in must write is here,
explicitly. The add-in writes the spindle speed, then the cutting feed, then
the plunge, ramp, lead-in and lead-out feeds. It never writes the feed per
tooth: in Fusion the feed per tooth follows the cutting feed, and a
feed-per-tooth write would rewrite the cutting feed instead (corrected
2026-09-01 from the spike, section 6; the first draft had this backwards).
`feedPerToothMm` stays in the row for the record. A drill row writes the
spindle speed and the plunge feed only, because a drill's cutting feed is
not editable, and so a drill row carries `opId`, `rpm` and `plungeMmMin`
alone (2026-09-02).

```json
{
  "protocol": 1,
  "type": "apply",
  "jobId": "3",
  "rows": [
    {
      "opId": "op-12",
      "rpm": 18000,
      "cuttingMmMin": 4390,
      "feedPerToothMm": 0.122,
      "plungeMmMin": 1463,
      "rampMmMin": 1463,
      "leadInMmMin": 4390,
      "leadOutMmMin": 4390
    }
  ]
}
```

### writeReport (add-in to page)

The synchronous half of the report, sent as soon as the writes finish. A stale
`jobId` writes nothing: the report says so and a fresh job message follows.

```json
{
  "protocol": 1,
  "type": "writeReport",
  "jobId": "3",
  "stale": false,
  "undoHint": "One undo step reverses every write.",
  "rows": [
    { "opId": "op-12", "status": "written" },
    { "opId": "op-13", "status": "failed", "reason": "..." },
    { "opId": "op-14", "status": "inconsistent", "reason": "..." },
    { "opId": "op-15", "status": "skipped_changed", "reason": "the operation changed after the snapshot" }
  ]
}
```

`inconsistent` means a write failed after another write in the same operation
succeeded. The page renders that row loudest and repeats the undo hint,
because a new spindle speed against an old feed is a dangerous chip load.

### regenReport (add-in to page)

The asynchronous half. Sent per operation, or batched, as Fusion finishes
regenerating.

```json
{
  "protocol": 1,
  "type": "regenReport",
  "jobId": "3",
  "rows": [ { "opId": "op-12", "status": "ok" } ]
}
```

A row's `status` is `"ok"` or `"failed"`. A failed row carries a `"reason"`
string. The page accepts both statuses (recorded 2026-09-01, from the first
build of the add-in side).

## Dump format

A dump is a job message written to a file, plus:

```json
{ "dump": true, "capturedAt": "2026-09-01T10:00:00Z", "scrubbed": true }
```

A dump ships `memory.docBlob` and `memory.userBlob` as `null`: the blobs are
user data, not raw facts, and a committed test input must not carry them
(recorded 2026-09-01). The dump command scrubs free text before writing:
`documentName`, setup and operation `name` fields become `doc-1`, `setup-1`,
`op-<n>`, and tool `description` and `comment` keep only the words that name
a geometry or a series (a committed allowlist in the dump code). Vendor and product id stay,
because they are the matching keys and are not customer data. A human reads
every dump before it is committed. Each committed dump pairs with a
human-approved `*.expected.json` holding the mapping module's output per
operation. Raw height modes stay in the dump next to the resolved values, so
the tests prove the mapping policy never needed Fusion.

## JavaScript module interfaces

These are the exact exports the panel builds against. All three modules are
pure: no DOM, no fetch, no timers. The purity fence in `tests/run.js` enforces
this for the whole `js/fusion/` directory.

### js/fusion/protocol.js

```js
export const PROTOCOL_VERSION = 1;
export const PROTOCOL_FLOOR = 1;
export const BAD_ADDIN_BUILDS = [];           // add-in version strings refused for Apply
export function acceptsProtocol(v) {}          // true when FLOOR <= v <= PROTOCOL_VERSION
export function isBadBuild(addinVersion) {}
export function validateEnvelope(msg) {}       // { ok, errors: [..] }
export function readJob(msg) {}                // { ok, job, errors } — normalises, fills null
export function makeHello(pageBuild) {}
export function makePersist(scope, blob) {}
export function makeRefresh() {}
export function makeApply(jobId, rows) {}
```

### js/fusion/tool-identity.js

```js
// rawTool is the job message tool shape above.
// Returns { key, kind, guess, guessSource, guessCertain, seriesMatches }.
//   key:    "onsrud|60-123" when a product id exists, else a stable digest of
//           type, diameter, flutes and description.
//   kind:   "router" | "drill" | "ball" | "chamfer", from Fusion's tool type
//           string (added 2026-09-01). Only a router bit takes the geometry
//           question; the other kinds carry no guess.
//   guess:  the prefill for the one question the tool takes. A router bit:
//           "upcut" | "downcut" | "compression" | "straight" | null. A drill
//           (2026-09-02): "dowel" | "through" | "hinge" | "twist" | null,
//           the family ids of js/ui/drill-tables.js. Other kinds: null.
//   guessSource: "product_id" | "description" | null.
//   seriesMatches: [{ vendor, series }] from chiploads.json entries.
//   guessCertain: true only for a drill whose description says "brad" and
//           no other family word: a brad point is the dowel drill's own
//           tip geometry, so the panel serves that pick unconfirmed
//           (Scott's rule, 2026-09-02). The user can still change it.
// The guess prefills the pick. Only the user's confirmation makes it real,
// except the certain brad point above.
export function toolKind(typeString) {}
export function identifyTool(rawTool, chiploads) {}
```

### js/fusion/map-operation.js

```js
// op is the job message operation shape above. choices is:
//   { toolType, upcutLengthMm, finishing }
//   toolType: the user-confirmed geometry for this op's tool.
//   finishing: true when the user marked this row a finish pass.
// Returns one of:
//   { status: "mapped", calc: { mode: "rout", toolType, diameterMm,
//     flutesTotal, apMm, aeMm, direction, upcutLengthMm, profileOverride },
//     reading: "..." }
//   { status: "mapped", calc: { mode: "drill", diameterMm, holeDepthMm },
//     reading: "..." }                          // a drill (2026-09-02)
//   { status: "unsupported", reason: "..." }   // strategy has no data
//   { status: "unreadable", reason: "..." }    // a needed raw fact was null
// It never invents a value and never touches material, machine, rpm or
// profile — those are panel state. profileOverride is "finishing" or null.
export function mapOperation(op, choices) {}
```

## The mapping policy the module implements

| Strategy | Width of cut | Depth of cut |
|---|---|---|
| `contour2d` | Full diameter (a slot) | see the depth rule below |
| `contour2d` marked finish | null (the core assumes the 1 mm skim) | see the depth rule below |
| `pocket2d` | Full diameter (every level starts as a slot) | see the depth rule below |
| `adaptive2d`, `adaptive` | `optimalLoadMm` | see the depth rule below |
| `slot` | Full diameter | see the depth rule below |

The depth rule (corrected 2026-09-01 after the adversarial review). For the
levelled 2D strategies (`contour2d`, `pocket2d`, `adaptive2d`, `slot`): the
pass depth is `stepdownMm` when `doMultipleDepths` is true, and
`top.zMm - bottom.zMm` when `doMultipleDepths` is false. A null
`doMultipleDepths` is unreadable, because Fusion keeps the last stepdown
value in the dialog even when the box is off. For the 3D `adaptive`, the
stepdown is always active: the pass depth is `stepdownMm`, and a null
`stepdownMm` is unreadable. The first draft read `stepdownMm` whenever it was
set, which served a shallow-pass feed for a cut that runs the full depth in
one pass, with no refusal.
| `drill` | none: the drilling chart is a feed per revolution with every cutting edge counted | the hole, resolved hole top minus resolved hole bottom, from the hole faces (2026-09-02) |
| `parallel`, `scallop`, `contour`, `pocket_clearing`, and the other 3D strategies | unsupported: no published chart covers 3D surfacing yet | |
| anything else | unsupported, named in the reason | |

Climb or conventional: `params.direction` where the strategy has it (the
2D adaptive), else `compensation` on a 2D contour or a 2D pocket, where
`left` reads as climb. The spike confirmed the `left` reading on 2026-09-01
from Fusion's own help text and the posted G-code (section 3). An ambiguous direction (`params.direction`
"both", `compensation` "both" or "center") serves the climb cutting-force
model, and the reading line says so. Climb is the conservative model here: in
every measured pair in kc.json the climb Ks is the higher value, so the climb
model gives the lower power and hold-down caps (corrected 2026-09-01; the
first draft said conventional and had the conservatism backwards). Any other
direction string the mapping does not recognise is unreadable, never
defaulted.

## Fusion parameter names the Python side uses

Every name below was read inside Fusion 2704.1.53 on Windows on 2026-09-01
through the Fusion connector. The evidence, with the full parameter dump per
strategy, is in `spike-results-windows.md` (the section number is given).
Nothing in this table rests on documentation alone any more.

| Name | Meaning | Where | Section |
|---|---|---|---|
| `tool_spindleSpeed` | spindle speed, raw rpm | all | 5 |
| `tool_surfaceSpeed` | surface speed | all | 5 |
| `tool_feedCutting` | cutting feed, raw mm/min | all; not editable on a drill | 2, 5 |
| `tool_feedPerTooth` | feed per tooth, raw cm; follows the cutting feed | all; reads 0 on a drill | 6 |
| `tool_feedPlunge` | plunge feed | all | 2 |
| `tool_feedRamp`, `tool_feedEntry`, `tool_feedExit` | ramp, lead-in, lead-out feeds | all; not editable on a drill | 2 |
| `maximumStepover` | pocket width of cut (default 0.6 × D) | `pocket2d`, and `contour2d` roughing | 2 |
| `stepover` | 3D stepover | `parallel` only | 2 |
| `optimalLoad` | adaptive width (default 0.4 × D) | `adaptive2d` | 2 |
| `maximumStepdown` | stepdown; raw reads 0.0 while `doMultipleDepths` is off | `contour2d`, `pocket2d`, `adaptive2d`, `slot`, `parallel` | 2 |
| `doMultipleDepths` | multiple depths on | same five; absent on `drill` | 2 |
| `useStockToLeave` | the switch in front of the stock-to-leave pair; both read 0.0 when off | all but `drill` | 2 |
| `stockToLeave`, `verticalStockToLeave` | stock to leave | `slot` has the vertical one only | 2 |
| `doMultipleFinishingPasses` | finishing passes on | `contour2d` | 2 |
| `doFinishingPasses` | finishing passes on | `pocket2d` | 2 |
| `numberOfFinishingStepovers` | finishing pass count | `contour2d`, `pocket2d` | 2 |
| `finishingStepover` | finishing pass width | `contour2d`, `pocket2d` | 2 |
| `rampAngle` | ramp angle, raw degrees | `contour2d`, `pocket2d`, `adaptive2d`, `slot` | 2, 5 |
| `compensation` | `left` (climb) or `right` (conventional); no `center` in this build | `contour2d`, `pocket2d` | 2, 3 |
| `direction` | `climb` or `conventional` | `adaptive2d` (`parallel` carries `one way`, `other way`, `both ways`) | 2 |
| `topHeight_value`, `bottomHeight_value` | resolved heights, raw cm, relative to the setup origin | all | 2 |
| `topHeight_mode`, `topHeight_offset` (and bottom) | raw height settings; mode strings listed in section 2 | all | 2 |
| `topHeight_absolute`, `bottomHeight_absolute` | true when `_value` holds the resolved height; false for the geometry modes, whose `_value` stays 0.0 | all | 12 |
| `topHeight_ref`, `bottomHeight_ref` | the selection a `from point` height refers to | all | 12 |
| `contours`, `pockets`, `holeFaces` | the geometry selections a `from contour` or `from hole` height resolves from | `contour2d`; `pocket2d`, `adaptive2d`, `slot`; `drill` | 12 |
| `Setup.workCoordinateSystem` | the setup frame as a Matrix3D; translation in millimetres against centimetre bounding boxes | property on the setup | 12 |
| `job_stockFixedX/Y/Z` | fixed stock size | setup | 2 |
| `stockZHigh`, `stockZLow`, `surfaceZHigh`, `surfaceZLow` | stock and model top and bottom, raw cm, relative to the setup origin | setup | 2 |
| `OperationBase.strategy` | the strategy id string on an existing operation | property, not a parameter | 1 |
| `OperationBase.operationId` | the stable integer id; `itemByOperationId` finds it | property; no `entityToken`, no `id` | 8 |
| `isToolpathValid`, `hasToolpath` | toolpath state; `isValid` is the API object's validity | properties | other readings |

Unit facts the read side rests on (section 5): lengths raw centimetres,
feeds raw millimetres per minute, spindle speed raw rpm, angles raw degrees.
The API documentation says radians for angles. The reading says degrees,
and the reading wins. Feeds in an inch document are untested.

## Facts from the spike the code must honour

- Identity is `operationId` (section 8): the same value twice in one
  session and across two saves, found again through
  `Operations.itemByOperationId` and `Setups.itemByOperationId`. `opId` is
  its string form. Identity on an unsaved document is untested.
- Write order (section 6): spindle speed, then the cutting feed, then the
  plunge, ramp, lead-in and lead-out feeds. The feed per tooth follows the
  cutting feed on its own and is never written: a feed-per-tooth write
  rewrites the cutting feed's expression, and the last write becomes the
  literal. The apply row still carries `feedPerToothMm` for the record, and
  the add-in ignores it. On a drill the cutting feed and the feed per tooth
  are not editable, so a drill row writes the spindle speed and the plunge
  feed only.
- A feed-only write does not invalidate the toolpath (section 7):
  `hasToolpath` and `isToolpathValid` stay true. The regen report says
  `ok` at once for such a row. A `rampAngle` write does invalidate, and
  restoring the expression does not restore validity.
- One command execution is one undo step (section 10). After any undo the
  add-in re-checks `hasMissingReferences()` on the setup and on every
  operation before it trusts the document, because an undo was seen to
  drop the setup's model link and four face selections.
- The setup machine (section 9): `setup.machine` gives the machine, and the
  spindle sits on the kinematics part with `partType` 2 as
  `MachineSpindle` with `minSpeed`, `maxSpeed`, `power` (kW), `peakTorque`
  (Nm) and `peakTorqueSpeed`. A zero means the field was left empty and
  ships as null. The job's setup shape carries it as an optional
  `"machine"` field (additive, no bump).
- `params.useStockToLeave` is an optional boolean on the operation shape
  (additive, no bump).
- The palette (section 11): `window.adsk` arrives 20 to 32 ms after the
  page scripts run, after the load event, so the page polls for it before
  it decides it is outside Fusion. The palette is created with the newer
  browser flag. `adsk.fusionSendData` resolves to the string the add-in put
  in `returnData`, and an empty string means a stale palette from an
  earlier add-in run. The panel address carries `build` (a cache-bust tag)
  and `theme` (`dark` or `light`, from Fusion's resolved user-interface
  theme) as query fields. The page maps `theme` onto the design system's
  own scheme attribute (`data-lt-scheme`), which is what the vendored
  tokens read. The cache-bust tag reaches the page, its stylesheets and
  its two entry scripts. The modules those scripts import carry no tag,
  so a stale copy of one can outlive a site update by the host's cache
  window (ten minutes on the current host).
- Heights in the geometry modes (section 12, 2026-09-02): `_absolute` is
  false, `_value` is 0.0, and the height lives in the selection. The
  add-in resolves it through `Setup.workCoordinateSystem`, whose
  translation read in millimetres against centimetre bounding boxes, and
  trusts the frame only after it reproduces `surfaceZLow` and
  `surfaceZHigh` from the setup models. A frame that fails the check
  ships every geometry height as null. A sketch curve's bounding box
  reads empty, so a sketch selection goes through its world geometry.
- `getChoices()` returns a three-tuple: a flag, the titles, then the value
  strings with their quotes. `Tool.description` is a formatted string;
  match tools on the `tool_description` parameter or the tool JSON.
- The Manufacture workspace is `CAMEnvironment` and its Actions panel is
  `CAMActionPanel`. `document.creationId` and `document.dataFile.id` read
  on a saved document.

## Still to confirm, on the real add-in

1. The page-to-add-in half of the messaging (`incomingFromHTML`) and the
   `returnData` reply. The connector could not wire them. Windows and Mac.
2. The panel loads https://wood.fusioncam.co/fusion.html over HTTPS once
   the page is deployed, and the ten-second offline timeout works.
3. The Mac pass of everything above.
4. Feeds in an inch document, and identity on an unsaved document.
5. The unit of the `workCoordinateSystem` translation in an inch document
   (the frame check refuses rather than guesses if it differs), and a
   sketch-selected contour's height on a real operation (2026-09-02).
