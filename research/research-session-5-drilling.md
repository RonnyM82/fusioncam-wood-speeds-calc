# CNC Router Speeds & Feeds — Research Session 5: Drilling and Boring, 1-35 mm

Researched 2026-09-01, to explore a drilling mode. Method: a five-angle web sweep (dowel drills, hinge and forstner boring, small twist drills, formulas and machine limits, HSS against carbide), twelve sources fetched, 112 numeric claims extracted. 54 claims went through three independent checks (does the source say it, does it fit the other sources, does the physics hold) and all 54 survived. The per-topic cap dropped the other 58 extracted claims before checking. The useful ones were recovered from the run journal and every such number below is marked **unverified**. The decisions Scott made after reading this report are recorded near the end, under Decisions.

## TL;DR

- **Drilling data has a different shape from routing data.** Routing charts publish chip-load bands. Drill vendors publish an rpm window, sometimes a feed speed, and rarely both. Leitz, the richest source, publishes rpm windows plus dimensionless feed factors, and the baseline feed those factors multiply did not come through in the extraction. The firsthand read found it printed as curves beside each tool table (amendment below). Until those curves are chart-read, the Leitz block gives speeds but no feeds.
- **The machine is the first constraint, not the bit.** Every verified drill window tops out at 9,000 rpm, except one dowel-drill series that reaches 12,000. The calculator's ES929-class spindle presets floor at 12,000 rpm, so on those machines almost every drill window is unreachable. The SCM Morbidelli presets (floor 1,500-1,800 rpm) and dedicated drill banks (fixed near 3,000-4,000 rpm) are where drilling actually lives.
- **"35 mm boring" is two tool families with a 2x speed gap, and the split is machine class, not head geometry.** Leitz rates its hinge drills at 2,800-9,000 rpm and its cylinder-head drills at 1,200-4,500 rpm over the same diameters. The firsthand read (amendment below) shows both families carry the same Z 2/V 2 head designation. What separates them is the intended machine (CNC and boring machines against column and portable drilling machines) and the material scope (panels against solid wood). The word Forstner appears nowhere in the Leitz chapter.
- **Feed data is thin, and the best of it is unverified.** Verified: CMT serves its 5-10 mm solid-carbide dowel drills at 6,000 rpm and 1-4 m/min. Unverified but firsthand: Amana's 35 mm hinge bit page gives a 20-40 in/min plunge at 6,000-8,000 rpm with an 8,000 rpm maximum, and Onsrud's catalogue carries a dowel-bit chip-load ladder from 0.23 mm/tooth at 3 mm to 0.43 mm/tooth at 8 mm.
- **HSS against carbide is not a clean multiplier.** Plain twist drills: HSS 1,500-4,000 rpm, carbide 3,000-6,000. Levin-type drills: the HSS version also runs 3,000-6,000. Geometry moves the window as much as the edge material does. In print, HSS covers solid wood and plywood only. No vendor publishes an HSS number for chipboard, MDF or melamine.
- **Peck rules exist and are quotable.** Leitz makes an interim chip-clearing stroke obligatory for 3-8 mm boring pins in hardwood and glulam, recommends one past 4xD for twist drills, and derates feed to 0.8 past 4xD. That is a servable rule set of the same kind as the routing depth rule already in rules.json.

## How drilling data is published

The routing side of this calculator is built on chip-load bands per material, geometry and diameter. Drilling vendors do not publish in that shape. Leitz (Lexicon Edition 7, chapter 6, the dominant source this session) gives each drill family an rpm window and a table of feed correction factors against a named baseline material. The baseline feed speed itself did not surface in any extracted claim, so the factors are ratios with nothing to multiply. The firsthand read (amendment below) found where it lives: every Leitz tool table carries a printed feed-speed-against-rpm diagram with the baseline material named beneath it. The curves need a chart read, the same discipline as the Vortex chart, and then the whole Leitz block produces feeds.

