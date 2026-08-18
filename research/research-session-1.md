# CNC Router Speeds & Feeds for Wood Panels and Solid Timber: A Calculator-Oriented Reference (2026)

## TL;DR
- **Build the calculator around chip load (feed per tooth), not surface speed** — the wood industry works from published chip-load-per-tooth targets by material and tool diameter (Feed = RPM × flutes × chip load). But on an industrial nesting router the achievable feed is usually capped not by the tool but by a *cascade of limiters*: spindle torque below the ~12,000 rpm constant-torque breakpoint, vacuum hold-down on small parts, corner deceleration, and (for MDF) a minimum chip-load floor to avoid rubbing. The calculator should compute an ideal feed, then report which limiter actually binds.
- **Vendors disagree by 2–3× on the same cut.** For a 12.7 mm (1/2") tool in hardwood, Onsrud publishes 0.18–0.23 mm/tooth (0.007–0.009") while Vortex publishes 0.48–0.53 mm/tooth (0.019–0.021") and Freud 0.46–0.53 mm/tooth (0.018–0.021"). Do not average these — expose the range and tag the source, because they encode different tool geometries and machine-rigidity assumptions.
- **What changed in 15 years:** near-universal micrograin/sub-micrograin carbide; DLC and nanocomposite (nACo-type) coatings now genuinely mainstream for wood/MDF (~2–3× life claims); dedicated 3+3, 2+2 and 3+1 up/down "nesting" compression geometries; higher-power HSK-interface spindles with shrink-fit HSK63F holders; and CAM-side chip-thinning plus corner feed-rate optimisation. The base chip-load numbers themselves have barely moved — they remain catalogue- and tradition-driven rather than measurement-driven.

## Key Findings

