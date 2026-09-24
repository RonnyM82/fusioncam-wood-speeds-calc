// The calculator's form: rows 3 to 18 of the survey's inventory
// (docs/CONVERSION_SURVEY.md, section 2), as design-system parts, laid out as
// legacy.html lays out the page before the conversion. Written 2026-09-24,
// step 2 of docs/CONVERSION_PLAN.md.
//
// Every value shown here comes from the one state in useCalculatorState, and
// every change goes back to it; nothing is held in a part. The part that does
// not belong to the mode on screen is not rendered, where the old page hid it
// with the hidden attribute (and an app-layer correction to make that work).
import { Checkbox, Form, FormGrid, NumberField, RadioGroup, Select, type NumberFieldDetail } from "@livetools/ui";
import { DRILL_DIAMETERS, DRILL_TOOLS } from "../js/ui/drill-tables.js";
import { diameterLabel } from "../js/ui/format.js";
import { data } from "./data";
import {
  ADV_FIELDS,
  DIAMETERS,
  DRILL_ADV,
  EMPTY_WORDS,
  MATERIALS,
  MODES,
  NUMBER_FIELDS,
  TOOL_TYPES,
  aboveWords,
  advKey,
  firstCutLabel,
  profilesFor,
  type FormAction,
  type FormState,
  type Preset,
} from "./form-state.js";

type Props = {
  state: FormState;
  dispatch: (action: FormAction) => void;
  presets: Preset[];
};

// The field's own rule for the two things its range cannot say: empty where a
// number must be, and a number that must be above a bound. The words match
// what blockers() reports for the same box.
const rule = (mustHold: boolean, above: number | undefined) => (v: number | null) => {
  if (v === null) return mustHold ? EMPTY_WORDS : null;
  return above !== undefined && v <= above ? aboveWords(above) : null;
};

const toItems = (list: readonly { id: string; label: string }[]) => list.map((o) => ({ value: o.id, label: o.label }));

