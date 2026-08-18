# CNC Router Speeds & Feeds — Research Session 3: Solid Timber by Species, Flute Conventions, Axis Acceleration, Minimum Chip Thickness, and Odds & Ends

## TL;DR
- **Solid wood cutting force scales with density in a species-specific way** — the Curti/Goli (2021) generalised model gives Fc = (Ks·h + Int)·ap with a density-normalised Ks that lets you estimate any species between 287–1080 kg/m³; measured degree-of-grain-anisotropy runs ~1.7 (paulownia/maple) to ~3.4 (azobé), and up-milling forces sit ~9% below down-milling. Radiata pine (~515 kg/m³, Janka ~3.15 kN) sits at the low-force end, near lime/poplar.
- **The ITA flute-count ambiguity is resolved as a genuine convention disagreement, not an error**: ITA nesting ranges are DTE Z3+1, DTF Z2+2, DTM Z3+3, and ITA's own guide states the effective flute count for up/down spirals "depends on the cutting section — some engineers count only the upcut flutes, others count the total." Vortex/Onsrud use total flutes but disagree ~2.5× on the chip-load value itself.
- **Two gaps remain partly open**: real published axis-acceleration figures for the big European nesting brands (Biesse/Homag/SCM) do not exist — they publish vector velocity only (Homag Centateq N-500 = 96 m/min X/Y); a 2–4 m/s² band is defensible. And there is still **no wood-specific minimum-chip-thickness measurement** — the nearest anchors are metal/micro-milling (h_min ≈ 0.17–0.36 × edge radius).

## Key Findings

### Target 1 — Solid timber by species (highest priority)
1. **Best single quantitative source is Curti, Marcon, Denaud, Togni, Furferi & Goli (2021)**, *European Journal of Wood and Wood Products* 79:667–678, DOI 10.1007/s00107-021-01667-5 (received 20 May 2020, accepted 4 February 2021, published online 3 March 2021; HAL hal-03252886), "Generalized cutting force model for peripheral milling of wood." Open-access; full text retrieved. It provides measured Ks (specific cutting coefficient, N/mm²) and Int (intercept, N/mm) for five species across the full 0–180° grain-angle range, at three helix angles (0°, 15°, 30°), in up- and down-milling.
2. **Density is a usable but imperfect predictor.** Chuchała et al. (2014) found only a moderate correlation (r≈0.61) between specific cutting energy and basic density in Scots pine; density-alone estimates are "a rather rough and imperfect estimate." Kivimaa (1950) established that grain direction, not density, is the single most influential variable.
3. **Radiata pine (NZ/AU critical)** is a low-to-medium-density softwood that machines easily. Per The Wood Database: "Average Dried Weight: 32 lbs/ft3 (515 kg/m3); Specific Gravity (Basic, 12% MC): .41, .51; Janka Hardness: 710 lbf (3,150 N); Modulus of Rupture: 79.2 MPa; Elastic Modulus: 10.06 GPa." It is comparable in cutting behaviour to the low-Ks end of the Curti/Goli span (paulownia/lime).
4. **Moisture content lowers cutting force up to fibre saturation, then plateaus.** In orthogonal cutting of Scots pine, as MC increased the average cutting force first decreased then stabilised. In sawing hem-fir, frozen wood needed the most power; dry vs green showed no significant difference.

### Target 2 — Flute-count conventions and effective flutes
5. **ITA nesting ranges (12 mm), from the ITA-distributor technical guide:** DTE = Z3+1 (3 up + 1 down), DTF = Z2+2, DTM = Z3+3, DTS = Z2 axial, DTA = Z1+1, X99 = compression. Recommended feed 15–20, 12–18, 20–30 m/min respectively at 20,000–21,000 rpm.
6. **The reconciliation:** ITA's chip-load figures (MDF 0.10–0.20 mm/tooth) are genuinely *per tooth*, and the guide explicitly flags that for up/down spirals the "effective flute count used in the formula depends on the cutting section — some engineers count only the upcut flutes, others count the total." So the session-1 discrepancy is a convention split, not an internal contradiction.
7. **Vortex and Onsrud both use total flute count** in Chip Load = Feed ÷ (RPM × flutes), but disagree ~2.5× on the recommended chip-load value (Onsrud ~0.008" vs Vortex ~0.02" for a 2-flute hardwood cut), with Vortex charts leaning toward high-power industrial machines.
8. **Insert-head runout:** cutter-head patent literature cites through-ground finishing holding "cutting edge runout to 0.0005"" (~12.7 µm); insert seating precision is the limiting factor on effective-flute uniformity.