CMT publishes the opposite shape: one rpm value (6,000) and a feed window (1-4 m/min) for its 5-10 mm dowel drills in chipboard, MDF, HDF and laminates. Onsrud publishes chip load per tooth for its 72-000 dowel-bit series and, for the drilling table, the formula Feed rate (in/min) = rpm x feed per revolution (in/rev). Amana publishes its core-box router-bit chart at a fixed 18,000 rpm, plus the same four formulas (rpm, surface speed, feed rate, chip load) the repo already carries for routing. Nothing here needs a new formula. The calculator already has every equation involved.

## The machine constraint

| Machine class | Drilling speed | Status |
|---|---|---|
| Anderson Selexx drill bank | 4,000 rpm, fixed | verified (WoodWeb shop thread) |
| Typical CNC drill block | about 3,000 rpm | unverified (WoodWeb knowledge base) |
| Homag Centateq P-210 drilling gear | 1,500-7,500 rpm | unverified (Homag brochure, firsthand) |
| SCM Morbidelli presets (machines.json) | floor 1,500-1,800 rpm | already in the repo |
| ES929-class router spindle presets (machines.json) | floor 12,000 rpm | already in the repo |

Every verified drill window in this session sits inside 1,200-9,000 rpm, except the Leitz "Excellent" dowel-drill series, which reaches 12,000. On a 12,000-floor spindle, that one series is reachable at exactly one speed, and nothing else is reachable at all. A drilling mode therefore has to check the machine before it checks the material, and refuse with the reason when the spindle cannot reach the window. That is the same refuse-with-reason shape the routing side already uses for coverage gaps. One practitioner data point cuts the other way and is worth keeping visible: a shop drilling MDF and plywood with TiN-coated bits at 14,500 rpm and 75-100 in/min (unverified, WoodWeb). It worked for them, but no vendor window in this session covers it.

Two supporting facts. Vortex balances its HSK 63F drill chuck (1-16 mm capacity) to 24,000 rpm, so the holder is not the limit (unverified, catalogue). Freud states twice in its CNC feed-and-speed guide that carbide-tipped router bits must not drill straight down into the work (unverified, firsthand PDF). Drills and router bits stay separate tool families, in the shop and in any UI.

## Dowel drills and through-hole drills, 2-12 mm

Verified rpm windows, all from the Leitz Lexicon drilling chapter:

| Tool | Diameter | Materials | rpm |
|---|---|---|---|
| Dowel drill with heel, HW tipped, 8 mm shank | 5-10 mm | softwood, hardwood, chipboard, MDF, plywood | 3,000-9,000 |
| Dowel drill "Excellent", HW solid, 10 mm shank | 3-10 mm | same list | 3,000-12,000 |
| Through-hole drill "Premium", HW tipped | 4.5-8 mm | wood and panel | 3,000-9,000, recommended 4,500-9,000 |
| Through-hole drill, DP (diamond) tipped | 5-10 mm | abrasive boards, resin glulam | 4,000-9,000 |
| Boring pin, HW solid, screw pre-drilling | 3-8 mm | hardwood, glulam | window not extracted |

Leitz feed factors for dowel drills, baseline plastic-coated chipboard = 1.0 (verified): uncoated chipboard 1.3, veneered or paper-coated 0.8, MDF and solid wood 0.7. Note what the 1.3 says. Uncoated chipboard drills faster than melamine-faced board, so the melamine face, not the core, sets the pace.

Verified feed: CMT solid-carbide dowel drills, 5-10 mm, at 6,000 rpm and 1-4 m/min, which works out to 0.17-0.67 mm/rev (derived).

Unverified rows recovered from the journal:

| Source | Numbers |
|---|---|
| Onsrud 72-000 dowel bits, chip load per tooth | 3 mm: 0.009-0.011 in (verified). 5 mm: 0.011-0.013 in. 6 mm: 0.013-0.015 in. 8 mm: 0.015-0.017 in (0.38-0.43 mm) |
| Onsrud 72-000 in gang-drilling heads | 4,500 rpm at 150 in/min, which is 0.85 mm/rev (derived) |
| WoodWeb knowledge base, drill-block practice | 8 mm bit at 3 m/min plunge, about 1.0 mm/rev at a 3,000 rpm block (derived) |
| WoodWeb shop threads | melamine and MDF at 6,000 rpm and 100 in/min. Brad-point carbide dowel drills in sheet goods at 5,000 rpm and 175 in/min, one pass, no peck. Hardwood pecked in 3/8 in steps at the same 5,000 rpm |