export function CalculatorForm({ state, dispatch, presets }: Props) {
  const drilling = state.mode === "drill";

  // One number field, wired to the state by its key in NUMBER_FIELDS. The
  // field reports every change a person makes with the state it judged
  // ("error" while its text cannot be read or its number is out of range),
  // and the state decides what that means for the calculation.
  const numberField = (key: string) => {
    const spec = NUMBER_FIELDS[key];
    // Some advanced hints quote the data ("for example 80").
    const hint = typeof spec.hint === "function" ? spec.hint(data) : spec.hint;
    return (
      <NumberField
        key={key}
        label={spec.label}
        {...(spec.measure !== undefined ? { measure: spec.measure } : {})}
        {...(spec.unit !== undefined ? { unit: spec.unit } : {})}
        {...(spec.decimals !== undefined ? { decimals: spec.decimals } : {})}
        {...(spec.min !== undefined ? { min: spec.min } : {})}
        {...(spec.max !== undefined ? { max: spec.max } : {})}
        {...(spec.step !== undefined ? { step: spec.step } : {})}
        {...(hint !== undefined ? { hint } : {})}
        // A box that must hold a number says so when emptied, with the part's
        // own words, without the required asterisk the old page never showed.
        // An advanced box takes only a number above 0 (form-state.js), and
        // says so under the box as the part says any other range.
        {...(spec.mustHold === true || spec.above !== undefined ? { validate: rule(spec.mustHold === true, spec.above) } : {})}
        stepper
        value={state.boxes[key] ?? null}
        onValueChange={(value: number | null, detail: NumberFieldDetail) =>
          dispatch({ type: "number", field: key, value, state: detail.state })
        }
      />
    );
  };

  const diameters: number[] = drilling ? (DRILL_DIAMETERS as Record<string, number[]>)[state.drillTool] ?? [] : DIAMETERS;
  const machine = presets[state.machineIdx];

  return (
    // Nothing is ever submitted: the page recalculates on every change. The
    // empty handler stops the browser's own submission, which Enter in a box
    // would otherwise start, as onsubmit="return false" did.
    <Form id="inputs" onSubmit={() => undefined}>
      {/* Routing and drilling share the material, the machine and how hard to
          run it, and share nothing else. A radio group says "pick one of two
          operations", which is what this is; tabs would say "two views of one
          thing", which it is not. */}
      <RadioGroup
        label="What are you cutting"
        layout="buttons"
        items={toItems(MODES)}
        value={state.mode}
        onValueChange={(value) => dispatch({ type: "mode", value })}
      />

      <Select
        label="Material"
        items={MATERIALS.map((m) => ({ value: m.id, label: m.label }))}
        value={state.material}
        onValueChange={(value) => value !== null && dispatch({ type: "material", value })}
      />

      {/* Keyed by mode: the two modes offer different lists, and a fresh
          group per list keeps Base UI's roving focus off an option that no
          longer exists. */}
      <RadioGroup
        key={`tool-${state.mode}`}
        label={drilling ? "Drill type" : "Tool type"}
        layout="cards"
        items={(drilling ? DRILL_TOOLS : TOOL_TYPES).map((t) => ({ value: t.id, label: t.label, hint: t.hint }))}
        value={drilling ? state.drillTool : state.toolType}
        onValueChange={(value) => dispatch({ type: "tool", value })}
      />

      <FormGrid>
        <Select
          label={drilling ? "Drill diameter" : "Tool diameter"}
          items={diameters.map((d) => ({ value: String(d), label: diameterLabel(d) }))}
          value={String(drilling ? state.drillDiameterMm : state.diameterMm)}
          onValueChange={(value) => value !== null && dispatch({ type: "diameter", value })}
        />
        {!drilling && numberField("flutes")}
      </FormGrid>

      {!drilling && <FormGrid>{[numberField("thickness"), numberField("doc")]}</FormGrid>}

      {drilling && <FormGrid>{[numberField("holedepth"), numberField("drillrpm")]}</FormGrid>}

      {!drilling && <FormGrid>{[numberField("woc"), numberField("rpm")]}</FormGrid>}

      {/* The hint is the preset's own note ("This machine publishes no
          spindle power..."), so it follows the machine. */}
      <Select
        label="Machine"
        items={presets.map((p, i) => ({ value: String(i), label: p.label }))}
        value={String(state.machineIdx)}
        hint={machine.notes ?? ""}
        onValueChange={(value) => value !== null && dispatch({ type: "machine", value })}
      />

      <RadioGroup
        key={`profile-${state.mode}`}
        label="How hard to run it"
        layout="buttons"
        items={toItems(profilesFor(state.mode))}
        value={state.profile}
        onValueChange={(value) => dispatch({ type: "profile", value })}
      />

      {/* Not shown while Finishing is on: a finish pass follows a proven cut,
          and the reduction would drive a thin skim into rubbing (research
          session 4). The choice is kept and returns with the other profiles. */}
      {!drilling && state.profile !== "finishing" && (
        <Checkbox
          label={firstCutLabel(data)}
          checked={state.firstCut}
          onCheckedChange={(value) => dispatch({ type: "firstCut", value })}
        />
      )}

      {/* A drill bank is a fixed-speed geared head with its own drive, so the
          router spindle's rated speed floor does not apply to it, and nobody
          publishes the bank's power. Drilling only. */}
      {drilling && (
        <Checkbox
          label="These holes run on a drill bank, not the router spindle"
          checked={state.drillBank}
          onCheckedChange={(value) => dispatch({ type: "drillBank", value })}
        />
      )}

      {/* The browser's own open-and-close box: no part exists for one, and the
          rules allow it (the plan's rulings). Its fields stay mounted while it
          is closed, so a fault in one still holds the results back. */}
      <details id="advanced" className="advanced">
        <summary>Advanced</summary>
        <FormGrid className="advanced-fields">
          {ADV_FIELDS.filter((f) => !drilling || DRILL_ADV.has(f.id)).map((f) => {
            if (f.select === undefined) return numberField(advKey(f.id));
            const hint = typeof f.hint === "function" ? f.hint(data) : f.hint;
            return (
              <Select
                key={f.id}
                label={f.label}
                items={f.select.map(([value, label]) => ({ value, label }))}
                // Nothing chosen yet shows the first option, as a native
                // select did; the state only gains the key once one is picked.
                value={(state.adv[f.id] as string | undefined) ?? f.select[0][0]}
                {...(hint !== undefined ? { hint } : {})}
                onValueChange={(value) => value !== null && dispatch({ type: "advSelect", id: f.id, value })}
              />
            );
          })}
        </FormGrid>
      </details>
    </Form>
  );
}
