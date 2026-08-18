# CNC Router Speeds & Feeds Calculator — Research Session 2: Four Weakest Data Areas

**Revision note (18 Aug 2026):** Target 1 is now closed. The Goli, Curti, Todaro & Marcon IWMS-25 paper (HAL hal-04274766) was obtained directly and its Ks/Int values read off Figures 3–6 at 200 DPI. The plywood section below replaces the earlier LVL proxy recommendation, and the small-chip-thickness conclusions in Target 2 are revised where the new data changes them. Figure-read tolerance: Ks ±2 N/mm², Int ±0.3 N/mm.

## TL;DR
- **Plywood specific cutting force is now measured, not proxied.** From the IWMS-25 figures: for a 30° helix tool (i.e. nearly every spiral nesting bit), plywood Ks ≈ 24 up-milling / 27 down-milling with negligible intercept; for a straight blade, Ks ≈ 32/36 with Int ≈ 3.9–4.0 N/mm. The tested plywood was poplar at 430 kg/m³ — 60% of MDF's density — yet its Ks sits *above* MDF in every condition. Cross-laminated construction means the edge always cuts some veneers across the grain, so **do not density-scale plywood kc**. The earlier working value of 33 N/mm² was nearly right for straight tools and slightly high for spirals; the LVL-derived directional band of 10–48 was far too wide — real plywood varies about ±25% around the disk.
- **The small-chip-thickness power rise is tool-geometry dependent.** The affine law F̄c/width = Int + Ks·h converts to kc(h) = Ks + Int/h, and the intercept is what drives the low-h blow-up. At λ = 30° the intercept collapses to ≈ 0 for every board, so **spiral tools see an almost flat kc(h)**; the roughly threefold finish-pass understatement flagged previously applies mainly to straight-flute and insert tooling (MDF straight-blade: Ks = 31.44 N/mm², Int = 3.36 N/mm → kc ≈ 113 N/mm² at h = 0.04 mm vs ≈ 35 at 1 mm).
- **Vacuum lateral grip and tool life both have usable anchors.** Measured friction coefficients for wood-based boards run μ static 0.77–0.33 / kinetic 0.68–0.25 (Kukla, Warguła & Biszczanik, Wood Research 66(5):789–805, 2021); realistic *achieved* nested vacuum is a small fraction of the ~83–101 kPa theoretical maximum; and K10 carbide edge recession is 0.04 mm per 4,000 m in MDF versus roughly 0.007 mm in radiata pine at identical chip load — 4–6× faster wear in fibreboard (ZC Tools).

## Key Findings

1. **Plywood Ks/Int extracted from the IWMS-25 paper** (conditions: 20 mm 2-flute uncoated carbide, rake 25°, 3,000 rpm, 2,000 mm/min, chip thickness 40–100 µm, full-thickness axial cut, Kistler 9255A dynamometer). Plywood is "moderately directional" — about ±25% variation with angular position, with a mirrored 0–90°/90–180° pattern from the crossed veneers — so one orientation-agnostic value per tool type is defensible and no orientation input is needed.
2. **Helix angle is a first-order effect.** λ = 30° versus λ = 0° cuts Ks by roughly 25–35% on every board *and* eliminates the intercept. The calculator needs a spiral/straight tool-type switch, not a single kc per material.
3. **Down-milling (climb) Ks runs ~10–15% above up-milling** consistently across boards — a cheap modifier worth including, since nesting finishes in climb.
4. **Cutting speed caveat on the new values:** the test ran at ~3.1 m/s cutting speed versus 40–60 m/s industrial. Pałubicki measured kc rising ~17.5% from 40 to 60 m/s in particleboard, so tag the IWMS-25 values `low-speed test, expect +15–20% at production speed`.
5. **Minimum chip thickness for wood specifically was not found** — all h_min/edge-radius data are metal-derived (h_min ≈ 0.25–0.33 × edge radius). Still a genuine gap; flag, don't hide.
6. **Vacuum hold-down is normal force only; lateral resistance = μ × achieved ΔP × sealed area.** Realistic achieved vacuum on a heavily cut flow-through sheet is far below theoretical.
7. **OSB is confirmed unmodellable** — the paper attributes the scatter (Ks anywhere from 8 to 66) to voids and localised density variation. The calculator should decline to give OSB a number.

