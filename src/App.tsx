import { Alert, Panel } from "@livetools/ui";
import { CalculatorForm } from "./CalculatorForm";
import { dataErrors } from "./data";
import { blockingMessage } from "./form-state.js";
import { useCalculatorState } from "./useCalculatorState";

// The page. Step 1 of docs/CONVERSION_PLAN.md gave it the title and the data
// gate; step 2 (2026-09-24) the form, the state and the address. The results
// arrive in step 3 and the charts in step 4.
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
  const { state, dispatch, presets, blockers } = useCalculatorState();
  return (
    <>
      <CalculatorForm state={state} dispatch={dispatch} presets={presets} />
      {/* No aria-live on the section: the plan's rulings have the banners
          announce themselves, and the Alert part carries its own role. */}
      <section id="results" className="results">
        {blockers.length > 0 ? (
          // Scott's ruling, 2026-09-24: while any box cannot be read, the
          // results show no numbers and say which box.
          <Alert variant="danger">{blockingMessage(blockers)}</Alert>
        ) : (
          <p>Results follow in the next step.</p>
        )}
      </section>
    </>
  );
}
