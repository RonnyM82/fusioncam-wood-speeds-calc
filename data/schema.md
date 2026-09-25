# Speeds & Feeds Calculator — Data Schema

Three seed files in `data/`, all versioned, every entry carrying provenance. The page fetches these as static JSON; no build step. Never average across vendors at load time: the Gentle / Standard / Aggressive profiles are computed as bands over the merged envelope per material + tool geometry, and the output names the contributing vendor.

## chiploads.json
One entry per (source, series, material, diameter). Fields:

| Field | Meaning |
|---|---|
| `source` / `vendor` | key into `sources` (document, retrieval date) and display name |
| `series` | vendor part-number family, null for series-less charts |
| `tool_geometry` | `straight`, `spiral_upcut`, `spiral_downcut`, `compression_spiral`, `compression_chipbreaker_finisher`, `chipbreaker_finisher`, `hogger_low/high_helix_chipbreaker`, `finisher`, `straight_o_flute`, `unspecified` |
| `flutes` | nominal count, null if the chart is flute-agnostic (per-tooth values) |
| `material` | `mdf`, `particleboard`, `laminated_pb`, `hardwood`, `softwood`, `plywood`, `softwood_ply`, `hpl`, `laminated_chipboard` |
| `diameter_mm` | always set. The ITA rows carry 12 mm, the nesting-tool size their guide states (amendment 2026-08-29); the loader still accepts null for a future unsized chart, and such a chart contributes at every diameter |
| `fz_min_mm` / `fz_max_mm` | published band, mm/tooth, converted from `original` where imperial |
| `doc_basis` | depth condition the band assumes (`1xD`) |
| `flute_basis` | `per_tooth_total`; ITA rows are `..._user_switchable` (upcut-only is the alternative reading) |
| `data_class` | `measured` / `vendor` / `practitioner` |

Top-level: `depth_derating` (1×/2×/3×D → 100/75/50%), `profiles` (band definitions), `analysis_notes` (the within-Onsrud geometry spread).

## kc.json
- `affine_models[]` — Ks/Int per (material, tool: `spiral_30` | `straight`, direction). Spiral rows have Int = 0 (flat kc); straight rows carry the small-chip rise. All IWMS-25 rows are `measured_chart_read` (±2 N/mm² Ks, ±0.3 Int) with the `speed_caveat` uplift (+15–20% at production speed).
- `plywood_rules` — no density scaling, no orientation input, dense-ply +15–20% estimate band.
- `solid_timber_model` — Curti 2021 density-normalised model, five species anchors, validity 287–1080 kg/m³, radiata mapped by density and flagged as such.
- `oak_validation[]` — Maderas 2014 (Q. petraea, 29 m/s) and BioResources 2021 (Q. robur, 38.35 m/s) as independent cross-checks with model coefficients; use to sanity-test the timber engine, not as primary data.
- `minimum_chip_thickness` — measured sharp edge radii 2–4 µm; geometric floor «practical MDF floor; floor is thermal/wear. Worn-edge radius: open gap.
- `osb` — refuse to model. `wear` — multipliers + the 600–1,000 m calibration anchor.

## machines.json
Machine presets (velocity-class data), HSD spindle table, acceleration tiers (derived — no OEM m/s² exists), spindle derating rule, vacuum defaults (μ 0.4, ΔP achieved 5 kPa, grip = μ·ΔP·area).

Amendment 2026-08-18: spiral entries whose chart row covers both cutting directions (Onsrud series 52-200/57-200) carry `covers_directions: ["upcut","downcut"]`, so down-cut coverage is explicit in the data rather than implied in code (decision D5). Entries whose chart states a tool-type exclusion carry `excludes_tool_types` (Rennie: "up OR down cut, NOT compression" → `["compression","straight"]`); the selector never serves an excluded tool type from that chart, and refuses with the chart's own scope as the reason when nothing else covers the pick. The validator rejects unknown values in `material`, `tool_geometry`, `covers_directions`, `excludes_tool_types` and `machine_class`, and non-numeric chip-load bands.

Amendment 2026-08-18 (later): the Onsrud Hard Plywood (catalogue p.118) and Soft Plywood cutting-data tables were extracted under source key `onsrud-2017-ply` — 117 entries, same series scope as the SW/HW/MDF extraction. Hard plywood maps to material `plywood`, soft plywood to `softwood_ply`. The soft table publishes no 52-200/57-200 spiral row; since the UI now offers hard and soft plywood as separate picks (D14), soft-ply spiral picks borrow the hard-ply chart as the nearest match via a material fallback, with a visible note (it reads conservative for the softer board). No other tool type falls back, so hard and soft bands never blend. The Freud and Rennie generic tables were also completed from research-session-1 (3.175/6.35/9.525 mm rows added), and generic big-iron charts (Freud, Rennie, Vortex) carry `machine_class: big_iron_10hp_plus`; a band served only by such charts warns that no conservative source tempers it.