## Details

### TARGET 1 — Plywood specific cutting force (CLOSED)

**Source:** Goli G., Curti R., Todaro L., Marcon B., "Specific cutting coefficients for the most common engineered wood products," 25th International Wood Machining Seminar, Nagoya, Oct 2023, HAL hal-04274766. Values read from Figures 3–6 of the author-deposited PDF; read tolerance Ks ±2 N/mm², Int ±0.3 N/mm.

**Materials tested:** particleboard 737.8 kg/m³ (MC 11.2%), MDF 720.0 (9.7%), OSB 585.7 (8.8%), poplar plywood 430.0 (8.7%).

**Model:** Fc(θ) = (Ks(θ)·h + Int(θ)) · ap, forces normalised per mm of engaged edge.

**Extracted values (mm/tooth-scale chips, h = 40–100 µm):**

| Material | Ks λ=0° up | Ks λ=0° down | Ks λ=30° up | Ks λ=30° down | Int λ=0° (N/mm) | Int λ=30° |
|---|---|---|---|---|---|---|
| Plywood (poplar) | 23–43, mean ≈32 | 24–43, mean ≈36 | 20–27, mean ≈24 | 24–29, mean ≈27 | ≈3.9–4.0 | ≈ −0.3 (negligible) |
| MDF | ≈29 | ≈35–36 | ≈19 | ≈21 | ≈3.0 | ≈ −0.25 |
| Particleboard | 12–23, mean ≈17 | 22–34, mean ≈27 | ≈13 | ≈17 | ≈2.9–3.1 | ≈ −0.15 |
| OSB | 8–57, scattered | 13–66, scattered | 13–26 | 18–34 | scattered | scattered |

Ks in N/mm². The MDF straight-blade values agree with Goli et al. 2018 (Materials 11(12):2575: Ks 31.44 mean), which cross-validates the figure reading.

**Implications that overturn the session's earlier proxy recommendation:**
- **Density scaling is invalid for plywood.** At 60% of MDF's density, poplar ply cuts *harder* than MDF under every condition, because some veneers are always presented cross-grain. Do not scale ply kc down for light cores; birch/formply may still warrant a modest upward adjustment for the denser face and glue content, but that is now an uncertainty band, not a rule.
- **The directional band collapses.** The beech/poplar LVL proxy suggested Ks 10–48 by orientation; measured plywood spans roughly 20–43 in total across all conditions, and only ±25% at fixed tool geometry. Drop the orientation input entirely.
- **The old working mean of 33 N/mm² survives for straight tools** (measured 32/36) **and drops to ≈ 24–27 for spirals.**

**Caveats on the closed gap:** one plywood specimen, one species (poplar), one density; values chart-read, not tabulated by the authors; cutting speed ~3.1 m/s (see Key Finding 4). Film-faced/formply and birch ply remain unmeasured — carry them as +15–20% bands on the poplar values, flagged as estimate.

### TARGET 2 — Cutting force vs chip thickness

**No fitted Kienzle constants (kc1.1, mc) for wood panels exist in any source found**, including the German literature (Ettelt & Gittel, *Sägen, Fräsen, Hobeln, Bohren*; Kivimaa), which uses indexed/empirical coefficients. The affine model solves the requirement directly.

**Governing relations (metric):**
- Force per unit edge width: **F̄c/b = Int + Ks·h** (h = mean uncut chip thickness, mm; Ks N/mm²; Int N/mm).
- Specific cutting force: **kc(h) = Ks + Int/h** (N/mm²) — the Kienzle-equivalent size effect. Ks is the asymptotic large-chip value; Int/h is the edge/ploughing rise.
- Mean chip thickness in peripheral milling: **hm ≈ fz·√(ae/D)**.

