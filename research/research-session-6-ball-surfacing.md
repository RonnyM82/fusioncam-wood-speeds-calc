# CNC Router Speeds & Feeds — Research Session 6: Ball-nose 3D surfacing in MDF and solid timber

Researched 2026-09-02, to decide whether the calculator and the Fusion panel can
stop refusing the 3D strategies. Method: a firsthand read of every catalogue and
chart already vendored in `research/sources/`, then a five-angle web sweep (North
American makers, European makers, ball-tool geometry, wood-machining science,
practitioner practice), then two adversarial verification passes over the 162
extracted claims. Seven agents, no failures. Every number below that a subagent
found was re-opened by a verifier, and the numbers that matter most were opened a
third time by me, off the rendered page rather than the PDF text layer.

Nothing was written to `data/` or `js/`. The serving decisions are Scott's and
they are listed at the end, as questions with the evidence for each answer.

## TL;DR

- **Two makers publish a chip load for a ball-tipped tool in wood, and they
  agree.** Amana's spiral ball nose chart carries softwood, hardwood and MDF
  columns across seven diameters. Onsrud's 77-100 taper tools, which its
  catalogue says "come standard with a ball nose point", carry .003-.005 in per
  tooth at 1/8 in and .005-.007 at 1/4 in, the same in soft wood, hard wood and
  MDF. Those two Onsrud values equal Amana's hardwood column exactly at both
  diameters.
- **Not one of those numbers is published for a surfacing pass.** Every ball
  chart found, from every maker, states the same single condition: a depth of cut
  of one times the tool diameter. That is a groove with a round bottom. A 3D
  finishing pass is the opposite regime, light in both directions at once. The
  charts are honest about what they cover, and what they cover is not this.
- **Onsrud sells a ball nose for wood and publishes no wood number for it.** The
  52-200B appears in the MDF, soft wood and hard wood contents pages of its own
  catalogue. Its chip loads exist only on the plastics, aluminium and solid
  surface pages. This is the cleanest refusal citation in the session.
- **Europe is a dry hole.** No European maker publishes a feed, a feed per tooth
  or a chip load for a ball nose in wood. Leitz publishes exactly one tool it
  calls a ball nose, gives it 18,000-24,000 rpm and no feed at all. CMT and Klein
  sell tapered ball nose tools for 3D carving in wood and publish geometry only.
  CMT says in print that it declines to publish numbers.
- **Two makers publish a stepover, and only one of them means a finishing
  stepover.** SpeTool prints a STEP OVER column on its 2D/3D chart at 0.4 times
  the tip diameter, which is the same 0.4 it prints on its straight spiral chart,
  so it is a generic width of cut rather than a 3D value. PreciseBits publishes
  0.08 times tip diameter for the finishing pass and 0.40 for the roughing pass,
  on a tapered ball nose sold for 3D carving in wood — and publishes no feed at
  all, telling the user to run a test instead.
- **Nobody publishes both.** The makers who print a feed print no stepover. The
  maker who prints a stepover prints no feed.
- **The geometry is settled and the wood science is nearly empty.** Five makers
  publish the effective cutting diameter of a ball tool and all five formulas are
  the same expression. Exactly one peer-reviewed study in any language has put a
  ball end mill into wood and measured the surface, and it is a preliminary
  experiment on flat boards that publishes no roughness number.
- **The one wood study measured the tip problem, and its fix is unavailable on a
  three-axis router.** Fujino et al. found a flat area at the bottom of every
  groove, caused by the part of the tip that carries no cutting edge. Tilting the
  tool 15 degrees removed it along the grain. Across the grain, no good surface
  was obtained at any setting tested.
- **One vendor chart is internally broken.** Five of the twenty-five ball nose
  cells on Amana's 2D/3D carving chart disagree with the formula Amana prints on
  the same page by more than ten per cent, and three of the five are wood rows.
  The worst pair differs by a factor of two.

## Pass 1 — the manufacturer record

### What is published for a ball-tipped tool in wood

| Maker | Tool | Wood materials | Numbers published | Cut condition |
|---|---|---|---|---|
| Amana | 2 flute solid carbide CNC spiral ball nose, 1/16 to 3/4 in | softwood, hardwood, MDF, sign foam | feed rate and chip load per tooth at 18,000 rpm | depth 1 x D |
| Amana | 2D/3D carving bits, 2/3/4 flute ball nose, 1/32 to 1/2 in | one combined "Wood, MDF, Sign-Foam" row | feed rate and chip load per tooth at 18,000 rpm | depth 1 x D |
| Onsrud | 77-100 taper tools, ball nose point, 1/8 and 1/4 in | soft wood, hard wood, MDF, hard plywood | chip load per tooth | depth 1 x D |
| SpeTool | 2D/3D router bits by tip diameter, 0.5 to 4 mm and 1/32 to 1/8 in | one combined "Wood, MDF, Sign-Foam" row | chipload, feed rate, step down, step over at 18,000 rpm | depth 1 x cutting diameter |
| PreciseBits | tapered ball nose carving tools, tips 1/16, 1/8, 1/4 in | softwood, hardwood (species named) | stepdown, stepover, rpm window | stepdown 1 x tip diameter |
| IDC Woodcraft | ball nose 1/8 and 1/4 in, taper ball nose 1/4 in | soft to moderately hard wood | feed, plunge, depth per pass, stepover, rpm | depth per pass stated per tool |
| Yonico | ball nose among four other bits on one sheet | hard wood, soft wood | feed rate in IPM by rpm | depth 1x, 2x and 3x published separately |
| Leitz | ProfilDiamaster ball nose, D 20/30/40 mm | chipboard and fibre materials (MDF, HDF) | rpm window only | none stated |
| Vortex | series 2200 ballnose and tapered ballnose | wood and plastics | none | none |
| CMT | series 152 tapered ball nose, series 199 full radius | wood, wood composites | none | none |
| Sistemi Klein | art. T173 tapered ball nose | wood | none | none |
| Woodpeckers | Ultra-Shear 3 flute ball nose | woodworking | none | none |
| Onsrud | 52-200B/BL spiral upcut ball nose | listed for SW, HW and CW | **none in wood** | not applicable |
| Freud | — | — | no ball nose entry of any kind | — |
| Harvey Tool | — | — | wood line has no ball profile at all | — |

The Amana straight ball nose chart, in full, is the strongest single source in the
session. Chip load per tooth, in inches, at 18,000 rpm with two flutes, depth of
cut one times the tool diameter:

| Material | 1/16" | 1/8" | 1/4" | 3/8" | 1/2" | 5/8" | 3/4" |
|---|---|---|---|---|---|---|---|
| Softwood | .003-.005 | .005-.007 | .007-.009 | .008-.010 | .009-.011 | .010-.012 | .011-.013 |
| Hardwood | .002-.004 | .003-.005 | .005-.007 | .006-.008 | .007-.009 | .008-.010 | .009-.011 |
| MDF | .003-.005 | .005-.007 | .006-.008 | .007-.009 | .008-.010 | .009-.011 | .010-.012 |

In millimetres per tooth, the same table reads 0.051-0.102 at the smallest
hardwood cell and 0.279-0.330 at the largest softwood cell. Two side facts hold
across the whole chart. Softwood carries the highest values and hardwood the
lowest, with MDF between them, which is the reverse of the MDF-highest ordering
that Freud, Vortex and Onsrud print for flat tools. And the chart passes its own
consistency check: every printed feed band equals rpm times flutes times the
printed chip load to within 10 IPM, which is rounding to the nearest ten.

### The condition every chart states, and what it is not

Every ball chart found states a depth of cut of one times the tool diameter, and
states nothing else. Amana prints it in the page header and repeats the familiar
reduction schedule underneath, 25 per cent off at two diameters and 50 per cent
off at three. Onsrud prints "1 x D" in the Cut column of the row itself. SpeTool
prints "Depth of cut: 1xCutting diameter", with a 30 per cent reduction at two
diameters where the American makers say 25.

A cut one ball diameter deep is a fully buried tool. The radial engagement is the
whole diameter and the tool is cutting on its full width. That is a slot with a
round bottom, and it is what these tools do when they cut a flute, a cove or a
bowl edge. A 3D surfacing pass is light in both directions at once: the stepover
is a few per cent of the diameter and the surface removes only the roughing
allowance. The two regimes share a tool and share nothing else.

So no maker publishes a chip load for the cut the Fusion panel is being asked
about. That is the central finding of the manufacturer pass, and it is not a gap
in the searching.

### Onsrud lists the tool for wood and publishes no wood number for it

Onsrud's 52-200B/BL is a "Double Flute - Solid Carbide Upcut Spiral Ball Nose",
described in the catalogue as "Designed for carving and modeling operations", with
usage "Plastic, solid surface, block & plate aluminum natural wood and wood
composite" and material codes SW HW CW SP HP A SSP. It appears by name in the
contents-by-material pages for CW MDF, for soft wood and for hard wood.

It appears on none of the seven wood cutting-data pages. I walked every one, in
the vendored catalogue and in the standalone sheets, by text search and then by
eye on the rendered page. Its chip loads exist only on the soft plastic, hard
plastic, aluminium and solid surface pages.

That is a maker naming a ball nose as a wood tool, in its own contents page, and
declining to give it a wood number. It is the exact sentence a refusal message
should be built on.

### The one Onsrud ball-tipped tool that does carry a wood number

The 77-100 series is described in the same catalogue: "The taper tools are
available with a variety of taper angles and come standard with a ball nose
point." Usage "Wood, plastic and aluminum", material codes SW HW CW SP HP A.
Taper angles 1, 3, 5 and 7 degrees per side. The 1/8 in tools carry a 1/16 in
radius per side and three flutes. The 1/4 in tools carry a 1/8 in radius and two
flutes. So the tip is a true hemisphere of the stated cutting diameter.