### Target 3 — Machine axis acceleration
9. **The big European nesting brands publish velocity, not acceleration.** Per HOMAG's own Centateq N-500 brochure the highlights list "High acceleration · Vector speed X/Y 96 m/min" and the technical-data page gives "Vector speed X/Y – Z-axis: 96 – 25 m/min"; Biesse Rover X/Y positioning ~100 m/min, Z 30 m/min; Anderson Stratos rapid 100 m/min / cut 50 m/min; SCM Morbidelli X200 cutting 50 m/min. The only explicit m/s² for a nesting-class machine is a Chinese vendor marketing claim (FORSUN, 3 m/s² at 85 m/min).
10. **Defensible acceleration bands**: hobby/desktop 0.4–1 m/s²; light-industrial router 1–3 m/s²; heavy nesting gantry 2–4 m/s²; specialty linear-motor 5–10 m/s². The Syntec controller (common on ATC nesting routers) treats 1 g (9.8 m/s²) as its jerk reference ceiling and configures acceleration as a time-to-max-feed.

### Target 4 — Minimum chip thickness for wood
11. **The gap is real.** No wood/MDF-specific minimum-uncut-chip-thickness (h_min) measurement was located. Nearest data are all metal/micro-milling: h_min ≈ 0.17 × edge radius (effective-rake method); 22–36% of edge radius (AISI 1045); 5–38% material-dependent; and a general "1/3 to 1/6 of the tool cutting edge radius."
12. **Indirect wood anchor:** In Curti/Goli, a 30° helix drives the intercept (Int) essentially to zero, so kc(h) is flat and proportional; but straight blades retain a non-zero (sometimes negative) intercept that makes the model "very hazardous to extrapolate for thinner chips" — the model is only valid above the smallest measured uncut chip thickness (~40 µm).

### Target 5 — Odds and ends
13. **Climb vs conventional in wood:** Curti/Goli measured up-milling (conventional) forces ~9% below down-milling (climb), because in the final part of the cut the chip splits by crack propagation ahead of the edge when up-milling but must be fully severed when down-milling. This is a measured wood result and runs opposite to the generic metal-machining claim that climb milling reduces force/wear.
14. **Heat/burn threshold:** Factory Mutual Record data (via Fire Engineering) states "at oven temperatures of 450°–500°F., the wood gradually chars and usually ignites after several hours"; species-specific autoignition figures are approximately pine ~500 °F (260 °C), maple ~570 °F (300 °C), oak ~600 °F (315 °C). The friction temperature at a rubbing (sub-h_min) edge reaches the scorch band easily, which is the mechanism of burn marks. MDF chars under sustained heat.
15. **Accoya/acetylated timber:** per the Accoya Wood Information Guide, "Density has increased (avg. 510 kg/m3)... Since the typical moisture content of Accoya® is below 8%, this can make the material a little more brittle" (Guide V3.9.1 gives avg. 515 kg/m³), and "As a rough guide, Accoya® wood is more comparable in machining to species like Hard Maple, American Cherry or American Walnut... Processing characteristics are equivalent to working with denser softwoods (for example Southern Yellow Pine)."

## Details

### 1. Species cutting-force data — the Curti/Goli generalised model

The model, from the peer-reviewed and fully-retrieved paper, is:

**Fc = (Ks · h + Int) · ap**   (Eq. 1)