The recovered Onsrud ladder also dissolves an apparent anomaly in the verified set. With only the 3 mm row confirmed, Onsrud looked like the aggressive outlier at the smallest diameter. With the full ladder visible, the chip load simply rises with diameter, as expected. Taken together, production dowel drilling clusters at 0.4-1.0 mm/rev, with CMT's published window starting lower.

## Hinge drills and cylinder-head drills, 15-40 mm

Verified rpm windows, all Leitz:

| Tool | Diameter | rpm |
|---|---|---|
| Hinge drill, standard Z2/V2 with centre point | 15-40 mm | 2,800-7,000 |
| Hinge drill, HW solid | 15-35 mm | 3,000-9,000 |
| Hinge drill, DP tipped, for HPL/CPL faces | 35 mm | 2,800-7,000 |
| Double furniture-hinge drill with pre-drill | 34 mm | 3,000-9,000 |
| Cylinder-head drill, HW tipped | 15-40 mm | 1,200-4,500 |
| Cylinder-head drill, reinforced shank | 20-60 mm | 1,200-4,500 |

The two families overlap across 15-40 mm and their windows differ by roughly 2x at both ends, so a served number still has to know which family it is serving. But the firsthand read (amendment below) changed what the split means. Both families are Z 2/V 2 tools with a centre point. The hinge drills are built for point-to-point machines, through-feed machines, CNC machining centres, hinge boring machines and multi-spindle units, and their material list covers solid wood plus every panel. The cylinder-head drills are built for column drilling machines, special-purpose drilling machines and portable drills, in softwood and hardwood only, with a solid resharpenable head. On a CNC, the 35 mm tool is the hinge drill. The cylinder-head window belongs to the drill-press world.

Leitz feed factors for HW solid hinge drills, baseline plastic-coated chipboard = 1.0 (verified): plastic-coated MDF 1.0, solid wood 1.0, paper-coated or veneered chipboard 0.7, glulam 0.6. Cylinder-head drills use a different baseline, hardwood = 1.0, with chipboard at 1.2 and laminated veneer lumber at 1.1. The factors are not portable across families because the baselines differ.

Verified shop context: an Anderson Selexx drill bank runs a 35 mm CMT hinge bit at a fixed 4,000 rpm in plywood, MDF, particleboard-core laminate and melamine, and the cup is about 13 mm deep in all of them. In the same thread (unverified rows): one poster judges 4,000 rpm insufficient for the 35 mm cup, another struggling shop is also fixed at 4,000, one workaround pockets a 32 mm hole with the router before the hinge bit finishes it, and another adds an 800 ms dwell at the bottom of the hole to clear chips and clean the floor.

The only plunge feeds found for the 35 mm cup are both unverified. Amana's product page for its carbide-tipped 35 mm hinge bit (203431) gives a maximum of 8,000 rpm and a plunge of 20-40 in/min (508-1,016 mm/min) at 6,000-8,000 rpm, stated as the same recommendation used on dedicated hinge-boring machines. The WoodWeb knowledge base gives about 1.5 m/min for a 35 mm cup, dropping to 1.0 m/min in laminate-faced board, at a nominal 3,000 rpm block. Per revolution these disagree hard: Amana works out to 0.06-0.17 mm/rev, the knowledge base to about 0.5 mm/rev (both derived). Both need a firsthand read before either serves a number.

## Small twist drills, and HSS against carbide

Verified rpm windows, all Leitz:

| Tool | Diameter | Materials | rpm |
|---|---|---|---|
| V-point (120°) twist drill, HW solid | 2-5 mm | softwood, hardwood, chipboard, MDF, plywood | 3,000-9,000 |
| Twist drill, HS (HSS) solid | 3-12 mm | softwood, hardwood, plywood | 1,500-4,000 |
| Twist drill with double heel, HW | 4-12 mm | same list | 3,000-6,000 |
| Levin-type drill, HS solid | 5-12 mm | softwood, hardwood | 3,000-6,000 |
| Levin-type drill, HW | 12-16 mm | softwood, hardwood, plywood, glulam | 3,000-7,500 |

