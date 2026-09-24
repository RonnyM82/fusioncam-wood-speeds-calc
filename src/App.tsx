import { useMemo } from "react";
import { Alert, Panel } from "@livetools/ui";
import { calculate } from "../js/core/calculate.js";
import { calculateDrilling } from "../js/core/drilling.js";
import { CalculatorForm } from "./CalculatorForm";
import { data, dataErrors } from "./data";
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
  const view = useMemo(() => {
    if (holding !== null) return null;
    const result = state.mode === "drill" ? calculateDrilling(engineInput, data) : calculate(engineInput, data);
    return resultsView(result);
  }, [holding, state.mode, engineInput]);
  return (
    <>
      <CalculatorForm state={state} dispatch={dispatch} presets={presets} />
      <Results view={view} holding={holding} />
    </>
  );
}