Its published chip load, read by word coordinate against the column headers and
then checked on the rendered page:

| Material | 1/8 in | 1/4 in |
|---|---|---|
| Soft wood | .003-.005 | .005-.007 |
| Hard wood | .003-.005 | .005-.007 |
| MDF | .003-.005 | .005-.007 |
| Hard plywood | .003-.005 | .005-.007 |

One ladder for every wood material. Onsrud makes no material distinction for this
tool at all, where Amana makes three.

Those four values equal Amana's hardwood ball nose column exactly at both
diameters. Two makers, different tool geometries, arriving at the same pair of
numbers. Under the repo's own disagreement rule they do not disagree at all.

ShopBot republishes the same row with a spindle speed attached: "1/8" Tapered
Carbide Upcut Ball End Mill", Onsrud series 77-102, cut 1 x D, chip load per
leading edge .003-.005, two flutes, 18,000 rpm, feed 1.8-3.0 inches per second,
which is 108 to 180 IPM. Note that ShopBot says two flutes where the 2019 Onsrud
catalogue says three for that part number.

### The charts that publish a stepover

Two, and they mean different things.

**SpeTool** prints a STEP DOWN column and a STEP OVER column beside the chipload
and feed on its "2D/3D ROUTER BIT FEED&SPEED CHART". For the wood, MDF and
sign-foam row, at 18,000 rpm, keyed to tip diameter:

| Tip | chipload in | feed in/min | step down | step over |
|---|---|---|---|---|
| 0.5 mm | 0.0007 | 25.2 | 0.5 mm | 0.2 mm |
| 1.0 mm | 0.001 | 36 | 1.0 mm | 0.4 mm |
| 1.5 mm | 0.0015 | 54 | 1.5 mm | 0.6 mm |
| 2.0 mm | 0.003 | 108 | 2.0 mm | 0.8 mm |
| 3.0 mm | 0.004 | 144 | 3.0 mm | 1.2 mm |
| 4.0 mm | 0.005 | 180 | 4.0 mm | 1.6 mm |
| 1/32 in | 0.0008 | 28.8 | 0.03 in | 0.0125 in |
| 1/16 in | 0.0015 | 54 | 0.06 in | 0.025 in |
| 1/8 in | 0.004 | 144 | 0.125 in | 0.05 in |

Every row is internally consistent on two flutes: feed equals 18,000 times two
times the chipload, on all nine wood rows. The step down is one times the tip
diameter throughout and the step over is 0.4 times the tip diameter throughout.

That 0.4 is the reason this is not a 3D finishing stepover. SpeTool prints the
same 0.4 times diameter step over on its straight carbide spiral chart, for
up-cut, down-cut and compression bits. It is the maker's house width-of-cut
convention applied to every chart it publishes, not a value derived from a
surface finish. Read as a roughing width it is sensible. Read as a finishing
stepover it is five times what every practitioner in the session runs.

**PreciseBits** is the exception, and its wording is unambiguous. On its
"2, 3-flute Carbide Tapered Ball-Nose Carving tools" page, under Application
Data, tool type "Tapered Ball Nose":

> Stepdown (pass depth, depth per pass) recommended - 1X tip dia. maximum - 2X tip
> dia.
> Stepover: finishing pass (stepover, cleanup pass) = 0.08 X tip diameter (8%)
> roughing pass (clearance stepover) = 0.40 X tip diameter (40%)
> Maximum Depth of Cut (DOC) = 1.50"
> Spindle RPM (SPEED) = 5 KRPM to 60 KRPM ( optimum speed )
> Feedrate (IPM) = Depends on the material being cut. Do the Sweetspot Test
> before setting this parameter

The materials list names softwood (pine, fir, western red cedar, poplar, redwood)
and hardwood (walnut, redwood, maple, rosewoods). The applications list names
"Precision 3D carving" and "3D contouring and profiling". This is the only source
in the whole session that splits a stepover by pass type on a wood tool, and its
roughing figure of 40 per cent is the same number SpeTool prints as its only
figure.

And it publishes no feed. The maker that resolves the 3D geometry refuses the
feed, and the makers that publish the feed refuse the geometry.

### One vendor chart is internally broken

Amana publishes three further charts under the title "2D/3D Carving CNC Router
Bits", for Spektra-coated carbide, for ZrN-coated and uncoated carbide, and for
ZrN-coated high speed steel. They carry a single combined "Wood, MDF, Sign-Foam"
row and cover ball nose tools from 1/32 in to 1/2 in in two, three and four
flutes. The tool reference numbers are Amana's tapered ball nose carving bits:
46284, for example, is "CNC 2D and 3D Carving 1 Deg Tapered Angle Ball Nose x 1/8
D x 1/16 R x 3 Flute", so the chart's stated diameter is the ball diameter and the
taper sits above it. The chart itself never prints the word tapered.

These charts print the formula "To find Feed Rate = RPM x # of flutes x chip
load" on the same page as the numbers. I checked every ball nose cell against it,
off the rendered page rather than the text layer:

| Block | Column | Row | printed IPM | formula IPM |
|---|---|---|---|---|
| 2 flute ball nose | 1/16 in | wood | 55-90 | 108-180 |
| 2 flute ball nose | 1 mm | aluminium and plastic | 20-35 | 18-54 |
| 3 flute ball nose | 1/8 in to 3.2 mm | wood | 80-100 | 81-135 |
| 3 flute ball nose | 3/16 in | wood | 100-170 | 135-216 |
| 3 flute ball nose | 3/16 in | aluminium and plastic | 80-100 | 81-135 |

Five of the twenty-five ball nose cells disagree by more than ten per cent, and
three of the five are wood rows. The other twenty agree to within four per cent.
The worst cell differs by a factor of two: on a 1/16 in two-flute ball nose in
wood, the printed feed and the printed chip load cannot both be right, and
choosing between them doubles or halves the number that reaches the spindle.

The failures cluster at the small diameters, which is exactly where a 3D finish
pass lives. The 3/16 in aluminium cell duplicates the 1/8 in wood cell exactly,
which reads like a copy error rather than a considered value.

This does not condemn the chart. It does mean that if these charts ever serve,
each cell must be checked against the maker's own formula first, and a cell that
fails cannot serve until Amana is asked which of the two numbers is the intended
one.

### Europe

No European maker reached in this session publishes a feed, a feed per tooth or a
chip load for a ball nose cutting wood.

Leitz publishes exactly one tool it calls a ball nose in its 169-page routing
chapter: "Router cutter - ProfilDiamaster ball nose", order code WO 531 2 51,
diamond tipped, Z 2, three sizes at D 20/30/40 mm with R 10/15/20 mm. Workpiece
material "Chipboard and fibre materials (MDF, HDF etc.), uncoated, plastic coated,
veneered etc." Machines include CNC machining centres. The whole of its cutting
data is one line, read off the rendered page: "RPM: n = 18000 - 24000 min-1".
There is no feed diagram beside it, unlike the spiral finishing cutter twenty
pages earlier, which carries a printed "Feed speed vf depending on cutting depth
ap" chart. Its stated application is cutting radius profiles in panels, not
surfacing.

Leitz's User encyclopedia chapter carries the general formulas, and two of them
look relevant and are not:

- `t = fz² / (4 · D)`, labelled "Depth of knife marks [mm]". That is the cusp
  along the feed direction left by a peripheral cutter, a function of feed per
  tooth. It is not a stepover scallop.
- `fz eff`, defined in the abbreviation key as "effective tooth feed", is defined
  in the encyclopedia as the cutter mark length visible on the workpiece when only
  one knife of a multi-knife head finishes the surface. It has nothing to do with
  a ball's effective diameter. I chased this one because the abbreviation looked
  promising, and the firsthand read closed it.

The one Leitz formula that does carry over is `hm = fz·√(ae/D)`, "Mean cutting
thickness". That is the chip-thinning relation, published by a wood tooling maker
for wood, for peripheral cutting. It governs the radial direction, and it is not
an effective-diameter rule for a ball.

CMT sells series 152 solid carbide tapered ball nose bits explicitly for 3D
carving in wood, eleven sizes from 0.8 to 6.4 mm with R = D/2 throughout, and
publishes no rpm, no feed and no chip load. CMT states its position in print:
that you cannot randomly publish numbers, and that the user should measure their
own chip with a caliper and work backwards. Sistemi Klein's art. T173 tapered ball
nose is the same story. Klein's 2026 CNC catalogue contains no cutting data table
of any kind.

JSO publishes genuine programmed 3D data for a single-flute full-radius tool —
finish milling in climb cut at 16,000-24,000 rpm, 0.3-0.6 m/min, axial depth
0.5-1.0 mm — and publishes it for thermoplastics, with wood named nowhere on the
page.

Titman publishes a real MDF-derived feed table by cutter diameter and spindle
speed, from two years of testing, with no ball nose in it and no depth-of-cut
axis. Titman also uses the phrase "cusp height" to mean chip thickness, which is
the only appearance of that word in any European source read and does not mean
what it means in surfacing.

Cadence, formerly Belin, could not be reached at all: the domain does not resolve
and belin-y.com still fails TLS, as it did in session 4. Search indicates the
Belin cutting tool line has been discontinued.

### One side observation for a future session

The Onsrud standalone cutting-data sheets vendored in `research/sources/` are an
older revision than the catalogue vendored beside them. The catalogue's MDF page
carries rows the standalone sheet does not (60-100DC, 60-500/500M, 62-200) and
names a different tool as BEST for single pass. The repo's MDF chip loads came
from the standalone sheets. Nothing served today is wrong, and nothing in this
session depends on it, but the two documents should be reconciled when the routing
data is next touched.

