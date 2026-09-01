"""Turn the accepted chart reads into data/drills.json entries.

Nothing here invents a number. The band points and the correction factors come
straight from the read; everything else is a stated fact from the tool table, and
where a fact is not printed as text the entry says where the value came from.

Run it from the repository root, after tools/read-leitz-drilling.py:

    python tools/build-drill-entries.py
"""
import json
import re
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

# Printed machine names to the vocabulary, longest first so "CNC machining
# centres" is not eaten by "machining centres". Sections 6.1 to 6.3 all print one
# list; 6.4 does not, which is why these are read from each page rather than
# assumed. A multi spindle unit is a drill bank, and that is what puts several
# 6.4 tools inside the served scope.
MACHINE_MAP = [
    ("point-to-point drilling machines", "point_to_point"),
    ("through feed drilling machines", "through_feed"),
    ("cnc machining centres", "cnc_machining_centre"),
    ("stationary routers", "cnc_machining_centre"),
    ("machining centres", "cnc_machining_centre"),
    ("hinge boring machines", "hinge_boring"),
    ("multi spindle units", "multi_spindle"),
    ("column drilling machines", "column_drill"),
    ("special purpose drilling machines", "special_purpose_drill"),
    ("special cutting machines", "special_purpose_drill"),
    ("portable drills", "portable_drill"),
    ("drilling machines", "drilling_machine"),
]


def machines_from(printed):
    text = (printed or "").lower()
    found, seen = [], set()
    for phrase, key in MACHINE_MAP:
        if phrase in text and key not in seen:
            seen.add(key)
            found.append(key)
            text = text.replace(phrase, " ")
    return found

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
    "Laminated veneer lumber": ["laminated_veneer_lumber"],
}
BASELINE_MAP = {
    "Chipboard plastic coated": "chipboard_plastic_coated",
    "Solid wood": "solid_wood",
    "Softwood": "softwood",
}
# Some pages print a depth rule where the material factors would sit. It is not a
# material correction and must not be read as one: it belongs with the chip
# clearing rules, where the calculator applies it to the whole cycle past the
# depth it names.
DEPTH_FACTOR = re.compile(r"^Drilling depth\s*>\s*(\d+)\s*x\s*D$", re.I)

# One entry per subfamily. Diameters are the tool table's own D column, checked
# against the ranges recorded in research-session-5-drilling.md. band_page names
# the diagram the band was read from; several pages of one subfamily share it.
#
# `pages` lists every diagram page of the subfamily, because a section's tables
# run over several pages and the diameter range is their union. `parts` names the
# tool's own part numbers, so a countersink's table on the same page cannot widen
# the drill's range. `materials` is the tool's printed workpiece list, mapped to
# the calculator's own material ids: a diamond-tipped drill for abrasive board is
# not rated for solid timber, and without this the calculator would serve one.
PANELS = ["mdf", "laminated_pb", "laminated_chipboard", "particleboard", "plywood", "softwood_ply"]
WOOD = ["hardwood", "softwood"]