where Fc = cutting force (N), Ks = specific cutting coefficient (N/mm²), h = mean uncut chip thickness (mm), Int = intercept (N/mm), ap = axial depth of cut / chip width (mm). For a 30° helix (spiral tools) Int → 0, giving the simplified **Fc = Ks · h · ap** (Eq. 2, matching the French standard NF E66-520-4).

**Species tested (measured, Kistler 9255A dynamometer, freshly-sharpened tungsten carbide, h ≈ 40–100 µm):**

| Species | Density (kg/m³) | MC (%) | Mean degree of grain anisotropy (Fmax/Fmin) |
|---|---|---|---|
| Paulownia (*Paulownia tomentosa*) | 287.1 | 8.7 | 1.70 |
| Lime (*Tilia europaea*) | 585.7 | 8.8 | 1.87 |
| Maple (*Acer pseudoplatanus*) | 623.9 | 9.7 | 1.68 |
| Oak (*Quercus robur*) | 737.8 | 11.2 | 1.97 |
| Azobé (*Lophira alata*) | 1079.5 | 11.5 | 3.38 |

*All measured data.* Key numeric results: cutting force is minimum parallel to grain (0°), maximum around 110° (slightly against the grain, where the rake face is parallel to grain), not at a strict 90°. R² of the linear h-vs-force fit >0.99 (0.97 for paulownia). Oak and maple have near-identical Ks despite different density. Azobé's extreme anisotropy is structural, not density-driven. Reading Ks off Fig. 6 (up-milling, 15° helix): the five species span roughly 10–20 N/mm² parallel-to-grain up to ~40–100 N/mm² near the 110° maximum, with azobé highest and paulownia lowest.

**Density-normalised model (for interpolating untested species):** Fc = (Ks,norm(GA)·h + Int,norm(GA))·ap·ρ, where Ks,norm and Int,norm are quadratic functions of grain angle GA (full coefficient tables in the paper, e.g. up-milling 15° helix: Ks15 = −4·10⁻⁶·GA² + 7·10⁻⁴·GA + 32·10⁻³, with GA in degrees). Validity range 287–1080 kg/m³; NRMSE 8–38% (best for mid-density lime/maple/oak, worst for the anisotropy extremes paulownia and azobé).

**Helix-angle effect (measured, maple, averaged over depths):** back-force-to-cutting-force ratio Fp/Fc rises steeply with helix — λ=0°: ~0–5%; λ=15°: ~13–21%; λ=30°: ~25–45%. Ks falls with increasing helix and is steadier (less dynamic excitation). This confirms the session-2 finding that a 30° spiral both flattens kc(h) and increases axial pull-out force — directly relevant to vacuum hold-down.

**Directional guidance (vendor/practitioner):** ITA publishes hardwood (oak, ash, beech) starting feeds of 8–12 m/min along grain, 5–8 m/min across grain; softwoods 20–30% faster. The physics: along-grain (Franz Type-1 chip) gives lowest force; against-grain fractures propagate below the cut plane causing tear-out; across-grain (90-90) is the most severe.

**Radiata pine specifics (NZ/AU):** average dried weight ~515 kg/m³ (32 lb/ft³), specific gravity 0.41 basic / 0.51 at 12%, Janka ~3.15 kN (710 lbf), MOR ~79.2 MPa, MOE ~10.06 GPa, basic density ~0.42 g/cm³ (varies with ring width and distance from pith — a 30-yr medium-site tree ~415 kg/m³). Comprehensive Scion/FRI tests found radiata's machining (cross-cutting, turning, planing, moulding, boring, sanding) "equal to, or superior to, many of the internationally traded softwoods," with low surface hardness the main caveat (ridging if planer blades not sharp). By density and low anisotropy it maps onto the low-Ks paulownia/lime end of the Curti/Goli scale.