For plain twist drills, carbide roughly doubles the HSS window. For Levin-type drills it does not, the HSS version already runs 3,000-6,000. So "carbide runs twice the rpm of HSS" is true for one pairing in this data and false for another, and the calculator cannot encode it as a flat multiplier. The HSS rows also never list a panel material. On the printed record, HSS in chipboard, MDF or melamine does not exist.

Leitz publishes complete numbers for exactly one twist-drill case, HW solid drills in HPL (verified): 3 mm at 3,500 rpm and 0.8 m/min, 5 mm at 3,500 and 1.0 m/min, 6 mm and up at 3,500 and 1.5 m/min, with a cutting-speed window of 0.7-1.6 m/s and a tooth feed of 0.15-0.3 mm. Two internal tensions in that block matter for any calculation:

1. The tabulated feeds sit below the stated tooth-feed floor at small diameters. The 3 mm row works out to 0.114 mm/tooth on two flutes, under the stated 0.15 mm minimum. Only the 6 mm row lands inside the band. Do not compute HPL feeds from the tooth feed and expect the published table.
2. The flat 3,500 rpm exits the stated cutting-speed window at both ends. At 3 mm it gives 0.55 m/s, below the 0.7 floor, and past about 8.7 mm it would exceed 1.6 m/s. One of the two is a simplification.

Feed factors (verified): HSS twist drills use a softwood baseline, hardwood = 0.7. The 2-5 mm V-point uses the plastic-coated chipboard baseline with MDF and solid wood at 0.7 and uncoated chipboard at 1.3.

## Depth and chip clearing

All verified, Leitz unless noted:

| Rule | Applies to |
|---|---|
| Maximum infeed 2xD in hardwood and glulam | HW boring pin, 3 mm |
| Interim chip-clearing stroke obligatory, bore depth restricted | HW boring pins 3-8 mm, hardwood and glulam |
| Interim clearance stroke recommended past 4xD | HW double-heel twist drills, 4-12 mm |
| No clearance stroke needed to about 4xD | Levin-type HS drills, 5-12 mm |
| No clearance stroke needed to 75 mm absolute | Levin-type HW drills, 12-16 mm |
| Feed factor 0.8 past 4xD | Levin-type drills, both edge materials |
| At 2xD depth reduce feed 25%, at 3xD reduce 50% | Amana carbide router bits, and Freud states the same rule with "at least" |

The Amana/Freud row is the routing depth rule already in rules.json, confirmed again from two more documents. The Leitz rows are new and drilling-specific. Note the two Levin limits are on different scales, a ratio and an absolute depth. At 12 mm diameter, 75 mm is 6.25xD.

No source in this session states a burn rule for drilling. The factor tables point the right way (slower feed in the materials that rub), and the chip-clearing rules exist because packed flutes stop cutting, but nobody prints "reduce X to avoid burn". Do not present one as sourced.

## Where the sources disagree

1. The 35 mm split, 2,800-9,000 rpm for hinge drills against 1,200-4,500 for cylinder-head drills, same maker, same diameters. The firsthand read ties the slow window to drill-press-class machines and solid wood, not to a different head geometry.
2. Dowel-drill ceilings: 9,000 (Leitz tipped), 12,000 (Leitz Excellent), one flat 6,000 (CMT).
3. The 35 mm plunge feed, 0.06-0.17 mm/rev (Amana, unverified) against about 0.5 mm/rev (WoodWeb knowledge base, unverified).
4. The two internal tensions in the Leitz HPL block, above.
5. Practitioner speeds sit both under and over the vendor windows: 4,000 rpm judged insufficient for a 35 mm cup inside a 2,800-7,000 window, and 14,500 rpm used in MDF far above every window.
6. Vortex's catalogue states a 10,000-20,000 rpm operating range for its tooling (unverified). Every drill window in this session sits below that. The claim almost certainly describes the routing tools. The repo already holds the Vortex catalogue PDF in research/sources, so this is checkable firsthand next session.