SUBFAMILIES = [
    dict(id="dowel_drill_hw_tipped", section="6.1.1", band_page=6, pages=[6, 7, 9, 10],
         parts=["WB 120 0 23", "WB 120 0 24", "WB 120 0 10", "WB 120 0 25", "WB 120 0 26", "WB 120 0 17", "WB 120 0 18"],
         family="dowel_drill", label="Dowel drill", edge="HW_tipped", materials=PANELS + WOOD,
         note="Section 6.1.1, blind holes for dowels in furniture construction. Spur geometry with shear cut. The "
              "four shank variants of this tool (8 mm, 10 mm, threaded, and the version without a heel) print one "
              "shared feed diagram, one speed range and one factor table, so they are one entry. The diameter range "
              "is the union of their own tables. Leitz does not state the cutting material for this tool in text; "
              "the grade recorded here follows the section structure, where 6.1.2 and 6.1.3 are published as the "
              "tipped and solid upgrades of it."),
    dict(id="dowel_drill_premium_hw_tipped", section="6.1.2", band_page=11, pages=[11],
         parts=["WB 120 0 29", "WB 120 0 30"],
         family="dowel_drill", label="Dowel drill, premium", edge="HW_tipped", materials=PANELS + WOOD,
         note="Section 6.1.2. Spur geometry with high shear cut, for tear-free blind holes."),
    dict(id="dowel_drill_excellent_hw_solid", section="6.1.3", band_page=12, pages=[12],
         parts=["WB 120 0 32", "WB 120 0 33"],
         family="dowel_drill", label="Dowel drill, solid carbide", edge="HW_solid", materials=PANELS + WOOD,
         note="Section 6.1.3. Solid tungsten carbide, polished gullet. The fastest speed range in the chapter "
              "and the highest feed band with it."),
    dict(id="through_hole_drill", section="6.2.1", band_page=15, pages=[15, 16],
         parts=["WB 101 0 02", "WB 101 0 03", "WB 101 0 04", "WB 101 0 05", "WB 101 0 06", "WB 101 0 07"],
         family="through_hole_drill", label="Through-hole drill", edge="HW_tipped", materials=PANELS + WOOD,
         note="Section 6.2.1, through holes in furniture construction. Two shank variants, one shared diagram. "
              "Leitz does not state the cutting material in text; the grade follows the section structure, as in 6.1.1."),
    dict(id="through_hole_drill_premium_hw_tipped", section="6.2.2", band_page=17, pages=[17],
         parts=["WB 101 0 10"],
         family="through_hole_drill", label="Through-hole drill, premium", edge="HW_tipped", materials=PANELS + WOOD,
         note="Section 6.2.2. V-point tip with two bevels, for exit-side quality."),
    dict(id="through_hole_drill_excellent_hw_solid", section="6.2.3", band_page=18, pages=[18],
         parts=["WB 101 0 02", "WB 101 0 04", "WB 101 0 07"],
         family="through_hole_drill", label="Through-hole drill, solid carbide", edge="HW_solid", materials=PANELS + WOOD,
         note="Section 6.2.3. V-point tip with two bevels, solid tungsten carbide. The tool is rated to 12,000 rpm "
              "but its diagram draws the band only to about 9,000, so the band covers part of the speed range and "
              "the feed holds at that edge above it. Its diagram is the same artwork Leitz prints for 6.2.2, which "
              "is why the two bands match."),
    dict(id="through_hole_drill_dp", section="6.2.4", band_page=19, pages=[19],
         parts=["WB 100 0 50"],
         family="through_hole_drill", label="Through-hole drill, diamond tipped", edge="DP_tipped",
         materials=["mdf", "particleboard", "laminated_pb", "laminated_chipboard", "plywood", "softwood_ply", "hpl"],
         note="Section 6.2.4. Diamond tipped, and rated by Leitz for abrasive board: gypsum-bonded, cement-bonded "
              "and flame-resistant particle and fibre materials, solid resin glulam and fibre-reinforced plastics. "
              "Its printed workpiece list carries no solid timber, so solid timber is outside its scope. One "
              "cutting edge, not two."),
    dict(id="hinge_drill", section="6.3.1", band_page=22, pages=[22],
         parts=["WB 310 0 04"],
         family="hinge_drill", label="Hinge drill", edge="HW_tipped", materials=PANELS + WOOD,
         note="Section 6.3.1, cup boring for concealed hinges. Protruding centre point for centring in solid wood."),
    dict(id="hinge_drill_hw_solid", section="6.3.2", band_page=23, pages=[23, 24],
         parts=["WB 310 0 13"],
         family="hinge_drill", label="Hinge drill, solid carbide", edge="HW_solid", materials=PANELS + WOOD,
         note="Section 6.3.2, part WB 310 0 13. Round spur geometry, solid tungsten carbide, for tear-free edges "
              "in panels with glued edgebanding. Section 6.3.2 prints further tables for this part on pages that "
              "carry no diagram, so the diameter range here is the union of the two pages that do."),
    dict(id="hinge_drill_hw_solid_three_edge", section="6.3.2", band_page=25, pages=[25],
         parts=["WB 320 0 13"],
         family="hinge_drill", label="Hinge drill, solid carbide, three edge", edge="HW_solid", materials=PANELS + WOOD,
         note="Section 6.3.2, part WB 320 0 13. Three cutting edges and three spurs where the other solid-carbide "
              "hinge drill has two, which is Leitz's own stated reason for its higher feed band: the page says it "
              "is designed for higher feed speed in comparison to boring bits with Z 2 / V 2. It shares its factor "
              "table with WB 310 0 13 but prints its own diagram and its own worked example, so it is a separate "
              "entry."),
    dict(id="hinge_drill_turnblade", section="6.3.3", band_page=28, pages=[28],
         parts=["WL 920 0"],
         family="turnblade_hinge_drill", label="Hinge drill, turnblade", edge="HW_tipped", materials=PANELS + WOOD,
         note="Section 6.3.3, part WL 920 0. Spurs and main cutting edge in turnblade form, replaceable centre "
              "point. Leitz calls it a diameter-constant tool and publishes it at 35 mm only. It is the evidence "
              "that the band width is an operating range and not a diameter spread: a single-diameter tool carries "
              "the same band as the 15-40 mm hinge drill at the same speed."),
    dict(id="hinge_drill_dp", section="6.3.4", band_page=29, pages=[29],
         parts=["WB 310 0 50"],
         family="hinge_drill", label="Hinge drill, diamond tipped", edge="DP_tipped",
         materials=["mdf", "particleboard", "laminated_pb", "laminated_chipboard", "plywood", "softwood_ply", "hpl"],
         note="Section 6.3.4. Diamond tipped for hard and abrasive faces such as HPL and CPL, and for fire-resistant "
              "board. Its printed workpiece list carries no solid timber, so solid timber is outside its scope. "
              "Leitz recommends it on automatic machines."),

    # Chapter 6.4, the tools an earlier pass wrongly ruled out. Every one of them
    # lists multi spindle units, which are drill banks, so they sit inside the
    # served scope. These are also the only served tools that publish a
    # chip-clearing rule, so they are what turns the peck output on.
    dict(id="twist_drill_hw_solid", section="6.4.1", band_page=31, pages=[31],
         parts=["WB 101 0 04"],
         family="twist_drill", label="Twist drill, solid carbide", edge="HW_solid", materials=PANELS + WOOD,
         note="Section 6.4.1, blind and through holes for general work. Solid tungsten carbide with a V point. This "
              "is the tool that covers the small sizes: its own table publishes 2, 2.5, 3, 3.2, 3.5, 4 and 5 mm, and "
              "nothing else in the served set goes under 3 mm."),
    dict(id="twist_drill_hw_double_heel", section="6.4.1", band_page=36, pages=[36],
         parts=["WB 120 0 25", "WB 120 0 27"],
         family="twist_drill", label="Twist drill, double heel", edge="HW_tipped", materials=PANELS + WOOD,
         clearing=[dict(kind="clearing_stroke_recommended_past", ratio_of_d=4)],
         note="Section 6.4.1. Tungsten carbide tipped, double heel for guidance on the way in and on the return "
              "stroke. Its page carries the first published chip-clearing rule in the served set: past four times "
              "the drill diameter, retract to clear the flutes."),
    # Section 6.4.2, the Levin drills, is deliberately not here (Scott,
    # 2026-09-02). They passed their read and they qualify on their machine list,
    # because it names multi spindle units, but their stated job is joint holes
    # in timber frame construction and their machine list carries no CNC
    # machining centre at all. This calculator is for cabinet making, and a
    # structural-timber drill does not belong in the picker just because a rule
    # let it through. Their read stays in research/leitz-drilling-read.json.
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
        clearing = list(sf.get("clearing", []))
        for f in r["factors_printed"]:
            depth = DEPTH_FACTOR.match(f["printed"])
            if depth:
                clearing.append(dict(kind="feed_factor_past_ratio",
                                     ratio_of_d=int(depth.group(1)), factor=f["factor"]))
                continue
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

        # The diameter range is the union of the tool's own tables across every
        # page of its section. Set by hand it was wrong once, understating the
        # standard dowel drill at 5-10 mm when its own tables publish 4-16, which
        # refused a size the source publishes.
        dia = set()
        for pno in sf["pages"]:
            for part, vals in reads[pno].get("diameters_by_part", {}).items():
                if part in sf["parts"]:
                    dia.update(vals)
        if not dia:
            raise SystemExit(f"{sf['id']}: no diameters found for parts {sf['parts']}")

        teeth = r.get("teeth")
        if not teeth:
            raise SystemExit(f"{sf['id']}: no cutting-edge count read from a table heading")

        entry = {
            "subfamily_id": sf["id"],
            "section": sf["section"],
            "family": sf["family"],
            "label": sf["label"],
            "edge_material": sf["edge"],
            "teeth": teeth,
            "teeth_source": r.get("teeth_from"),
            "serves": True,
            "materials": sf["materials"],
            "materials_printed": r.get("tool_materials_printed"),
            "diameter_min_mm": min(dia),
            "diameter_max_mm": max(dia),
            "diameters_published_mm": sorted(dia),
            "rpm_min": r["rpm_min"],
            "rpm_max": r["rpm_max"],
            "rpm_recommended_min": r.get("rpm_recommended_min"),
            "machine_classes": machines_from(r.get("machine_printed")) or MACHINES,
            "machines_printed": r.get("machine_printed"),
            "feed_band": band,
            "material_factors": [{"material": k, "factor": v} for k, v in factors.items()],
            "chip_clearing": None if not clearing else {
                "rules": clearing,
                "source": "leitz-lexicon-7-drilling",
                "data_class": "vendor",
            },
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