**Revised by the IWMS-25 extraction: the size effect is a straight-tool phenomenon.** Because Int ≈ 0 at λ = 30°, spiral tooling sees kc(h) ≈ Ks, roughly flat down to the 40 µm chips tested. The worked MDF example below therefore applies to straight-flute and insert tooling; for spirals, use Ks directly with no low-h correction.

**Worked kc(h) for MDF, straight blade (Ks = 31.44, Int = 3.36):**

| h (mm) | Context | kc = Ks + Int/h (N/mm²) |
|---|---|---|
| 0.041 | finish pass, ae ≈ 0.3 mm | 113 |
| 0.062 | | 85 |
| 0.091 | ae ≈ 1.5 mm | 68 |
| 0.20 | light cut | 48 |
| 0.50 | roughing | 38 |
| 1.00 | heavy | 35 |

An effective Kienzle exponent forced over the 0.04–0.1 mm window gives mc ≈ 0.7 (metal range 0.2–0.3) — present as *derived*, not published.

**Raw datapoints for curve-fitting** remain available in Goli 2018 (depths 0.3/0.7/1.1/1.5 mm → h 0.041–0.091 mm, forces per grain angle in Tables 2–4) and Pałubicki 2021 (Materials 14(9):2208: particleboard 32.0 N/mm² slow / 37.6 fast, +17.5% from 40 to 60 m/s).

**Cutting-edge radius & minimum chip thickness: still a gap.** Best available is metal-derived h_min ≈ 0.25–0.33 × edge radius (study range 0.14–0.49), hyper-proportional kc rise once fz < r_e/10. Sharp carbide edge radius is single-digit to low-tens of µm, growing with wear. Use h_min ≈ 0.3 × r_e as a placeholder flagged non-wood-validated.

### TARGET 3 — Vacuum hold-down lateral resistance

**Framework:** hold-down = ΔP × sealed area is *normal* force only. Lateral resistance to sliding = **μ × (ΔP × sealed area)**. Two numbers needed: μ and *achieved* ΔP.

**Measured friction coefficients — Kukla, Warguła & Biszczanik, Wood Research 66(5):789–805, 2021 (doi:10.37763/wr.1336-4561/66.5.789805):** static 0.77–0.33, kinetic 0.68–0.25.

| Pair | μ static | μ kinetic | Source |
|---|---|---|---|
| Steel ↔ MDF (non-laminated) | 0.77 | 0.68 | Kukla et al. 2021 (highest) |
| Steel ↔ chipboard (laminated) | 0.33 | 0.25 | Kukla et al. 2021 (lowest) |
| Board ↔ board (MDF/PB) | rises with roughness Ra | — | Tribology Transactions 57(5), 2014 |
| Timber ↔ timber / LVL (structural) | ~0.2–0.5 | — | Eurocode-5-adjacent literature (fallback) |

For a part on an MDF spoilboard, **μ ≈ 0.3–0.5 is the defensible default**; laminated/melamine faces slide more easily (μ ≈ 0.25–0.35).

**Achieved vacuum vs theoretical:**
- Theoretical max ≈ 101 kPa; practical high-vacuum pumps ~83 kPa on sealed work.
- **Nested flow-through reality is far lower.** Practitioner benchmark (Wood Industry / CAMaster): a 12″×12″ melamine part needs ~50 lbf (~222 N) to lift — an achieved net ΔP of only ~2.4 kPa, up to ~7 kPa under good conditions. Regenerative blowers reach 28–34 kPa at the plenum but bleed through kerfs and porous board; positive-displacement pumps approach full vacuum only on sealed parts.
- Vacuum falls as the sheet is cut open; cut small parts first; keep spoilboard skims shallow (~0.08 mm); ~750 kg/m³ MDF spoilboard is the norm. Biesse "dynamic vacuum" concentrates capacity near the tool.
- Pump sizing: 360 m³/h units, commonly 2–3 per nesting table; up to ~1,000 m³/h on large SCM tables.