## Gaps

- The Leitz baseline feed speed. Without it, the largest verified block serves no feed at all. The firsthand read located it as printed curves beside each tool table (amendment below), so this is now a chart-read task rather than a search.
- Forstner and hinge-cup plunge feed has no verified source. The two candidates disagree by 3-8x per revolution.
- Melamine-faced chipboard never gets its own number. It is only reachable as the Leitz baseline (factor 1.0) whose value is the missing quantity.
- Brad-point drills are absent from vendor print by name. The nearest verified rows are the 120° V-point and the dowel drills. One practitioner row (5,000 rpm, 175 in/min) is the only brad-point number found.
- 1-2 mm has nothing at all. The smallest verified entries are 2 mm (V-point window) and 3 mm (boring pin, HSS twist, HPL row).
- Through-hole and blind-hole tools are only distinguished up to 10 mm, and nothing covers exit-side chipping or backing.
- HSS in panel materials, tool life, and dust extraction as a chip-clearing aid: nothing.

## What this means for the calculator

The assessment below was written before Scott decided. His calls are recorded in the next section, Decisions.

A drilling mode would not serve a chip-load band. The natural output is an rpm (or a check against a fixed drill-block speed), a plunge feed, and a peck plan, with the vendor named, under the same provenance discipline as the routing data. The machine check comes first and refuses with the reason when the spindle floor sits above the drill window, which on the current presets means the ES929-class machines refuse almost everything while the Morbidelli presets and any drill-bank preset serve. The tool picker needs the drill families kept apart (dowel or through-hole drill, twist drill, hinge drill, cylinder-head drill), because the windows differ by up to 2x at the same diameter. If the mode stays CNC-only, the cylinder-head family can sit out entirely, because Leitz aims it at column and portable drilling machines.

Before anything serves a number, the verification queue is: the Leitz feed curves (a chart read per tool subfamily, per the amendment below), the Amana 203431 plunge figures, the Onsrud 5-8 mm ladder rows, and the WoodWeb knowledge-base feeds. The Diablo forstner speed chart and the WOOD Magazine drill-press chart both surfaced in the search sweep but were not fetched, and they are the obvious sources for the HSS forstner drill-press case the session did not cover. And per the standing discipline, a served drilling grid gets a full sight sweep before it ships.

## Decisions (Scott, 2026-09-01)

Scott answered the six decision points above the same day. His calls, and what each one settles:

1. **Machine scope: CNC machining centres and drill banks only.** Drill presses stay out. That removes the cylinder-head family and the HSS twist drills from the served set, because both are drill-press tools on the printed record, and it leaves woodworker's forstner bits out of scope. Their windows stay in this file as context.
2. **The published rpm window is the served value.** Surface speed and feed per revolution render as derived display, computed from the served rpm and feed at the chosen diameter. The calculator never re-derives an rpm from a surface-speed range, because that would extend the window beyond what the vendor states.
3. **The Leitz chart reads are commissioned.** The source PDF is vendored at research/sources/Leitz_Lexicon_Edition_7_-_06_Drilling.pdf (retrieved 2026-09-01 from leitz.org, the URL in Sources below). A first look at the hinge-drill page (p. 20 as printed, page 22 of the PDF) shows the feed data is a published **band** of feed speed against rpm, drawn as vector art. By sight the band runs from roughly 0.7-1.4 m/min at 2,800 rpm to roughly 1.4-2.4 m/min at 7,000 rpm in plastic-coated chipboard, with a worked example marked at 4,000 rpm and 1.5 m/min. Those sight values are approximate and must not enter the data. The read itself can come off the vector path coordinates, which beats a visual estimate. A band is the same served shape the routing side already uses. Dowel drills and hinge drills read first. A first scripted read of the hinge-drill page validated the method the same day: the band polygon spans exactly the published 2,800-7,000 rpm window, and the printed worked example (1.5 m/min at 4,000 rpm) falls inside the read band of 0.81-1.85 m/min at that speed. Two details for the production read: the example sits in the upper half of the band, not at its midpoint, and the axis calibration should come from the gridline coordinates rather than the tick-label text (the label-based calibration read the "1" tick at 0.97). No read value enters the data until the production read is done and sight-swept.
4. **On irreconcilable disagreement, the most conservative source serves alone**, matching the routing disagreement rule. This governs the 35 mm plunge-feed conflict once the candidates are verified.
5. **Peck guidance serves only where a published rule exists.** Where nothing is published, the cut still serves and the peck output stays silent. No refusals for missing peck data, and no invented suggestions.
6. **A pick whose drill window sits below the spindle's rated floor serves with a quiet warning** and the honest derated power figure, never a refusal. The preset loader must start reading the bottom of each published speed range, which it currently ignores.
7. **Leitz is the core drilling data, and no vendor name renders in the drilling UI (Scott, 2026-09-01, later).** The drilling numbers build on the Leitz windows, bands and factors alone. The other sources from this session stay as research cross-checks and do not serve. No vendor name appears next to the suggested drilling speeds and feeds, which is a deliberate departure from the routing convention of naming the serving chart in the limit line and the chart ladder. The provenance stays complete in the data files, per the update discipline. Only the rendering changes. If a cross-check later contradicts a Leitz band beyond the routing disagreement ratio, that surfaces to Scott in research rather than changing what serves.