**Other species anchors:** Porankiewicz, Bermudez & Tanaka (2007, *BioResources* 2(4):671–681) give multifactor cutting-force relationships for low-density yellow poplar (*Liriodendron tulipifera*) and laurel. For an independent oak cross-check, Porankiewicz et al. (2021, *BioResources* 16(1):1424–1437, "Modelling Cutting Forces using the Moduli of Elasticity in Oak Peripheral Milling," *Quercus robur*) provides a separate oak Fc model. Cristóvão et al. (2012) modelled main cutting force for two tropical species. Goli et al. (2018, *Materials* 11:2575) gives beech-LVL directional Ks (held from session 2). Koch (1964) and Kivimaa (1950/1952) remain the classical primary references for parallel/perpendicular force ratios but are books/theses requiring manual retrieval (see below).

**Moisture content (quantified):** Scots pine orthogonal cutting (Huang et al., *Holzforschung* 2018) — with increasing MC the average cutting force initially decreased then stabilised (plateau near fibre saturation), and the 90-0 direction gave lower and steadier forces than 90-90. Sawing study of hem-fir (Nasir & Cool, *Wood Sci Technol* 2020): moisture effect on cutting power is non-linear — frozen wood highest power; no significant dry-vs-green difference. General rule (Stewart, via Koch): power rises as feed, depth, and specific gravity rise and as MC falls.

### 2. Flute-count conventions

The ITA distributor guide (Smarter Production, an authorised ITA Tools distributor, Feb 2026) resolves the session-1 puzzle. It states the formula plainly — **Chip Load = Feed Rate ÷ (RPM × Number of Flutes)** — gives per-tooth targets (laminated chipboard 0.15–0.25 mm/tooth; MDF 0.10–0.20; solid hardwood 0.15–0.30), and then explicitly notes that for DTE/DTF/DTM up/down spirals "the effective flute count used in the formula depends on the cutting section — some engineers count only the upcut flutes, others count the total." So the 20 m/min-at-20,000-rpm-with-a-12 mm-tool working point (=1.0 mm/rev) reconciles only once you decide whether to divide by upcut flutes (e.g. 3) or total (e.g. 4 or 6): 1.0 mm/rev ÷ 3 = 0.33 mm/tooth (upcut-only) vs ÷ 4–6 = 0.17–0.25 mm/tooth (total). The latter lands inside ITA's own per-tooth range, so **counting total flutes is the internally-consistent reading**, but the vendor deliberately leaves it open.

**Series map (ITA 12 mm):**

| Series | Config | Best material | Feed (m/min) | RPM |
|---|---|---|---|---|
| DTE | Z3+1 | Laminated chipboard | 15–20 (to 22) | 20,000–21,000 |
| DTF | Z2+2 | MDF, laminated chipboard | 12–18 | 20,000–21,000 |
| DTM | Z3+3 | Laminated chipboard (max throughput) | 20–30 (to 40) | 20,000–21,000 |
| DTS | Z2 axial | HPL, Corian, plywood | 10–15 | 20,000–21,000 |
| DTA | Z1+1 | General purpose | up to 5 | 18,000–20,000 |
| X99 | Compression | Laminated chipboard | 20 | 20,000 |

**Vortex** (Woodworking Network / Vortex catalogue): Chip Load = Feed (ipm) ÷ (RPM × number of flutes); example 500 ipm ÷ (15,000 × 2) = 0.017". Uses total flutes. Practitioner corroboration: a 3/8" 2-flute at 18,000 rpm ≈ 600–650 ipm.
**Onsrud vs Vortex disagreement:** ~2.5× on the value — a practitioner back-calculation gives Onsrud 0.008" vs Vortex 0.02" for the same 2-flute hardwood cut. Onsrud charts are bit-specific; Vortex is a general chart skewed to industrial "big iron."
**Leitz** publishes a Z2+2 nesting spiral finishing router (alternate-twist) for coated chip/fibreboard — same total-flute convention.
**Insert/indexable runout:** Royce//Ayr markets insert and PCD cutters with integrated tool holders for "reduced runout and vibration." A cutter-head patent (US 5,820,308) cites through-ground finishing to hold "cutting edge runout to 0.0005"" (~12.7 µm) via a locator-pin third-axis reference — a useful order-of-magnitude for insert-seating TIR that firms up the effective-flutes model: a head with 10–15 µm TIR at typical per-tooth loads of 0.1–0.3 mm effectively cuts on its high tooth, so effective flutes < nominal.