## Pass 2 — geometry and physics

### Effective cutting diameter

Five makers publish it, in four algebraic forms, and all four are the same
expression:

| Source | Printed form |
|---|---|
| NS Tool | d = 2√(ap (D − ap)) |
| Harvey Performance | D_eff = 2 × √(ADOC × (D − ADOC)) |
| Modern Machine Shop | D_eff = 2√((D/2)² − (D/2 − DOC)²) |
| IMCO | D = 2√(R² − (R − ADOC)²) |
| Mitsubishi Materials | vc = 2πn√(ap(DC − ap)) / 1000 |

The verifier checked the algebra by hand and so did I. The chord half-width at
depth ap on a circle of radius R = D/2 is √(R² − (R − ap)²). Expanding gives
D·ap − ap². Doubling gives 2√(ap(D − ap)). At D = 6.000 mm and ap = 0.500 mm every
form returns 3.3166247903554 mm.

What that costs in surface speed, computed here and marked **derived**:

| ap as % of D | Deff / D | vc on a 12.7 mm ball at 18,000 rpm |
|---|---|---|
| 2 | 0.280 | 3.35 m/s |
| 5 | 0.436 | 5.22 m/s |
| 10 | 0.600 | 7.18 m/s |
| 20 | 0.800 | 9.58 m/s |
| 50 | 1.000 | 11.97 m/s |

The relevant comparison is not to another router bit. It is to the fact that no
wood source anywhere in the session states a minimum surface speed for a router
bit, so there is nothing to compare this against. Leitz gives one class-wide band
for shank tools, 10 to 40 m/s, with no material breakdown and no ball nose. The
12.7 mm ball at a two per cent stepdown falls under that band. So does the same
ball at full engagement, at 11.97 m/s, which is inside it. The band is too coarse
to decide anything.

For a sloped surface, Mitsubishi publishes the contact-point speed with the
inclination in the sine term, and the page's own calculator code reproduces it
character for character. Harvey publishes the tilted-tool form,
D_eff = D × sin(β + arccos((D − 2·ADOC)/D)).

Two makers, IMCO and Dapra, go further and publish a **feed** adjustment: multiply
the feed per tooth by D/Deff. Dapra's published multipliers reach 7.9. The
verifier closed the important detail here. IMCO's step 1 directs the user to take
the **slot milling** value as the input to that multiplier. Dapra's base chart
contains no occurrence of the word slot and its own guidance reads "Higher Feed
Ranges for: Lighter cuts", so its base already moves with cut weight. The two
makers publish the same multiplier on different bases. Applying it to the wrong
base doubles a feed.

No wood source publishes an effective-diameter correction of any kind, for rpm or
for feed. That was searched for directly and it is a clean dry hole.

### The tip

Sandvik Coromant states that at the tool centre of a ball nose the cutting speed
is close to zero, calls it the most critical area of the cutting edge, and
recommends tilting the spindle or the workpiece by 10 to 15 degrees to move the
cutting zone off centre. Harvey states the same as a zero-surface-feet condition
and adds two companions: feed in the direction of the incline, and climb mill.

Every source that says this is a metal or general machining source. No wood source
states it, and no wood source recommends a tilt for it — except the one wood study
below, which measured it.

### Scallop height

The exact relation and its parabolic approximation are both published, by Modern
Machine Shop, IMCO and Machining Doctor among others:

- exact: `h = R − √(R² − (ae/2)²)`
- approximate: `h ≈ ae² / (8R)`

Nobody publishes the error between them, so I computed it. Marked **derived**, and
it is scale free — the ratio depends only on the stepover as a fraction of
diameter:

| Stepover as % of D | approximate / exact |
|---|---|
| 5 | 0.9994 |
| 10 | 0.9975 |
| 15 | 0.9943 |
| 20 | 0.9899 |
| 30 | 0.9770 |
| 40 | 0.9583 |

The approximation always understates. Below about 15 per cent stepover the error
is under one per cent, which is far inside any other uncertainty in this session.
Either form is safe for a finishing stepover. The exact form costs nothing and
should be used anyway.

Scallop height at the stepovers people actually run, **derived**:

| Ball diameter | 8% | 10% | 12% | 40% |
|---|---|---|---|---|
| 3.175 mm | 0.0051 mm | 0.0080 mm | 0.0115 mm | 0.133 mm |
| 6.35 mm | 0.0102 mm | 0.0159 mm | 0.0229 mm | 0.265 mm |
| 12.7 mm | 0.0204 mm | 0.0318 mm | 0.0459 mm | 0.530 mm |

Machining Doctor's widely quoted "30 per cent" rule of thumb is 30 per cent of the
ballnose **radius**, per its own wording, which is 15 per cent of diameter. Anyone
carrying that number across as a diameter fraction doubles it.

Two measured checks exist, both in metal, and they disagree. In one study of a
rounded steel surface the calculated cusp was far below the measured profile
height at small stepovers. In another, on a tilted ball nose in hardened steel,
the measured average scallop was 2.5 µm against a theoretical 3.33 µm, and the
dominant roughness wavelength was 403 µm against a programmed 400 µm stepover.
Nothing equivalent exists in wood.

### What the wood science actually measured

Exactly one peer-reviewed study in any language has put a ball end mill into wood
and measured the surface. The bibliographic searches that establish this are worth
recording because they are what makes it a finding rather than a failure to look:
OpenAlex returns zero works for "ball nose" together with any of fibreboard, MDF
or particleboard. BioResources returns zero articles for either "ball nose" or
"ball end". A 22-page review of fifty years of wood machining research, by ten
authors across the main French laboratories, contains no occurrence of the word
"ball".

The study is Fujino, Sawada, Fujii and Okumura, Forest research Kyoto 74:159-166,
2002, in Japanese, on makanba (Japanese birch) and hinoki (cypress). Its own
introduction states that no research had been carried out considering the cutting
conditions of ball end mill machining with wood as the workpiece, and gives the
reason: at the tool's centre of rotation the cutting speed becomes zero.

What it ran: a 15 mm diameter ball end mill, two edges, 12,000 rpm, 0.5 mm depth
of cut, 2.0 mm pick feed, 50 mm stroke, feed 3.0 m/min, on flat-grain and
edge-grain faces, feeding along and across the grain, at 0 and 15 degrees of tool
inclination. Two tools differing only in the width of the chisel where the edges
cross, 1.36 mm and 0.52 mm. A second experiment varied feed over 0.4, 0.8, 1.5 and
3.0 m/min, which is 0.017 to 0.125 mm per tooth.

What it measured:

1. With the tool axis vertical, both species showed a flat area at the bottom of
   every groove, attributed to the portion of the tip that carries no cutting
   edge.
2. Tilting the tool 15 degrees took that region out of the cut, and for feed along
   the grain both species then produced arc-shaped grooves close to the
   theoretical profile.
3. For feed **across** the grain at 15 degrees, no good surface was obtained.
4. The narrow-chisel tool cut closer to the centre and still produced an uneven
   groove bottom. The authors state that whether the cause lies in the cutting
   mechanism near the centre of rotation or in the tool shape cannot be clearly
   explained at present.
5. It publishes the scallop formula with a correction for the edgeless tip:
   `R1 = r − √(r² − (p/2)²)` and `R2 = R1 − (r − √(r² − (a/2)²))`, where a is the
   chisel width.

It publishes no Ra, no Rz, no roughness number of any kind — only profile curves
and visual assessment.

The consequence for this calculator is direct. The measured fix for the tip is a
tool tilt, and a three-axis router cannot tilt. On Scott's machines the defect
Fujino measured is not avoidable by any parameter the calculator can serve.

### What the wood science measured about everything else

- **Cutting speed does not drive roughness, chip thickness does.** Beech up-milled
  at 7.5 and 15 m/s at constant chip thickness gave mean Ra of 4.91 and 4.74 µm,
  no significant difference. Over the same experiment chip thickness from 0.02 to
  0.06 to 0.10 mm moved Ra from 2.72 to 4.93 to 6.82 µm, all three in different
  homogeneous groups. This confirms session 4's finding and is the reason the
  collapsing tip speed may matter far less in wood than a metal source would
  suggest.
- **Stepover is the primary roughness factor in wood, measured with flat tools.**
  Oak milled with 8 and 10 mm straight-flute end mills at 30, 50, 70 and 90 per
  cent stepover: stepover dominated, effect size η² = 0.715. On the 8 mm tool at
  1 mm depth, Rk+Rpk rose from 11.60 µm at 30 per cent to 25.61 µm at 90 per cent.
  Nobody has run the equivalent experiment with a ball.
- **Grain angle moves cutting force by a factor of 1.34 to 3.73**, measured across
  a full 180 degrees of grain angle in one operation on five species. Species
  averages: paulownia 1.70, lime 1.87, maple 1.68, oak 1.97, azobé 3.38. Up-milling
  forces averaged 9 per cent below down-milling over 25 configurations.
- **Nobody has measured a pass that reverses between climb and conventional
  mid-cut**, which is what a ball tool does crossing a ridge. Nobody has machined a
  curved wood surface whose grain angle changes continuously along the pass and
  measured the result.
- **MDF at low chip thickness is a dust problem, not a burn problem, on the
  measured record.** The one study that models it gives dust content as
  `c% = 0.194 · hm⁻¹` and recommends an average chip thickness above 0.05 mm. A
  later fully-specified study on a 20 mm three-flute cutter found the smallest
  average chip thickness of 0.025 mm gave the **lowest** presence of respirable
  chips in MDF, the opposite of the pattern in particleboard. The 0.05 mm
  threshold is not settled.