## rules.json
Sourced rules the renderer needs that previously lived only in reference prose (decision D10). Same provenance discipline as the other files: every rule carries `source` (keyed into its own `sources` map) and `data_class`. Contents: the plunge/ramp one-third rule (Vortex), the lead-in/out equals-cutting-feed decision (project decision D2, `data_class: project_decision`), the 0.10/0.08 mm/tooth chip floor, the compression minimum-depth extra (1/16 in, block not warn), the corner model L = v²/a, reference defaults (rpm 18,000, breakpoint 12,000, max feed 30 m/min, spindle 10 kW, footprint 80 cm², feature 120 mm), and the profile-band convention note (D7).

## Envelope construction (decisions D1, D5, D11)
The calculator serves one band per (material, tool geometry class, diameter), never averaged across vendors, contributing vendor named in output. Under D11 (2026-08-18, replacing the D7 min-to-max hull): the **served band** comes from the geometry-and-diameter-matched charts when they exist (Onsrud for MDF/hardwood/softwood); materials with only generic geometry-unspecified rows serve those, with a visible "not geometry-resolved" note. When the charts eligible to serve disagree by more than the `disagreement_ratio` in rules.json (2×) in band midpoint, the most conservative chart serves alone. Gentle/Standard/Aggressive = lower edge/midpoint/upper edge of the served band. Every chart that does not serve renders as **named context** ("Also published, not setting this band: …"), so the big-iron numbers stay visible without setting the knob. D7's hull convention was replaced because profile positions on a min-max hull vary with vendor-coverage accidents: MDF's spiral hull spanned 7× while plywood's spanned 1.3×, making Gentle mean different things per material.

Presentation of context (2026-08-18, later): the core no longer builds the "Also published for this material…" prose sentence. `resolveBand` returns `servingBands` and `context` as structured band objects (label, geometry class, machine class, lo/hi), context sorted low to high, and the UI draws them as a chart ladder: every published chart for the pick on one chip-load scale, the serving chart highlighted, a dotted marker at the served feed per tooth, and big-iron charts tagged. Headless consumers of the core read the same structured fields. In the same pass, all user-facing copy moved to Simplified Technical English discipline (short sentences, active voice, one instruction per sentence, no contractions); the five binding-limit messages keep their meaning from the reference doc but are no longer verbatim quotes of it.

Selection rules retained from the adversarial reviews (2026-08-18): a diameter-resolved chart contributes only when the requested diameter falls within ±25% (`coverage_tolerance`) of its published range — outside that the chart is excluded with a visible note, never clamped, and when every chart is excluded the refusal carries those notes as its reason. A `spiral_upcut` entry serves a down-cut pick only when its `covers_directions` field says so (and vice versa), so an up-cut-only series can never set down-cut numbers silently. Charts with `excludes_tool_types` never serve those tool types, as primary or as context. Every other chart the material publishes renders as named context ("Also published for this material…"), with a plain-language geometry tag when it belongs to a different tool family, so the whole tool ladder is visible without setting the knob. Generic-only materials serve their generic charts for any tool type not excluded, with two notes: not geometry-resolved, and not tool-type-resolved (the tool-type pick does not move those numbers). The UI merges melamine naming synonyms into one pick (`laminated_pb` + `laminated_chipboard`); hard and soft plywood are separate picks (D14). OSB is absent from the UI list (D12) but the core still refuses it with the reason.

## machines.json amendments 2026-08-18
A `Generic / Heavy nesting router (default)` preset was added, composed from already-sourced parts (HSD ES929-class 10 kW spindle, heavy-nesting acceleration default, reference default breakpoint and max feed), `data_class: derived`. HSD spindle rows now carry `data_class: vendor`.

## machines.json amendment 2026-08-21
A `Heliner / 3-axis router` preset was added from the spindle's own torque and power chart (GDL70-24Z/12.0, 380 V, 20.0 A, 4-pole, air cooled), `data_class: vendor`. The chart holds 4.78 Nm flat from zero to 24,000 rpm. On a 4-pole motor, 800 Hz is 24,000 rpm, so the whole speed range sits below base frequency. The spindle is constant torque to its top speed. `breakpoint_rpm` therefore equals `rpm_max` at 24,000, power rises with speed, and 12 kW arrives only at 24,000 rpm. At 12,000 rpm the spindle gives 6 kW. Test `HELINER` in `tests/data.test.js` pins the breakpoint and cross-checks the published torque against the published power, because a revert to the 12,000 rpm reference default would double the served power at 12,000 rpm with nothing on the page to contradict it.

The 12 kW figure is the S6 60% air-cooled rating at 20 °C ambient. The chart publishes no continuous S1 figure, and none was derived, so the served `spindle_kw` is the S6 number and the preset note tells the user to reduce it for a long run. The machine publishes no cutting feed and no acceleration, so the reference default of 30 m/min and the heavy-nesting acceleration default serve, the same substitution every other preset without those figures takes. The entry was appended to the end of `machines` rather than inserted, because the UI writes the preset index into the share URL as `mc`.

