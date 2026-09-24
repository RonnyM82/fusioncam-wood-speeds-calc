// The calculator's data, bundled into the page. Before the conversion the page
// fetched these files at load (js/data/load-browser.js, which the Fusion
// panel still uses). They stay in data/, unchanged, because the tests read
// them there; the page imports them instead of fetching them, so a load
// failure can no longer happen and its banner is gone.
//
// The integrity sweep still runs before anything renders. It is the gate that
// stops a data edit without provenance from reaching a spindle: if it finds
// anything, the page shows its danger banner and no numbers
// (docs/CONVERSION_SURVEY.md, section 8, risk 6).
import chiploads from "../data/chiploads.json";
import kc from "../data/kc.json";
import machines from "../data/machines.json";
import rules from "../data/rules.json";
import drills from "../data/drills.json";
import plastics from "../data/plastics.json";
import { validateData } from "../js/data/validate.js";

export const data = { chiploads, kc, machines, rules, drills, plastics };

export const dataErrors: string[] = validateData(data).errors;