### 3. Axis acceleration

Real spec-sheet m/s² figures for Biesse/Homag/SCM/Holzher/Felder wood routers do not exist publicly; they publish vector/rapid **velocity** and use qualitative "high acceleration" language.

**Velocity anchors (measured/spec):** Homag Centateq N-500 (10–13.2 kW HSK) vector X/Y/Z = 96/96/25 m/min, two synchronised digital servos in X; Biesse Rover X/Y ~100 m/min, Z 30 m/min (helical rack-and-pinion X, ballscrew Y/Z); Anderson Stratos Pro rapid 100 m/min, cut 50 m/min (dual rack-and-pinion X); SCM Morbidelli X200 cutting 50 m/min. Multicam Apex5R rapid ~70 m/min; Thermwood Max5 ~53 m/min.

**Explicit acceleration values found:** FORSUN FS1325D-N 3 m/s² at 85 m/min (marketing); Kimla BlackBox 10 m/s² (1 g) — but that is a small linear-motor engraver, not a nesting router; CMS agil 10 m/s² — glass table. Servo-sizing worked examples for router-class gantries cluster at 0.67–4.5 m/s² (1000 mm/s² for a 100 kg gantry; 4.5 m/s² conservative retrofit; 0.5-s ramp to 20 m/min ≈ 0.67 m/s²).

**Controller behaviour:** Syntec (common on ATC nesting routers) exposes cutting-acceleration-time and jerk (time-to-1 g) parameters and treats 1 g = 9.8 m/s² as the reference ceiling; effective m/s² = max feed ÷ accel time, S-curve profile. Fanuc (Anderson Selexx, optional C.R. Onsrud) derives tangential acceleration from the smaller per-axis limit. A WOODWEB technician note on the Anderson Selexx is valuable: the ballscrew short axis (rapid 60 m/min) has "much slower acceleration/deceleration" than the rack-and-pinion long axis (rapid 80 m/min) — i.e. accel is axis-specific and not simply proportional to velocity.

**Recommendation for the calculator:** replace the blind 2 m/s² default with tiered, axis-aware defaults — heavy nesting gantry X/Y 2–4 m/s² (use ~3 m/s²), Z somewhat higher; light-industrial 1–3 m/s²; hobby 0.4–1 m/s². Where only velocity is known (the norm), derive acceleration from vector velocity plus an assumed ramp rather than trusting a single published number.

### 4. Minimum chip thickness for wood

No direct wood/MDF measurement was found in the accessible literature; this is a genuine, still-open gap. The transferable metal/ceramic anchors:
- h_min ≈ 0.17 × edge radius (effective-rake averaging method, micro-milling).
- h_min = 22–36% of edge radius (AISI 1045, experimental).
- h_min = 5–38% of edge radius, material-dependent (review).
- General rule of thumb: 1/3 to 1/6 of the cutting-edge radius.
- Below h_min the process ploughs/rubs rather than cuts, specific cutting energy rises hyper-proportionally (approaching grinding-level ~70 GPa when f ≈ re/10), and surface roughness and heat spike — the direct mechanistic link to burn marks in wood.

The best wood-specific proxy is the Curti/Goli intercept behaviour: with a 30° helix Int≈0 so the affine model is valid down to the smallest measured chip (~40 µm); straight/low-helix tools carry a non-zero (occasionally negative) intercept, meaning the model must not be extrapolated below the measured range. **The edge radius of new vs worn woodworking carbide (in microns) — the denominator needed to turn these ratios into an absolute h_min for wood — was not found and should be flagged for manual retrieval.**

