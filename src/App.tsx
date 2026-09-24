import { useMemo } from "react";
import { Alert, Link, Panel, Prose } from "@livetools/ui";
import { calculate } from "../js/core/calculate.js";
import { calculateDrilling } from "../js/core/drilling.js";
import { CalculatorForm } from "./CalculatorForm";
import { data, dataErrors } from "./data";
import { chartsView } from "./chart-view.js";
import { blockingMessage } from "./form-state.js";
import { Results } from "./Results";
import { resultsView } from "./result-view.js";
import { useCalculatorState } from "./useCalculatorState";

// The page. Step 1 of docs/CONVERSION_PLAN.md gave it the title and the data
// gate; step 2 (2026-09-24) the form, the state and the address; step 3 (the
// same day) the results and "What is going on in this cut". The charts arrive
// in step 4.
export function App() {
  return (
    <>
      <header>
        <h1>CNC Router Speeds &amp; Feeds</h1>
        <p className="tagline">
          For nested-base routers and solid carbide tooling. Pick your material, tool, board and machine, then
          transcribe the numbers straight into Fusion or Woodwork for Inventor. Every number traces to a published
          source.
        </p>
      </header>
      {/* Controls belong on a panel, and the panel stays light in both colour
          schemes. The header sits on the page surface. */}
      <Panel as="main" className="app-main">
        {dataErrors.length > 0 ? (
          <Alert variant="danger" title="The data failed its integrity check, so the calculator shows no numbers.">
            <ul>
              {dataErrors.slice(0, 5).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        ) : (
          <Calculator />
        )}
      </Panel>
      {/* The footer sits on the page, not the panel. Its type is the app's
          class on the Prose part (as on the old page, where the app's footer
          rule set the smaller size over the prose class's own). */}
      <footer>
        <Prose full className="page-footer">
          <p>
            Every value is a start point from a published vendor chart or a measured study, never an average across
            vendors. Prove settings with a test cut and keep a record of linear metres per bit. Wood moves the numbers:
            species, moisture, grain and machine rigidity all matter.
          </p>
          <p>
            No warranty of any kind. You are responsible for making sure the settings are safe for your machine,
            tooling and material. Sources and data live in the{" "}
            <Link href="https://github.com/RonnyM82/fusioncam-wood-speeds-calc">repository</Link>.
          </p>
        </Prose>
      </footer>
    </>
  );
}

function Calculator() {
  const { state, dispatch, presets, engineInput, blockers } = useCalculatorState();
  // app.js's recalc(): the engine for the mode on screen, on exactly the input
  // currentInput() or currentDrillInput() built. Not run at all while a box
  // holds the results back, because its numbers would be for a cut the boxes
  // are not showing.
  const holding = blockers.length > 0 ? blockingMessage(blockers) : null;
  // The drill speed chart reads the chosen machine's own speed range, as
  // drillSpeedChart() did, not the advanced boxes.
  const machine = presets[state.machineIdx].machine;
  const { view, charts } = useMemo(() => {
    if (holding !== null) return { view: null, charts: null };
    const result = state.mode === "drill" ? calculateDrilling(engineInput, data) : calculate(engineInput, data);
    return { view: resultsView(result), charts: chartsView(result, machine) };
  }, [holding, state.mode, engineInput, machine]);
  return (
    <>
      <CalculatorForm state={state} dispatch={dispatch} presets={presets} />
      <Results view={view} charts={charts} holding={holding} />
      {state.mode === "drill" ? <DrillDefects /> : <RoutDefects />}
    </>
  );
}

// The two "Something looks wrong" folds, word for word as legacy.html has
// them, each shown in its own mode. They keep the browser's own fold (the
// plan's rulings); the list inside takes the Prose part, where the old page
// wrote the design system's prose class on the list itself.
function RoutDefects() {
  return (
    <details className="defects" id="defects-rout">
      <summary>Something looks wrong on the cut?</summary>
      <Prose>
        <dl>
          <dt>Laminate edge chips.</dt>
          <dd>Change the tool geometry. Do not change the feed.</dd>
          <dt>Burn marks in corners.</dt>
          <dd>Use the CAM corner feed function, or increase the machine acceleration.</dd>
          <dt>Glazed or polished MDF edge.</dt>
          <dd>Increase the feed or reduce the rpm to raise the chip load above the minimum.</dd>
          <dt>Parts lift or move.</dt>
          <dd>Use an onion skin or tabs. More vacuum does not correct a small footprint.</dd>
          <dt>Torque stall at low rpm.</dt>
          <dd>Increase the rpm into the constant-power range, or reduce the depth and the feed.</dd>
        </dl>
      </Prose>
    </details>
  );
}

// Each of these is a published fact from the drilling data, not shop lore.
// The face reading is the 1.3 correction factor for raw chipboard against 1.0
// for the coated board, which says the face sets the pace.
function DrillDefects() {
  return (
    <details className="defects" id="defects-drill">
      <summary>Something looks wrong on the hole?</summary>
      <Prose>
        <dl>
          <dt>The melamine face tears around the rim.</dt>
          <dd>
            Slow the feed, not the speed. Coated board takes a lower feed than raw chipboard through the same drill.
          </dd>
          <dt>Dust instead of chips, and a hot drill.</dt>
          <dd>
            The feed is under the slowest published value. Raise the feed, or drop the speed so each turn takes a
            thicker bite.
          </dd>
          <dt>The hole is burnt at the bottom of a blind cup.</dt>
          <dd>Retract to clear the flutes. A packed flute stops cutting and starts rubbing.</dd>
          <dt>The router spindle will not run slowly enough.</dt>
          <dd>
            Move the holes to the drill bank and tick the drill bank box, or accept the speed the machine is rated
            for.
          </dd>
          <dt>The exit side blows out on a through hole.</dt>
          <dd>
            Back the panel, or use a through-hole drill rather than a dowel drill. The published feed does not fix
            an unsupported exit.
          </dd>
        </dl>
      </Prose>
    </details>
  );
}
