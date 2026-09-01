"""Turn the accepted chart reads into data/drills.json entries.

Nothing here invents a number. The band points and the correction factors come
straight from the read; everything else is a stated fact from the tool table, and
where a fact is not printed as text the entry says where the value came from.

Run it from the repository root, after tools/read-leitz-drilling.py:

    python tools/build-drill-entries.py
"""
import json
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
READ = ROOT / "research" / "leitz-drilling-read.json"
DRILLS = ROOT / "data" / "drills.json"

# Every in-scope page prints the same machine list: point-to-point machines,
# through-feed machines, CNC machining centres, hinge boring machines and multi
# spindle units. A multi-spindle unit is the drill bank, so the whole set is
# inside decision 1's scope.
MACHINES = ["point_to_point", "through_feed", "cnc_machining_centre", "hinge_boring", "multi_spindle"]

# Printed factor row -> the vocabulary key, or keys where one printed row covers
# two materials the calculator picks separately.
FACTOR_MAP = {
    "Veneered": ["chipboard_veneered_or_paper_coated"],
    "Paper coated": ["chipboard_veneered_or_paper_coated"],
    "Chipboard veneered": ["chipboard_veneered_or_paper_coated"],
    "Chipboard paper coated": ["chipboard_veneered_or_paper_coated"],
    "Chipboard, uncoated": ["chipboard_uncoated"],
    "MDF": ["mdf"],
    "MDF plastic coated": ["mdf_plastic_coated"],
    "MDF, solid wood": ["mdf", "solid_wood"],
    "Solid wood": ["solid_wood"],
    "Glulam": ["glulam"],
}
BASELINE_MAP = {"Chipboard plastic coated": "chipboard_plastic_coated"}

# One entry per subfamily. Diameters are the tool table's own D column, checked
# against the ranges recorded in research-session-5-drilling.md. band_page names
# the diagram the band was read from; several pages of one subfamily share it.
SUBFAMILIES = [
    dict(id="dowel_drill_hw_tipped", section="6.1.1", band_page=6, family="dowel_drill",
         label="Dowel drill", edge="HW_tipped", dia=(5, 10),
         note="Section 6.1.1, blind holes for dowels in furniture construction. Spur geometry with shear cut. "
              "The cutting-material badge is printed as artwork rather than text, so the tipped grade here follows "
              "the section structure: 6.1.2 and 6.1.3 are published as the tipped and solid upgrades of this tool."),
    dict(id="dowel_drill_premium_hw_tipped", section="6.1.2", band_page=11, family="dowel_drill",
         label="Dowel drill, premium", edge="HW_tipped", dia=(4, 10),
         note="Section 6.1.2. Spur geometry with high shear cut, for tear-free blind holes."),
    dict(id="dowel_drill_excellent_hw_solid", section="6.1.3", band_page=12, family="dowel_drill",
         label="Dowel drill, solid carbide", edge="HW_solid", dia=(3, 10),
         note="Section 6.1.3. Solid tungsten carbide, polished gullet. The fastest speed range in the chapter "
              "and the highest feed band with it."),
    dict(id="through_hole_drill", section="6.2.1", band_page=15, family="through_hole_drill",
         label="Through-hole drill", edge="HW_tipped", dia=(5, 12),
         note="Section 6.2.1, through holes in furniture construction. The cutting-material badge is artwork "
              "rather than text, so the tipped grade follows the section structure, as in 6.1.1."),
    dict(id="through_hole_drill_premium_hw_tipped", section="6.2.2", band_page=17, family="through_hole_drill",
         label="Through-hole drill, premium", edge="HW_tipped", dia=(4.5, 8),
         note="Section 6.2.2. V-point tip with two bevels, for exit-side quality."),
    dict(id="through_hole_drill_excellent_hw_solid", section="6.2.3", band_page=18, family="through_hole_drill",
         label="Through-hole drill, solid carbide", edge="HW_solid", dia=(3, 10),
         note="Section 6.2.3. V-point tip with two bevels, solid tungsten carbide. The tool is rated to 12,000 rpm "
              "but its diagram draws the band only to about 9,000, so the band covers part of the speed range and "
              "the feed holds at that edge above it."),
    dict(id="through_hole_drill_dp", section="6.2.4", band_page=19, family="through_hole_drill",
         label="Through-hole drill, diamond tipped", edge="DP_tipped", dia=(5, 10),
         note="Section 6.2.4. Diamond tipped for abrasive board: gypsum-bonded, cement-bonded and flame-resistant "
              "particle and fibre materials, and solid resin glulam. One cutting edge, not two."),
    dict(id="hinge_drill", section="6.3.1", band_page=22, family="hinge_drill",
         label="Hinge drill", edge="HW_tipped", dia=(15, 40),
         note="Section 6.3.1, cup boring for concealed hinges. Protruding centre point for centring in solid wood."),
    dict(id="hinge_drill_hw_solid", section="6.3.2", band_page=23, family="hinge_drill",
         label="Hinge drill, solid carbide", edge="HW_solid", dia=(15, 35),
         note="Section 6.3.2, part WB 310 0 13. Round spur geometry, solid tungsten carbide, for tear-free edges "
              "in panels with glued edgebanding."),
    dict(id="hinge_drill_hw_solid_reinforced", section="6.3.2", band_page=25, family="hinge_drill",
         label="Hinge drill, solid carbide, heavy duty", edge="HW_solid", dia=(18, 35),
         note="Section 6.3.2, part WB 320 0 13, the heavier of the two solid-carbide hinge drills. It shares its "
              "section and its factor table with WB 310 0 13 but prints its own diagram, a higher band and its own "
              "worked example, so it is a separate entry rather than a variant."),
    dict(id="hinge_drill_turnblade", section="6.3.3", band_page=28, family="turnblade_hinge_drill",
         label="Hinge drill, turnblade", edge="HW_tipped", dia=(35, 35),
         note="Section 6.3.3, part WL 920 0. Spurs and main cutting edge in turnblade form, replaceable centre "
              "point. Leitz calls it a diameter-constant tool and publishes it at 35 mm only. It is the evidence "
              "that the band width is an operating range and not a diameter spread: a single-diameter tool carries "
              "the same band as the 15-40 mm hinge drill at the same speed."),
    dict(id="hinge_drill_dp", section="6.3.4", band_page=29, family="hinge_drill",
         label="Hinge drill, diamond tipped", edge="DP_tipped", dia=(15, 35),
         note="Section 6.3.4. Diamond tipped for hard and abrasive faces such as HPL and CPL, and for fire-resistant "
              "board. Leitz recommends it on automatic machines."),
]