## chiploads.json amendment 2026-08-26
The Vortex chip load chart now enters firsthand under source key `vortex-chart` (research/sources/vortex-chipLoadChart.pdf; the same chart prints on p.14 of Vortex_Catalog.pdf). 20 entries: four diameters (3.175/6.35/9.525/12.7 mm) across hardwood, softwood, plywood, MDF and HPL. The chart publishes softwood and plywood as one column, so the same band feeds both materials (Scott's call, 2026-08-26); MDF and particleboard also share a column, and the phenolic/paperstone column has no matching material and stays out. The two secondhand `vortex` entries (12.7 mm hardwood and MDF, via Woodshop News and the CAMheads thread) carry `superseded_by: vortex-chart`; the firsthand read confirms both values. Behaviour change: an HPL compression pick previously refused, because the only HPL chart (Rennie) excludes compression — the Vortex chart states no tool-type exclusion, so that pick now serves the Vortex generic band with the generic-chart notes. ENV8 pins the new outcome. The chart's 12.7 mm row is published as "1/2 in and up", but the entries stay at 12.7 mm, so diameters past 15.875 mm (the +25% coverage edge) still refuse rather than ride the row.

## rules.json amendment 2026-08-29
A `finishing` rule enters under source key `session-4-finishing` (research/research-session-4-finishing.md, the roughing-to-finishing research). The Finishing profile joins Gentle/Standard/Aggressive as a fourth position. It serves the low edge of the finisher-series charts (Onsrud 60-200, `tool_geometry: finisher`), the only published finishing chip loads, as the programmed chip with no chip-thinning compensation, because the vendor publishes those values for a finish pass and the light radial engagement is already inside the number. That is a deliberate cross-family borrow named in a note, and the tool's own charts stay visible as context. Plywood, soft ply, melamine and HPL have no finisher row, so they borrow the MDF finisher chart, the lowest of the three, with a note. Outside the finisher rows' ±25% diameter coverage (1/8 in, 4 mm, 1 in) the profile refuses with the reason. The deep-slot depth derate does not apply to a skim (a cut under half the diameter wide), and the first-cut reduction never applies: both compensate heavy engagement, and on a thin skim either drives the chip under the rubbing floor. In Finishing the chip floor check is the finisher chart's own minimum, on the programmed chip, and it warns only when a machine cap or a full-width derate holds the feed below it. Two earlier builds were rejected the same day, 2026-08-29: the first served the tool chart's own low edge and gave 24,300 mm/min for a half-inch MDF skim at 18,000 rpm, which Scott rejected on sight; the second treated the finisher chip as the effective chip and compensated it for thinning, which a 42,000-cut review sweep showed reaching the 30,000 mm/min machine cap on a 3/4 in three-flute hardwood skim. When the user gives no width of cut, the profile assumes `skim_ae_mm` of radial stock on the wall (1 mm, capped at the tool diameter), inside Leitz's published 1-2 mm finish allowance. The UI hides the first-cut check box while Finishing is on and keeps the stored choice for the other profiles. The width-of-cut hint quotes the 1 mm value as static markup because the field element reads its hint once at render, and test FIN pins the hint to the rules value. Behaviour is pinned by PROF (core), FIN (data), SC31 and SC32 (scenario), and the SC30 warning-ceiling sweep includes the finishing profile and still tops out at three warnings.

## Amendments 2026-08-29 (later): the 3xD block and the ITA diameter
Two findings from the review sweep that followed the Finishing build, both predating it, fixed with Scott's agreement. First, `rules.json` `depth_derating_extension` is replaced by `depth_limit` (`max_ratio_of_d: 3`, block not warn). The vendor depth rule ends at its 3xD anchor, and the hyperbolic extension past it served a chip so small that the floor warning fired against the calculator's own number and told the user to raise a feed it had just lowered, on 1,260 sweep results per profile. `calculate()` now blocks a cut deeper than three diameters and names the maximum pass, the same shape as the compression minimum-pass block. The `depthDerate()` tail stays for headless callers but is unreachable from the calculator. Second, the three ITA rows (laminated chipboard, MDF, hardwood) carry `diameter_mm: 12`, the nesting-tool size the ITA guide states for its ranges. Unsized, they contributed at every diameter: at 1/8 in the ITA melamine band merged with Freud's and let Aggressive serve 0.194 mm/tooth on a 3.175 mm tool, above any published value for that size, and at 1 in the ITA rows served MDF and hardwood spirals that every other chart refused. With the diameter set, the coverage rule confines ITA to 9-15 mm, melamine at 12.7 mm still resolves to ITA alone (ENV5), and 25.4 mm picks in MDF and hardwood now refuse like plywood does. Tests SC33 and SC34 pin both.

## Amendment 2026-08-31: chart narration leaves the public page
The calculator is public, and its rendered notes had grown into a log of how the data was chosen: which chart served, which chart published nothing near the diameter, what the MDF finisher borrow was, what the calculator did not compensate. Scott pulled all of it from the UI. The core now returns two streams. `notes` renders, and carries only what the user can act on or must watch: the finishing skim assumption, the first-cut states, inert controls (direction, density), the flute-count convention, the thin-chip power caveat. `meta.chartNotes` carries every chart-selection sentence (coverage, borrows, generic serves, the disagreement rule, the no-compensation record, the flat-kc record) and renders nowhere; tests read it. On the page, chart attribution lives in exactly two places: the limit line ("Onsrud 60-200 sets this feed") and the chart ladder with its table twin. Refusals still explain themselves, but in one plain sentence, without per-chart narration; a chart's own scope exclusion (Rennie: not compression) still shows, because the user can act on it by changing the tool. The lead-in output note lost its "no vendor publishes" clause the same way; the decision record stays in rules.json. Test SC35 sweeps representative picks and fails if narration reaches the rendered notes again.

## drills.json, new 2026-09-02: the drilling data

A fifth data file. Drilling data has a different shape from routing data, which is
why it does not live in `chiploads.json`: routing publishes a chip load per tooth
against material, geometry and diameter, merged across vendors, while Leitz
publishes per tool subfamily a spindle speed range, a feed band in mm per
revolution that varies with speed and not with diameter, a table of material
correction factors against one baseline material, and chip-clearing rules. Drill
rows in `chiploads.json` would also become visible to the routing selector, which
is the most-tested path in the repo.

`data/drills.json` carries `sources`, `material_factor_map`, `profiles` and
`entries`. `js/data/load-browser.js` and `tests/load-node.js` both list it and must
stay in lockstep. Conventions rather than data live in three new `rules.json`
blocks: `drilling`, `drilling_attribution` and `drill_bank`, under the new
`session-5-drilling` source key.

**Fourteen entries.** Dowel drills (6.1.1 to 6.1.3), through-hole drills (6.2.1
to 6.2.4), hinge drills (6.3.1 to 6.3.4) and twist drills (6.4.1).

**The twist drills were added on 2026-09-02**, after the claim that all of
chapter 6.4 was drill-press equipment turned out to be wrong: they list CNC
machining centres and multi spindle units on their own pages. They matter twice
over. The solid-carbide one is the only tool in the served set that goes under
3 mm, publishing 2, 2.5, 3, 3.2, 3.5, 4 and 5 mm. And the double-heel one carries
the only published chip-clearing rule in the served set, a clearing stroke past
four times the diameter, which is what turns the peck output on at all.

Machine lists are now read from each page's own printed text rather than
assumed, because 6.4 does not print one list for the whole section the way 6.1
to 6.3 do. A page that prints a depth rule where a material factor table would
sit, as the Levin pages do with "Drilling depth > 4 x D = 0.8", has it routed to
`chip_clearing` rather than read as a material correction, and the builder stops
on any factor row it has no vocabulary for.

**Section 6.4.2, the Levin drills, is deliberately absent** (Scott, 2026-09-02).
They pass their read and they qualify on their machine list, which names multi
spindle units, but their stated job is joint holes in timber frame construction
and their machine list carries no CNC machining centre at all. This calculator is
for cabinet making, and a structural-timber drill does not belong in the picker
because a scope rule happened to let it through. Their read stays in
`research/leitz-drilling-read.json`.

**What is not here, and why, corrected 2026-09-02.** This is a first pass, not the
whole of the served scope. An earlier version of this section said chapter 6.4 was
the drill-press chapter and printed one machine list for all of it. That is wrong,
and it was wrong in a direction that quietly narrowed the calculator. The chapter's
opening page does list column, special purpose and portable machines, but its tool
pages do not agree: the twist drills on printed pages 29 and 30 list "point-to-point
drilling machines, through feed drilling machines, CNC machining centres, hinge
boring machines, multi spindle units" before naming a column drill, and the Levin
drills on page 32 open with "CNC machining centres". So parts of 6.4 sit inside
decision 1's scope and are simply not read yet. They are the next entries in.

Two things do rule themselves out on their own machine lists: the cylinder-head
drills on printed pages 43 and 44, which name column and portable machines alone,
and with them the woodworker's forstner bits. Section 6.1.4, the boring pins, is
read but not ingested: its diagram prints no correction factor table and its
baseline is the compound "Chipboard / MDF", so it has no factor row to serve from.
Its chip-clearing rules are the only published peck rules in the served sections'
neighbourhood, so it is the obvious next entry after the 6.4 twist drills.

**The chart read is reproducible.** `tools/read-leitz-drilling.py` reads the band
polygons off the PDF vector art and writes `research/leitz-drilling-read.json`;
`tools/build-drill-entries.py` turns that into the entries. Re-running both
reproduces the file. The read takes the polygon's exact vertical extent at a speed
by crossing every edge of the outline, not by sampling nearby vertices, and
calibrates each axis by least squares over its own tick labels. A diagram is
accepted only when its band overlaps the tool's published speed range and covers
at least 60% of it, its printed worked example converts and lands inside the band
read off it, the axis calibration residual is under 2% of the range, and a baseline
material and factor table are printed under it. Seventeen of the eighteen in-scope
diagrams pass, and the eighteenth is the boring pins, which print no factor table.
**All seventeen carry a printed worked operating point and all seventeen land
inside their own band**, which is the strongest check available on a chart read,
and the validator now requires one on every served entry.

That last sentence used to read "six carry a printed worked example". Seventeen
do. The reader's number pattern only matched round thousands, and six diagrams
mark their operating point at 4,500 rpm, so half the tools silently lost the one
point their maker prints. Nothing downstream noticed, because the check that reads
the marker is also the check the marker feeds. Requiring one is what closes that.

**Two read gates are data, not code**, in `rules.drilling`. `band_ratio_sanity` is
[1.3, 5.5]: measured across the seventeen accepted diagrams the bands run 1.64x to
4.94x, widest at the slow end of each range and narrowing as speed rises. The
research's earlier "about 2:1" came from the hinge-drill diagram alone and does not
hold across the chapter. `band_coverage_min` is 0.6, because a diagram does not
always draw the whole range its tool is rated for: the solid-carbide through-hole
drill (6.2.3) is rated to 12,000 rpm and its diagram stops near 9,000.

**Where the band stops, the FEED RATE holds flat, not the feed per revolution.**
That was the other way round at first, and the first way is not the conservative
side. Feed rate is speed times feed per revolution, so a flat feed per revolution
keeps the feed climbing with speed, while every diagram in the chapter shows the
feed rate flattening as speed rises, which is exactly why feed per revolution
falls across all of them. On a tool whose diagram does reach 12,000 rpm, holding
feed per revolution from 7,500 would have served about 35% more feed than the
diagram prints there.

**One entry publishes a chip-clearing rule**, the double-heel twist drill, and
every other `chip_clearing` is an explicit `null`. Where a drill publishes
nothing, `rules.drill_peck_suggestion` offers a borrowed one past four times the
diameter (Scott, 2026-09-02), because saying nothing about a five-diameter dowel
hole is unhelpful when the chapter twice says what happens in a deep one. It is
carried by two published rules: the twist drill's stroke past 4xD, and the boring
pins' obligatory interim stroke with a maximum infeed of 2xD in hardwood and
glulam, which is stricter than the figure used.

The line between the two is deliberate and visible on the page. A published rule
fills the peck row and may change the served feed. A borrowed one is a note that
says it is borrowed, and it moves no number: a suggestion may change what the
user does, and only a published number may change what the calculator serves.

**Printed factor rows are merged into the vocabulary, never renamed silently.** Two
printed rows can map to one key, as "Veneered" and "Paper coated" both do at 0.8,
and one printed row can cover two picks, as "MDF, solid wood" does. A merge is only
allowed when the printed factors agree, and the builder stops if they do not.
`FACTOR_MATERIALS` in the validator is its own namespace and deliberately does not
extend `MATERIALS`, because Leitz names rows the calculator has no pick for
(veneered chipboard, glulam). `material_factor_map` is the only join between them.

**The plain MDF pick reads only the plain MDF row.** It once also accepted the
"MDF plastic coated" row, which the two solid-carbide hinge drills publish at 1.0
while publishing no plain row. The result served a coated-panel feed for an
uncoated board, unmarked, at more than twice the 0.7 every other section prints
for MDF. A coated panel is what the melamine pick means, so that row now sits
behind coated chipboard there instead.

**A pick that falls through to the conservative fallback is lifted to a cutting
chip, not served rubbing** (Scott, 2026-09-02). The fallback scales a tool's whole
band by another material's factor, which is the calculator's choice and not the
maker's, and it can land the chip under the thickness at which a wood cutting edge
rubs instead of cutting. Rubbing burns the hole and the edge, so the feed is raised
to the thinnest chip that still cuts, and the page says it was raised.

The lift is bounded by the tool's own unfactored value at that profile and speed.
That ceiling is the point: a correction factor is a reduction from the baseline
material, so undoing part of it walks back toward a number the maker does publish,
and stopping there means the lift can never claim more than the maker publishes for
the easiest material it lists. Where even that ceiling sits under the floor, the
feed cannot be rescued and a warning stands instead. The floor is checked again on
what is finally delivered, because a machine feed cap can undo the lift.

The figure is the existing `chip_floor_mm_per_tooth.plough_below`, borrowed from
panel routing and named as borrowed. None of this runs where the tool publishes a
factor for the picked material: there the low edge of the maker's own band is the
maker's own minimum, and a panel-routing number has no standing to contradict it.

**Every entry records the workpiece list its own page prints.** Without it the
diamond-tipped drills, which Leitz rates for abrasive board and does not list for
solid timber, served a timber feed silently. A pick outside a tool's own list now
warns and still serves, because decision 9's whole point is not to refuse.

Behaviour pinned by `DRILLDATA` (every band covers its range, every printed worked
example lands inside its own band, the hinge-drill read and the position of the
vendor's marked point on it) and `DRILLFENCE` (a sound entry validates clean, and
ten ways of breaking one are each caught). Writing `DRILLFENCE` caught the first
invented number: a band edge that read plausibly and was not what the diagram says.

## Update discipline
New data lands as new entries with a new `source` key + retrieval date; superseded entries stay with a `superseded_by` field rather than being deleted. Chart-read values get `data_class: measured_chart_read`. Nothing enters without a source.

## rules.json amendment 2026-09-02: the depth block follows the engagement

The 3xD block and the depth derate now apply to slot-width cuts only, at or
above half the tool diameter of width (Scott, 2026-09-02, from the first live
runs of the Fusion panel). The depth hazard is engagement, not flute
immersion: a full-width slot past three diameters packs chips and breaks
tools, and it still blocks. A light-radial cut clears its chips sideways and
runs the flute length at a light optimal load as standard adaptive practice,
so it loses both the derate and the block, and the chip-thinning compensation
keeps lifting its programmed feed, exactly as before. The half-diameter
boundary is the one chip thinning and the finish skim already use, so the
core has one regime line, not three. Two new pieces beside it: an optional
`fluteLengthMm` input (the Fusion panel always sends it, the site has an
advanced field), and a `past_flutes` hot warning when the pass runs deeper
than the flutes, which never blocks: the machinist owns that call. The depth
chip now speaks per regime, because "Depth 2.2xD gives 100% chip load" in
amber read as a contradiction on a finish skim. Pinned by SC36, and SC33's
finishing case flipped from blocked to served with the reason in the test.

## chiploads.json amendment 2026-09-02: the ball nose

A fifth tool type, `ball`, and a new geometry class, `ball_nose`. Twenty-one
entries from the Amana spiral ball nose chart under source key
`amana-ball-nose` (research/sources/amana-spiral-ball-nose-v7.pdf, retrieved
2026-09-02): three materials, softwood, hardwood and MDF, across seven
diameters from 1.5875 to 19.05 mm. The research is
`research/research-session-6-ball-surfacing.md`.

**The chart states one condition and no others: a depth of cut of one tool
diameter.** That is a full-width groove with a round bottom. It is not
published for a surfacing pass, and no maker anywhere publishes a chip load
for a ball nose cutting wood on a 3D pass. Two makers do publish a 3D stepover,
PreciseBits and IDC Woodcraft, and neither publishes a feed to go with it.
Nobody publishes a scallop rule or an effective-diameter correction for a ball
nose in wood at all. Every ball entry therefore carries `cut_type_published: "none"`, a new
field, so no later code path can treat a groove number as a surfacing number
by accident.

**The chart value is a full-engagement number, so the existing radial
chip-thinning compensation is what serves it.** A surfacing pass takes a
stepover as its width of cut, the compensation lifts the programmed feed, and
the chip the tool actually takes is the chart value unchanged, down to the
stepover floor below. That is the
opposite of the Finishing profile, where the vendor already has the light
engagement inside the number. IMCO, the one maker that prints a feed
multiplier with its base named, states that base as the slot value, which is
what this chart is. Scott judged the resulting feeds sound against his own
production surfacing experience on 2026-09-02.

**No second correction is applied.** The result reports the ball's effective
cutting diameter and the surface speed at it, and those numbers move nothing.
The two makers that publish a feed multiplier from the effective diameter
disagree about the base it starts from, and no wood source publishes one at
all. Applying both a radial and an axial correction is the double-scaling the
Finishing profile was rebuilt twice to remove.

**Three ball-only display values ride in `outputs`**, guarded by a `when` row
in the UI the same way the drilling peck row is: the scallop height, from the
exact `R - sqrt(R^2 - (ae/2)^2)` rather than the parabolic approximation, the
effective cutting diameter `2*sqrt(ap*(D - ap))`, and the surface speed at that
diameter. All three are geometry, five makers print the effective diameter in
four algebraically identical forms, and all three are marked as display in
`js/core/chipload.js`.

**A ball nose never borrows and is never borrowed from.** `ball` maps to
`ball_nose` alone, so a flat tool cannot pick up a ball band and a ball cannot
pick up a flat one. The generic geometry-unspecified charts do not join it
either. Where the chart says nothing the pick refuses: plywood, soft plywood,
melamine, particleboard and HPL have no ball nose chip load from any maker.
The exclusion also runs on the context ladder, in both directions
(`sameToolFamily`), because a flat chip load drawn beside a ball's reads as
headroom the tool does not have.

**The Finishing profile refuses for a ball**, because every finisher row is a
flat-edged tool and no finisher chart covers a ball nose.

**The validator gate is the maker's own printed formula.** Every ball entry
carries the chart's printed feed band in `printed_feed_in_min`, and the
validator checks it against rpm times flutes times chip load. A cell fails
only when it misses by more than ten inches per minute AND more than five per
cent, because Amana prints its feed ladder on round tens and a sound cell can
sit one step out. That gate is why Amana's separate 2D/3D carving charts are
out of scope: five of their twenty-five ball nose cells fail it, three of them
wood rows, the worst by a factor of two.

**Onsrud's 77-100 taper tools are a cross-check, not data.** They carry a ball
nose point and publish .003-.005 in per tooth at 1/8 in and .005-.007 at 1/4
in, the same in soft wood, hard wood and MDF, and those values equal Amana's
hardwood column exactly at both diameters. They stay in the research file:
Scott's call is a straight ball nose only (2026-09-02).

Behaviour is pinned by `BALLDATA` and `BALLFENCE` (data), `SC37` to `SC41`
(scenario, including the served-grid sweep and the machine-cap check), and the
`ball` rows added to the `SC30` warning-ceiling sweep and the `SC35` narration
sweep.

**The compensation has a floor, added 2026-09-03 after the adversarial review.**
Chip thinning is unbounded as the stepover falls, and on a ball that runs away
inside the tool's normal working range: at a 2 per cent stepover on a 3.175 mm
ball it programmed 0.636 mm per tooth against a 0.064 mm stepover, a chip ten
times the width of cut, and served 22,886 mm/min. The relation assumes the chip
is small against the engagement, and there it is not. `rules.ball_nose`
therefore holds the compensation at a stepover of 8 per cent of the diameter and
never extrapolates below it, and the page says so when that bites. Below the
floor the served feed stops rising and the physical chip falls under the chart
value, which is the conservative side. Every number Scott approved, at 8 per
cent and above, is unchanged. The figure comes from the one 3D finishing
stepover any maker publishes, PreciseBits at 0.08 x tip diameter, and from the
sight table Scott read, which is computed at that stepover; choosing it as the
floor is the calculator's decision and it is recorded as one. This is the same
shape as the 3xD depth block of 2026-08-29: a correction is held at its anchor
rather than run past the point anybody checked.

**A surfacing pass with no stated depth serves, added 2026-09-03.** A firsthand
read of the Fusion API showed that a scallop, a pencil or a blend pass carries a
stepover and no stepdown anywhere, and a 3D contour or a ramp carries the
reverse. `calculate()` therefore accepts `apMm: null` from a ball nose, meaning
the toolpath states no depth of cut. The feed still serves, because the chip
load and the width of cut set it and neither depends on the depth. What is
skipped is skipped explicitly: the spindle power cap, the hold-down cap, the
power figure, the past-flutes warning and the effective cutting diameter all
drop out, `meta.powerKw` comes back undefined, and a rendered note says the
power and hold-down checks did not run. Nothing is assumed on the user's behalf
(Scott, 2026-09-03).

**A bull nose reads the ball chart at its corner, added 2026-09-03.** A bull
nose is a surfacing tool too, and no maker publishes a chip load for one in
wood anywhere, so the ball nose chart is borrowed for it. The chart is indexed
on the **corner diameter**, twice the corner radius, not on the tool diameter
(Scott's call): on a surfacing pass the corner is what cuts, and reading the
chart there is conservative twice over, because it gives both the lower
published chip load and the smaller thinning compensation. A 12 mm tool with a
3 mm corner reads as a 6 mm ball. The cost is that a small corner falls off the
bottom of the chart's ladder and refuses, which is the honest outcome for a
geometry nobody publishes: a 12.7 mm tool with a 0.5 mm corner refuses.

The borrow is recorded in `meta.chartNotes` and renders nowhere, with the other
chart-selection sentences (Scott, 2026-09-03).

Two geometry values do **not** come from the chart's ball. The scallop is taken
off the corner radius, because the ridge comes from the rounded corner that
touches the surface: a 12.7 mm bull nose with a 1.5 mm corner at a 1.27 mm
stepover leaves 0.141 mm, and calling it a 12.7 mm ball would report 0.032 mm,
four and a half times smoother than the truth. The cutting diameter uses the
toroidal form `(D - 2R) + 2*sqrt(R^2 - (R - ap)^2)`, which reduces exactly to
the ball formula when the corner radius is half the diameter, so a ball is the
special case of one formula rather than a second code path.

The scallop is reported while the stepover is under the corner diameter, not
while the cut is light-radial. On a bull nose the corner is far smaller than
the tool, so a stepover that is heavy against the corner is still light against
the tool, and the light-radial gate hid a real and coarse ridge.

**Three surfacing rulings, added 2026-09-25 (Scott, research session 6).** They
refine the ball nose surfacing already built above, and do not touch the data.

- **The first-cut reduction is skipped on every ball and bull nose pass.** A 3D
  surfacing pass is a light finishing cut, and the reduction guards a heavy
  proving cut, so on a surfacing pass it drove the chip toward the rubbing
  floor, the same reason the Finishing profile disables it. `calculate()` now
  gates first-cut on `!ballNose`; routing and drilling keep it. A rendered note
  states the skip when the box would otherwise be on, as Finishing does. The
  ball baseline feeds rose by one over the 0.65 factor wherever first-cut was
  on, and the baseline was re-captured. Pinned by `SC43`.
- **A surfacing pass with no stated depth serves, with the power and hold-down
  checks skipped.** This confirmed the decision already built on 2026-09-03
  (above); nothing changed in code.
- **The ball tool lists its materials MDF, softwood, hardwood**, the repo
  order, not Amana's printed order. Display only: the tool hint on the page and
  in the panel, and the panel's tool-shape refusal. No chip-load number moved
  and no material was relabelled, so no served number changed.

## plastics.json, new 2026-09-24: soft and hard plastic

A sixth data file, for the two plastic families, with Scott's approval of the plan that
day. The only source is the LMT Onsrud Production Cutting Tools catalogue, edition PCT-19
(2019): Soft Plastic Cutting Data Recommendations on page 120 and Hard Plastic Cutting
Data Recommendations on page 121 (research/sources/Soft Plastic.pdf and Hard Plastic.pdf),
with the full catalogue for each series' name, flute count and hands. The file is apart
from `chiploads.json` for the reason drilling is: a plastic row in the wood file would
become visible to the wood selector, which is the most-tested path in the repo.
`js/data/load-browser.js`, `tests/load-node.js` and `src/data.ts` all list it.

**Every entry is one printed cell**, 248 of them (115 soft, 133 hard), in the units the
sheet prints: inches per tooth against an inch diameter column. The engine converts to
millimetres at run time. Every entry carries `source`, `page` and `edition`, the printed
text of its cell in `printed`, the printed series name with any asterisk in
`series_printed`, and the printed depth condition in `cut_printed`. The soft sheet's
asterisk on 37-50 and 37-60 ("* = 12,500 RPM") rides as `rpm_max` on each of their cells.

**The read is reproducible and was made twice.** Text extraction loses the columns, so
both sheets were read from page renders: once by eye at 400 dpi, placing each value under
its header, and once from the position of every word against the column centres. The two
agree on all 248 cells. `research/onsrud-pct19-plastics-read.json` holds the read, and
`tools/build-plastics.mjs` turns it into the data file. The catalogue facts for each
series (its contents-page name, flutes, hands and product page) are in the builder, each
with its printed page.

**Three printed cells are not clean numbers.** On the hard sheet, 56-000 and 56-000P at
3/16 in print ".004-006", the upper value without its decimal point. Scott ruled them
0.004-0.006. 56-600 at 3/8 in prints ".009- .011" with a space. Each such entry keeps the
printed text and says what was mended in `transcription_note`. Two cells look odd and are
exactly as printed: hard 56-000 prints its fourth value at 5/16 in and nothing at 3/8 in,
and soft 61-400 prints ".020-.021" at 1/2 in. Neither sheet prints anything in the 1-1/8
in to 2 in columns.

**`families`** records, per sheet, the printed Good/Better/Best tables, the serving rule,
the Finishing series, the printed depth rule, the printed formulas, the printed note, the
defect the note names (knife marks for soft, cratering for hard) and the plastics each
family holds. The page and the panel offer one pick per family, "Hard plastics" and "Soft
plastics" (Scott, 2026-09-25), and each pick's hint lists those plastics.
**`series`** records the catalogue facts, and its `kind` separates the flat solid carbide
router series, which the chart ladder may draw, from the HSS, engraving, V-bottom, ball
nose, edge profile and taper tools, which are recorded and never drawn.

**The serving rule.** The sheet's Best single-pass series serves the band, never an
envelope across series: soft 63-750 below 1/2 in and 52-700 at 1/2 in and up, hard 63-700
below and 60-200 at and above. At exactly 1/2 in the "1/2 and up" series serves, because
the sheets split their tables "< 1/2" and "≥ 1/2". The reason is the D11 reason: an
envelope across the O-flute series spans more than 2x at 1/2 in soft (.010 to .022,
because the 61-000P straight O-flute prints far above the rest), and the profile edges
would then move with which series happen to be printed. The other router series of the
picked hand that print at the size render as named context on the chart ladder. The hard
curve drops at 1/2 in (.010-.012 at 3/8 in, .006-.010 at 1/2 in) because the tool
changes from a single-edge O-flute to a three-flute finisher, and the page names the
series that serves so a beginner can see why.

**Metric sizes.** A size the serving series does not print is interpolated in a straight
line between its two nearest printed sizes, both band edges, within that series only and
never across the 1/2 in split. The result carries `meta.plastic.interpolated`, the chart
row and the band badge say "interpolated", and a rendered note names the two printed sizes.
A size outside the series' printed range gets no number. The wood charts' 25 per cent
coverage stretch does not apply. The page offers 3 mm while a plastic is chosen.

**What differs from wood** (Scott, 2026-09-24). No cutting force is published for
plastic, so the spindle power and hold-down checks do not run, and a note and a badge say
so. First-cut mode does not apply, because the sheet's cure for chips that weld back is a
higher feed. The wood chip floor does not apply. The only floor warning is a machine limit
holding the chip under the band's low edge (`chip_below_band`). Finishing serves the low
edge of the family's own 60-200 row, which the hard sheet names for finishing and the soft
sheet prints without naming. Compression and the ball nose refuse. Up-cut, down-cut and
straight serve the same Best number, with a note. The depth derate is the sheet's
printed 1xD/2xD/3xD rule, applied as for wood. The maker's printed note renders as an info
banner, "Onsrud's advice for soft plastic" or "for hard plastic", with the spoilboard
sentence only for a soft down-cut.

The plastics are behind the beta tick on the page and in the panel. Behaviour is pinned by
PL1 to PL21 and PL-PICKS in `tests/plastics.test.js`, and PL18 sweeps 420 wood picks to
prove every wood result is identical with and without the plastics data.
