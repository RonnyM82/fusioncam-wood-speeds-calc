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

## Update discipline
New data lands as new entries with a new `source` key + retrieval date; superseded entries stay with a `superseded_by` field rather than being deleted. Chart-read values get `data_class: measured_chart_read`. Nothing enters without a source.