- **No measurement exists of burnishing or glazing of MDF at low chip thickness.**
  No study measured gloss, densification, colour change, temperature or resin
  state against chip thickness. No temperature measurement in the MDF cutting zone
  was found at all. The burnishing mechanism is real and documented in general
  wood-surface work, but it has never been measured against a chip thickness in
  MDF, so no numeric floor can be sourced from it.

## Pass 3 — the practitioner record

Everything here is `data_class: practitioner`. It never overrides a chart. Its job
is to bound what a served number may look like before a machinist rejects it.

**The stepover consensus is narrow and it is nothing like the vendor 40 per
cent.** Vectric's own manual says 8 to 12 per cent of tool diameter is typical for
most 3D finishing cuts. Next Wave Automation publishes 7 to 11 per cent. A CNC
router maker's guide says 8 to 10 per cent of tool tip diameter for a finish
needing minimal sanding, and that 20 per cent doubles the speed but leaves visible
ridges. Amana's own retail arm offers 10 per cent as an example. Across roughly
twenty independent community reports the numbers run 3 to 12 per cent, clustering
hard on 8 to 10, with 5 or 6 recommended when someone reports visible lines and 3
to 5 recommended for a guitar-grade surface.

Two documented ladder tests exist. One cut the same model at 100, 75, 50, 25, 10
and 5 per cent on a 1/4 in ballnose and recorded finish times of 47 seconds
through to 14 minutes 20 seconds, concluding 10 per cent is acceptable if you will
sand and 5 per cent if you will not. Another cut a purpose-built test at 50, 25,
20, 15, 10 and 5 per cent on three ball sizes with feeds held constant, and
reported the difference between 10 and 5 per cent on the 1/8 in tool as barely
visible.

**Feeds run far below the vendor charts.** The Amana chart puts a 1/4 in ball in
hardwood at 190-260 IPM. Practitioner finishing feeds for the same tool cluster at
40 to 150 IPM, with one production user at 350 IPM on a 1/16 in tool and several
experienced users capping softwood at 100 IPM. Several report their machine's feed
ceiling as the binding constraint, not the tool.

**Nobody in the whole corpus reports burning MDF with a small ball tool on a
finishing pass, with numbers.** That was searched for directly across five
communities. The failure reports are fuzzing in softwood, tearout on the finishing
pass in cedar, chatter marks, and visible ball nose lines from too large a
stepover. The fixes offered are a smaller stepover, a raster at 45 degrees to the
grain, two finishing passes at different angles, a sanding sealer after roughing,
and changing direction.

**There is no such thing as a 3D finishing pass depth, and the community says so.**
Vectric's manual confirms it: the finishing toolpath is one single pass and ignores
the tool's pass depth, so the roughing allowance is what the finishing tool
actually cuts. What people state instead is a roughing allowance, and the ladder
offered by Carbide 3D's community lead is 0.02 in for a 1/4 in tool, 0.010 to
0.005 for 1/8, 0.005 to 0.0025 for 1/16 and zero for 1/32, with the reasoning that
leaving only a chipload's thickness for each successive smaller tool causes rubbing
and heat.

**One thread states the chip-thinning problem exactly.** A cutting tool maker's
representative works the example: a 0.005 in chipload at 10,000 rpm and 100 IPM
becomes about 0.0027 in at an 8 per cent stepover, a little over half, and calls
0.0027 in close to the minimum for hardwoods. A long-standing user in the same
thread replies that his machine's 4,000 mm/min ceiling means the chip load charts
cannot be satisfied at 8 to 9 per cent stepover at all, and that everything is a
compromise. That exchange is the practical shape of the whole serving problem.

**Nobody states a chip load for a tapered ball nose tip.** Asked directly, the
answers were that it cannot be calculated because the chipload of the tip is hard
to calculate, and that the very tip is rubbing no matter what you do.

**The spindle speed question is openly unresolved.** One experienced user says
drop to 10,000-12,000 rpm for softwood 3D finishing. A tool maker's representative
replies in the same thread that higher rpm increases shear. The thread ends
without resolution.

## Where the sources disagree

1. **Amana's carving chart against itself**, in five of twenty-five ball nose
   cells, worst case a factor of two. Documented above.
2. **Vendor stepover against practitioner stepover**, 40 per cent against 8 to 10
   per cent. This is not really a disagreement: PreciseBits publishes both and
   labels which is which. It becomes a disagreement only if SpeTool's single
   figure is read as a finishing value.
3. **IDC Woodcraft against itself, three ways.** Its starter-set summary page
   prints 40 per cent for the 1/8 in and 1/4 in ballnose. Its dedicated ball nose
   page prints 8 per cent for the same two bits at the same feeds and rpm, under
   the note "Stepover is set for 3D modeling work." Its metric table prints 20 per
   cent, footnoted down to 5-8 per cent for 2.5D and 3D relief carves. Its metric
   table also gives different spindle speeds for the same bits, 14,000 and 13,000
   against 22,000 and 19,000. The feeds convert exactly (1524 mm/min is 60.0
   in/min), so the speed conflict is real and not a conversion.
4. **ShopBot against Onsrud on flute count** for part 77-102, two against three.
5. **The two makers who publish a D/Deff feed multiplier disagree on its base.**
   IMCO's input is the slot value by explicit instruction. Dapra's base chart says
   "Higher Feed Ranges for: Lighter cuts". The same multiplier on the wrong base
   doubles a feed.
6. **The MDF fine-dust threshold.** One study models dust against chip thickness
   and recommends staying above 0.05 mm. A later, better-specified study found the
   opposite direction in MDF over 0.025 to 0.049 mm.
7. **Amana's ball chart puts softwood above MDF above hardwood.** Every flat-tool
   chart in this repo puts MDF highest. Amana's own flat chart has one combined
   Wood/Plywood column below its MDF/Laminate column, so it cannot arbitrate.
8. **Cutting speed against roughness in wood**, measured in only two studies at
   constant chip thickness, and they do not agree in direction.

## The dry holes, named so a refusal can cite them

These are the sentences a refusal message can rest on. Each was looked for
directly and is absent, not merely unfound.

- **No maker publishes a chip load, feed or chip thickness for a ball nose in wood
  for a 3D surfacing cut.** Every ball chart states one condition, a depth of cut
  of one times the tool diameter, and that is a full-width groove.
- **Onsrud lists its ball nose series for MDF, soft wood and hard wood in its own
  contents pages and publishes no wood chip load for it anywhere in the
  catalogue.**
- **No European maker publishes any feed for a ball nose in wood.** Leitz gives its
  one panel ball nose an rpm window and nothing else. CMT and Klein publish
  geometry only. CMT declines in print.
- **No maker publishes a scallop-height rule, or any stepover-to-surface-finish
  relation, for a ball tool in wood.**
- **No wood source publishes an effective-diameter correction for a ball tool**,
  for rpm or for feed. Every source that does is a metal or general machining
  source.
- **No wood source states that cutting speed falls to zero at the ball centre, or
  recommends a tilt for it.** One wood study measured the consequence; no maker
  states the rule.
- **No study anywhere measures ball end or ball nose milling of MDF,
  particleboard, plywood or any wood panel.** The bibliographic searches are
  recorded above.
- **No study measures ball-nose stepover against measured roughness in wood.** The
  one wood ball study used a single fixed pick feed and never varied it.
- **No measurement exists of burnishing, glazing, temperature or resin softening in
  MDF as a function of chip thickness.**
- **No source publishes an effective-diameter formula for a tapered ball nose**,
  which is the geometry most used for wood 3D carving. CNC Cookbook states
  explicitly that it is more complex and then gives no formula.
- **No maker publishes a different 3D stepover for MDF than for hardwood.** Every
  source gives one figure for all materials.
- **No published number exists for a bull nose**, a tool with a corner radius
  between zero and half the diameter, in any of this.

## What this means for the calculator

The honest position is that a ball surfacing mode can serve a **chip load and a
feed**, from two makers who agree, for a **straight ball nose in softwood,
hardwood and MDF between 1/16 and 3/4 inch**, and that everything the 3D part of
the question asks for is unsourced. The stepover, the scallop, the tip, the slope
and the grain reversal all have to be either derived geometry that the calculator
shows without claiming, or a refusal.

The trap is the one session 4 already fell into twice. The charts publish a
programmed value for a full-width cut. A surfacing pass is a light cut. The
temptation is to compensate the feed upward for the light engagement, and the
sight test below is what that produces.

Served cutting feed in mm/min at 18,000 rpm on two flutes, from the Amana chart.
Column A is the chart value programmed as it stands. Column B is the same value
with the existing radial chip-thinning compensation applied to the stepover. The
machine cap in `rules.json` is 30,000 mm/min.

| Material | Diameter | stepover | A (mm/min) | B (mm/min) |
|---|---|---|---|---|
| MDF | 3.175 mm | 8% | 4,572-6,401 | 8,426-11,797 |
| MDF | 6.35 mm | 8% | 5,486-7,315 | 10,112-13,482 |
| MDF | 12.7 mm | 8% | 7,315-9,144 | 13,482-16,853 |
| MDF | 19.05 mm | 8% | 9,144-10,973 | 16,853-20,223 |
| Hardwood | 3.175 mm | 8% | 2,743-4,572 | 5,056-8,426 |
| Hardwood | 19.05 mm | 8% | 8,230-10,058 | 15,167-18,538 |
| Softwood | 19.05 mm | 8% | 10,058-11,887 | 18,538-21,908 |
| MDF | 6.35 mm | 40% | 5,486-7,315 | 5,600-7,466 |

