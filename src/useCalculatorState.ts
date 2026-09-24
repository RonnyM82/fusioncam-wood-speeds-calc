// The calculator's state in one place: the hook the form and the results read.
// Written 2026-09-24, step 2 of docs/CONVERSION_PLAN.md.
//
// The rules themselves live in src/form-state.js, as plain functions, so the
// tests run them in Node (tests/form-state.test.js). This file only holds
// them in React: the state at load comes from the page's address, every
// change goes through update(), and every state is written back to the
// address, as js/ui/app.js did after each recalculation, so a shared link
// opens to exactly what the sender saw.
import { useEffect, useMemo, useReducer } from "react";
import { machinePresets } from "../js/data/presets.js";
import { data } from "./data";
import {
  blockers,
  createState,
  currentDrillInput,
  currentInput,
  update,
  writeUrlState,
  type FormAction,
  type FormState,
  type Preset,
} from "./form-state.js";

// Built once, the first time the form renders. Not at import: the page
// imports this module even when the data failed its check, and the preset
// builder should not run on data that failed.
let built: Preset[] | undefined;
export function getPresets(): Preset[] {
  built ??= machinePresets(data.machines, data.rules) as Preset[];
  return built;
}

export function useCalculatorState() {
  const presets = getPresets();
  const [state, dispatch] = useReducer(
    (s: FormState, a: FormAction) => update(s, a, presets),
    undefined,
    () => createState(data, presets, window.location.search),
  );

  // app.js wrote the address after every recalculation, the first one at load
  // included, so a link with no query at all is rewritten in full.
  useEffect(() => {
    window.history.replaceState(null, "", writeUrlState(state));
  }, [state]);

  // What the engine is handed: exactly what currentInput() and
  // currentDrillInput() built. The results (App.tsx) hand it to the engine.
  const engineInput = useMemo(
    () => (state.mode === "drill" ? currentDrillInput(state, data, presets) : currentInput(state, data, presets)),
    [state, presets],
  );

  const holding = useMemo(() => blockers(state), [state]);

  return { state, dispatch, presets, engineInput, blockers: holding };
}