### 5. Odds and ends
- **Chip load vs tool life (wood):** no clean published curve. Practitioner data: a 3/8" compression bit at 18,000 rpm / 600–850 ipm gives ~60–200+ sheets of 3/4" melamine per edge. Consensus is that too-low chip load (rubbing) shortens life more than moderately-high chip load, via friction/glazing.
- **Climb vs conventional (wood):** measured — up-milling (conventional) ~9% lower cutting force than down-milling (climb) in peripheral wood milling (Curti/Goli), the opposite of the generic metal claim (which cites up to ~50% longer tool life for climb via reduced re-cutting). For panel edge quality, downcut/compression geometry protects the top laminate regardless of feed direction.
- **Heat/burn:** hardwood char/ignition band ~450–500 °F oven temperature with autoignition roughly pine ~260 °C, maple ~300 °C, oak ~315 °C; MDF chars and shows dark burn marks, is abrasive (dulls carbide fast — burning often signals a dull/loaded bit rather than pure feed error). No cutting-edge temperature measurement specific to MDF panel routing was located.
- **Accoya/acetylated timber:** density ~510–515 kg/m³; Janka increased over base radiata; MC <8% → more brittle; manufacturer rates machinability as comparable to Hard Maple / American Cherry / American Walnut (US guide) or yellow poplar (EU guide), "processing characteristics equivalent to working with denser softwoods (e.g. Southern Yellow Pine)." No independent measured cutting-force dataset for Accoya was found; Tricoya (acetylated MDF) is CNC-routable per manufacturer with no published force data.

## Recommendations
1. **Adopt the Curti/Goli density-normalised model as the solid-timber engine.** Populate the species table with the five measured anchors (paulownia 287, lime 586, maple 624, oak 738, azobé 1080 kg/m³) and interpolate others by density, but cap confidence: flag ±25–38% uncertainty and warn that azobé-like tropical/interlocked species break the density assumption. Map radiata pine to the low-Ks end (~515 kg/m³) and mark it "estimated from density, no direct radiata milling Ks located."
2. **Implement flute count as a user-selectable convention** (total flutes vs upcut-only) with total as the default, because that reading reconciles ITA's own per-tooth range with its stated working point. Surface the ~2.5× Onsrud–Vortex spread as a min–max band rather than a single number.
3. **Replace the 2 m/s² acceleration default with tiered, axis-aware bands** (heavy nesting X/Y ~3 m/s², Z higher; light-industrial 1–3; hobby 0.4–1) and, where the user knows only rapid velocity, compute acceleration from an assumed ramp. Trigger to revisit: any genuine Biesse/Homag/SCM spec-sheet m/s² surfacing.
4. **Keep minimum-chip-thickness as an explicit "data-thin" parameter.** Use h_min ≈ 0.2–0.3 × edge radius provisionally, but only once an edge-radius value for woodworking carbide is obtained (see manual-download list). Until then, key the rubbing warning off the 30°-helix intercept behaviour (valid above ~40 µm chip).
5. **Manually retrieve the flagged primary sources below** — Koch (1964) and Kivimaa (1950) would supply the classical parallel/perpendicular force ratios and moisture-vs-force curves that would let you replace the metal-derived anchors with wood-native numbers, exactly as the HAL-paper retrieval did in session 2.

## Caveats
- The Curti/Goli model is calibrated on 20 mm 2-flute tools at 3000 rpm with h = 40–100 µm; extrapolation to 12 mm 3+ flute nesting tools at 20,000 rpm is directional, not exact.
- Almost all machine-acceleration numbers are velocity-derived or marketing; the only nesting-class m/s² (FORSUN 3) is a vendor claim.
- Minimum chip thickness for wood is genuinely unmeasured in accessible literature — all quoted ratios are metal/micro-milling and transferred by analogy.
- Vendor chip-load charts disagree by 2–2.5× and should never be averaged; present as bands.
- Accoya machining guidance is manufacturer self-reported; no independent force data. Burn-threshold figures are fire-safety autoignition/char values, not measured cutting-edge temperatures in panel routing.

