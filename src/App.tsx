import { Alert, Panel } from "@livetools/ui";
import { dataErrors } from "./data";

// Step 1 of docs/CONVERSION_PLAN.md: the page's title, and the data gate.
// The form, the results and the charts arrive in steps 2 to 4.
export function App() {
  return (
    <>
      <header>
        <h1>CNC Router Speeds &amp; Feeds</h1>
      </header>
      {dataErrors.length > 0 && (
        <Panel as="main" className="app-main">
          <Alert variant="danger" title="The data failed its integrity check, so the calculator shows no numbers.">
            <ul>
              {dataErrors.slice(0, 5).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Alert>
        </Panel>
      )}
    </>
  );
}