## Amendment 2026-09-01 (later): the band supports four profiles

Scott asked whether the drilling data can carry Gentle, Standard, Aggressive and Finishing, or only a single served number. A scripted read of all 24 feed diagrams in the chapter answers it: the data is a band, and the band is wide.

**The band runs about 2:1.** Across every diagram that read cleanly, the upper edge sits close to twice the lower edge at the same rpm. Hinge drills read 0.20-0.42 mm/rev at 4,900 rpm, dowel drills 0.25-0.60 at 3,000 rpm, the solid-carbide dowel drill 0.33-0.80 at 3,000 rpm. That spread is the vendor's own published range for one tool in one material, which is a stronger basis than the routing side has, because the routing bands are built by merging charts across vendors.

**The width is not a diameter axis, and this was tested rather than assumed.** Most charted pages cover a diameter range, so the band could have meant "small drill at the bottom, large drill at the top", which would have made a profile mapping wrong. Page 26 as printed (section 6.3.3, the turnblade hinge drill, PDF page 28) settles it. That tool table has exactly one row, 35 mm, and Leitz calls it a diameter-constant tool. Its band is 0.202-0.412 mm/rev at 4,900 rpm, a ratio of 2.04, matching the multi-diameter hinge page at the same speed. A single-diameter tool still gets the full band, so the width is an operating range, not a diameter spread. The chapter never explains the convention in words. It says only that "the optimum RPM and feed speeds are detailed in the diagrams attached to the tool tables", so the empirical test is the evidence, not a quotation.

**Two shapes worth keeping.** The lower edge is roughly a constant feed per revolution across the whole rpm window (about 0.19-0.25 mm/rev on the hinge and through-hole charts), which reads as a minimum chip below which the drill rubs. The upper edge falls as rpm rises (0.56 down to 0.34 mm/rev on the hinge chart), which reads as a chip-clearing ceiling. Any profile mapping should preserve both, because they are different physical limits.

**Where the vendor puts its own recommendation.** The hinge-drill diagram carries a marked worked example at 4,000 rpm and 1.5 m/min. The band at that speed reads 0.81-1.85 m/min, so the marked point sits about two thirds up, not at the midpoint. A Standard profile placed at the midpoint would therefore run below the only operating point Leitz itself prints. That is a decision for Scott when the mode is built, not a defect.

Reading quality: 24 diagrams found, and most now read with the band spanning the published rpm window to within about 1%. Several still need work (the HSS twist-drill page fails, and a few pages pick up a neighbouring diagram), so the production read must validate every page against its own printed worked example before any value enters the data.

## Amendment 2026-09-01: the firsthand Leitz read

Scott challenged the equation of cylinder-head drills with forstner bits, so the Leitz drilling chapter (59 pages) was downloaded and read directly the same day. Four corrections and one find came out of it.