## Sources requiring manual download
1. **Kivimaa, E. (1950). *Cutting Force in Woodworking.* Report No. 18, The State Institute for Technical Research, Helsinki (doctoral thesis).** Open Library: https://openlibrary.org/works/OL37028539W/Cutting_force_in_wood-working — Expected to contain the foundational quantitative curves of cutting force vs density, moisture content, temperature, tool sharpness and grain direction (on Finnish birch). Matters because it is the primary source for grain-direction force multipliers and the MC-vs-force relationship still cited by every modern paper; would replace metal-analogy anchors with wood-native numbers.
2. **Koch, P. (1964). *Wood Machining Processes.* Ronald Press, New York.** Google Books record: https://books.google.com/books/about/Wood_Machining_Processes.html?id=pQZUAAAAMAAJ — Expected to contain tabulated parallel and perpendicular cutting-force data by species and moisture content, chip-type (Franz I/II/III) transitions, and the McKenzie 90-0/90-90 notation with force values. Matters as the definitive English-language reference for species force ratios.
3. **Onsrud "H — Wood Cutting Data" and full production catalogue (LMT Onsrud).** https://onsrud.com/images/H%20Wood%20Cutting%20Data2.pdf and https://onsrud.com/images/2017%20LMT%20Onsrud%20Production%20Cutting%20Tools%20Catalog2.pdf (robots-blocked to automated fetch). Expected to contain bit-specific chip-load charts for hardwoods (ash, beech, birch, cherry, mahogany, maple, oak, poplar, teak, walnut) by tool series and diameter. Matters because Onsrud is the low-side anchor in the documented 2.5× vendor spread and gives species-level chip loads not available elsewhere.
4. **"Cutting forces by Oak and Douglas fir machining," *Maderas* (SciELO Chile), S0718-221X2014000200006.** https://www.scielo.cl/scielo.php?script=sci_arttext&pid=S0718-221X2014000200006 (robots-blocked). Expected to contain measured tangential/normal cutting-force models for oak and Douglas fir across grain orientations. Matters for a second independent oak dataset to cross-check Curti/Goli.
5. **Ettelt, B. & Gittel, H.-J. — *Sägen, Fräsen, Hobeln, Bohren: Die Spanung von Holz und ihre Werkzeuge* (German).** (No stable open URL located.) Expected to contain German-standard specific-cutting-force (Schnittkraft) tables by species and operation. Matters as the continental-European counterpart to Koch, with values used in Wagenführ/Scholz analytical models.
6. **Cristóvão, L. et al. (2012). "Main cutting force models for two species of tropical wood," *Wood Material Science & Engineering* 7(3):143–149.** https://www.researchgate.net/publication/254358842 (paywalled). Expected: measured Ks-type coefficients for two tropical species. Matters for extending the density model above the oak/azobé range.
7. **Huang et al. (2018). "Cutting forces and chip formation revisited based on orthogonal cutting of Scots pine," *Holzforschung*.** https://doi.org/10.1515/hf-2018-0037 (paywalled). Expected: quantified MC-vs-force curves and 90-0 vs 90-90 force ratios for a softwood. Matters as the clearest modern moisture-vs-force dataset.
8. **Porankiewicz et al. (2021). "Modelling Cutting Forces using the Moduli of Elasticity in Oak Peripheral Milling," *BioResources* 16(1):1424–1437.** (Open on bioresources.cnr.ncsu.edu; retrieve for the full model coefficients.) Expected: an independent *Quercus robur* peripheral-milling cutting-force model. Matters as a second oak dataset to validate the Curti/Goli oak Ks.
9. **Wood-machining carbide edge-radius measurements (new vs worn), IWMS 19–25 proceedings / *Mokuzai Gakkaishi*.** (No single open URL; search IWMS proceedings.) Expected: SEM-measured cutting-edge radii (µm) for sharp and worn woodworking carbide. Matters because it is the missing denominator to convert the h_min-ratio (0.2–0.3 × re) into an absolute wood minimum chip thickness.