Column B on a 1/8 inch ball in MDF is 11,797 mm/min, or 464 inches per minute. The
practitioner record for that tool runs 635 to 3,810 mm/min, 25 to 150 inches per
minute, and the one production outlier is 8,890 mm/min on a 1/16 inch tool. Column
A on the same cut is 4,572 to 6,401 mm/min, 180 to 252 inches per minute, which is
exactly what Amana prints for a groove.

**Scott judged the column B figures sound on 2026-09-02**, from his own production
surfacing experience, and that reading survives scrutiny for a reason the corpus
itself supplies. The practitioner band is not a statement about the cut. It is a
statement about the machines making it. That corpus is dominated by benchtop and
prosumer routers, and several reports name the machine's own feed ceiling as the
binding constraint rather than the tool: one user states plainly that a 4,000
mm/min ceiling makes the chip load charts unsatisfiable at an 8 per cent stepover
at all. A heavy nesting router has no such ceiling until 30,000 mm/min. So the gap
between column B and the forum cluster is largely a machine-class gap, and column
B is not disqualified by it.

That does not make column B sourced. Column A is the maker's groove number.
Column B is that number with the radial thinning compensation applied, and the
distinction that matters is which base the compensation sits on — see Q2.

## The proposal

None of this is implemented. The three sections below are the data shape, the
decisions that are Scott's, and what the Fusion panel would need.

### A. The data shape

A sixth file, `data/ball.json`, for the same reason `drills.json` is separate:
the shape differs and the routing selector must never see these rows. Modelled on
`drills.json`, one entry per (source, tool family, material), with the diameter
ladder inside the entry rather than one entry per diameter, because both serving
charts publish a ladder.

```jsonc
{
  "schema_version": "1.0",
  "units": { "length": "mm", "chip": "mm_per_tooth", "feed": "mm_per_min" },
  "sources": {
    "amana-ball-nose-chart": {
      "document": "Amana Tool, 2 Flute Solid Carbide CNC Spiral Ball Nose Router Bits (research/sources/amana-spiral-ball-nose-v7.pdf)",
      "retrieved": "2026-09-02",
      "notes": "v6 and v7 carry identical numbers; v7 adds two tool reference numbers"
    },
    "onsrud-2017-taper": { "...": "..." }
  },
  "entries": [
    {
      "entry_id": "amana_ball_nose_mdf",
      "family": "ball_nose",              // ball_nose | tapered_ball_nose
      "tip_radius_rule": "half_diameter", // R = D/2, the only shape served
      "edge_material": "solid_carbide",
      "flutes": 2,
      "flutes_basis": "per_tooth",
      "material": "mdf",
      "materials_printed": "MDF",
      "diameters_published_mm": [1.5875, 3.175, 6.35, 9.525, 12.7, 15.875, 19.05],
      "fz_mm": [                          // one band per published diameter
        [0.076, 0.127], [0.127, 0.178], [0.152, 0.203], [0.178, 0.229],
        [0.203, 0.254], [0.229, 0.279], [0.254, 0.305]
      ],
      "rpm_stated": 18000,
      "doc_basis": "1xD",                 // the ONLY condition the chart states
      "cut_type_published": "none",       // NOT published for surfacing
      "stepover_published": null,
      "scallop_rule_published": null,
      "effective_diameter_rule": null,
      "depth_derating": { "1xD": 1.0, "2xD": 0.75, "3xD": 0.5 },
      "internal_check": {
        "method": "printed feed band against rpm x flutes x printed chip load",
        "max_deviation_pct": 4,
        "passed": true
      },
      "source": "amana-ball-nose-chart",
      "data_class": "vendor"
    }
  ],
  "geometry": {                            // derived, not vendor data
    "effective_diameter_mm": "2*sqrt(ap*(D-ap)), ap <= D/2",
    "scallop_height_mm": "R - sqrt(R^2 - (ae/2)^2)",
    "sources": ["ns-tool", "harvey", "imco", "mitsubishi", "modern-machine-shop"],
    "data_class": "derived_from_published_formula",
    "wood_source_exists": false
  },
  "stepover_guidance": [                   // NOT feeds; guidance only
    { "value_fraction_of_tip_diameter": 0.08, "pass": "finishing",
      "source": "precisebits-tapered", "data_class": "vendor" },
    { "value_fraction_of_tip_diameter": 0.40, "pass": "roughing",
      "source": "precisebits-tapered", "data_class": "vendor" },
    { "range_fraction_of_diameter": [0.08, 0.12], "pass": "finishing",
      "source": "vectric-docs", "data_class": "practitioner" }
  ]
}
```

Three fields there are new and each earns its place. `cut_type_published` records
that the chart states no cut type, so no code path can quietly treat a groove
number as a surfacing number. `internal_check` records that the chart was tested
against its own formula, which is what would keep the five broken Amana carving
cells out. `stepover_published: null` sits beside a separate `stepover_guidance`
block precisely so that guidance can never be mistaken for a served band.

### B. The serving policy questions

**Q1. Does a ball surfacing mode serve a feed at all, given that no chart is
published for the cut?**

- *Serve it, named as a groove number.* Two makers agree, the materials resolve,
  the diameters resolve. The output says the chart is published for a cut one
  diameter deep and that the calculator has not compensated it. Column A above is
  what it looks like. In favour: the numbers are real, they are conservative
  against nothing and aggressive against the practitioner cluster by roughly 1.5
  to 2 times.
- *Refuse, and serve only geometry.* Report scallop height, effective diameter and
  effective surface speed from the user's own stepover and stepdown, and no feed.
  In favour: it is the only position that claims nothing unsourced. Against: the
  panel then still refuses to give a number, which is what this session was asked
  to fix.
- *Serve a feed only where the tool is a straight ball nose and refuse the tapered
  ones*, because Amana's tapered carving charts are the ones with five broken
  cells and Onsrud's tapered row is a single ladder with no material resolution.

**Q2. If a feed serves, is the chart value the programmed chip or the effective
chip?**

The evidence is on both sides and it does not resolve itself.

- *Programmed, no compensation.* This is session 4's finishing precedent, and the
  reason there was that the finisher chart already had the light engagement inside
  it. That reason does **not** apply here: Amana's ball chart is explicitly a
  1 x D full-width condition, so the light engagement is not inside it.
- *Compensate for radial thinning on the stepover.* **This is the leading option
  after Scott's 2026-09-02 steer** (see Decisions so far). Three things support
  it. The geometry is right. Leitz publishes the underlying relation
  `hm = fz·√(ae/D)` for wood, so the relation itself is not a metal import. And
  the base matches: IMCO's instruction is to feed its D/Deff multiplier from the
  **slot** value, and a 1 x D full-width ball cut is a slot value, which is exactly
  the base condition Amana states. The objection was that it produces column B,
  which the forum record rejects, and that objection is now answered by machine
  class rather than by the cut.
- *Compensate, then cap at a practitioner ceiling.* Dishonest in the repo's terms:
  a cap chosen from forum posts is a served number with no source. The machine cap
  already in `rules.json` is the honest ceiling and it is the one that should bind.
- *Serve the low edge only, uncompensated.* Column A low edge is 4,572 mm/min on
  that cut.

Two cautions stay live even under the compensating option, and both are about
stacking rather than about the first compensation.

1. **Do not also compensate axially.** The published D/Deff multiplier exists in
   two makers' documents and they sit on different bases: IMCO's input is the slot
   value by explicit instruction, and Dapra's base chart says "Higher Feed Ranges
   for: Lighter cuts", so its base already moves with cut weight. Applying both a
   radial thinning factor and an axial effective-diameter factor to the same
   number is the double-scaling that the finishing profile was rebuilt twice to
   remove. One compensation, on the radial engagement, against a base that is
   genuinely full-width.
2. **The chip floor is the check that has to hold.** A compensated feed on a light
   stepover raises the programmed number precisely because the real chip is thin.
   The floor must be checked on the physical chip, as the finishing profile already
   does, and for MDF there is now a candidate mechanism in the dust literature
   rather than the borrowed panel-routing figure. That conflict is unresolved and
   is recorded under Q7.

**Q3. Does the calculator take stepover and stepdown as inputs, and check scallop
height?**

- *Take both, report the scallop, warn nothing.* The formula is exact geometry
  published by five makers, and the panel already ships a stepover on at least one
  3D strategy. The output would say "stepover 0.5 mm leaves a 0.010 mm scallop"
  and stop there. No source is needed for a statement of geometry.
- *Take both and warn above a threshold.* No wood source publishes a threshold.
  Vectric's 8 to 12 per cent is documentation, not a chart, and would have to be
  served as practitioner guidance with the label on it.
- *Do not take them.* Then the mode cannot say anything about the surface, which is
  the only thing a 3D pass is for.

Recommendation for Scott to accept or reject: take them, report the scallop as
geometry, and show the 8 to 12 per cent band as named practitioner guidance beside
it, never as a limit.

**Q4. What does the calculator do about the tip?**

- *Nothing.* Defensible: no wood maker mentions it.
- *Report the effective diameter and the effective surface speed as derived
  display.* Costs nothing, claims nothing, and it is the number the machinist can
  act on by picking a bigger ball.
- *Warn.* The only warning that could be sourced is Fujino's measured result, and
  the honest form is uncomfortable: the tip leaves a flat area, the measured fix is
  a tool tilt, and a three-axis router cannot tilt. That is a warning the user
  cannot act on except by changing machines.
- *Floor the rpm.* Nothing supports it. No wood source states a minimum surface
  speed for a shank tool at all.

**Q5. Does roughing with a ball fall under the existing routing charts, or
refuse?**

A 3D adaptive or pocket-clearing pass with a ball is a real operation and the
panel already serves the 3D adaptive by its optimal load. The question is only
whether the *ball* charts or the *routing* charts serve it.