1. The word Forstner appears nowhere in the chapter. The "(forstner-type)" gloss came from the extraction agent, not from Leitz, and this file no longer uses it. In German trade naming the cylinder-head form is the forstner family, which is how the gloss slipped through, but the source does not make that link and this file must not lean on it.
2. Hinge drills and cylinder-head drills carry the same Z 2/V 2 designation, two cutting edges and two spurs with a centre point. The 2x window split is not a head-geometry split.
3. What actually separates them: hinge drills (section 6.3) are listed for point-to-point machines, through-feed machines, CNC machining centres, hinge boring machines and multi-spindle units, in solid wood and every panel material. Cylinder-head drills (section 6.4.3) are listed for column drilling machines, special-purpose drilling machines and portable drills, in softwood and hardwood only, with a solid resharpenable head. The slow 1,200-4,500 window is a drill-press rating.
4. Woodworker's forstner bits proper are therefore still uncovered by any verified source in this session. The Diablo and WOOD Magazine drill-press charts remain the candidates.

The find: every tool table in the chapter prints a feed-speed-against-rpm diagram with the baseline material named beneath it. The standard hinge-drill page shows the axis reaching 4 m/min at up to 7,000 rpm in plastic-coated chipboard, which sits well with CMT's published 1-4 m/min. These curves are the missing Leitz baseline, recoverable by chart read. One detail to keep straight when that happens: the standard hinge drill (6.3.1) and the HW solid hinge drill (6.3.2) publish different factor sets (0.8/0.8/0.7 against 1.0/1.0/0.7/0.6), so each subfamily needs its own curve and its own factors.

## Caveats

- All 54 checked claims survived, none refuted. Most claims come from one Leitz PDF that the fetch agent read directly, so faithful extraction was likely, and the consistency and physics checks logged the tensions above rather than refuting rows that quote their source correctly. Still, a 54-for-54 pass says the checks were gentle. Treat "verified" here as "faithfully extracted and not contradicted", not as "true".
- Every number marked unverified came from the run journal after the per-topic cap dropped it, and skipped the three-lens check entirely. The Amana, Onsrud and Homag rows are firsthand vendor-page extractions. The WoodWeb rows are practitioner reports.
- **Amana publishes no drilling or boring speed chart** (checked 2026-09-01). Its chart library at `/pub/media/productattachments/` covers router bits only: core box, bowl and tray, ball nose, V-groove, spoilboard, O-flute and the rest. The 35 mm hinge-bit plunge figures exist only as prose in the description of one product page, which makes them a weaker publication than the Leitz chapter even before verification. That page also refuses automated fetches with a 403 and needs a browser to read, so it is the one source in this session Scott cannot review the way he reviewed Leitz. The two captured sentences are: "Note: Maximum RPM is 8,000." and "Plunge rate/ ramp down rate: 20 to 40 inches per minute at an RPM of 6,000 - 8,000." Under decision 7 the point is moot for what serves, because Amana does not serve.
- The engineeringtoolbox.com fetch returned no usable claims. Its drill-speed page ranked first on hits but contributed nothing.
- Diameters were covered unevenly: 10-12 mm is thin, 40-60 mm has one rpm window and nothing else, and 1-2 mm is empty (see Gaps).

## Sources

Verified claims: Leitz Lexicon Edition 7 chapter 6 (https://www.leitz.org/fileadmin/Downloads/Lexicon/EN/Leitz_Lexicon_Edition_7_-_06_Drilling.pdf, vendored 2026-09-01 at research/sources/Leitz_Lexicon_Edition_7_-_06_Drilling.pdf), CMT solid-carbide dowel drill page (cmtorangetools.com), Amana carbide-tipped core-box speed chart (amanatool.com, PDF), LMT Onsrud catalogue PCT-19 (onsrud.com, PDF), WoodWeb CNC forum thread 855533. Unverified recoveries additionally: Amana 203431 product page, WoodWeb thread 773096, WoodWeb knowledge base 764939, Homag Centateq P-210 brochure (homag.com, PDF), Freud CNC feed-and-speed guide (freudtools.com, PDF), Vortex catalogue 2019 (ctsaw.com mirror, PDF).
