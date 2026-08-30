# CNC Router Speeds & Feeds — Research Session 4: What Changes from Roughing to Finishing

Researched 2026-08-29, for the Finishing mode. Three parallel sweeps: the manufacturer record, the practitioner record, and the machining physics. The decision this session fed is recorded near the end, under "What the calculator adopts".

## TL;DR

- **No bit maker publishes a "reduce chip load by X% for finishing" rule.** The roughing/finishing split is sold as tool geometry, and only one maker prices it in numbers: Onsrud's best-finish series 60-200 carries chip loads about one third of its roughers' at the same diameter.
- **The only manufacturer-published finish allowance is from Leitz**: "finish cut allowance approx. 1-2 mm" after roughing cutters, printed on its spiral finishing cutter pages for softwood, hardwood, chipboard, MDF/HDF, plywood and laminates.
- **A finish pass is defined by light radial engagement, not by a slower feed.** The universal published percentage rule (reduce chip load 25% at 2×D, 50% at 3×D) is an axial depth rule. Applying any such reduction to a thin radial skim points the wrong way, because on a skim the risk is rubbing, and the feed must rise (chip thinning) to hold the effective chip above the floor.
- **The peer-reviewed lever on wood surface quality is chip thickness, not spindle speed.** In beech, doubling the cutting speed from 7.5 to 15 m/s at constant chip thickness changed measured roughness not at all. Roughness tracks feed per tooth in beech, plywood and MDF studies alike. So the practitioner rule "hold the rpm, tune the feed" has measured support.
- **The rubbing floor is real but unnumbered for wood.** All published minimum-chip ratios (0.15-0.5 × edge radius) are metal or micro-milling work. This matches the session 3 finding that a wood-specific minimum chip thickness does not exist in the accessible literature.

## Key findings

### Target 1 — the manufacturer record

