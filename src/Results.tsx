// The results area and "What is going on in this cut": rows 19 to 23 of the
// survey's inventory (docs/CONVERSION_SURVEY.md, section 2), drawn from what
// src/result-view.js builds. Written 2026-09-24, step 3 of docs/CONVERSION_PLAN.md.
//
// Everything this file shows is decided in result-view.js, which the tests hold
// to the baseline; this file only draws it. The banners are the Alert part,
// the badges the Badge part in a Row. The output card stays the app's own
// description list with app CSS, because no part lines a column of feedrates
// up on the right with the imperial figure under each (the survey, row 21).
//
// THE CHARTS ARE STEP 4. Their places are held by three empty, hidden
// elements, each marked data-chart-slot, where the old page drew them:
//   - data-chart-slot="ladder" (routing) or "drill-feed" (drilling), the last
//     thing in #results: app.js's ladderHtml() or drillFeedChart(), each with
//     its table twin inside it;
//   - data-chart-slot="cascade" (routing), after the badges in #diagnostics:
//     the capacity cascade and, after it, its table twin;
//   - data-chart-slot="drill-speed" (drilling), the whole of #diagnostics:
//     drillSpeedChart() with its table twin.
// Step 4 replaces each slot with its chart. They are hidden so that an empty
// one takes no gap in the results area's grid.
//
// SCREEN READERS (the plan's rulings, settled for this step on 2026-09-24).
// The results area carries no live region. Each banner announces itself: the
// Alert part gives a banner mounted after load role="alert" (danger,
// warning) or role="status" (success, info), and each banner here is keyed
// by what it says, so a banner whose words change is a new banner and
// announces, where one kept mounted from load would change silently. The
// figures are carried by one short sentence, "Numbers updated.", said
// politely through announce() once the figures have changed and then held
// still for a second, so a person typing 18000 hears it once, not five
// times. Nothing is said at load, and nothing when a recalculation leaves
// the figures as they were.
import { useEffect, useRef, type ReactNode } from "react";
import { Alert, Badge, Row, announce } from "@livetools/ui";
import { figuresOf, type Banner, type ResultsView } from "./result-view.js";

/** How long the figures must stay still before "Numbers updated." is said. */
const SETTLE_MS = 1000;

type Props = {
  /** What to show, or null while a box holds the results back. */
  view: ResultsView | null;
  /** The blocking message while a box holds the results back. */
  holding: string | null;
};

export function Results({ view, holding }: Props) {
  useNumbersUpdated(figuresOf(view));

  return (
    <>
      {/* No aria-live on the section: the banners announce themselves. */}
      <section id="results" className="results">
        {holding !== null ? (
          // Scott's ruling, 2026-09-24: while any box cannot be read, the
          // results show no numbers and say which box.
          // Keyed by its words, like every banner here.
          <Alert key={holding} variant="danger">
            {holding}
          </Alert>
        ) : view?.kind === "message" ? (
          banner(view.banner, "message")
        ) : view?.kind === "figures" ? (
          <>
            {banner(view.limit, "limit")}
            <dl className="out-card">
              {view.rows.map((row) => (
                <div key={row.label} className={row.secondary ? "out-row secondary" : "out-row"}>
                  <dt className="out-label">{row.label}</dt>
                  <dd className="out-vals">
                    <span className="metric">{row.metric}</span>
                    {row.imperial !== null && <span className="imperial">{row.imperial}</span>}
                  </dd>
                  {row.note !== null && <dd className="row-note">{row.note}</dd>}
                </div>
              ))}
            </dl>
            {keyed(view.warnings).map(([key, b]) => banner(b, key))}
            {view.notes.length > 0 && (
              <div className="notes">
                <h3 className="notes-title">Notes on this calculation</h3>
                <ul>
                  {view.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}
            <div hidden data-chart-slot={view.drilling ? "drill-feed" : "ladder"} />
          </>
        ) : null}
      </section>
      <section id="diagnostics" className="diagnostics">
        {view?.kind === "figures" &&
          (view.chips === null ? (
            <div hidden data-chart-slot="drill-speed" />
          ) : (
            <>
              <h2>What is going on in this cut</h2>
              <Row>
                {view.chips.map((c, i) => (
                  <Badge key={i} variant={c.variant} icon={c.icon}>
                    {c.text}
                  </Badge>
                ))}
              </Row>
              <div hidden data-chart-slot="cascade" />
            </>
          ))}
      </section>
    </>
  );
}

/**
 * One banner, keyed by what it says (see SCREEN READERS above). A title alone
 * is the title with an empty body; a paragraph is a real <p>, as app.js wrote
 * it, so it reads as its own paragraph; a list is one item per line.
 */
function banner(b: Banner, slot: string): ReactNode {
  const body = b.list !== null ? (
    <ul>
      {b.list.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  ) : b.paragraph !== null ? (
    <p className="banner-text">{b.paragraph}</p>
  ) : null;
  const key = `${slot}|${b.variant}|${b.title ?? ""}|${b.paragraph ?? ""}|${(b.list ?? []).join("\n")}`;
  return b.title !== null ? (
    <Alert key={key} variant={b.variant} title={b.title}>
      {body}
    </Alert>
  ) : (
    <Alert key={key} variant={b.variant}>
      {body}
    </Alert>
  );
}

/** Each warning banner with a slot name that is unique even when two say the same thing. */
function keyed(list: Banner[]): [string, Banner][] {
  const seen = new Map<string, number>();
  return list.map((b) => {
    const said = `${b.variant}|${b.title ?? ""}|${b.paragraph ?? ""}|${(b.list ?? []).join("\n")}`;
    const n = seen.get(said) ?? 0;
    seen.set(said, n + 1);
    return [`warning${n}`, b];
  });
}

/**
 * Says "Numbers updated." once the figures have changed and held still for
 * SETTLE_MS. `figures` is null while none are shown; figures that come back
 * after that are new figures, whatever they read.
 */
function useNumbersUpdated(figures: string | null) {
  // undefined until the first render has been seen: the figures at load are
  // read in document order like the rest of the page, and nothing is said.
  const said = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (said.current === undefined || figures === null) {
      said.current = figures;
      return undefined;
    }
    if (figures === said.current) return undefined;
    const timer = window.setTimeout(() => {
      said.current = figures;
      announce("Numbers updated.");
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [figures]);
}