**Grip-factor default:** lateral resistance ≈ 0.4 × ΔP_achieved × sealed area, with ΔP_achieved ≈ 3–7 kPa on a cut-open sheet. A 100 cm² part then resists only ~12–28 N — consistent with small parts slipping. **No direct measurement of lateral force to displace a vacuum-held part was found, and no manufacturer minimum-part-area table with numeric feed derating exists** — Biesse/SCM guidance is qualitative. Both remain gaps; offer a "measured pull-off" calibration field so users can enter a fish-scale test.

### TARGET 4 — Tool life benchmarks by material

**[M] measured/research · [V] vendor claim · [P] practitioner report**

| Material | Tool / grade | Life figure | Wear criterion | Class |
|---|---|---|---|---|
| MDF | K10 carbide pre-miller | edge recession 0.04 mm / 4,000 m | edge recession | [V] ZC Tools |
| Radiata pine | K10 carbide, same chip load | 0.007 mm / 4,000 m | edge recession | [V] ZC Tools |
| Laminated chipboard | quality 12 mm carbide bit | ~600–1,000 linear m | edge quality failure | [P] prior anchor |
| 18 mm raw MDF | 80T TCG C4 saw blade | ~1,800 m before resharpen | top-face fuzzing | [V] ZC Tools (saw proxy) |
| 18 mm raw MDF | 60T ATB saw blade | ~650 m (fuzz by 400 m) | fuzzing | [V] ZC Tools |
| HPL / melamine | coated vs uncoated carbide | coating +~40% life | edge quality | [P] WoodWeb |
| General wood/MDF | TiN-coated vs uncoated insert | 2–3× life | — | [V] ToolingBox |
| Abrasive composite/MDF | PCD vs carbide | 50–100× between sharpens (cost 5–10×) | edge integrity | [V] industry |

**Interpretation:** MDF/particleboard wear is abrasion-dominated — cured UF resin plus trapped mineral content wears carbide 4–6× faster than softwood at equal chip load; this multiplier is the most important term in a life model. Melamine/HPL adds an edge-chipping failure mode ahead of bulk recession. Coating gains on carbide in wood are modest (~40% practitioner, 2–3× vendor); PCD is the step change, economic above roughly 20,000 m/month in MDF. **Chip-load-vs-life and climb-vs-conventional life effects: not found quantified — gap.** Wear criteria differ per row; normalise to edge recession where possible.

### SECONDARY TARGET 5 — Machine dynamics presets

**Nesting routers ([V] spec sheets, [L] resale listings):**

| Machine | Spindle power | Rapid X/Y | Rapid Z | Toolholder / rpm | Vacuum |
|---|---|---|---|---|---|
| Biesse Rover B/S | 12–13.2 kW | 85 m/min | 30 m/min | HSK-F63, 24,000 rpm | 2× 360 m³/h typical |
| SCM Morbidelli X50 | 9.5 kW | — | — | HSK-F63, 1,500–24,000 rpm | — |
| SCM Morbidelli M100/X100 | 10 kW | — | — | HSK-F63, 1,800–24,000 rpm | — |
| SCM Morbidelli M200/X200 | 14 kW | nesting feed to 50 m/min | — | HSK-F63, 1,500–24,000 rpm | 2–3× 360 m³/h |
| SCM Morbidelli M600/800 | 12 kW routing unit | — | — | — | up to 1,000 m³/h |

**HSD spindle data (ES-series manuals):**

| Model | S1 cont. | S6 | Rated torque | Speed / cooling |
|---|---|---|---|---|
| ES915 | 3.8 kW | 4.6 kW | 3.0 Nm @12k → 1.5 Nm @24k rpm | 12,000–28,000 rpm, fan |
| ES919 | 6.6 kW | — | — | 24,000 rpm @400 Hz, fan |
| ES929 | 10 kW | — | — | 12,000–24,000 rpm, fan, HSK-F63 |
| ES988 | 11 kW | — | — | 12,000–24,000 rpm, HSK-F63 |
| ES951 | 8 kW | 9.6 kW | 6.4 / 7.6 Nm | 24,000 rpm, HSK-F63 |
| ES884 | 16 kW | 18 kW | 19 / 21.5 Nm @8,000 rpm | liquid-cooled, 8,000–18,000 rpm |
| ES888 | 16 kW | — | — | liquid-cooled, 8,000–24,000 rpm |

