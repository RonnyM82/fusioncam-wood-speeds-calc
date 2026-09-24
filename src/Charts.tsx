// The page's charts and the table under each: rows 24 to 27 of the survey's
// inventory (docs/CONVERSION_SURVEY.md, section 2), drawn from what
// src/chart-view.js builds. Written 2026-09-24, step 4 of
// docs/CONVERSION_PLAN.md, under Scott's chart ruling of the same day: the
// calculator draws its charts itself, with its own class names, and writes no
// design-system class.
//
// PLACEMENT. The old page placed each bar and marker with an inline `left`,
// which the lint refuses; the one inline geometry it allows is inline-size.
// So each track holds two lanes laid over each other, and in each lane an
// empty spacer sized to the start percentage pushes what follows it along:
// the bar (sized to its width percentage) in one lane, the dotted marker in
// the other. The percentages are the strings chart-view.js computed with the
// old arithmetic. Each spacer, bar and fill also carries the same string as
// data-at, because the browser writes an inline-size back out rounded to six
// significant figures, and tools/baseline.mjs compares the unrounded number
// the code computed (and checks the painted position matches it).
//
// THE HIGHLIGHT is the app's own class, chart-emphasis, painted in app.css
// from --wood-chart-mark-emphasis (src/app-tokens.css), which reads the
// design system's chart emphasis colour; the Windows high contrast rule the
// system writes on its own class is re-declared on this one. Exactly one row
// per chart carries it: the serving chart, the picked setting, the drill's
// own range, or the binding cap.
//
// THE KEYBOARD. Each chart is one Tab stop and the arrow keys (and Home and
// End) move between its rows, a roving tabindex, as app.js did. Each row is
// named by the sentence the old floating tip showed, which is dropped (the
// plan's rulings): everything it said is the row's name and the table's
// third column.
//
// THE TABLES are the Table part, plain (not sortable), zebra, named by the
// caption the old page gave them, inside the browser's own fold.
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Table } from "@livetools/ui";
import type { Cascade, Ladder, Twin } from "./chart-view.js";

/** The chart ladder, and the two drilling charts drawn on the same construction. */
export function LadderChart({ chart }: { chart: Ladder }) {
  const roving = useRoving(chart.rows.length);
  return (
    <div className="ladder">
      <div className="ladder-head">
        <h2>{chart.heading}</h2>
        <span className="ladder-units">{chart.units}</span>
      </div>
      {chart.rows.map((row, i) => (
        <div
          key={`${i}|${row.label}`}
          className={row.serves ? "ladder-row is-serving" : "ladder-row"}
          {...roving.row(i)}
          aria-label={row.name}
        >
          <span className="ladder-label">
            {row.label}
            {row.tag !== null && (
              <>
                {" "}
                <em className="ladder-tag">{row.tag}</em>
              </>
            )}
          </span>
          <span className="ladder-track">
            <span className="ladder-lane">
              <Spacer at={row.barLeft} />
              <span
                className={row.serves ? "ladder-bar chart-emphasis" : "ladder-bar"}
                style={{ inlineSize: `${row.barWidth}%` }}
                data-at={row.barWidth}
              />
            </span>
            {row.marker !== null && (
              <span className="ladder-lane ladder-lane--mark">
                <Spacer at={row.marker} />
                <span className="ladder-mark" />
              </span>
            )}
          </span>
          <span className="ladder-range">{row.value}</span>
        </div>
      ))}
      <p className="ladder-legend">{chart.legend}</p>
      <TableTwin twin={chart.twin} />
    </div>
  );
}

/** The capacity cascade and, after it, its table. */
export function CascadeChart({ chart }: { chart: Cascade }) {
  const roving = useRoving(chart.rows.length);
  return (
    <>
      <div className="cascade">
        {chart.rows.map((row, i) => (
          <div
            key={row.label}
            className={`casc-row${row.binds ? " is-bind" : ""}${row.farAbove ? " na" : ""}`}
            {...roving.row(i)}
            aria-label={row.name}
          >
            <span className="casc-label">{row.label}</span>
            <span className="casc-bar">
              <span
                className={row.binds ? "casc-fill chart-emphasis" : "casc-fill"}
                style={{ inlineSize: `${row.fillWidth}%` }}
                data-at={row.fillWidth}
              />
            </span>
            <span className="casc-val">
              {row.metric}
              <span className="imperial">{row.imperial}</span>
            </span>
          </div>
        ))}
      </div>
      <TableTwin twin={chart.twin} />
    </>
  );
}

/** An empty span that pushes what follows it `at` per cent along its lane. */
function Spacer({ at }: { at: string }) {
  return <span className="chart-spacer" style={{ inlineSize: `${at}%` }} data-at={at} />;
}

/**
 * The table under a chart: app.js's tableTwin(). Collapsed by default so it
 * costs no height; the browser's own fold gives the keyboard and the
 * announced state for free (the plan's rulings keep the raw fold).
 */
function TableTwin({ twin }: { twin: Twin }) {
  const columns = twin.headers.map((label, i) => ({ id: `c${i}`, label }));
  const rows = twin.rows.map((cells, r) => ({
    id: `r${r}`,
    cells: Object.fromEntries(cells.map((c, i) => [`c${i}`, c as ReactNode])),
  }));
  return (
    <details className="table-twin">
      <summary>Show {twin.caption.toLowerCase()} as a table</summary>
      <Table label={twin.caption} columns={columns} rows={rows} zebra empty={{ title: "Nothing to show." }} />
    </details>
  );
}

/**
 * A roving tabindex over a chart's rows: one Tab stop, on the first row until
 * the arrow keys move it, as labelChartRows() and initChartTips() did.
 */
function useRoving(count: number) {
  const [active, setActive] = useState(0);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const current = active < count ? active : 0;
  const onKeyDown = (i: number) => (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowDown" || e.key === "ArrowRight") next = Math.min(i + 1, count - 1);
    if (e.key === "ArrowUp" || e.key === "ArrowLeft") next = Math.max(i - 1, 0);
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = count - 1;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    rows.current[next]?.focus();
  };
  return {
    row: (i: number) => ({
      ref: (el: HTMLDivElement | null) => {
        rows.current[i] = el;
      },
      tabIndex: i === current ? 0 : -1,
      onKeyDown: onKeyDown(i),
    }),
  };
}