- *Routing charts.* Wrong tool geometry: the routing bands are for straight-walled
  spirals and compressions, and a ball's engagement at a given axial depth is not
  the same cut.
- *Ball charts at the roughing stepover.* Both PreciseBits and SpeTool publish 40
  per cent as the roughing figure, and the Amana chart's 1 x D condition is much
  closer to a roughing pass than to a finishing one. This is the option with the
  most support.
- *Refuse.* Consistent, but it refuses the one case the vendor numbers actually
  describe.

**Q6. What refuses outright, for want of a source?**

On the record above, all of these have to refuse whatever is decided elsewhere:

- Plywood, soft plywood, melamine, laminated chipboard, particleboard and HPL. No
  ball chart covers them. Amana's rows are softwood, hardwood and MDF, and the
  carving charts say only "Wood, MDF, Sign-Foam". The one Onsrud hard plywood row
  is a taper tool.
- A bull nose, meaning any corner radius strictly between zero and half the
  diameter. Nothing is published for it anywhere in this session.
- Diameters outside the published ladders, under the existing ±25 per cent
  coverage rule. That puts the floor near 1.19 mm and the ceiling near 23.8 mm on
  the Amana ladder.
- Any tapered ball nose whose tip diameter falls outside the carving charts, and
  the five Amana carving cells that fail the maker's own formula.
- Any request for a scallop-height target in wood, a surface-roughness prediction,
  or a stepover the calculator claims as correct.

**Q7. Is there a chip floor, and where does it come from?**

The existing `chip_floor_mm_per_tooth.plough_below` was borrowed from panel
routing. For MDF there is now a candidate with a published mechanism: the fine-dust
model recommending an average chip thickness above 0.05 mm. It is a dust argument,
not a burn argument, and a later study found the opposite direction in MDF, so it
should be recorded and not served until that conflict is resolved. There is still
no measured wood burnishing floor, which is the same open gap session 3 recorded.

### C. What the Fusion panel needs

The panel already ships enough to classify the tool and to compute the geometry:
`typeString`, `diameterMm`, `cornerRadiusMm`, `flutes`, `fluteLengthMm`,
`stepdownMm`, `stepoverMm`, the resolved heights and the stock to leave. A true
ball is `cornerRadiusMm == diameterMm / 2` within tolerance, and that test
separates it from a bull nose today, with no protocol change.

Four things are missing or unverified, and two of them are real work.

1. **The taper angle is not shipped.** Fusion carries it, and without it a tapered
   ball nose cannot be told from a straight one. That matters because the two
   families' published chip loads differ by up to three times at the same nominal
   diameter, and because a tapered tool's stated diameter is its tip. This is an
   additive field on the tool shape, the same shape as the tool GUID already on the
   TODO list, and the two should ship together.
2. **The stepover parameter name is confirmed for `parallel` only.** The spike read
   `stepover` inside Fusion on the 3D parallel and nowhere else, and the add-in
   reads `maximumStepover` first and then `stepover`. For `scallop`, the 3D
   `contour`, `morph`, `radial`, `spiral`, `pencil`, `flat`, `horizontal`,
   `steep_and_shallow` and `project`, nothing has been read inside Fusion. Until
   each is spiked, the panel does not know whether it is getting the right number,
   the wrong number or null. This is a spike, not a build, and it is the gate on
   serving anything for those strategies.
3. **Fusion's scallop strategy may be driven by a height rather than a step**, in
   which case the panel should read that height directly instead of deriving it.
   Unverified.
4. **The surface slope cannot be shipped and cannot be derived.** It varies
   continuously along the toolpath, so the effective diameter at the contact point
   is not one number per operation. The panel can bound it from the stepdown and
   must not present it as resolved. Any output about effective diameter has to be
   worded as the flat-surface case.

One smaller thing. `toolKind()` in `js/fusion/tool-identity.js` puts ball end
mills, bull nose end mills, lollipop, radius, form, tapered, dovetail, slot and
thread mills into one `ball` bucket. A ball surfacing mode needs the true ball
separated from the rest, and `cornerRadiusMm` plus the taper angle is enough to do
it once the taper angle ships.

## Decisions so far (Scott, 2026-09-02)

One steer, given after reading the sight-test numbers above. The rest of the
questions in section B are still open.

1. **The compensated feeds are sound.** Scott judged the column B figures fine
   from his own production surfacing experience, where he regularly ran high feed
   rates. That settles the objection this session raised against Q2's compensating
   option, which was that column B sits two to three times above the practitioner
   band. The band is machine-limited, not cut-limited, and the reports themselves
   say so. It does not by itself settle Q1, and it does not license a second,
   axial compensation on top of the first.

## Caveats

- **The Amana carving charts must not serve without a question to Amana.** Five
  ball nose cells contradict the formula printed on the same page, three of them
  in wood, worst case a factor of two. Every other number in this file passed its
  own internal check.
- **The Onsrud and Amana agreement is at two diameters only**, 1/8 and 1/4 inch,
  and it is agreement between a straight ball and a tapered taper tool. Do not
  extend it.
- **Onsrud and ShopBot disagree on the flute count of part 77-102**, three against
  two. The chip load is per tooth, so the served chip is unaffected, but a feed
  computed from it is not.
- **The one wood ball-milling study is in Japanese and was read through a
  subagent's translation, not by me.** Its parameter list and its two formulas were
  checked and are arithmetically sound. Its qualitative results are as reported.
  Anyone leaning harder on it should have the paper read by someone who reads
  Japanese.
- **Sandvik's DCAP formula could not be retrieved** in any raw or independently
  rendered form across four attempts, so the specific algebraic form is not
  quoted here. Its two prose statements, that DCAP is the maximum cutting diameter
  at a depth and that cutting speed is based on it, were confirmed.
- **Several sources refused automated fetching**, and no number in this file rests
  on a source that was not opened. Blocked: bitsbits.com (403, so its 16,000 rpm
  and 75 IPM tapered ball nose figures are excluded entirely), the Vectric forum
  (403 on every thread), talkshopbot.com (403 host-wide), routerforums.com,
  lagunatools.com, dimarcanada.com, mdpi.com, afs-journal.org. The Faba catalogue
  downloaded but is a pure image scan with no text layer and no OCR was available.
- **A 3D roughness prediction is out of reach and should stay out of reach.** The
  two measured scallop-versus-roughness studies are both in metal and they
  disagree in direction.
- **Every metal-machining source in this file is marked as such.** The effective
  diameter, the tip speed and the scallop formulas are geometry and carry over.
  The tilt recommendation, the D/Deff feed multiplier and the minimum-chip ratios
  do not carry over on their own authority.

## Sources

### Vendored this session, in `research/sources/`

- Amana Tool, 2 Flute Solid Carbide CNC Spiral Ball Nose Router Bits —
  `amana-spiral-ball-nose-v7.pdf` and `amana-spiral-ball-nose-v6.pdf`,
  https://www.amanatool.com/pub/media/productattachments/Spiral-Ball-Nose-Speed-Chart-v7.pdf
  (retrieved 2026-09-02)
- Amana Tool, ZrN-Coated and Uncoated 2D/3D Carving CNC Solid Carbide Router Bits —
  `amana-ZrN-3D-Profiling-Feed-Chip-Load-Chart-v8.pdf` (retrieved 2026-09-02)
- Amana Tool, Spektra Extreme Tool Life Coated 2D/3D Carving CNC Solid Carbide
  Router Bits — `amana-Spektra-Coated-3D-Profiling-Feed-Chip-Load-Chart-v10.pdf`
  (retrieved 2026-09-02)
- Amana Tool, ZrN-Coated 2D/3D Carving CNC High Speed Steel Router Bits —
  `amana-HSS-ZrN-3D-Profiling-Feed-Chip-Load-Chart-v3.pdf` (retrieved 2026-09-02)
- Amana Tool, Solid Carbide Spektra Spiral Plunge 2-3 Flute —
  `amana-spektra-spiral-plunge-v27.pdf` (retrieved 2026-09-02, comparison case)
- Leitz Lexicon Edition 7, chapter 5 Routing —
  `Leitz_Lexicon_Edition_7_-_05_Routing.pdf`,
  https://www.leitz.org/fileadmin/Downloads/Lexicon/EN/Leitz_Lexicon_Edition_7_-_05_Routing.pdf
  (retrieved 2026-09-02)
- Leitz Lexicon Edition 7, chapter 11 User encyclopedia —
  `Leitz_Lexicon_Edition_7_-_11_User_encyclopedia.pdf` (retrieved 2026-09-02)
- CMT, CNC Router Cutters & Chucks / Industrial Dowel Drills 2026 EN —
  `cmt-cnc-tools-2026-en.pdf` (retrieved 2026-09-02)
- SpeTool, 2D/3D Router Bit Feed & Speed Chart —
  `spetool-2d3d-tapered-chart.pdf` (retrieved 2026-09-02)
- Freud, router bit feed and speed for CNC — `freud-cnc-feed-speed.pdf`
  (retrieved 2026-09-02, negative result)
- PreciseBits, 2/3-flute Carbide Tapered Ball-Nose Carving tools (CM204, CM304) —
  `precisebits-tapered-ballnose.html`,
  https://www.precisebits.com/products/carbidebits/taperedcarve250b2f.asp
  (retrieved 2026-09-02)

### Already in the repo, read firsthand again this session

- LMT Onsrud Production Cutting Tools Catalog PCT-19 (2017) — the 52-200B ball nose
  page, the 77-100 taper tool page, the contents-by-material pages and all seven
  wood cutting-data pages