**Modelling point:** constant-torque below the breakpoint, constant-power above; derate available power linearly with rpm below breakpoint. **Axis acceleration (m/s²) is unpublished throughout** — only rapid velocities appear. Acceleration remains a blank requiring manufacturer data or on-machine measurement.

## Recommendations

**Stage 1 — ship now with defensible defaults.**
1. **Material kc table with a spiral/straight tool-type switch.** Spiral (λ ≈ 30°, the nesting default): plywood Ks 24 (conventional) / 27 (climb), MDF 19/21, particleboard 13/17, Int = 0, kc(h) flat. Straight/insert: plywood 32/36 with Int 4.0, MDF 29/36 with Int 3.4, particleboard 17/27 with Int 3.0, kc(h) = Ks + Int/h. Tag all IWMS-25 values `low-speed test, +15–20% at production speed`. OSB: refuse to model; advise conservative manual settings.
2. **Climb modifier:** +10–15% on Ks when down-milling.
3. **Plywood handling:** no orientation input; no density scaling; birch/film-faced carried as a +15–20% estimate band on the poplar values.
4. Vacuum: lateral grip = μ × ΔP_achieved × area, defaults μ = 0.4, ΔP_achieved = 5 kPa, warning band for parts < ~150 cm², plus a measured pull-off calibration field.
5. Tool life: wear-rate multiplier keyed to edge recession — softwood 1×, MDF/particleboard 5×, melamine/HPL adds edge-chipping mode, ply intermediate; absolute anchor 600–1,000 m per 12 mm bit in laminated chipboard.
6. Machine presets: load the Biesse/SCM/HSD tables; derate spindle power below breakpoint.

**Stage 2 — remaining gaps (with triggers).**
- ~~Obtain the plywood Ks/Int scalars~~ **Closed 18 Aug 2026** via the author-deposited HAL PDF; values chart-read. Optional refinement: email the authors (giacomo.goli@unifi.it) for tabulated regression values and any birch-ply data. Trigger: only if chart-read tolerance proves material.
- Wood-specific minimum chip thickness / edge radius measurement. Trigger: finish-pass predictions on *straight tooling* diverge >25% from shop measurement (spirals no longer depend on this).
- Manufacturer axis-acceleration figures and a direct lateral pull test on a vacuum-held part. Trigger: before advertising feed optimisation as validated.

**Benchmarks that would change the above:** shop pull-off consistently >7 kPa achieved → raise the vacuum default; measured MDF recession differing >30% from 0.04 mm/4,000 m → recalibrate the wear multiplier; production-speed cutting force data → replace the +15–20% speed uplift estimate with a measured curve.

## Caveats
- **Plywood values are chart-read from one poplar specimen at 430 kg/m³ and ~3.1 m/s cutting speed.** They are measured data, and far stronger than the LVL proxy they replace, but they are one panel, one species, one lab, read off scatter plots at ±2 N/mm². Denser plys and production speeds are extrapolations flagged as such.
- Pałubicki's specific force (32.0/37.6 N/mm²) and the Goli-group Ks are different quantities — a near-constant specific force at industrial speed versus the slope of an affine fit. Not interchangeable; the affine form is preferred for power modelling.
- No fitted Kienzle constants for wood panels exist; the derived mc ≈ 0.7 is an interpretation, and now applies to straight tooling only.
- Friction coefficients are steel-on-board and wood-on-wood tribology; no CNC-specific board-on-spoilboard coefficient under vacuum load exists. Eurocode 5 acknowledges but does not publish a design friction value.
- Tool-life figures mix measured, vendor and practitioner data with inconsistent wear criteria; vendor multiples are directional, not audited.
- Machine data are largely resale listings and spindle manuals, not current OEM engineering sheets; axis acceleration is unpublished throughout.