def main():
    reads = {r["page_pdf"]: r for r in json.load(open(READ, encoding="utf-8"))}
    entries = []
    for sf in SUBFAMILIES:
        r = reads[sf["band_page"]]
        if not r["accepted"]:
            raise SystemExit(f"{sf['id']} reads from page {sf['band_page']}, which was not accepted")

        baseline = BASELINE_MAP[r["baseline_printed"]]

        # Merge the printed rows into the vocabulary. Two printed rows can map to
        # one key (veneered and paper coated are both 0.8 on the dowel drills) and
        # one printed row can cover two picks ("MDF, solid wood"). A merge is only
        # allowed when the printed factors agree.
        factors = OrderedDict()
        factors[baseline] = 1.0
        for f in r["factors_printed"]:
            keys = FACTOR_MAP.get(f["printed"])
            if not keys:
                raise SystemExit(f"{sf['id']}: no vocabulary for printed factor row {f['printed']!r}")
            for k in keys:
                if k in factors and abs(factors[k] - f["factor"]) > 1e-9:
                    raise SystemExit(f"{sf['id']}: printed rows disagree for {k}: {factors[k]} and {f['factor']}")
                factors[k] = f["factor"]

        points = [{"rpm": p["rpm"],
                   "fn_min_mm_rev": round(p["fn_min_mm_rev"], 3),
                   "fn_max_mm_rev": round(p["fn_max_mm_rev"], 3)} for p in r["points"]]

        band = {
            "basis": "mm_per_rev",
            "baseline_material": baseline,
            "diagram_page_printed": r.get("page_printed"),
            "diagram_page_pdf": r["page_pdf"],
            "points": points,
            "worked_example": None,
            "source": "leitz-lexicon-7-drilling-chart-read",
            "data_class": "measured_chart_read",
        }
        ex = r.get("worked_example")
        if ex:
            band["worked_example"] = {"rpm": ex["rpm"], "vf_m_min": ex["vf_m_min"], "fn_mm_rev": round(ex["fn_mm_rev"], 4)}

        entry = {
            "subfamily_id": sf["id"],
            "section": sf["section"],
            "family": sf["family"],
            "label": sf["label"],
            "edge_material": sf["edge"],
            "teeth": r.get("teeth", 2),
            "serves": True,
            "diameter_min_mm": sf["dia"][0],
            "diameter_max_mm": sf["dia"][1],
            "rpm_min": r["rpm_min"],
            "rpm_max": r["rpm_max"],
            "rpm_recommended_min": r.get("rpm_recommended_min"),
            "machine_classes": MACHINES,
            "feed_band": band,
            "material_factors": [{"material": k, "factor": v} for k, v in factors.items()],
            "chip_clearing": None,
            "source": "leitz-lexicon-7-drilling",
            "data_class": "vendor",
            "notes": sf["note"],
        }
        entries.append(entry)

    doc = json.load(open(DRILLS, encoding="utf-8"))
    doc["entries"] = entries
    with open(DRILLS, "w", encoding="utf-8", newline="\n") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {len(entries)} entries")
    for e in entries:
        pts = "  ".join(f"{p['rpm']}:{p['fn_min_mm_rev']}-{p['fn_max_mm_rev']}" for p in e["feed_band"]["points"])
        print(f"  {e['subfamily_id']:42} {e['rpm_min']:>5}-{e['rpm_max']:<6} d{e['diameter_min_mm']}-{e['diameter_max_mm']}")
        print(f"     {pts}")
        print(f"     factors {[(m['material'], m['factor']) for m in e['material_factors']]}")


if __name__ == "__main__":
    main()