1. **Onsrud is the only maker with separate published finisher chip loads.** Every Onsrud wood sheet carries an application table with Single Pass, Roughing and Finishing rows mapped to tool series. The 60-200 finisher runs far below the 60-000 rougher at the same diameter:

   | Diameter | Hard wood, 60-000 rougher | Hard wood, 60-200 finisher | MDF, 60-000 rougher | MDF, 60-200 finisher |
   |---|---|---|---|---|
   | 1/4" | .017-.019" (at 1/2", HH row) | .005-.007" | .017-.019" | .004-.006" |
   | 3/8" | — | .006-.008" | — | .005-.007" |
   | 1/2" | .017-.019" | .007-.009" | — | .005-.007" |
   | 3/4" | — | .008-.010" | .023-.025" | .006-.008" |

   One trap in the same tables: the 60-300/60-350 "better finishing" rows carry HIGHER chip loads than the single-pass tools (hard wood 1/2": .026-.028"). Onsrud's finishing distinction is geometry-driven. "Finishing always means a lower chip load" is not what Onsrud publishes. Only the best-finish 60-200 runs low.
2. **The universal published percentage rule is a depth rule, not a finishing rule.** Onsrud, Amana and Freud print the same wording: at 1×D use the recommended chip load, at 2×D reduce it by 25%, at 3×D reduce it by 50% (Freud says "at least"). GDP Tooling softens it to 20-25% and 40-50%. Onsrud's laminated chipboard and laminated plywood sheets differ: only beyond 3×D, reduce by 25%.
3. **Vortex publishes no split at all.** One chip load chart, one column per material. Roughing (series 1000/1100) and finishing (three-flute 1800/1900, single-flute 800/900 at 100-300 in/min) are sold as tool families. The catalog describes the rougher's "rippled" edge and the two-tool sequence: rougher first cut, profile tool second cut. Claims circulating online that Vortex says "reduce ~20% for slotting" or "reduce 10-15% for chatter" are NOT in the catalog. They come from third-party blogs. Do not attribute them to Vortex.
4. **Leitz publishes the only finish allowance number: approx. 1-2 mm** after roughing cutters. Leitz also gives the clearest direction rule in print for solid wood: climb cut along the grain, conventional cut across the grain, and hand-fed machines conventional only. Its production routing guide shows the tool-family feed ladder at 18,000 rpm, 1/2" tool, 1/2" depth: roughers/hoggers 500-1500 in/min, chipbreaker/finishers 350-1200, finishers 200-600 for the smoothest edge.
5. **On rpm the makers split, and nobody says "raise the rpm for finishing" in print.** Vortex: pick the lowest rpm that works, because higher rpm improves finish but adds friction and wear. Onsrud and GDP: tune the feed first (raise it until finish degrades, back off 10%), then lower the rpm until finish degrades and step back. All four US makers warn qualitatively that a too-small chip overheats the edge (Freud: "just sawdust... will not carry enough heat away"). None prints a numeric floor.

### Target 2 — the practitioner record

6. **Finish allowance in shop practice clusters far below Leitz.** ShopBot production users leave 0.015-0.020" for the cleanup pass. Laguna says 0.020-0.040". CNCCookbook sizes it as 2-3 × chip load, or 1-2% of tool diameter, typically about 0.015". Woodworking Network's chip load guide gives the industrial minimum: on finish passes take at least one chip load of radial stock (about 0.010" for a 1/4" tool), "otherwise you are just wearing the tool out".
7. **The chip thinning correction is what makes a skim work.** Below 50% radial engagement the true chip is thinner than the programmed chip load. CNCCookbook's worked example: the uncorrected feed of 22.46 in/min becomes 49.778 in/min corrected, more than doubled, to hold the same true chip. ToolGrit states the wood form directly: fix fuzzy softwood with "a light finishing pass (0.010-0.020" radial engagement) at a higher feed rate". Vendor chip load charts do not carry this correction. It lives in CAM software and calculators, which is where this calculator already has it.
8. **Stepover for 3D finishing: 8-12% of tool diameter** (Vectric documentation), against roughly 40% for roughing. The Vectric finish toolpath runs as a single full-depth pass by design, and the roughing allowance exists so the finish tool always has material to cut. That is the CAM vendor stating the anti-rubbing rationale itself.
9. **Where a chip load reduction for finishing does circulate, it is teaching-tier, not vendor print.** MIT's fab-lab reference: 0.005" roughing, 0.002" finishing, with the immediate warning that at 0.001-0.002" the edge can mash the material and never form a chip. Hobby-CNC floors: 0.001" for normal end mills, 0.0005" below 1/8" diameter, sharp tools assumed.
10. **Climb on the finish pass is common but grain- and material-dependent.** Laguna and Toolstoday describe a light climb finish pass after conventional roughing for solid wood edges. WOODWEB's professional consensus runs the other way for panels: conventional gives the better surface on melamine and laminates. An Onsrud representative's field rule: cut, compare the good side with the waste side, and if the waste looks better, reverse direction.

### Target 3 — the physics record

11. **Feed per tooth is the best single predictor of machined wood surface quality.** Beech up-milling at chip thicknesses of 0.02, 0.06 and 0.10 mm: roughness (Ra, Rz) and cutting power rose with chip thickness, and doubling the cutting speed changed roughness not at all. A 2025 plywood study found feed per tooth the best-correlated predictor of the Rp roughness parameter. MDF studies agree in direction (rpm up and feed down reads smoother) and find the axial depth of cut statistically insignificant for roughness.
12. **Two mechanisms reward a thinner finishing chip, and both stop at the rubbing floor.** Kinematics: cusp height scales with the square of the step (h = ae²/8R), and the planing-trade standard is 20+ knife marks per inch. Fracture: a thinner chip shortens the split running ahead of the edge, which converts Franz Type I (torn grain) toward Type II (clean shear). Below the floor the trend inverts into burnishing, burning and glazing, and USDA Forest Products Laboratory documents that a burnished surface then rejects glue and water-based finishes.
13. **The first-cut style reduction belongs to heavy engagement and must not follow the tool into the skim.** The published 25%/50% reductions compensate axial depth. A skim is the opposite regime: engagement so light that the programmed chip already overstates the true chip. Reducing the feed there drives the pass under the floor. Toolstoday states the wood symptom set plainly: dust instead of chips, burn along the edge, a hot bit, premature dulling, and the fix is to raise the feed or lower the rpm.
14. **Deflection is the reason the allowance exists at all.** Tool stiffness scales with diameter to the fourth power and inversely with stickout cubed, about 0.001" of deflection starts chatter, and the light final pass unloads the tool on the cut that defines the wall. Wood nesting practice has its own deflection fix: climb the first pass, conventional the second, to erase the edge lip.

## What the calculator adopts (approved 2026-08-29, corrected twice the same day)

The Finishing mode joins Gentle, Standard and Aggressive as a fourth profile. Two builds were rejected before the one that shipped, and both errors are worth recording. The first build served the low edge of the tool's own chart band. The serving charts for spiral and compression tools are roughing-grade chip loads, so their low edge (0.406 mm/tooth for a half-inch MDF compression cut) is a nesting chip, not a finishing chip, and the thinning compensation then drove the programmed feed to 24,300 mm/min. Scott rejected that number on sight. The second build served the low edge of the finisher-series charts (Onsrud 60-200, finding 1) but treated that value as the effective chip and compensated the feed for thinning on top of it. A review sweep over 42,000 cuts showed the chip then growing with diameter twice over, until a 3/4 in three-flute hardwood skim at 24,000 rpm reached the 30,000 mm/min machine cap, the sibling of the first number.

The mode that shipped serves the finisher-series chip loads as the **programmed chip, with no thinning compensation**, because the vendor publishes them for a finish pass and the light radial engagement is already inside the number. The half-inch MDF cut now serves 4,572 mm/min (180 in/min), hardwood at the same size 6,408 mm/min (252 in/min), and the 3/4 in three-flute hardwood cut 14,616 mm/min (575 in/min), inside the 100-300 in/min band Vortex mandates for its finishing bits and the 200-600 in/min finisher rung of the Leitz ladder (finding 4). Plywood, soft plywood, melamine and HPL have no finisher row and borrow the MDF finisher chart, the lowest of the three, with a note. Outside the finisher rows' diameter coverage (1/8 in, 4 mm, 1 in) the mode refuses with the reason, because every diameter-blind substitute tried served a number a machinist would reject. The chip floor in this mode is the finisher chart's own minimum, checked on the programmed chip, and it warns only when a machine cap or a full-width derate holds the feed below it.

When the user gives no width of cut, the mode assumes **1 mm of radial stock left on the wall**, chosen by Scott on 2026-08-29. That value sits inside Leitz's published 1-2 mm and above the 0.25 mm per side modelled in the archived reference article. Neither the first-cut reduction nor the deep-slot depth derate applies to a skim, for the reason in finding 13: both compensate heavy engagement, and on a thin cut either drives the chip under the rubbing floor. The result names the physical chip, thinner than the programmed one, and carries a note that the power estimate reads low on thin chips (Kienzle behaviour, per the reference article).

## Caveats

- talkshopbot.com, forum.vectric.com, amanatool.com and woodworkingnetwork.com refused automated fetches (403). Numbers from those sources came through search excerpts and are marked as such above. The ShopBot and Leitz PDFs were extracted in full.
- Costes & Larricq (2002) tested beech from 3 to 62 m/s at constant chip thickness, which makes it the reference study for cutting speed isolated from chip load. The direction of its roughness result was not verified this session. Do not cite a direction from it.
- Every minimum-chip-thickness ratio in this session is metal or micro-milling work carried over by analogy. Session 3's manual-retrieval list (edge radius of woodworking carbide) is still the missing piece.
- The 0.005"/0.002" rough/finish chip loads, the 0.010-0.030" allowances and the "5-15% finishing stepover" numbers are teaching- and blog-tier. They are consistent with each other and with the physics, but no tooling manufacturer prints them.

## Sources

### Manufacturer primary documents

- Onsrud per-material cutting data sheets (application tables with Roughing/Finishing rows, depth rules): https://onsrud.com/Forms/Cutting-Data-Recommendations.asp with the sheets at https://onsrud.com/images/Hard%20Wood.pdf , https://onsrud.com/images/Soft%20Wood.pdf , https://onsrud.com/images/MDF.pdf , https://onsrud.com/images/Hard%20Plywood.pdf , https://onsrud.com/images/Soft%20Plywood.pdf , https://onsrud.com/images/Laminated%20Chipboard.pdf , https://onsrud.com/images/Laminated%20Plywood.pdf
- Onsrud production catalog technical pages (feed-then-rpm optimisation procedure, tool heat): https://www.suncoasttools.com/crm/pdf/LMTONSRUDCAT.pdf (distributor mirror)
- Vortex Tool 2019 catalog (roughing vs finishing series, rpm philosophy, chip load chart): https://ctsaw.com/wp-content/uploads/2015/03/Vortex_Catalog-2019.pdf with the chart alone at https://www.vortextool.com/media/assets/chipLoadChart.pdf
- Amana feeds and speeds PDFs (depth rule, per-material columns): https://www.amanatool.com/pub/media/productattachments/Solid-Carbide-Compression-Spirals-v8.pdf , https://www.amanatool.com/pub/media/productattachments/Solid-Carbide-Spektra-Spiral-Plunge-2-3-Flute-v27.pdf , https://www.amanatool.com/pub/media/productattachments/Spiral-Ball-Nose-Speed-Chart-v6.pdf
- Freud CNC feed and speed guide (depth rule, chip-too-small warning): https://www.freudtools.com/public/assets/freud/downloadables/freudtools-router-bit-feed-and-speed-for-cnc-20170822.pdf
- GDP Tooling chip load calculator and CNC tooling guide (two-tool sequence, softened depth rule, down-cut groove rule): https://gdptooling.com/chipload-calc/ and https://gdptooling.com/wp-content/uploads/2024/02/GDP-CNC-Tooling-Guide.pdf
- Leitz Lexicon Edition 7, Routing chapter (the 1-2 mm finish allowance, climb/conventional grain rules, fz by material): https://www.leitz.org/fileadmin/Downloads/Lexicon/EN/Leitz_Lexicon_Edition_7_-_05_Routing.pdf and the Manual feed chapter at https://www.leitz.org/fileadmin/Downloads/Lexicon/EN/Leitz_Lexicon_Edition_7_-_04_Manual_feed.pdf
- Leitz CNC production routing guide (chips-not-dust doctrine, tool-family feed ladder): https://precisionboard.com/wp-content/uploads/2017/08/CNC-Prod-Routing-Guide-05.pdf (mirror)

### Machine and CAM vendor documents

- ShopBot feeds and speeds charts (Onsrud-sourced, the feed-then-rpm loop): https://shopbottools.com/wp-content/uploads/2024/01/FeedsandSpeeds.pdf
- Vectric documentation, 3D finish and rough toolpaths (8-12% stepover, single-pass finish, allowance rationale): https://docs.vectric.com/docs/V12.0/VCarvePro/ENU/Help/form/Finish%20Machining%20Toolpath/index.html and https://docs.vectric.com/docs/V10.0/Aspire/ENU/Help/form/Rough%20Machining%20Toolpath/

### Trade press and expert forums

- Woodworking Network, how to use a chip load chart (minimum chip load on radial depth for finish passes): https://www.woodworkingnetwork.com/best-practices-guide/cutting-grinding-cutting-tools-grinders/how-use-chip-load-chart (403, snippet-verified)
- Woodworking Network / FDMC, knife marks per inch: https://www.woodworkingnetwork.com/magazine/fdmc-magazine/knife-marks-inch and https://www.woodworkingnetwork.com/magazine/fdmc-magazine/more-about-knife-marks-inch
- WOODWEB, climb vs conventional (professional consensus, Onsrud rep's field rule): https://woodweb.com/knowledge_base/Climb_Cutting_Versus_Conventional_Cutting.html
- WOODWEB, burnished wood fails to hold finish: https://woodweb.com/knowledge_base/Understanding_Why_Burnished_Wood_Fails_to_Hold_Fin.html
- Woodshop News, factors to factoring chip load (repeats the depth rule, no finishing discussion): https://www.woodshopnews.com/columns-blogs/factors-to-factoring-chip-load
- ShopBot forum archive threads on cleanup stock: https://www.talkshopbot.com/forum/archive/index.php/t-3974.html , https://www.talkshopbot.com/forum/archive/index.php/t-21234.html , https://www.talkshopbot.com/forum/archive/index.php/t-19860.html (all 403, snippet-verified)
- Vectric forum threads on finishing stepover and allowance: https://forum.vectric.com/viewtopic.php?t=27560 , https://forum.vectric.com/viewtopic.php?t=34113 , https://forum.vectric.com/viewtopic.php?t=24491 , https://forum.vectric.com/viewtopic.php?t=29890 (all 403, snippet-verified)

### Peer-reviewed and institutional

- Piernik, Pinkowski & Krauss (2023), chip thickness vs roughness and power in beech up-milling, BioResources: https://bioresources.cnr.ncsu.edu/resources/effect-of-chip-thickness-wood-cross-sections-and-cutting-speed-on-surface-roughness-and-cutting-power-during-up-milling-of-beech-wood
- European Journal of Wood and Wood Products (2025), plywood roughness optimisation, fz best predictor of Rp: https://link.springer.com/article/10.1007/s00107-025-02272-6 (paywalled, abstract only)
- BioResources, MDF milling roughness (feed, speed, diameter significant, axial depth not): https://bioresources.cnr.ncsu.edu/resources/the-influence-of-machining-parameters-on-surface-roughness-of-mdf-in-milling-operation/
- BioResources, MDF cabinet door roughness and energy: https://bioresources.cnr.ncsu.edu/resources/surface-roughness-and-processing-time-of-a-medium-density-fiberboard-cabinet-door-processed-via-cnc-router-and-the-energy-consumption-of-the-cnc-router/
- MDPI Forests (2026), feed per tooth vs roughness and waviness in particleboard edge milling: https://www.mdpi.com/1999-4907/17/4/512 (403, abstract via search)
- Costes & Larricq (2002), high cutting speed in beech milling, 3-62 m/s at constant chip: https://www.afs-journal.org/articles/forest/abs/2002/07/07/07.html (403, setup verified, result direction not)
- US Forest Service, Franz chip types in orthogonal cutting of loblolly pine: https://research.fs.usda.gov/treesearch/596 and https://www.srs.fs.usda.gov/pubs/rp/rp_so146.pdf
- Goli, Marchal, Uzielli et al. (2009/2010), up/down-milling by grain orientation: https://link.springer.com/article/10.1007/s00107-009-0323-3 and https://link.springer.com/article/10.1007/s00107-009-0374-5 (paywalled)
- USDA Forest Products Laboratory, Wood Handbook chapter 10 (burnished surfaces reject adhesives): https://www.fpl.fs.usda.gov/documnts/fplgtr/fplgtr190/chapter_10.pdf
- Wood and Fiber Science, surfacing defects and moisture (fuzzy vs torn grain, rake/clearance bands): https://wfs.swst.org/index.php/wfs/article/download/866/866
- European Journal of Wood and Wood Products (2017), machining parameters vs raised grain under water-based finishes: https://link.springer.com/article/10.1007/s00107-017-1250-3 (paywalled, topic verified only)
- ScienceDirect topic page and PMC review, minimum chip thickness in micro-machining (0.15-0.5 × edge radius, metals): https://www.sciencedirect.com/topics/engineering/minimum-chip-thickness and https://pmc.ncbi.nlm.nih.gov/articles/PMC7760672/
- Wood Research 63(3) 2018, high-speed milling of HDF: https://www.woodresearch.sk/wr/201803/09.pdf (PDF not parseable, snippet only)

### Teaching, community and blog tier (numbers here are practice, not vendor print)

- CNCCookbook, milling surface finish guide (allowance sizing, deflection, rpm-up-feed-down): https://www.cnccookbook.com/milling-finish-complete-guide-feeds-speeds-master-class-lesson-7/
- CNCCookbook, chip thinning and rubbing (thresholds, the doubled-feed worked example): https://www.cnccookbook.com/chip-thinning-rubbing-lesson-3-fs-email/
- CNCCookbook, wood cutting and tear-out lists: https://www.cnccookbook.com/feeds-speeds-cnc-wood-cutting/ and https://www.cnccookbook.com/16-cnc-router-tips-to-avoid-tearout-and-splintering/ and https://www.cnccookbook.com/cnc-stepover/
- MIT CBA fab pages, chip load (0.005" rough, 0.002" finish, mash warning): https://pub.pages.cba.mit.edu/feed_speeds/parameter_explanations/chipload.html
- Shapeoko community guide, feeds and speeds basics (hobby floors, thinning formula): https://shapeokoenthusiasts.gitbook.io/shapeoko-cnc-a-to-z/feeds-and-speeds-basics
- ToolGrit wood speeds and feeds guide (finishing stepover 5-15%, higher-feed skim): https://www.toolgrit.com/guides/cnc-wood-speeds-feeds-guide
- Laguna Tools, preventing tear-out (0.020-0.040" allowance, climb finish): https://info.lagunatools.com/how-to-prevent-tearout-on-a-wood-cnc-router
- Toolstoday (Amana's education arm), climb cuts and burning: https://toolstoday.com/learn/what-is-a-climb-cut and https://toolstoday.com/learn/why-your-cnc-router-bit-is-burning-wood-and-why-slowing-down-might-make-it-worse
- Machining Doctor, ball-nose scallop and end mill deflection: https://www.machiningdoctor.com/calculators/ball-nose-surface-finish/ and https://www.machiningdoctor.com/expert-articles/endmiils-deflection/
- Open machining textbook, finishing allowance and spring passes (metal practice): https://openwa.pressbooks.pub/intromachining1/chapter/wa9-9/
- WorkshopCalc chart and Cal Bryant's plywood write-up (light climb finish pass, thinning reasoning): https://workshopcalc.com/reference/cnc-feeds-speeds-chart and https://calbryant.uk/blog/cnc-routing-speeds-and-feeds/
- SpeTool toolpath basics (bottom-skin onion skinning): https://spetools.com/blogs/spetool-woodworking-tips/cnc-routing-basics-toolpaths-feeds-and-speeds

Not reachable this session: Belin (belin-y.com TLS failure, only a Scribd upload of "Cutting Formulas for Belin Tools" exists at https://www.scribd.com/document/730224235/BELIN-ROUTERBITS-info ). Whiteside publishes no chip load chart at all, only Vectric tool files "as a recommended starting point": https://www.whitesiderouterbits.com/pages/vectric-tool-files