1. **The core maths is unit-sensitive.** Universal identities: Chip load = Feed ÷ (RPM × flutes); Feed = RPM × flutes × chip load; RPM = Feed ÷ (flutes × chip load). US vendors (Onsrud, Freud, Vortex, Amana) publish in inch/tooth and IPM; European vendors (Leitz, ITA Tools) in mm/tooth and m/min. Conversion pitfall: **IPM ÷ 39.37 = m/min** (per Cutter Shop's published metric conversion, "Divide inches per minute by 39.374") — not ÷ 25.4, a common error — while **1 inch/tooth = 25.4 mm/tooth**.

2. **Chip load scales strongly with diameter and material.** Published solid-carbide chip loads run from ~0.05–0.13 mm/tooth on 3 mm tools to ~0.5–0.7 mm/tooth on 12–13 mm tools in MDF. MDF/particleboard carry the highest chip loads; laminated products and hardwood-cross-grain the lowest.

3. **The industry works from chip load, not surface speed** — but surface speed still bounds RPM at large diameters. Typical RPM is 16,000–24,000 for small-to-mid tools, dropping to 12,000–18,000 for large diameters. SFM = 0.262 × D(in) × RPM; Vc(m/min) = π × D(mm) × RPM ÷ 1000.

4. **Published chiploads are per-tooth,** but the *effective flute count* in up/down and compression tools is ambiguous: sources differ on whether to count only up-cut flutes or all flutes. This must be a user-exposed choice in the calculator.

5. **The MDF minimum chip-load floor is real and economically important:** below roughly 0.08–0.10 mm/tooth the edge rubs/burnishes, glazing the resin binder, generating heat and accelerating abrasive wear.

6. **Spindle power/torque is the hard physical limiter.** Industrial router spindles run constant-torque below ~12,000 rpm and constant-power above. Cutting power is estimable from specific cutting force (kc ≈ 30–40 N/mm² for wood panels) × material removal rate.

## Details

### LAYER 1 — Base calculation

**Formulae to implement directly:**
- Chip load per tooth: `fz = Vf / (n × Z)` — Vf = feed (mm/min or IPM), n = RPM, Z = flutes.
- Feed: `Vf = n × Z × fz`
- RPM from surface speed: `n = (Vc × 1000)/(π × D)` (metric); `n = SFM × 3.82 / D(in)` (imperial).
- Surface speed: `Vc = π × D × n / 1000` (m/min); `SFM = 0.262 × D(in) × n`.
- Material removal rate: `MRR = ap × ae × Vf` (ap = axial DOC, ae = radial engagement; for a full through-slot ae = D).

**Depth-of-cut chip-load derating (consistent across Freud and Onsrud):**
- DOC = 1×D → full chip load
- DOC = 2×D → reduce chip load ≥25%
- DOC = 3×D → reduce chip load ≥50%

**Chip-load tables (solid carbide, per tooth). Original units noted per source.**

*Freud (published in inch/tooth; solid carbide; based on DOC ≤ diameter):*
| Diameter | MDF/Particleboard | Laminated PB | Hardwood | Softwood | Plywood |
|---|---|---|---|---|---|
| 3.2 mm (1/8") | 0.10–0.18 mm (.004–.007") | 0.08–0.15 (.003–.006") | 0.05–0.13 (.002–.005") | 0.10–0.15 (.004–.006") | 0.08–0.13 (.003–.005") |
| 6.35 mm (1/4") | 0.33–0.43 (.013–.017") | 0.25–0.38 (.010–.015") | 0.20–0.28 (.008–.011") | 0.25–0.30 (.010–.012") | 0.15–0.23 (.006–.009") |
| 9.5 mm (3/8") | 0.46–0.53 (.018–.021") | 0.36–0.46 (.014–.018") | 0.36–0.41 (.014–.016") | 0.41–0.48 (.016–.019") | 0.38–0.46 (.015–.018") |
| 12.7 mm (1/2") | 0.58–0.69 (.023–.027") | 0.56–0.66 (.022–.026") | 0.46–0.53 (.018–.021") | 0.51–0.58 (.020–.023") | 0.46–0.53 (.018–.021") |

*Rennie Tool (published in mm/tooth; solid carbide up OR down cut — NOT compression; recommends 18,000 rpm and DOC ≈ 1×D):*
| Diameter | Hardwood | Soft plywood | MDF/Particleboard | HPL |
|---|---|---|---|---|
| 3.175 mm (1/8") | 0.076–0.127 | 0.102–0.153 | 0.102–0.178 | 0.076–0.127 |
| 6.35 mm (1/4") | 0.229–0.279 | 0.279–0.330 | 0.330–0.406 | 0.229–0.305 |
| 9.35 mm (3/8") | 0.381–0.457 | 0.432–0.508 | 0.508–0.584 | 0.381–0.457 |
| 12.7 mm (1/2") | 0.483–0.534 | 0.533–0.584 | 0.635–0.686 | 0.584–0.635 |

*Onsrud (published inch/tooth, by tool series, DOC = 1×D). Onsrud's 48-000 straight series: 1/8" ~0.004–.006", 1/4" ~0.005–.007", 3/8" ~0.006–.008", 1/2" ~0.007–.009", 3/4" ~0.008–.010", 1" ~0.009–.011". Onsrud's hardwood chart gives 0.007–0.009" (0.18–0.23 mm) for a 1/2" bit (confirmed by practitioner "Gerry" on the CAMheads CNC Router Forum: "the Onsrud hardwood chart says ideal chipload is .007–.009\""). Onsrud varies chip load by both series and diameter and keys numbers to specific part numbers.*

*ITA Tools (European; mm/tooth targets by material): laminated chipboard 0.15–0.25; MDF 0.10–0.20; solid hardwood 0.15–0.30. Feed 15–30 m/min at 20,000–21,000 rpm for 12 mm nesting tools.*

**VENDOR DISAGREEMENT — flag prominently.** For a 1/2" tool in hardwood the spread is 0.18–0.23 mm/tooth (Onsrud) vs 0.46–0.53 mm/tooth (Freud) vs 0.48–0.53 mm/tooth (Vortex — confirmed on the CAMheads CNC Router Forum: "The vortex chart says .019-.021\" for 1/2\"D bits in hardwood") — a 2–3× disagreement. A practitioner on the same CAMheads *Chipload Charts* thread (user "Justin") observed "the average discrepancy of around 2.5x chipload was a bit high." The reason: Onsrud numbers are conservative and tied to specific tool part numbers, whereas Vortex/Freud assume rigid, high-power industrial machines — CAMheads instructor "Gary" states plainly that "Those charts are made for big iron machines with 10+ hp spindles, not a Stinger 1," and adds "I run pretty close to the Vortex numbers on our Morbidelli with a 10HP spindle." Since the target here is a 10 kW+ nesting router, the **Vortex/Freud/ITA end of the range is the appropriate default**, with Onsrud as the conservative floor. A representative MDF datapoint: for a two-flute 1/2" square bit in 1/4" MDF, "The Vortex chart specifies a chip load of .025–.027\"" (Ted Bruning, *Woodshop News*, "Factors to factoring chip load").

### LAYER 2 — Limiters and modifiers

**1. MDF abrasion, minimum chip-load floor, tool life.** MDF is abrasive because cured UF/MUF resin micro-crystals are harder than the wood fibre itself. Below ~0.08–0.10 mm/tooth the edge rubs rather than cuts, glazing the binder, generating friction heat and accelerating abrasive wear. Practitioner/vendor data indicate 50–70% shorter bit life in MDF than solid wood. Measured edge recession on K10 carbide was ~0.04 mm per 4,000 linear m of MDF versus ~0.007 mm on radiata pine at identical chip load — roughly 6× faster wear (ZC Tools pre-milling data). The general carbide rule (Ingersoll, via CNCCookbook) is that chip loads should not fall below ~0.004" (0.10 mm) or you "run the risk of rubbing which reduces tool life and causes chatter"; the minimum-chip-thickness theory holds that below ~5–20% of the cutting-edge radius no chip forms and the tool ploughs.

**2. Compression spiral geometry.** A compression bit has an up-cut zone at the tip and a down-cut zone above; the up-cut length is typically ~1× cutting diameter (as short as ~0.4× for thin-panel tools). **Critical rule: DOC must be deep enough to fully bury the up/down transition,** or one face finishes poorly. Vortex's own guidance: a tool with 0.5" up-cut length "should be programmed to cut minimum of .563\" at once pass." Selection logic: up-cut = best chip evacuation and clean bottom (rough top); down-cut = clean top but poor chip clearing, more heat, and burn risk (feed slower); compression = clean both faces on laminated/veneered/double-sided sheets. Ramp/plunge down-cut and compression tools at ~45° over 2–4 inches at ~⅓ feed. Run a compression tool too shallow (e.g., 5/8" material in a bit sized for 3/4") and the top laminate chips.

**3. Spindle power and torque.** Industrial spindles (HSD, Colombo/Elte, Perske) are **constant-torque below the breakpoint (commonly ~12,000 rpm) and constant-power above**, to 18,000–24,000 rpm. Below breakpoint, power falls proportionally with RPM while torque is flat; above it, torque falls as 1/RPM while power is flat — so halving RPM from the plate rating roughly halves available power (per igolden-cnc). Torque curves vary between nominally identical spindles: a 3.8 kW HSD-type spindle may be flat 12,000–24,000 rpm, or only reach rating at 18,000–24,000 rpm.

- Power–torque: `P(kW) = T(Nm) × n(rpm) × 2π / 60,000`.
- Cutting-power estimate: `P_cut(W) = kc[N/mm²] × MRR[cm³/min] / 60`, equivalently `P_cut(W) = kc[N/mm²] × MRR[mm³/min] / 60,000`.
- **Specific cutting force kc for wood panels** (peer-reviewed): particleboard **32.0–37.6 N/mm²** (up-milling, rising with cutting speed over 40–60 m/s — Pałubicki, B. 2021, *Materials* 14(9):2208, doi:10.3390/ma14092208); MDF **31.4 ± 2.7 N/mm²** (round-shape machining, near-isotropic — Goli, Curti, Marcon, Scippa, Campatelli, Furferi, Denaud 2018, *Materials* 11(12):2575, doi:10.3390/ma11122575). Equivalent specific cutting energy ≈ 30–40 J/cm³ (≈ 0.03–0.04 J/mm³), i.e. **≈ 0.5–0.65 W per cm³/min of MRR**. *(Note: N/mm² and J/mm³ are NOT numerically equal — 1 J/mm³ = 1000 N/mm²; use the formula above to avoid a 1000× error.)*
- **Worked example:** 12 mm tool, full-depth through-slot in 18 mm board (ap = 18, ae = 12) at 20 m/min → MRR = 18 × 12 × 20,000 = 4.32×10⁶ mm³/min. At kc ≈ 35 N/mm²: P_cut ≈ 35 × 4.32×10⁶ / 60,000 ≈ **2.5 kW at the edge.** This is why nesting demands 10 kW+ spindles and why torque, not chip load, frequently caps feed on aggressive full-depth cuts. kc rises sharply at small chip thickness (Kienzle behaviour), so estimates at fine finishing chips understate draw.

**4. Vacuum hold-down.** Maximum theoretical hold-down = pressure differential × exposed part footprint. At sea level 1 atm ≈ 14.7 psi (101 kPa), but practical flow-type tables reach ~24" Hg ≈ 12 psi (~83 kPa); practitioners "always assume 12 lbs per square inch as a maximum" and derate for altitude (Practical Machinist). On small nested parts the footprint is tiny, so **hold-down — not tool capability — becomes the feed limiter.** Leakage rises as more of the porous MDF board is cut open, further reducing available vacuum. Standard countermeasures: **onion-skinning** (leave a ~0.010"/0.25 mm floor and cut through last at reduced feed) or **tabbing**; both are widely documented (Datron, IBAG, WOODWEB) and one CNC-controller patent (US 6,830,416) automatically leaves "in the order of 10 thousandths of an inch" on sub-threshold parts and slows the final pass. The calculator should compare estimated lateral cutting force against (12 psi × part area) and recommend onion-skin/tab below the crossover part size.

**5. Effective flute count on inserted/indexable tooling.** Runout means one insert can do most of the cutting; the practical rule is to calculate on *effective* flute count (often 1 on a poorly-set insert head) rather than nominal. Patent literature defines "effective flutes" as how many flutes must pass to cut one complete profile; overlapping helical insert groupings can make an 8-grouping head a "4 effective flute" cutter, but a runout-dominated head behaves as 1. Be conservative — assume effective Z ≈ 1 for inserted tooling unless the head is precision-set with runout held to fractions of a thousandth.

**6. Onion-skin and multi-pass nesting.** Typical onion-skin ~0.2–0.5 mm (0.010–0.020"). Roughing pass: near-full axial engagement, radial engagement = full slot width, standard chip load. Finishing/skin pass: light radial engagement (leave ~0.25 mm/0.010" per side), full axial, and **feed must be increased to compensate for chip thinning** or the edge rubs.

**7. Radial chip thinning.** When radial engagement ae < D/2 the real chip is thinner than fz. Compensation formula (metalworking-derived, applied identically by wood CAM):
`Thinning factor = D / (2 × √(ae × (D − ae)))`; `Adjusted fz = target fz × factor`; `Effective chip = programmed fz / factor`.
At 50% engagement factor = 1.0; at 25% ≈ 1.15; at 10% ≈ 1.66. Applies to light-radial finish/skin passes. Wood caveat: the geometry holds, but Vortex's practical rule is to "always take minimum of chip load on radial depth of cut otherwise you are just wearing the tool out" — i.e., don't finish so light that even compensated feed can't lift the chip above the rubbing floor.

**8. Deflection / stick-out / L:D ratio.** Deflection rises steeply with stick-out (≈ cube of length) and falls with diameter (≈ 4th power), so long small tools deflect dramatically. Carbide can cut 4–10× its diameter in depth *with feed reduced* (CNCSourced), but the ratio is higher for small bits and you should always use the shortest tool that reaches. Keep DOC per pass ≤ 1×D (up to ~2×D on larger rigid tools; Vortex allows 2×D for ≥1/4" tools and only 1×D for tools under 1/4"). Larger diameter buys disproportionately more usable depth; prefer 1/2" tools for single-pass nesting.

**9. Edge quality on laminated/veneered products is mostly geometry, not feeds.** Shear/helix angle, compression geometry, chipbreaker, carbide grade and edge sharpness dominate. Decisive field evidence (WOODWEB): a shop destroyed two $80 compression bits within 10 sheets of Wilsonart HPL, then cut 30+ sheets cleanly with a cheaper straight carbide-tipped bit — the very sharp, chisel-like compression edge fractures on hard HPL/melamine resin while a more robust, blunter edge survives. Match up-cut length to panel thickness (a 0.700" up-shear chips sub-3/4" material; use ~0.400" up-shear for 1/2"). Leitz offers positive/neutral/negative shear geometries by application (Diamaster PRO/PLUS). Melamine and HPL are abrasive (aluminium-sulfate/mineral fillers) and reward chipbreaker compression tools (e.g., 3+3) and, in high volume, PCD (out of scope). Net: for laminate edge defects, change tool geometry, not feed.

**10. Other real-world limiters.**
- *Corner deceleration:* the machine must decelerate to ~zero at corners and re-accelerate, so nominal chip load collapses in corners → rubbing and burning. Minimum move length to reach feed v is **L_min = v²/a** (e.g., 50 mm/s at 500 mm/s² needs 5 mm just to reach feed). CAM corner feed-rate optimisation (reduce % over a set distance before/after corners) and adequate machine acceleration are essential — this is precisely why small parts and tight radii burn. A worked forum example: a machine needing 3" to decelerate and 3" to accelerate spends 6" of every side below programmed feed.
- *Climb vs conventional:* nesting generally climb-mills for finish; on the final skin/tab, cut direction affects part stability.
- *Moisture content & grain* (solid timber): cross-grain needs lower feed than along-grain (ITA: hardwood 8–12 m/min along grain, 5–8 across; softwoods 20–30% faster but watch resin).
- *Resin/pitch buildup* in softwoods — clean tools regularly; DLC coatings reduce adhesion.
- *Dust extraction* is a genuine cooling and re-cut-prevention mechanism (removes chips from the zone, prevents flute packing, pulls heat), not optional.
- *Axial DOC rule of thumb:* 1×D standard, up to 2×D on rigid large tools, ~1×D max for tools ≤ 1/4".

### What genuinely changed in the last 10–15 years
- **Carbide grade:** micrograin and sub-micrograin carbide are now standard (Amana, Infinity and others), giving sharper, more durable, resharpenable edges; Infinity claims optimal-helix micrograin bodies "last up to 300% longer than regular router bits."
- **Coatings:** DLC (diamond-like carbon) and nanocomposite (nACo-type) coatings are now mainstream for wood/MDF, with vendor life claims of ~2–3× (Amana DLC lines "up to 3 times longer tool life"). Caveat: practitioners note the coating wears off the actual cutting edge quickly, so real benefit is partly reduced resin buildup and slower body wear; standard TiN is considered not worthwhile for wood.
- **Geometry:** dedicated nesting compression geometries (3+3, 2+2, 3+1 up/down; ITA DTM/DTF/DTE) and chipbreaker roughers, plus 3-flute nesting bits balanced for high feed.
- **Spindles/holders:** higher-power HSK-interface spindles and shrink-fit HSK63F holders for high-feed nesting (ER32/40 collets adequate to ~18 m/min; HSK preferred above, where collet runout unevenly loads six flutes and cuts tool life 20–30%).
- **Software:** CAM chip-thinning compensation (Mastercam Dynamic, Fusion Adaptive, hyperMILL) and corner feed-rate optimisation are now standard.
- **Chip-load advice itself:** has barely shifted — still catalogue- and tradition-driven, published as starting ranges every vendor tells you to verify by test cut.

## Recommendations

1. **Architect the calculator in two layers.** Layer 1 computes an ideal feed from a chip-load lookup (material × diameter × tool type), metric-first with an imperial toggle. Layer 2 applies limiter caps and returns the *binding constraint* to the user (e.g., "feed limited by vacuum hold-down," "limited by spindle torque below 12k rpm," "below MDF rubbing floor").

2. **Store vendor data as ranges with provenance, not averages.** Tag each cell Onsrud / Freud / Vortex / Rennie / ITA and show the spread. For a 10 kW+ nesting router, default toward the Vortex/Freud/ITA upper band with Onsrud as the conservative floor; let the user pick a vendor profile.

3. **Implement these limiter modules with explicit thresholds:**
   - MDF/particleboard minimum chip-load floor 0.10 mm/tooth (warn below; treat 0.08 mm as a hard rubbing threshold).
   - DOC derating 25% / 50% at 2×D / 3×D.
   - Radial chip-thinning compensation whenever ae < D/2, using the factor formula above.
   - Spindle-power check: `P_cut(W) = kc × MRR(cm³/min)/60`, default kc = 35 N/mm² (panels), ~25 (softwood), ~40 (dense hardwood/HPL); compare against the spindle's power curve (constant torque <12k rpm, constant power above).
   - Vacuum check: hold-down = 12 psi (derate for altitude) × part footprint vs estimated cutting force; recommend onion-skin/tab below the crossover part size.
   - Corner-feed model: flag when feature length < v²/a for the machine's acceleration.
   - Deflection warning at high L:D (shortest tool that reaches; DOC ≤ 1×D on long tools).

4. **Benchmarks that change the recommendation:** laminate edge chipping → it's geometry, change the tool (shear/up-cut length/chipbreaker), not the feed. Corner burning → machine dynamics, add CAM corner optimisation and/or raise acceleration. MDF glazing/burnishing → raise feed or lower RPM to lift chip load above the floor. Parts lifting → onion-skin/tab, not "more vacuum." Torque stall at low RPM → raise RPM into the constant-power band or reduce DOC/feed.

5. **Validate with test cuts and log linear-metres-per-bit.** Every source stresses the published data is a starting point; a quality 12 mm carbide bit should deliver ~600–1,000 linear m in laminated chipboard before edge quality degrades — track this to calibrate your own tables.

## Caveats
- **The chip-load data is weak and tradition-based.** Vendor charts disagree 2–3×, rarely disclose measurement methodology, and are marketing-adjacent. Treat all tables as starting ranges, not ground truth.
- **Specific cutting-energy data for plywood is thin.** The best peer-reviewed panel values are MDF (~31 N/mm², Goli 2018) and particleboard (32–38 N/mm², Pałubicki 2021); plywood values exist mainly in figure form (Curti/Goli, HAL hal-04274766) and are semi-anisotropic. kc rises at small chip thickness (Kienzle behaviour), so fine-finish power estimates understate draw.
- **Metal-cutting kc1.1/mc tables do not apply to wood** (they are 20–100× too high). No well-fitted Kienzle constants (kc1.1, mc) specifically for wood-based panels were found in the literature; the round-shape-machining papers use an affine Fc = intercept + Ks·h model instead.
- **Flute-count convention for up/down and compression tools is genuinely ambiguous** across sources — expose it as a user choice with a documented default.
- **Inserted-tool effective flute count** guidance is largely practitioner lore; be conservative (assume ~1) absent precision runout setting.
- **PCD/diamond tooling was deliberately excluded per scope,** though in practice it dominates high-volume MDF/laminate economics (claimed ~50× carbide life in MDF) and is where the real long-run cost-per-metre advantage lies for abrasive panels.