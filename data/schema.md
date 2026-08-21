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
| `diameter_mm` | null when the source is not diameter-resolved (ITA) |
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

## Update discipline
New data lands as new entries with a new `source` key + retrieval date; superseded entries stay with a `superseded_by` field rather than being deleted. Chart-read values get `data_class: measured_chart_read`. Nothing enters without a source.