- Onsrud standalone cutting data sheets, MDF, Hard Wood, Soft Wood, Hard Plywood,
  Soft Plywood
- Vortex Tool catalogue and chip load chart — the series 2200 ballnose and tapered
  ballnose pages, and the chart's geometry-blind structure

### Manufacturer, read by the sweep and verified

- LMT Onsrud OC-06 catalogue, 2006, third-party mirror at microfence.com — the
  77-100 (DE) and (3E) rows, plus a laminated plywood row
- ShopBot Tools, Feeds and Speeds Charts, July 2016,
  https://shopbottools.com/wp-content/uploads/2024/01/FeedsandSpeeds.pdf
- IDC Woodcraft, CNC Router Bit Feeds & Speeds, rev. 2023-08, copy on the Carbide
  3D community forum
- Yonico End Mill Data Sheet, via precisionbits.com
- SpeTool carbide spiral router bit chart, and the W010xx tapered ball nose product
  page
- ToolsToday (Amana), 3D Carving With Ball Nose Router Bits, 2023-10-20
- Vortex Tool series 2200 product pages; Harvey Tool wood end mill category;
  Woodpeckers Ultra-Shear ball nose page
- CMT main catalogue 2026 EN and the series 152 tapered ball nose product page
- Sistemi Klein catalogue section 7 (2026) and the art. T173 product page
- JSO 2023 solid carbide cutter catalogue extract
- Titman, Recommended Feed Rates, titman.co.uk
- CncFraises, Fiche Conseil Fraisage CNC: le MDF
- Not reachable: Bits & Bits (403), Dimar Canada (403), Cadence/Belin (DNS and TLS
  failure), IGM (502), Stehle (TLS failure), Faba (image-only scan)

### Geometry and general machining

- NS Tool, actual cutting diameter of a ball end mill, with its table for radii 0.1
  to 10 mm
- Harvey Performance, Ball Nose Milling Strategy Guide — the effective diameter,
  the tilted form, the zero-SFM statement
- IMCO, ball nose effective diameter, the twelve-tool table, and the D/De feed
  multiplier with its slot-value instruction
- Dapra, effective cutting diameter and Feed Rate Adjustment tables
- Mitsubishi Materials, ball nose cutting speed formulas including the oblique
  contact point
- Sandvik Coromant, ball nose centre speed and the 10-15 degree tilt
  recommendation (page content read through a rendering layer only)
- Modern Machine Shop, ball nose effective diameter and stepover (trade press, not
  a maker)
- Machining Doctor, ball nose surface finish calculator and the 30 per cent of
  radius rule of thumb
- CNC Cookbook, effective diameter and Sturz milling (practitioner tier)

### Wood science

- Fujino, Sawada, Fujii and Okumura (2002), ball end mill machining of makanba and
  hinoki, Forest research Kyoto 74:159-166, in Japanese — the only ball-end-mill
  wood study found
- Piernik, Pinkowski and Krauss (2023), chip thickness against roughness and power
  in beech up-milling, BioResources
- Costes and Larricq (2002), beech at 3 to 62 m/s at constant chip thickness (full
  text blocked, 403)
- Curti, Goli and colleagues (2021), cutting force across 180 degrees of grain
  angle on five species
- Angelescu and Gurau (2026) and Angelescu, Gurau and Ispas (2025), stepover
  against roughness in oak and maple with flat end mills
- Rautio et al. (2007), MDF dust against average chip thickness (abstract only)
- Pedzik et al. (2024), chip size distribution in MDF and particleboard finish
  milling
- US Forest Service, Franz chip types in orthogonal cutting, and the 22-species
  southern hardwood study
- Wood machining review covering fifty years of research (French laboratories),
  searched and found to contain no ball-tool content
- OpenAlex, J-STAGE and BioResources index searches, recorded above as the evidence
  for the literature dry hole

### Practitioner

Vectric documentation (3D finish toolpath), Next Wave Automation, CNCCookbook
stepover guide, and community reports from the Carbide 3D, Onefinity, Avid CNC,
Inventables and Sienci forums, plus two documented stepover ladder tests. Every
number from this tier is marked `data_class: practitioner` above and none of it
sets a served band. The Vectric forum, talkshopbot.com, routerforums.com and
Laguna could not be read at all.

## What was built, 2026-09-03

The ball nose shipped as a **fifth tool type inside routing**, not a third mode
(Scott's call). A surfacing pass is a light width of cut and a light depth of
cut, which the routing engine already models, so the chip thinning, the power
model, the machine caps, the limit line and the chart ladder all carry over
unchanged. Twenty-one entries went into `chiploads.json` under a new
`ball_nose` geometry class, and `data/schema.md` carries the amendment.

The Fusion panel maps every 3D surfacing strategy. The stepover is the width of
cut and the stepdown is the depth of cut, neither is ever defaulted, and a ball
nose takes no confirmation question because Fusion states the geometry.

Five things the build learned that this research did not know.

1. **The compensation runs away below about an 8 per cent stepover.** Chip
   thinning is unbounded as the stepover falls, and the sight table above is
   computed at one stepover only. At 2 per cent on a 3.175 mm ball the
   calculator programmed 0.636 mm per tooth against a 0.064 mm stepover, a chip
   ten times the width of cut, and served 22,886 mm/min. The relation assumes
   the chip is small against the engagement, and there it is not. The
   calculator now holds the compensation at 8 per cent of the diameter and says
   so on the page. That figure is PreciseBits' published finishing stepover and
   the point the sight table was computed at, and choosing it as the floor is
   the calculator's decision, recorded as one. Every number Scott approved is
   unchanged. This is the same shape as the 3xD depth block of 2026-08-29.
2. **A single-pass 3D finish has no stepdown, and Fusion reports zero rather
   than nothing.** Multiple Depths is off by default on a finishing raster, and
   Fusion then disables `maximumStepdown` and reports 0.0. The first build read
   that as a depth of nothing and refused the headline case with a sentence
   nobody could act on. The mapping now gates on `doMultipleDepths` exactly as
   the 2D strategies do and says what to change. **The deeper question is
   open**: a single-pass finish removes whatever the roughing left, which is a
   fact about another operation, so the panel cannot know the depth. Serving
   that row needs either a depth input on the row or a stated assumption, and
   that is Scott's call.
3. **The ball chart itself carries broken cells, outside the rows that serve.**
   Three cells fail Amana's own printed formula by 62 to 74 in/min: aluminium
   3/4 in and both edges of sign foam 1/8 in. None is ingested. So the chart is
   sound where it is read and defective elsewhere, the same defect that keeps
   the 2D/3D carving charts out. The claim above that the chart passes its own
   consistency check is true of the wood rows and false of the chart.
4. **The stepover record is not as empty as the summary above reads.** Nobody
   publishes a chip load for a surfacing pass, and that is the load-bearing
   finding. But PreciseBits and IDC Woodcraft both publish a 3D stepover, and
   the code and the schema originally said no maker published one at all. The
   correct sentence is the narrower one.
5. **A tool type string can contain another one.** "tapered ball end mill"
   contains "ball end mill", so the taper words have to be tested first or a
   tapered tool is handed the straight ball chart, whose chip loads run up to
   three times higher.

### The served grid, swept 2026-09-03

163,296 cells: three materials, seven published diameters, nine stepovers from
2 to 60 per cent, four spindle speeds, one to four flutes, three profiles,
first cut on and off, every machine preset. Nothing refuses inside coverage and
nothing blocks. Median 7,303 mm/min. The machine feed cap binds on 2.5 per cent
of cells and says so. No cell reaches four warnings.

| Material | min | median | max |
|---|---|---|---|
| softwood | 395 | 8,038 | 50,000 mm/min |
| hardwood | 265 | 6,120 | 49,364 mm/min |
| MDF | 395 | 7,459 | 50,000 mm/min |

The common cut, a 12.7 mm ball at 18,000 rpm on two flutes with a 10 per cent
stepover: softwood 15,240 mm/min, MDF 13,710, hardwood 12,210. The extremes are
real corners, not defects: the maximum is a four-flute 19 mm ball at 24,000 rpm
on a machine whose own feed limit is 50,000 mm/min, and the limit line says the
machine is what sets it.

### Still open, for Scott

- **The single-pass finish row in the panel** (point 2 above). It refuses today
  and says what to change.
- **The first-cut reduction on a ball.** It applies, it is on by default, and on
  a light surfacing pass it drives the chip toward the rubbing floor, which is
  the reason the Finishing profile disables it. A ball roughing pass at a 40 per
  cent stepover is a different case, so one rule does not fit both.
- **The material ordering.** This chart puts softwood above MDF above hardwood,
  which is the reverse of every flat-tool chart in the repo. Nothing in the UI
  acknowledges it.

## Amendment 2026-09-03: the Fusion API, read firsthand

Scott corrected the model on the day of the build: 3D surfacing toolpaths carry
a stepover or a stepdown or both, depending on the type and the settings, and
Multiple Depths is not the control that decides it. He was right, and the build
had it wrong in a way no test could have caught, because every test built its
own operation shape by hand.

The correction came from Fusion itself, through the MCP connector, using
`Operations.compatibleStrategies` and `createInput(strategy).parameters`, which
expose a strategy's parameters without adding anything to an open design. Six
findings, all firsthand.

1. **`isEnabled` is the signal, not the value.** Fusion greys a parameter out
   when the switch in front of it is off. The reading then reports 0.0 while
   the expression still holds the last value the dialog showed: on the test
   document's 3D parallel with Multiple Depths off, `maximumStepdown` reads
   value 0.0, expression "1.0mm", `isEnabled` False. The add-in now ships
   `null` for any disabled parameter, which closes the whole class of stale and
   phantom reading at the reader rather than one gate at a time in the mapping.
2. **The strategy ids were wrong.** Fusion calls the 3D contour `contour3d`.
   The build carried `contour`, which Fusion never sends, so a real 3D contour
   could never have matched. Eight more real surfacing strategies were missing
   from the list.
3. **The families are three, not one.** A scallop, a pencil, a blend, a flow, a
   geodesic and a rotary finishing pass carry a stepover and no stepdown
   anywhere. A 3D contour, a ramp, inclined walls, a radial and a rotary
   contour carry a stepdown and no stepover. A parallel, spiral, morph,
   morphed spiral, flat, horizontal, steep and shallow, swarf and pocket
   clearing carry both, with the stepdown behind a switch.
4. **The width parameter is not one name.** Most use `stepover`. The horizontal
   and the pocket clearing use `maximumStepover`, the same name the 2D pocket
   uses. `project` uses `angularStepover` and `projectionStepover`.
5. **Fusion computes the scallop with the same formula this calculator does.**
   `cuspHeightStepover` is a derived value, expression
   `distToCusp(tool_cornerRadius; stepover; Math.PI/4)`. On the test document's
   9.5 mm bullnose at a 5 mm stepover it reads 1.578 mm, and the exact scallop
   formula with the stepover divided by cos(45 degrees) gives 1.578 mm. So
   Fusion reports the 45-degree-slope case and this calculator reports the flat
   one, and the geometry underneath is identical. That is the `ae/cos(alpha)`
   form the peer-reviewed source in the geometry pass printed.
6. **Fusion's own default finishing stepover is 10 per cent of the tool
   diameter.** `tool_finishingStepover` is `tool_diameter * 0.1` on every
   strategy, and `tool_stepover` is `tool_diameter * 0.3`. That sits inside the
   8 to 12 per cent practitioner band this research recorded, from a source the
   research never looked at.

### The decisions that followed (Scott, 2026-09-03)

- **A pass with no stated depth serves.** The feed comes from the chip load and
  the width of cut, and neither depends on the depth. The spindle power and
  hold-down checks are skipped and the page says so. Nothing is assumed.
- **A Z-level pass spends its stepdown as the width of cut.** Fusion states no
  stepover for one. The caveat is recorded rather than argued: it reads true on
  the steep walls those strategies are built for and understates a shallow
  surface, where the same stepdown engages far more of the tool.

### Corrected again the same day, after Scott read the first table

Three of his corrections, and what the API said to each.

1. **Fusion classifies its own strategies, and that is the scope rule.**
   `OperationStrategy` carries `is2DStrategy`, `is3DStrategy`,
   `isFinishingStrategy`, `isRotaryStrategy`, `isMillingStrategy`, a `title`
   and a `description`. Reading those replaced the hand list entirely.
2. **Geodesic is not a 3D strategy.** It reports `is3DStrategy` false. So do
   swarf, deburr, the multi-axis family and the rotary family. They are
   multi-axis work, a three-axis nesting router cannot run them, and they are
   out of scope. The first table had geodesic in the served set.
3. **Corner does state a width, four of them.** `steepRestConstantStepover`,
   `steepRestMaximumStepover`, `shallowRestConstantStepover` and
   `shallowRestMaximumStepover`, each with its own cusp height, and which pair
   is live depends on the mode. The first table said corner states no cut
   dimension at all, which was wrong because the search only looked for names
   beginning "stepover". The add-in now reads all four and ships the largest
   live one: a wider cut thins the chip less and so serves the lower feed,
   which is safe for every region of the pass.
4. **Flat and horizontal are facing work** (Scott). Fusion does report them as
   3D finishing, so the API alone would have kept them. They machine flat and
   horizontal areas, where a ball cuts on its full diameter rather than
   walking a curved surface, so the ball surfacing model does not describe
   them and they stay out. Whether they should serve as a facing cut instead
   is a separate question and is not answered here.

The lesson for the next session is the one that produced two wrong tables in a
row: a search list is a guess about names, and a guess about names is how you
miss `steepRestConstantStepover` and `contour3d`. Ask the API what exists
before filtering it.

### Corrected a third time: the flag was not the rule

Scott challenged the geodesic call, and he was right. `is3DStrategy` is
undocumented beyond "is a 3D strategy" and it is not a scope rule. Fusion's own
`OperationStrategy.description` is, and it says:

- **geodesic**: "Creates a finishing operation to machine freeform surfaces and
  undercuts. Choose between a Blend type or Scallop type toolpath." That is
  surfacing work, and the flag reports false for it.
- **flow**: "Flow is a 3-axis strategy by default, but multi-axis mode can be
  enabled." Support for simultaneous multi-axis is something most of these
  strategies carry, and it is not what puts one in or out of scope.
- **swarf**: "A multi-axis strategy for machining with the side of the tool."
  That is out, and its own words say why.

So the rule is now the description, and geodesic serves.

**Flat and Horizontal serve as facing work** (Scott, 2026-09-03). Both
"automatically detect all the flat areas of the part". On a flat area the tool
cuts on its full diameter, and the tool that runs one is a flat or a bull nose,
so they map to the ordinary routing path with the Finishing profile and the
stepover as the width of cut. A ball nose on one of them refuses in the core,
because no finisher chart covers a ball nose, and that refusal already says so.
One consequence worth knowing: Fusion computes the Horizontal stepover itself
unless Manual Stepover is on, and a greyed-out control now arrives as nothing
at all, so that case refuses and names the box to turn on rather than guessing
a width that would set the whole feed.

Three wrong tables in a row came from the same habit: filtering a list of names
I had guessed, and then trusting a flag whose meaning I had assumed. Ask the
API what exists, and read what it says a thing is for.

### Where the real classification lives, 2026-09-03

Scott pointed at `Section.checkGroup()` in the post-processor API, and it is the
right instrument. That API tests a section against a documented group set:
`STRATEGY_2D`, `STRATEGY_3D`, `STRATEGY_MULTIAXIS`, `STRATEGY_SURFACE`,
`STRATEGY_ROUGHING`, `STRATEGY_FINISHING`, `STRATEGY_MILLING`,
`STRATEGY_TURNING`, `STRATEGY_DRILLING` and more
(cam.autodesk.com/posts/reference/classSection.html).

The design-time API exposes only a subset of those bits. `OperationStrategy`
carries `is2DStrategy`, `is3DStrategy`, `isFinishingStrategy`,
`isMillingStrategy`, `isRotaryStrategy`, `isTurningStrategy`,
`isDrillingStrategy`, `isCuttingStrategy`, `isAdditiveStrategy` and
`isSupportStrategy`. It has no `checkGroup`, no multi-axis bit, no surface bit
and no roughing bit; every one of those names was probed firsthand and
`hasattr` is false. `adsk.cam` carries no `STRATEGY_*` constants either.

That explains the mistake. `is3DStrategy` is one bit of a wider grouping with
its most useful neighbours missing, so a strategy that Autodesk groups under
multi-axis reports false there even when it is a surface-finishing pass.
Geodesic is exactly that case, and its own description settles what it is.

Reaching the post groups needs a generated toolpath and a post-processor run,
which the add-in does not do and should not start doing for a snapshot. So the
served list is built from each strategy's description and its parameters, and
recorded as such. If the add-in ever posts, `checkGroup` is the definitive
answer and the list should come from it instead of from a hand-kept set.

## The scope rule and the bull nose, settled 2026-09-03

**Scope.** A 3D surfacing calculation applies when Fusion reports both
`is3DStrategy` and `isFinishingStrategy` true, plus geodesic, and the tool is
round-ended (Scott). That is nineteen strategies plus geodesic. The two that
report 3D and not finishing are Adaptive Clearing and Pocket Clearing, the 3D
roughers, and they serve through the ordinary path. `tools/fusion-strategy-flags.py`
dumps the whole table from a running Fusion, so the list can be re-derived
rather than trusted.

Flat and Horizontal are inside that set and they machine flat areas, so a flat
or bull-ended router bit running one of them is facing work and takes the
routing charts with the Finishing profile. A round-ended tool on one of them
takes the surfacing calculation like any other strategy in the set.

**The bull nose.** This research recorded bull nose tools as a named dry hole
to refuse: nothing is published for one anywhere. Scott reversed that, and the
reversal is defensible on the geometry rather than on a new source. A bull nose
cuts on its corner, so the ball chart is read at the **corner diameter**, which
gives the lower published chip load and the smaller thinning compensation. It
is a borrow with no source behind it and it is recorded as one, in the chart
notes, which render nowhere.

Two things do not come from the ball. The scallop comes off the corner radius:
a 12.7 mm bull nose with a 1.5 mm corner at a 1.27 mm stepover leaves 0.141 mm,
and treating it as a 12.7 mm ball would report 0.032 mm. That error is the one
that would have mattered, because it is the number a machinist uses to decide
whether to sand. The cutting diameter uses the toroidal form, which reduces
exactly to the ball formula at a full radius, so the ball became the special
case of one formula rather than a second path.

The served ladder, a 12.7 mm tool at a 1.27 mm stepover in MDF:

| Corner radius | Chart read at | Feed | Scallop |
|---|---|---|---|
| 6.35 mm (a ball) | 12.70 mm | 13,710 mm/min | 0.032 mm |
| 3.0 mm | 6.00 mm | 7,700 mm/min | 0.068 mm |
| 1.5 mm | 3.00 mm | 5,351 mm/min | 0.141 mm |
| 1.0 mm | 2.00 mm | 4,131 mm/min | 0.228 mm |
| 0.5 mm | 1.00 mm | refuses, below the chart's ladder | |

Smaller corner, smaller chart diameter, lower feed, coarser ridge. Every step
of that is the conservative direction.
