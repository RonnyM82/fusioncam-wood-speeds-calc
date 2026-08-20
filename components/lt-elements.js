/* =============================================================================
   Livetools Design System, behavioural components
   lt-elements.js     requires lt-tokens.css and lt-components.css

   Version 0.5.0  (2026-08-20)
     + <lt-date-field>, <lt-time-field>, <lt-file-drop>

   Load it once, anywhere, no build step and no dependencies:

       <script type="module" src="components/lt-elements.js"><\/script>

   WHY LIGHT DOM AND NOT SHADOW DOM
   These elements upgrade markup that is already in the page rather than
   rendering into a shadow root. That is a deliberate choice for this stack:

     - lt-components.css applies directly, so a control inside a component looks
       identical to the same control outside it, with no style duplication and no
       ::part surface to maintain.
     - The surface contexts work. A .lt-panel re-declares text tokens for its
       descendants; shadow DOM would inherit the custom properties but not the
       class-based context, so a component inside a panel could disagree with the
       panel around it.
     - Native form participation is free. The real <input> is in the page, so it
       posts, validates and autofills without ElementInternals gymnastics.
     - It degrades. If the script fails to load, the markup is still a labelled
       input inside a form. On a shop-floor kiosk that matters more than
       encapsulation does.

   The cost is that app CSS can reach inside a component. That is a real
   trade-off, accepted knowingly, and the reason every internal element carries
   an lt- prefixed class rather than a bare tag selector.

   ACCESSIBILITY
   Patterns follow the ARIA Authoring Practices Guide. Keyboard behaviour is
   listed above each component. Anything that changes without a page load
   announces through the shared live region at the bottom of this file.
   ============================================================================= */

const DEFINED = new Set();

/** Register once, so a double script include cannot throw. */
function define(tag, cls) {
  if (!customElements.get(tag)) {
    customElements.define(tag, cls);
    DEFINED.add(tag);
  }
}

/* -----------------------------------------------------------------------------
   Number formatting and parsing

   Kept in one place because a calculator that parses "1,240.0" as 1 is worse
   than a calculator that refuses it. Parsing accepts what a machinist actually
   types: thousands separators, a comma decimal mark, a leading plus, stray
   spaces. Formatting keeps a fixed number of decimals so a column of values
   does not jitter between 12 and 12.00.
   -------------------------------------------------------------------------- */

function parseNumber(raw) {
  if (raw === null || raw === undefined) return NaN;
  let s = String(raw).trim();
  if (s === "") return NaN;
  s = s.replace(/\s+/g, "").replace(/^\+/, "");
  // If both separators appear, the last one is the decimal mark.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    const decimalMark = lastComma > lastDot ? "," : ".";
    const thousands = decimalMark === "," ? "." : ",";
    s = s.split(thousands).join("");
    s = s.replace(decimalMark, ".");
  } else if (lastComma > -1) {
    // A lone comma is a decimal mark if it looks like one, otherwise a separator.
    s = /,\d{3}$/.test(s) ? s.split(",").join("") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

function formatNumber(value, decimals) {
  if (!Number.isFinite(value)) return "";
  return value.toFixed(decimals);
}

/* -----------------------------------------------------------------------------
   Units

   Factors are exact by definition, not rounded approximations:
     1 inch = 25.4 mm exactly
     1 foot = 0.3048 m exactly

   The element always holds its value in the metric base unit and converts only
   for display. Converting the stored value on every toggle would accumulate
   rounding error, and on a feed rate that error ends up in the cut.
   -------------------------------------------------------------------------- */

const MM_PER_INCH = 25.4;
const M_PER_FOOT = 0.3048;

const UNITS = {
  length: {
    metric:   { unit: "mm",     decimals: 2, fromBase: v => v,               toBase: v => v },
    imperial: { unit: "in",     decimals: 4, fromBase: v => v / MM_PER_INCH, toBase: v => v * MM_PER_INCH },
  },
  feed: {
    metric:   { unit: "mm/min", decimals: 1, fromBase: v => v,               toBase: v => v },
    imperial: { unit: "in/min", decimals: 3, fromBase: v => v / MM_PER_INCH, toBase: v => v * MM_PER_INCH },
  },
  feedPerTooth: {
    metric:   { unit: "mm/tooth", decimals: 4, fromBase: v => v,               toBase: v => v },
    imperial: { unit: "in/tooth", decimals: 5, fromBase: v => v / MM_PER_INCH, toBase: v => v * MM_PER_INCH },
  },
  speed: {
    metric:   { unit: "m/min",  decimals: 0, fromBase: v => v,              toBase: v => v },
    imperial: { unit: "SFM",    decimals: 0, fromBase: v => v / M_PER_FOOT, toBase: v => v * M_PER_FOOT },
  },
  rotation: {
    metric:   { unit: "rpm",    decimals: 0, fromBase: v => v, toBase: v => v },
    imperial: { unit: "rpm",    decimals: 0, fromBase: v => v, toBase: v => v },
  },
  // Degrees in both systems, like rotation. Declared rather than left to the
  // literal-unit fallback so an angle field is first-class: lt-unit-toggle
  // keeps it in scope by declared kind instead of skipping it by accident of
  // markup, and the two systems can grow different decimals if they ever need
  // to (first consumer request, 2026-08-05).
  // An ASCII escape rather than a literal degree sign, and that is not
  // fussiness: this file documents its own inlining trap above, and an inlined
  // module takes the DOCUMENT's encoding, not the UTF-8 a real module import is
  // guaranteed. A page that inlines this script without a charset declaration
  // renders the literal as a mojibake pair - seen on the 2026-08-10 proof page,
  // which is exactly such a page. An ASCII escape cannot be mis-decoded.
  angle: {
    metric:   { unit: "\u00B0", decimals: 1, fromBase: v => v, toBase: v => v },
    imperial: { unit: "\u00B0", decimals: 1, fromBase: v => v, toBase: v => v },
  },
};

/* -----------------------------------------------------------------------------
   <lt-number-field>

   A numeric input with a unit suffix, optional stepper, and range clamping.

   Deliberately NOT <input type="number">. Its scroll wheel silently changes
   committed values, its native spinners are far below any sane target size, and
   it rejects thousands separators outright. This is type="text" with
   inputmode="decimal", explicit stepper buttons at full target size, and
   parsing that accepts what people type.

   Attributes
     value      initial value, in the base (metric) unit
     min, max   range in the base unit; out-of-range is reported, not silently
                clamped, unless clamp is present
     clamp      snap to min/max instead of reporting
     step       stepper increment in the display unit, default 1
     decimals   display precision, default from the unit
     unit       a literal unit label, when not using measure/system
     measure    length | feed | feedPerTooth | speed | rotation | angle
     system     metric | imperial   (display only; the value stays metric)
     label      the field label
     hint       help text under the field
     name       form field name; the element participates in the parent <form>
     warn-below, warn-above
                advisory band inside min/max. Outside it the field shows a
                warning rather than an error, because a feed above the published
                range is a judgement call, not an invalid entry.

   Properties:  value (base unit, number), displayValue (number), valid (bool)
   Events:      lt-change  { value, displayValue, unit, system, state }
   Keyboard:    Up/Down step, PageUp/PageDown step by ten, Home/End to min/max
   -------------------------------------------------------------------------- */

class LtNumberField extends HTMLElement {
  static observedAttributes = ["value", "system", "unit", "min", "max", "disabled"];

  #input = null;
  #posted = null;   // hidden input carrying the base-unit value for the form
  #affix = null;
  #msg = null;
  #hintId = "";     // "" when the field has no hint
  #msgId = "";      // the message span's id, always present
  #base = NaN;      // canonical value, always in the metric base unit
  #state = "ok";    // ok | warn | error

  connectedCallback() {
    if (this.#input) return;   // already upgraded
    this.#render();
    this.#syncFromAttribute();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (!this.#input || oldV === newV) return;
    if (name === "value") this.#syncFromAttribute();
    else if (name === "disabled") {
      this.#input.disabled = this.hasAttribute("disabled");
      if (this.#posted) this.#posted.disabled = this.#input.disabled;
    }
    // Moving min or max IS the documented cross-field mechanism (one field's
    // edit narrows its neighbour's range), so the neighbour must re-judge its
    // value the moment its bounds move, not on its next keystroke. Paint alone
    // left a now-out-of-range field showing ok with aria-invalid="false" —
    // the chip and the state drifting apart, which #validate exists to forbid.
    else if (name === "min" || name === "max") { this.#paint(); this.#validate(); }
    else this.#paint();
  }

  /* --- unit resolution ---------------------------------------------------- */

  get #measure() { return this.getAttribute("measure") || null; }
  get #system() { return this.getAttribute("system") || "metric"; }

  get #spec() {
    const m = this.#measure;
    if (m && UNITS[m]) return UNITS[m][this.#system] || UNITS[m].metric;
    // no measure: a plain number with a literal unit label
    return {
      unit: this.getAttribute("unit") || "",
      decimals: this.hasAttribute("decimals") ? Number(this.getAttribute("decimals")) : 2,
      fromBase: v => v,
      toBase: v => v,
    };
  }

  get #decimals() {
    return this.hasAttribute("decimals")
      ? Number(this.getAttribute("decimals"))
      : this.#spec.decimals;
  }

  /* --- public API -------------------------------------------------------- */

  /** Value in the base (metric) unit. */
  get value() { return this.#base; }
  set value(v) {
    this.#base = Number(v);
    this.#paint();
    this.#validate();
  }

  /** Value as currently displayed, in the current system's unit. */
  get displayValue() {
    return Number.isFinite(this.#base) ? this.#spec.fromBase(this.#base) : NaN;
  }

  get unit() { return this.#spec.unit; }
  get valid() { return this.#state !== "error"; }
  get state() { return this.#state; }

  /** Switch display system without touching the stored value. */
  setSystem(system) {
    this.setAttribute("system", system);
    this.#paint();
    this.#validate();
  }

  /* --- rendering --------------------------------------------------------- */

  #render() {
    const id = this.getAttribute("input-id") || `lt-nf-${Math.random().toString(36).slice(2, 9)}`;
    const label = this.getAttribute("label") || "";
    const hint = this.getAttribute("hint") || "";
    const stepper = this.hasAttribute("stepper");

    this.classList.add("lt-field");

    const parts = [];
    if (label) {
      parts.push(
        `<label class="lt-field__label" for="${id}"${this.hasAttribute("required") ? ' data-required' : ""}>${label}</label>`
      );
    }
    parts.push(`<div class="lt-input-group">`);
    if (stepper) {
      parts.push(
        `<button type="button" class="lt-btn lt-btn--secondary lt-btn--icon" data-step="-1" aria-label="Decrease ${label || "value"}">&minus;</button>`
      );
    }
    parts.push(
      `<input id="${id}" class="lt-input lt-input--numeric" type="text" inputmode="decimal" autocomplete="off"` +
      (this.hasAttribute("required") ? " required" : "") +
      (this.hasAttribute("disabled") ? " disabled" : "") +
      `>`
    );
    parts.push(`<span class="lt-affix" data-affix></span>`);
    if (stepper) {
      parts.push(
        `<button type="button" class="lt-btn lt-btn--secondary lt-btn--icon" data-step="1" aria-label="Increase ${label || "value"}">+</button>`
      );
    }
    parts.push(`</div>`);
    if (hint) parts.push(`<span class="lt-field__hint" id="${id}-hint">${hint}</span>`);
    // The message carries an id so aria-describedby can point at it. role=alert
    // announces it the moment it appears, but that is a one-shot: a user who
    // tabs back to the field afterwards hears the label and the hint and no
    // reason the field is red. describedby is what makes it re-readable.
    parts.push(`<span data-msg id="${id}-msg" hidden></span>`);

    this.innerHTML = parts.join("");

    this.#input = this.querySelector("input");
    this.#affix = this.querySelector("[data-affix]");
    this.#msg = this.querySelector("[data-msg]");
    this.#hintId = hint ? `${id}-hint` : "";
    this.#msgId = `${id}-msg`;

    if (hint) this.#input.setAttribute("aria-describedby", this.#hintId);

    // The parent <form> collects this field through a HIDDEN input that carries
    // the name and the base-unit value; the visible input stays nameless. The
    // posted value is the base unit, which is the one worth storing; the
    // display unit is a view concern. Until 0.4.0 the name sat on the visible
    // input, so a form submitted while the toggle showed imperial posted the
    // converted display string — inches into a metric column, silently (first
    // consumer report, 2026-08-05).
    const name = this.getAttribute("name");
    if (name) {
      this.#posted = document.createElement("input");
      this.#posted.type = "hidden";
      this.#posted.name = name;
      this.#posted.disabled = this.hasAttribute("disabled");
      this.appendChild(this.#posted);
    }

    this.#input.addEventListener("input", () => this.#onInput());
    this.#input.addEventListener("blur", () => this.#onCommit());
    this.#input.addEventListener("keydown", e => this.#onKey(e));
    this.querySelectorAll("[data-step]").forEach(btn => {
      btn.addEventListener("click", () => this.#nudge(Number(btn.dataset.step)));
    });
  }

  #paint() {
    if (!this.#input) return;
    const spec = this.#spec;
    this.#affix.textContent = spec.unit;
    this.#affix.hidden = !spec.unit;
    if (document.activeElement !== this.#input) {
      this.#input.value = Number.isFinite(this.#base)
        ? formatNumber(spec.fromBase(this.#base), this.#decimals)
        : "";
    }
  }

  #syncFromAttribute() {
    const raw = this.getAttribute("value");
    this.#base = raw === null ? NaN : parseNumber(raw);
    this.#paint();
    this.#validate();
  }

  /* --- behaviour --------------------------------------------------------- */

  #onInput() {
    const shown = parseNumber(this.#input.value);
    this.#base = Number.isFinite(shown) ? this.#spec.toBase(shown) : NaN;
    this.#validate();
    this.#emit();
  }

  /** Reformat on blur, so 12 becomes 12.00 and 1,240 becomes 1240.0. */
  #onCommit() {
    this.#paint();
    this.#validate();
    this.#emit();
  }

  #onKey(e) {
    const step = Number(this.getAttribute("step") || 1);
    const map = {
      ArrowUp: step, ArrowDown: -step,
      PageUp: step * 10, PageDown: -step * 10,
    };
    if (e.key in map) {
      e.preventDefault();
      this.#nudge(map[e.key] / step, step);
    } else if (e.key === "Home" && this.hasAttribute("min")) {
      e.preventDefault();
      this.value = parseNumber(this.getAttribute("min"));
      this.#emit();
    } else if (e.key === "End" && this.hasAttribute("max")) {
      e.preventDefault();
      this.value = parseNumber(this.getAttribute("max"));
      this.#emit();
    }
  }

  #nudge(multiplier, stepOverride) {
    const step = stepOverride ?? Number(this.getAttribute("step") || 1);
    const spec = this.#spec;
    const current = Number.isFinite(this.#base) ? spec.fromBase(this.#base) : 0;
    // Step in the display unit, so a stepper in inches moves in inches.
    const next = current + step * multiplier;
    // Round to the display precision to stop float dust accumulating.
    const rounded = Number(next.toFixed(this.#decimals));
    this.#base = spec.toBase(rounded);
    this.#paint();
    this.#validate();
    this.#emit();
    this.#input.focus();
  }

  #validate() {
    if (!this.#input) return;
    const min = this.hasAttribute("min") ? parseNumber(this.getAttribute("min")) : -Infinity;
    const max = this.hasAttribute("max") ? parseNumber(this.getAttribute("max")) : Infinity;
    const warnLo = this.hasAttribute("warn-below") ? parseNumber(this.getAttribute("warn-below")) : -Infinity;
    const warnHi = this.hasAttribute("warn-above") ? parseNumber(this.getAttribute("warn-above")) : Infinity;

    let state = "ok";
    let message = "";

    if (this.#input.value.trim() === "") {
      if (this.hasAttribute("required")) { state = "error"; message = "Enter a value."; }
    } else if (!Number.isFinite(this.#base)) {
      state = "error";
      message = "That is not a number.";
    } else if (this.#base < min || this.#base > max) {
      if (this.hasAttribute("clamp")) {
        this.#base = Math.min(Math.max(this.#base, min), max);
        this.#paint();
        state = "warn";
        message = `Adjusted to the allowed range.`;
      } else {
        state = "error";
        const spec = this.#spec;
        const lo = min === -Infinity ? null : formatNumber(spec.fromBase(min), this.#decimals);
        const hi = max === Infinity ? null : formatNumber(spec.fromBase(max), this.#decimals);
        // A unit-less field has nothing to name, and "between 1 and 6 ." reads
        // as a typo. Same guard #paint() uses to hide the affix.
        const u = spec.unit ? ` ${spec.unit}` : "";
        message = lo && hi ? `Must be between ${lo} and ${hi}${u}.`
          : lo ? `Must be at least ${lo}${u}.`
          : `Must be at most ${hi}${u}.`;
      }
    } else if (this.#base < warnLo || this.#base > warnHi) {
      state = "warn";
      message = this.getAttribute("warn-message") || "Outside the recommended range.";
    }

    this.#state = state;
    this.#input.setAttribute("aria-invalid", state === "error" ? "true" : "false");

    // The chip and the attributes are ONE thing, set in one pass. This is the
    // contract auditFields() holds every hand-rolled field to, and the reason
    // it can: this element cannot paint a chip without also marking the
    // control, because both happen here.
    // Rebuild only the two ids this element owns, and carry anything else
    // through untouched. An app is entitled to describe this input with its own
    // node, and a validation pass has no business dropping it.
    const owned = new Set([this.#hintId, this.#msgId].filter(Boolean));
    const existing = (this.#input.getAttribute("aria-describedby") || "")
      .split(/\s+/).filter(t => t && !owned.has(t));
    const described = [
      ...(this.#hintId ? [this.#hintId] : []),
      ...(state === "ok" ? [] : [this.#msgId]),
      ...existing,
    ];
    if (described.length) this.#input.setAttribute("aria-describedby", described.join(" "));
    else this.#input.removeAttribute("aria-describedby");

    if (state === "ok") {
      this.#msg.hidden = true;
      this.#msg.textContent = "";
      this.#msg.className = "";
      this.#msg.removeAttribute("role");
    } else {
      this.#msg.hidden = false;
      this.#msg.className = state === "error" ? "lt-field__error" : "lt-field__warning";
      // assertive for an error the user must fix, polite for advice
      this.#msg.setAttribute("role", state === "error" ? "alert" : "status");
      // Icon as markup (this file's own artwork), message as TEXT. A field
      // error routinely quotes what the user typed or what the server said
      // about it, and interpolating that into innerHTML re-parsed it as markup
      // — the same defect fixed in toast() and <lt-status-select> on
      // 2026-07-29. Set the icon first, then append the message as a text node.
      this.#msg.innerHTML =
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ` +
        `stroke-linecap="round" aria-hidden="true">` +
        (state === "error"
          ? `<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>`
          : `<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>`) +
        `</svg>`;
      this.#msg.appendChild(document.createTextNode(message));
    }

    // Every path that moves #base ends here (typing, blur, stepper, setter,
    // attribute sync, the clamp branch above), so this is the one place the
    // posted value is written. Raw base, same number the .value API exposes:
    // rounding it to the metric display precision would post less than an
    // imperial display is showing.
    if (this.#posted) {
      this.#posted.value = Number.isFinite(this.#base) ? String(this.#base) : "";
    }
  }

  #emit() {
    this.dispatchEvent(new CustomEvent("lt-change", {
      bubbles: true,
      detail: {
        value: this.#base,
        displayValue: this.displayValue,
        unit: this.unit,
        system: this.#system,
        state: this.#state,
      },
    }));
  }
}
define("lt-number-field", LtNumberField);


/* -----------------------------------------------------------------------------
   <lt-unit-toggle>

   Switches every <lt-number-field> in a scope between metric and imperial.

   This is the single highest-risk control in a speeds-and-feeds tool. A silent
   or ambiguous unit switch is how someone runs an inch-per-minute feed as
   millimetres per minute. Three defences:

     1. Stored values never convert. Only the display does, so repeated toggling
        cannot drift.
     2. The active system is stated in words, not implied by a highlight alone.
     3. The change is announced to assistive tech and the unit suffix on every
        affected field updates in the same frame.

   Attributes
     for       id of the scope to control; defaults to the nearest form or
               the parent element
     system    metric | imperial, initial state
   Events      lt-system-change { system }
   Keyboard    Left/Right arrows move between options, per the APG radiogroup
   -------------------------------------------------------------------------- */

class LtUnitToggle extends HTMLElement {
  #buttons = [];

  connectedCallback() {
    if (this.#buttons.length) return;
    const system = this.getAttribute("system") || "metric";
    this.innerHTML =
      `<div class="lt-row" role="radiogroup" aria-label="Measurement system">` +
      `<span class="lt-field__label" style="text-transform:none">Units</span>` +
      `<div class="lt-btn-group">` +
      `<button type="button" role="radio" class="lt-btn lt-btn--secondary" data-system="metric">Metric</button>` +
      `<button type="button" role="radio" class="lt-btn lt-btn--secondary" data-system="imperial">Imperial</button>` +
      `</div></div>`;

    this.#buttons = [...this.querySelectorAll("[data-system]")];
    this.#buttons.forEach(b => {
      b.addEventListener("click", () => this.apply(b.dataset.system));
      b.addEventListener("keydown", e => this.#onKey(e));
    });
    this.apply(system, { silent: true });
  }

  #onKey(e) {
    const i = this.#buttons.indexOf(e.target);
    if (i === -1) return;
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % this.#buttons.length;
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + this.#buttons.length) % this.#buttons.length;
    if (next !== null) {
      e.preventDefault();
      this.#buttons[next].focus();
      this.apply(this.#buttons[next].dataset.system);
    }
  }

  get #scope() {
    const forId = this.getAttribute("for");
    if (forId) return document.getElementById(forId) || document;
    return this.closest("form") || this.parentElement || document;
  }

  apply(system, { silent = false } = {}) {
    this.#buttons.forEach(b => {
      const on = b.dataset.system === system;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      b.classList.toggle("lt-btn--primary", on);
      b.classList.toggle("lt-btn--secondary", !on);
    });
    this.setAttribute("system", system);

    this.#scope.querySelectorAll("lt-number-field[measure]").forEach(f => {
      if (typeof f.setSystem === "function") f.setSystem(system);
    });

    if (!silent) {
      const label = system === "metric" ? "Metric, millimetres" : "Imperial, inches";
      announce(`Units switched to ${label}. All values converted.`, "assertive");
      this.dispatchEvent(new CustomEvent("lt-system-change", {
        bubbles: true, detail: { system },
      }));
    }
  }
}
define("lt-unit-toggle", LtUnitToggle);


/* -----------------------------------------------------------------------------
   <lt-tabs>

   APG tabs. Expects the markup already present:

     <lt-tabs>
       <div class="lt-tabs__list" role="tablist">
         <button class="lt-tabs__tab" role="tab" aria-controls="p1">Milling</button>
         ...
       </div>
       <div class="lt-tabs__panel" role="tabpanel" id="p1">...</div>
     </lt-tabs>

   Keyboard: Left/Right move, Home/End jump, and selection follows focus, which
   is the APG default for tabs whose panels are already in the DOM.
   -------------------------------------------------------------------------- */

class LtTabs extends HTMLElement {
  connectedCallback() {
    this.tabs = [...this.querySelectorAll('[role="tab"]')];
    this.panels = [...this.querySelectorAll('[role="tabpanel"]')];
    if (!this.tabs.length) return;

    this.tabs.forEach((tab, i) => {
      if (!tab.id) tab.id = `${this.id || "lt-tabs"}-tab-${i}`;
      const panel = this.#panelFor(tab);
      if (panel) {
        panel.setAttribute("aria-labelledby", tab.id);
        panel.tabIndex = 0;
      }
      tab.addEventListener("click", () => this.select(i));
      tab.addEventListener("keydown", e => this.#onKey(e, i));
    });

    const initial = Math.max(0, this.tabs.findIndex(t => t.getAttribute("aria-selected") === "true"));
    this.select(initial);
  }

  #panelFor(tab) {
    const id = tab.getAttribute("aria-controls");
    return id ? this.querySelector(`#${CSS.escape(id)}`) : null;
  }

  select(index) {
    this.tabs.forEach((tab, i) => {
      const on = i === index;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      const panel = this.#panelFor(tab);
      if (panel) panel.hidden = !on;
    });
    this.dispatchEvent(new CustomEvent("lt-tab-change", {
      bubbles: true, detail: { index, tab: this.tabs[index] },
    }));
  }

  #onKey(e, i) {
    const last = this.tabs.length - 1;
    let next = null;
    if (e.key === "ArrowRight") next = i === last ? 0 : i + 1;
    if (e.key === "ArrowLeft") next = i === 0 ? last : i - 1;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = last;
    if (next !== null) {
      e.preventDefault();
      this.tabs[next].focus();
      this.select(next);
    }
  }
}
define("lt-tabs", LtTabs);


/* -----------------------------------------------------------------------------
   <lt-dialog>

   Wraps the native <dialog>, which already gives a top layer, a ::backdrop,
   Escape to close, and a focus trap. This adds the parts it does not: returning
   focus to the invoker, an optional destructive confirmation, and a click on the
   backdrop closing the dialog.

   Usage
     <lt-dialog id="confirm-delete" heading="Delete tool?" danger>
       <p>EV-1200-5F will be removed from the quote.</p>
       <div slot="actions">...</div>
     </lt-dialog>

     document.querySelector("#confirm-delete").open(invokerElement)
       .then(result => { if (result === "confirm") ... })
   -------------------------------------------------------------------------- */

class LtDialog extends HTMLElement {
  #dialog = null;
  #invoker = null;
  #resolve = null;

  connectedCallback() {
    if (this.#dialog) return;
    const heading = this.getAttribute("heading") || "";
    const danger = this.hasAttribute("danger");
    const confirmLabel = this.getAttribute("confirm-label") || (danger ? "Delete" : "Confirm");
    const cancelLabel = this.getAttribute("cancel-label") || "Cancel";
    const body = this.innerHTML;

    // lt-panel is load-bearing: the dialog is in the top layer, so it inherits
    // whatever context its author happened to put it in, and at page level in
    // the dark scheme that is light ink on its own light card. The surface
    // context settles it wherever the dialog is authored. There is deliberately
    // no .lt-card wrapper any more — see the note on .lt-dialog.
    this.innerHTML =
      `<dialog class="lt-dialog lt-panel">` +
      (heading ? `<h2 class="lt-dialog__title">${heading}</h2>` : "") +
      `<div class="lt-dialog__body">${body}</div>` +
      `<div class="lt-form-actions">` +
      `<button type="button" class="lt-btn ${danger ? "lt-btn--danger" : "lt-btn--primary"}" data-act="confirm">${confirmLabel}</button>` +
      `<button type="button" class="lt-btn lt-btn--secondary" data-act="cancel">${cancelLabel}</button>` +
      `</div></dialog>`;

    this.#dialog = this.querySelector("dialog");
    if (heading) this.#dialog.setAttribute("aria-label", heading);

    this.querySelectorAll("[data-act]").forEach(b => {
      b.addEventListener("click", () => this.close(b.dataset.act));
    });

    // A click on the backdrop lands on the dialog element itself, since the
    // content sits in a child. Anything deeper is inside the dialog.
    this.#dialog.addEventListener("click", e => {
      if (e.target === this.#dialog) this.close("dismiss");
    });
    this.#dialog.addEventListener("cancel", e => {   // Escape
      e.preventDefault();
      this.close("dismiss");
    });
  }

  /** Open and resolve with "confirm", "cancel" or "dismiss". */
  open(invoker = null) {
    this.#invoker = invoker || document.activeElement;
    this.#dialog.showModal();
    // focus the least destructive action first
    const first = this.#dialog.querySelector('[data-act="cancel"]')
      || this.#dialog.querySelector("[data-act]");
    if (first) first.focus();
    return new Promise(resolve => { this.#resolve = resolve; });
  }

  close(result = "dismiss") {
    if (!this.#dialog.open) return;
    this.#dialog.close();
    // Native <dialog> does not restore focus to the invoker; do it here so a
    // keyboard user is not dumped back at the top of the document.
    if (this.#invoker && document.contains(this.#invoker)) this.#invoker.focus();
    if (this.#resolve) { this.#resolve(result); this.#resolve = null; }
    this.dispatchEvent(new CustomEvent("lt-dialog-close", {
      bubbles: true, detail: { result },
    }));
  }
}
define("lt-dialog", LtDialog);


/* -----------------------------------------------------------------------------
   <lt-menu>

   The row-actions kebab. A menu button following the ARIA Authoring Practices
   Guide, wrapped around markup the page already contains.

   THE MARKUP IS THE API. Everything is authored as plain elements and
   attributes, because the pages that use this are rendered by a template
   engine: a Jinja macro can emit an <a> and a <button>, and cannot pass a
   JavaScript array of action objects. So there is no configuration property
   anywhere on this element. Author the items; the element supplies the
   trigger, the wrapper, the roles and the behaviour.

     <lt-menu label="Actions for EV-1200-5F-30">
       <a class="lt-menu__item" href="/tools/1200/edit">Edit</a>
       <button class="lt-menu__item" type="submit" form="default-1200">Make default</button>
       <hr class="lt-menu__sep">
       <button class="lt-menu__item lt-menu__item--danger" type="submit"
               form="delete-1200">Delete</button>
     </lt-menu>

   Attributes
     label     accessible name for the trigger. Name the ROW, not the verb:
               twenty triggers all called "Actions" are twenty identical
               announcements. Defaults to "Row actions".
     align     end (default) or start, which edge of the trigger the list
               lines its own edge up with

   Keyboard, per the APG menu button pattern
     trigger   Enter / Space open and focus the first item
               Down opens and focuses the first item, Up the last
     menu      Down / Up move, Home / End jump, a printable character jumps to
               the next item starting with it, Escape closes and returns focus
               to the trigger, Tab closes and lets focus move on

   Without the script the authored items are simply visible in the row, so a
   destructive action is never hidden behind a control that failed to upgrade.
   -------------------------------------------------------------------------- */

/**
 * Position a floating, fixed-position list against its trigger, in viewport
 * coordinates. Shared by <lt-menu> and <lt-status-select>: both float a
 * .lt-panel list out of a scrolling table wrapper, and two copies of this
 * arithmetic would drift.
 *
 * Physical top/left rather than the logical inset properties the stylesheet
 * uses everywhere else, because getBoundingClientRect is itself physical:
 * mixing the two would place the list on the wrong side of the trigger the
 * first time this ships in a right-to-left locale.
 *
 * `host` supplies the writing direction. alignStart lines the list's start
 * edge up with the trigger's; the default lines up the end edges.
 * matchInlineSize opens the list at least as wide as the trigger, which is
 * what makes a select-like popup read as the same control as its face.
 */
function placeFloating(host, trigger, list, { alignStart = false, matchInlineSize = false } = {}) {
  if (typeof trigger.getBoundingClientRect !== "function") return;
  const gap = 4;
  const t = trigger.getBoundingClientRect();
  if (matchInlineSize && t.width) list.style.minWidth = `${Math.round(t.width)}px`;
  const l = list.getBoundingClientRect();
  const vw = window.innerWidth || 0;
  const vh = window.innerHeight || 0;
  if (!vw || !vh || (!l.width && !l.height)) return;   // not laid out (jsdom)

  let top = t.bottom + gap;
  // flip above when there is not room below AND there is room above
  if (top + l.height > vh && t.top - l.height - gap > 0) top = t.top - l.height - gap;
  top = Math.max(gap, Math.min(top, vh - l.height - gap));

  const rtl = getComputedStyle(host).direction === "rtl";
  // "end" means the list's end edge meets the trigger's end edge
  const endAligned = alignStart === rtl;
  let left = endAligned ? t.right - l.width : t.left;
  left = Math.max(gap, Math.min(left, vw - l.width - gap));

  list.style.top = `${Math.round(top)}px`;
  list.style.left = `${Math.round(left)}px`;
}

const MENU_ITEM_SELECTOR = ".lt-menu__item, a[href], button";

class LtMenu extends HTMLElement {
  #trigger = null;
  #list = null;
  #native = false;   // true when the browser has the popover API
  #open = false;
  #typed = "";
  #typedAt = 0;
  #reposition = null;
  #onOutside = null;   // only bound when the popover API is missing

  connectedCallback() {
    if (this.#trigger) return;
    const id = this.getAttribute("menu-id")
      || `lt-menu-${Math.random().toString(36).slice(2, 9)}`;
    const label = this.getAttribute("label") || "Row actions";

    this.#list = document.createElement("div");
    // lt-panel is load-bearing, not decoration: the list floats free of the row
    // it belongs to, so it needs a surface context of its own for its ink,
    // borders and color-scheme. See the note on .lt-menu__list.
    this.#list.className = "lt-menu__list lt-panel";
    this.#list.id = id;
    this.#list.setAttribute("role", "menu");
    this.#list.setAttribute("aria-label", label);
    // move the authored children in, nodes and all, so anything the app
    // attached to them (htmx attributes, event listeners) survives intact
    while (this.firstChild) this.#list.appendChild(this.firstChild);

    this.#trigger = document.createElement("button");
    this.#trigger.type = "button";
    this.#trigger.className = "lt-btn lt-btn--ghost lt-btn--icon lt-menu__trigger";
    this.#trigger.setAttribute("aria-haspopup", "true");
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#trigger.setAttribute("aria-controls", id);
    this.#trigger.setAttribute("aria-label", label);
    // The kebab is drawn here rather than referenced from the lt sprite, so
    // the element works on a page that has not inlined it. Same standard as
    // any other glyph: the 24 grid, painted through a layer class, no literal
    // fill or stroke anywhere.
    this.#trigger.innerHTML =
      '<svg class="lt-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
      '<circle class="lt-ic-ink" cx="12" cy="5" r="1.5"/>' +
      '<circle class="lt-ic-ink" cx="12" cy="12" r="1.5"/>' +
      '<circle class="lt-ic-ink" cx="12" cy="19" r="1.5"/></svg>';

    this.appendChild(this.#trigger);
    this.appendChild(this.#list);

    // Popover gives the top layer (so a sticky header cannot cover the menu),
    // light dismiss and Escape for free. Where it is missing the list is still
    // a fixed-position panel, which is what escapes the table wrapper's
    // overflow; only the dismissal has to be wired by hand.
    this.#native = typeof this.#list.showPopover === "function";
    if (this.#native) {
      this.#list.setAttribute("popover", "auto");
      this.#list.addEventListener("toggle", e => {
        if (e.newState === "closed" && this.#open) this.#afterClose();
      });
    } else {
      this.#list.hidden = true;
    }

    // Roles go on EVERY item, disabled ones included: a menu that silently
    // drops an item from the accessibility tree reads as a shorter menu, and
    // "Duplicate, dimmed" is information. Only focus movement skips them.
    this.#allItems().forEach(el => {
      el.setAttribute("role", "menuitem");
      el.tabIndex = -1;
    });

    this.#trigger.addEventListener("click", () => this.toggle());
    this.#trigger.addEventListener("keydown", e => this.#onTriggerKey(e));
    this.#list.addEventListener("keydown", e => this.#onMenuKey(e));
    // Delegated, and on click rather than on each item, so an item added or
    // swapped in later (htmx re-rendering a row) needs no re-binding.
    this.#list.addEventListener("click", e => {
      if (e.target.closest(MENU_ITEM_SELECTOR)) this.close({ restoreFocus: false });
    });
    this.#onOutside = e => {
      if (!this.contains(e.target)) this.close({ restoreFocus: false });
    };
  }

  disconnectedCallback() {
    this.#unwatch();
    if (this.#onOutside) document.removeEventListener("pointerdown", this.#onOutside, true);
  }

  #allItems() {
    return [...this.#list.querySelectorAll(MENU_ITEM_SELECTOR)];
  }

  /** The items arrow keys move between: everything the user can actually act on. */
  #items() {
    return this.#allItems()
      .filter(el => !el.disabled && el.getAttribute("aria-disabled") !== "true");
  }

  get open() { return this.#open; }

  toggle() { this.#open ? this.close() : this.show(); }

  /** Open the menu. `focus` is "first", "last" or null for no focus move. */
  show(focus = null) {
    if (this.#open) return;
    this.#open = true;
    this.#list.dataset.ltOpen = "";
    if (this.#native) this.#list.showPopover();
    else {
      this.#list.hidden = false;
      document.addEventListener("pointerdown", this.#onOutside, true);
    }
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#place();
    this.#watch();
    if (focus) this.#focusItem(focus === "last" ? this.#items().length - 1 : 0);
    this.dispatchEvent(new CustomEvent("lt-menu-open", { bubbles: true }));
  }

  close({ restoreFocus = true } = {}) {
    if (!this.#open) return;
    // hidePopover fires toggle, which routes back through #afterClose; doing
    // the teardown in one place keeps a light dismiss and an Escape identical
    if (this.#native) this.#list.hidePopover();
    this.#afterClose();
    if (restoreFocus && this.#trigger.isConnected) this.#trigger.focus();
  }

  #afterClose() {
    if (!this.#open) return;
    this.#open = false;
    delete this.#list.dataset.ltOpen;
    if (!this.#native) {
      this.#list.hidden = true;
      document.removeEventListener("pointerdown", this.#onOutside, true);
    }
    this.#trigger.setAttribute("aria-expanded", "false");
    this.#unwatch();
    this.dispatchEvent(new CustomEvent("lt-menu-close", { bubbles: true }));
  }

  /* --- placement ---------------------------------------------------------- */

  #place() {
    if (!this.#open) return;
    placeFloating(this, this.#trigger, this.#list, {
      alignStart: (this.getAttribute("align") || "end") === "start",
    });
  }

  /* A fixed panel does not travel with the row it belongs to, so anything that
     moves the trigger has to move the menu. Capture phase, because the scroll
     that matters is usually the table wrapper's, not the document's. */
  #watch() {
    if (this.#reposition) return;
    this.#reposition = () => this.#place();
    window.addEventListener("scroll", this.#reposition, true);
    window.addEventListener("resize", this.#reposition);
  }

  #unwatch() {
    if (!this.#reposition) return;
    window.removeEventListener("scroll", this.#reposition, true);
    window.removeEventListener("resize", this.#reposition);
    this.#reposition = null;
  }

  /* --- keyboard ----------------------------------------------------------- */

  #focusItem(index) {
    const items = this.#items();
    if (!items.length) return;
    const i = (index + items.length) % items.length;
    items[i].focus();
  }

  #currentIndex() {
    return this.#items().indexOf(document.activeElement);
  }

  #onTriggerKey(e) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      this.show("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      this.show("last");
    }
  }

  #onMenuKey(e) {
    const i = this.#currentIndex();
    if (e.key === "ArrowDown") { e.preventDefault(); this.#focusItem(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); this.#focusItem(i - 1); }
    else if (e.key === "Home") { e.preventDefault(); this.#focusItem(0); }
    else if (e.key === "End") { e.preventDefault(); this.#focusItem(this.#items().length - 1); }
    else if (e.key === "Escape") { e.preventDefault(); this.close(); }
    else if (e.key === "Tab") { this.close({ restoreFocus: false }); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // APG type-ahead: successive characters within a second extend the
      // search, so "de" finds Delete rather than stopping at Default.
      const now = Date.now();
      this.#typed = now - this.#typedAt > 1000 ? e.key : this.#typed + e.key;
      this.#typedAt = now;
      const needle = this.#typed.toLowerCase();
      const items = this.#items();
      const from = i < 0 ? 0 : i;
      for (let n = 1; n <= items.length; n += 1) {
        const candidate = items[(from + n) % items.length];
        if (candidate.textContent.trim().toLowerCase().startsWith(needle)) {
          e.preventDefault();
          candidate.focus();
          return;
        }
      }
    }
  }
}
define("lt-menu", LtMenu);


/* -----------------------------------------------------------------------------
   <lt-status-select>

   The chip combobox: a picker whose closed face and option list render real
   status chips — glyph + colour + word, the Linear/GitHub status-picker
   pattern. Follows the ARIA Authoring Practices Guide select-only combobox:
   focus stays on the face, the options are reached through
   aria-activedescendant, and the arrow keys clamp at the ends rather than
   wrapping, exactly as a native select does.

   WHY IT IS A SYSTEM COMPONENT (decided 2026-07-28, from the first
   consumer's rating matrices): a native select cannot render markup in its
   face or options, and the moment the face is custom the full combobox
   keyboard contract comes with it — which is the same reason lt-menu exists.
   The consumer's interim (a plain select with a status-accent glyph overlaid
   on the face, state on a data-rating attribute) is what this replaces. A
   full-face badge tint was tried there and REJECTED as too loud; the face
   stays a plain field control and the chip inside it carries the colour.

   THE MARKUP IS THE API, same bargain as lt-menu. Author a real, labelled
   <select class="lt-select">; each option names its chip on data attributes:

     <lt-status-select>
       <select class="lt-select" name="rating" aria-label="Rating for P steels">
         <option value="">— not yet ruled —</option>
         <option value="ideal" data-glyph="lt-ic-check" data-variant="success">Ideal</option>
         <option value="capable" data-glyph="lt-ic-tilde" data-variant="info">Capable</option>
       </select>
     </lt-status-select>

   data-glyph is a sprite symbol id (inline the sprite once per page, as for
   any badge); data-variant is a badge variant (danger | warning | success |
   info | neutral, default neutral). An option with no data-glyph renders as
   plain text — which is how an unset "— not yet ruled —" placeholder stays
   visibly different from a rated value.

   TAXONOMY OPTIONS: data-swatch instead of data-glyph, added 2026-07-29 for
   the Evolute tool-manager's ISO 513 pickers. The option renders a .lt-swatch
   with the code in it, then the label:

     <option value="P" data-swatch="iso-p">Steel</option>      ->  [P] Steel

   data-swatch NAMES A MODIFIER, exactly as data-variant does — "iso-p" means
   .lt-swatch--iso-p — so a colour never reaches app markup and an app cannot
   invent an uncertified fill from a picker. data-code is what goes inside the
   box and DEFAULTS TO THE OPTION'S VALUE, so most options need no such
   attribute; set it only where the posted value is not the code the trade
   prints (an id of 12 whose code is P2.1). An option with neither data-glyph
   nor data-swatch is still plain text, so the unset placeholder is unchanged.

   PUT THE NAME IN THE OPTION TEXT, NOT THE CODE — "Steel", not "P — Steel".
   The swatch already carries the code, so a label that repeats it renders
   [P] P — Steel. The cost is on the light-DOM fallback, where an un-upgraded
   native select shows "Steel" with no letter; the eight material-group names
   are mutually unambiguous, so that reads fine, and it is the author's call
   either way.

   WHY THIS IS A HATCH ON THIS ELEMENT AND NOT A SIBLING <lt-swatch-select>,
   decided 2026-07-29 by Scott Moyse after the consumer proposed the sibling:
   the entire difference between a status picker and a taxonomy picker is what
   #chip() puts inside one span. The APG select-only-combobox contract — focus
   staying on the face, aria-activedescendant, type-ahead, arrow keys clamping
   at the ends, popover placement, light dismiss — is identical, and it is the
   single worst thing in this file to keep two copies of. The name is broader
   than "status" already: the CSS block calls it the chip combobox.

   THE SELECT STAYS IN THE PAGE as the posted form value: hidden, but still
   submitting, so hidden sibling fields (a reason that must ride along with
   every save) keep riding along, and a change commits back through a real
   bubbling `change` event on the real select — an onchange attribute or an
   htmx trigger the app already has fires exactly as it would natively. The
   element also mirrors the current value onto its own data-value attribute
   for app CSS, replacing the interim's data-rating.

   Attributes  list-id   fixes the generated listbox id
   Properties  value (proxies the select), open
   Methods     show(), close(), toggle()
   Events      lt-change { value }, plus the native change on the inner select

   Keyboard, per the APG select-only combobox pattern
     closed   Enter / Space / Down / Up open at the current value,
              Home / End open at the first / last option, a printable
              character opens and jumps
     open     Down / Up move (no wrap), Home / End jump, type-ahead jumps,
              Enter / Space commit and close, Tab commits and lets focus
              move on, Escape closes without committing

   Without the script the markup is a labelled native select that posts the
   same name and value. It has no chips; it loses nothing else.
   -------------------------------------------------------------------------- */

const BADGE_VARIANTS = new Set(["danger", "warning", "success", "info", "neutral"]);
// A swatch modifier is open-ended — the system grows palettes without this file
// changing — so it is validated by SHAPE rather than against a list, the one
// thing data-variant does not have to worry about. It lands in a class
// attribute, so anything that is not a plain modifier name is dropped and the
// swatch falls back to its neutral surface.
const SWATCH_MODIFIER = /^[a-z][a-z0-9-]*$/;

class LtStatusSelect extends HTMLElement {
  #select = null;
  #face = null;
  #value = null;
  #current = null;
  #list = null;
  #options = [];     // [{ el, value, label, glyph, variant, disabled }]
  #native = false;   // true when the browser has the popover API
  #open = false;
  #activeIndex = -1;
  #typed = "";
  #typedAt = 0;
  #reposition = null;
  #onOutside = null;

  connectedCallback() {
    if (this.#face) return;
    this.#select = this.querySelector("select");
    if (!this.#select) return;   // nothing to upgrade
    const id = this.getAttribute("list-id")
      || `lt-ss-${Math.random().toString(36).slice(2, 9)}`;

    // The native select stays in the page as the posted form value; the face
    // replaces it for eyes and keyboard. hidden keeps it submitting, and
    // aria-hidden + tabindex keep it out of the accessibility tree so the
    // combobox is not announced twice.
    this.#select.hidden = true;
    this.#select.tabIndex = -1;
    this.#select.setAttribute("aria-hidden", "true");

    this.#list = document.createElement("div");
    // lt-panel is load-bearing: the list floats free of its row, so it needs
    // a surface context of its own. Full record on .lt-menu__list.
    this.#list.className = "lt-status-select__list lt-panel";
    this.#list.id = id;
    this.#list.setAttribute("role", "listbox");

    this.#face = document.createElement("button");
    this.#face.type = "button";
    this.#face.className = "lt-status-select__face";
    this.#face.setAttribute("role", "combobox");
    this.#face.setAttribute("aria-haspopup", "listbox");
    this.#face.setAttribute("aria-expanded", "false");
    this.#face.setAttribute("aria-controls", id);
    if (this.#select.disabled) this.#face.disabled = true;

    // Name the face the way the select was named. An aria-label copies
    // across; a <label for> is pointed at the face instead, and its click is
    // re-wired because a label cannot focus a hidden control.
    const label = this.#select.getAttribute("aria-label");
    if (label) {
      this.#face.setAttribute("aria-label", label);
      this.#list.setAttribute("aria-label", label);
    } else if (this.#select.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(this.#select.id)}"]`);
      if (lab) {
        if (!lab.id) lab.id = `${id}-label`;
        this.#face.setAttribute("aria-labelledby", lab.id);
        this.#list.setAttribute("aria-labelledby", lab.id);
        lab.addEventListener("click", () => this.#face.focus());
      }
    }

    // The VALIDITY state moves across too, and for a long time it did not.
    // The select is hidden and aria-hidden, so an aria-invalid the server put
    // on it is announced to nobody and paints nothing: the invalid ring in
    // lt-components.css keys off .lt-select, which is the element that is no
    // longer on screen. A field could be marked invalid, correctly, and the
    // combobox that replaced it would look and sound perfectly fine. Found
    // 2026-07-29 while wiring the first consumer's error chips, where two of
    // its fifteen invalid fields were exactly this shape.
    //
    // Copied at upgrade, not observed. Every server-rendered consumer replaces
    // the whole panel to show an error (htmx swaps, a form re-render), which
    // destroys this element and upgrades a fresh one, so there is nothing for
    // an observer to catch that this does not. An app that flips the attribute
    // in place on a live element calls setInvalid() instead.
    if (this.#select.getAttribute("aria-invalid") === "true") {
      this.#face.setAttribute("aria-invalid", "true");
    }
    const describedBy = this.#select.getAttribute("aria-describedby");
    if (describedBy) this.#face.setAttribute("aria-describedby", describedBy);

    this.#value = document.createElement("span");
    this.#value.className = "lt-status-select__value";
    this.#face.appendChild(this.#value);
    // The live chip. It shares a grid cell with one hidden ghost per option,
    // appended below, so the face reserves the width of its WIDEST option
    // instead of the one currently showing — see the note in lt-components.css.
    this.#current = document.createElement("span");
    this.#current.className = "lt-status-select__current";
    this.#value.appendChild(this.#current);

    this.#options = [...this.#select.options].map((o, i) => {
      const opt = {
        value: o.value,
        label: o.textContent.trim(),
        glyph: o.dataset.glyph || "",
        variant: o.dataset.variant || "neutral",
        swatch: o.dataset.swatch || "",
        // the box is never empty (see .lt-swatch), so the code falls back to
        // the option's value rather than rendering a bare colour
        code: o.dataset.code || o.value,
        disabled: o.disabled,
        el: document.createElement("div"),
      };
      opt.el.className = "lt-status-select__option";
      opt.el.id = `${id}-opt-${i}`;
      opt.el.setAttribute("role", "option");
      // a disabled option keeps its role and stays visible, same reasoning
      // as lt-menu: a list that silently shortens reads as a shorter list
      if (opt.disabled) opt.el.setAttribute("aria-disabled", "true");
      opt.el.replaceChildren(this.#chip(opt));
      this.#list.appendChild(opt.el);
      return opt;
    });

    // one hidden ghost per option, stacked in the live chip's grid cell, so the
    // browser resolves the face to the widest option. Rebuilt nowhere else:
    // the option set is read once, exactly like #options above.
    this.#options.forEach(o => {
      const ghost = document.createElement("span");
      ghost.setAttribute("data-ghost", "");
      ghost.setAttribute("aria-hidden", "true");
      ghost.appendChild(this.#chip(o));
      this.#value.appendChild(ghost);
    });

    this.appendChild(this.#face);
    this.appendChild(this.#list);

    // Popover gives the top layer and light dismiss for free; without it the
    // list is still a fixed panel and dismissal is wired by hand. Same
    // mechanism, and the same contract, as lt-menu.
    this.#native = typeof this.#list.showPopover === "function";
    if (this.#native) {
      this.#list.setAttribute("popover", "auto");
      this.#list.addEventListener("toggle", e => {
        if (e.newState === "closed" && this.#open) this.#afterClose();
      });
    } else {
      this.#list.hidden = true;
    }

    this.#face.addEventListener("click", () => this.toggle());
    this.#face.addEventListener("keydown", e => this.#onKey(e));
    // an option is not focusable, so the press must not blur the face
    this.#list.addEventListener("pointerdown", e => e.preventDefault());
    this.#list.addEventListener("click", e => {
      const el = e.target.closest(".lt-status-select__option");
      if (el) this.#commit(this.#options.findIndex(o => o.el === el));
    });
    this.#onOutside = e => {
      if (!this.contains(e.target)) this.close({ restoreFocus: false });
    };

    // the app may still write to the select directly (a swap-back render, a
    // form reset); reflect any change that did not come from here
    this.#select.addEventListener("change", () => this.#renderFace());

    this.#renderFace();
  }

  disconnectedCallback() {
    this.#unwatch();
    if (this.#onOutside) document.removeEventListener("pointerdown", this.#onOutside, true);
  }

  /* --- rendering ---------------------------------------------------------- */

  /** The chip for one option, as NODES: a real badge when a glyph is named, a
      swatch when a palette entry is named, otherwise the bare label, which is
      what keeps unset visibly different from rated.

      BUILT WITH createElement AND textContent, NEVER A MARKUP STRING. Fixed
      2026-07-29 after the Evolute tool-manager's ISO pickers became the first
      caller to feed this element user-authored text. The option's label and
      code are read back out of the DOM as TEXT (o.textContent, o.dataset),
      which DECODES whatever the server escaped; interpolating that into a
      string and assigning it with innerHTML re-parsed it as markup, so a
      correctly escaped `&lt;img src=x onerror=...&gt;` became a live element.
      Server-side escaping cannot defend against this — the round trip through
      textContent is what undoes it — so the fix has to be here.

      Do not "simplify" this back into a template literal. The rule for this
      file: anything that originates in a <select> the app authored is data,
      and data goes in through textContent. */
  #chip(opt) {
    const frag = document.createDocumentFragment();

    // A taxonomy option: the swatch carries the code, the label follows it as a
    // sibling so the option's accessible name reads "P Steel". The swatch is
    // never empty, which is why code falls back to the option's value.
    if (opt.swatch) {
      const box = document.createElement("span");
      box.className = "lt-swatch"
        + (SWATCH_MODIFIER.test(opt.swatch) ? ` lt-swatch--${opt.swatch}` : "");
      box.textContent = opt.code;
      frag.append(box, document.createTextNode(opt.label));
      return frag;
    }

    if (!opt.glyph) {
      frag.append(document.createTextNode(opt.label));
      return frag;
    }

    const variant = BADGE_VARIANTS.has(opt.variant) ? opt.variant : "neutral";
    const badge = document.createElement("span");
    badge.className = `lt-badge lt-badge--${variant}`;
    // createElementNS, not createElement: an <svg> built in the HTML namespace
    // is inert and paints nothing. The sprite id lands through setAttribute,
    // where it is an attribute value rather than markup.
    const NS = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const use = document.createElementNS(NS, "use");
    use.setAttribute("href", `#${opt.glyph}`);
    svg.appendChild(use);
    badge.append(svg, document.createTextNode(opt.label));
    frag.append(badge);
    return frag;
  }

  #renderFace() {
    const i = this.#select.selectedIndex;
    const opt = i >= 0 ? this.#options[i] : null;
    this.#current.replaceChildren(...(opt ? [this.#chip(opt)] : []));
    // state on the host, for app CSS; replaces the interim's data-rating
    this.dataset.value = this.#select.value;
    this.#options.forEach((o, n) => o.el.setAttribute("aria-selected", String(n === i)));
  }

  /* --- public API --------------------------------------------------------- */

  get value() { return this.#select ? this.#select.value : ""; }
  /** Programmatic writes render but do not fire change, same as a native select. */
  set value(v) {
    if (!this.#select) return;
    this.#select.value = v;
    this.#renderFace();
  }

  get open() { return this.#open; }

  /**
   * Mark the combobox invalid, or clear it. Sets the attribute on BOTH the
   * hidden select (which is what a form and a server round trip read) and the
   * face (which is what a user sees and hears), because splitting those two is
   * the defect this pairing exists to prevent. Use it when an app flips
   * validity on a live element rather than re-rendering the panel.
   */
  setInvalid(invalid = true) {
    for (const el of [this.#select, this.#face]) {
      if (!el) continue;
      if (invalid) el.setAttribute("aria-invalid", "true");
      else el.removeAttribute("aria-invalid");
    }
  }

  toggle() { this.#open ? this.close() : this.show(); }

  show() {
    if (this.#open || this.#face.disabled) return;
    this.#open = true;
    this.#list.dataset.ltOpen = "";
    if (this.#native) this.#list.showPopover();
    else {
      this.#list.hidden = false;
      document.addEventListener("pointerdown", this.#onOutside, true);
    }
    this.#face.setAttribute("aria-expanded", "true");
    this.#place();
    this.#watch();
    this.#setActive(Math.max(0, this.#select.selectedIndex));
  }

  close({ restoreFocus = true } = {}) {
    if (!this.#open) return;
    if (this.#native) this.#list.hidePopover();
    this.#afterClose();
    if (restoreFocus && this.#face.isConnected) this.#face.focus();
  }

  #afterClose() {
    if (!this.#open) return;
    this.#open = false;
    delete this.#list.dataset.ltOpen;
    if (!this.#native) {
      this.#list.hidden = true;
      document.removeEventListener("pointerdown", this.#onOutside, true);
    }
    this.#face.setAttribute("aria-expanded", "false");
    this.#setActive(-1);
    this.#unwatch();
  }

  /* --- placement ---------------------------------------------------------- */

  #place() {
    if (!this.#open) return;
    // start-aligned and at least face-width, so the open list reads as the
    // same control as the face it fell out of, the way a native select does
    placeFloating(this, this.#face, this.#list, { alignStart: true, matchInlineSize: true });
  }

  #watch() {
    if (this.#reposition) return;
    this.#reposition = () => this.#place();
    window.addEventListener("scroll", this.#reposition, true);
    window.addEventListener("resize", this.#reposition);
  }

  #unwatch() {
    if (!this.#reposition) return;
    window.removeEventListener("scroll", this.#reposition, true);
    window.removeEventListener("resize", this.#reposition);
    this.#reposition = null;
  }

  /* --- selection ---------------------------------------------------------- */

  #setActive(index) {
    this.#activeIndex = index;
    this.#options.forEach((o, n) => {
      if (n === index) o.el.dataset.ltActive = "";
      else delete o.el.dataset.ltActive;
    });
    const active = this.#options[index];
    if (active) {
      this.#face.setAttribute("aria-activedescendant", active.el.id);
      if (active.el.scrollIntoView) active.el.scrollIntoView({ block: "nearest" });
    } else {
      this.#face.removeAttribute("aria-activedescendant");
    }
  }

  #commit(index, { restoreFocus = true } = {}) {
    const opt = this.#options[index];
    if (opt && opt.disabled) return;   // stays open, like a native select
    this.close({ restoreFocus });
    if (!opt || opt.value === this.#select.value) return;
    this.#select.value = opt.value;
    this.#renderFace();
    // a real change event from the real select, so form wiring the app
    // already has (an onchange attribute, an htmx trigger) fires exactly as
    // it would for the native control
    this.#select.dispatchEvent(new Event("change", { bubbles: true }));
    this.dispatchEvent(new CustomEvent("lt-change", {
      bubbles: true, detail: { value: opt.value },
    }));
  }

  /* --- keyboard ------------------------------------------------------------ */

  #typeahead(ch) {
    // APG type-ahead, same clock as lt-menu: successive characters within a
    // second extend the search, so "no" finds "Not suitable" past "None".
    const now = Date.now();
    this.#typed = now - this.#typedAt > 1000 ? ch : this.#typed + ch;
    this.#typedAt = now;
    const needle = this.#typed.toLowerCase();
    const from = this.#activeIndex < 0 ? 0 : this.#activeIndex;
    for (let n = 1; n <= this.#options.length; n += 1) {
      const idx = (from + n) % this.#options.length;
      // Match what the option SHOWS, not just its label. A swatch option puts
      // its code in the box and the name beside it, so "P — Steel" reads as
      // [P] Steel and a machinist types P. Matching the label alone sent that
      // keypress nowhere, which is what the first consumer's ISO pickers hit
      // when they moved the code out of the option text (2026-07-29). The code
      // is tried first because it is the thing a taxonomy is keyed by.
      const opt = this.#options[idx];
      const hay = opt.swatch ? [opt.code, opt.label] : [opt.label];
      if (hay.some(s => String(s).toLowerCase().startsWith(needle))) {
        this.#setActive(idx);
        return;
      }
    }
  }

  #onKey(e) {
    const last = this.#options.length - 1;
    if (!this.#open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        this.show();
      } else if (e.key === "Home") {
        e.preventDefault(); this.show(); this.#setActive(0);
      } else if (e.key === "End") {
        e.preventDefault(); this.show(); this.#setActive(last);
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        this.show();
        this.#typeahead(e.key);
      }
      return;
    }
    // arrows CLAMP rather than wrap: the select-only combobox pattern, and
    // what a native select does — Down at the bottom must not teleport a
    // rating back to the top of the vocabulary
    if (e.key === "ArrowDown") { e.preventDefault(); this.#setActive(Math.min(this.#activeIndex + 1, last)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); this.#setActive(Math.max(this.#activeIndex - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); this.#setActive(0); }
    else if (e.key === "End") { e.preventDefault(); this.#setActive(last); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.#commit(this.#activeIndex); }
    else if (e.key === "Escape") { e.preventDefault(); this.close(); }
    else if (e.key === "Tab") { this.#commit(this.#activeIndex, { restoreFocus: false }); }
    else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.#typeahead(e.key);
    }
  }
}
define("lt-status-select", LtStatusSelect);


/* -----------------------------------------------------------------------------
   <lt-filter>

   The catalogue filter: a bar carrying quick filters, search and one trigger
   per facet; applied filters as removable chips below it; facet bodies that
   open as popovers on a wide component and as one bottom sheet on a narrow
   one. Built 2026-08-10 from Scott Moyse's mockup, which is the spec; the
   layout decisions and their reasoning are recorded in lt-components.css.

   ONE SERIALISABLE STATE OBJECT IS THE POINT:

       { quick, q, facets: { key: [values] }, range: { key: { min, max } } }

   Every control writes to it and no control reads any other control, so saved
   views, URL persistence, grouping and any later natural-language layer all
   reduce to reading and writing this. Read it with .state, replace it with
   .state = {...}, and listen for lt-filter-change.

   SCHEMA-DRIVEN, WHICH IS A DEPARTURE FROM lt-menu AND lt-status-select, and
   the trade is worth stating rather than discovering. Those two upgrade markup
   a template already rendered, so they degrade to a working control with the
   script gone. A facet schema is an array of objects, which no template engine
   can put in an attribute, so this element is configured with properties and
   its authored markup is empty - there is nothing to degrade TO.

   That is why the CSS half stands alone. A server-rendered consumer that needs
   its filters to work with no JS does NOT use this element: it renders its own
   markup with the same .lt-filter classes, its quick items as real anchors
   carrying href and aria-current, and lets the server filter. Ctrl-click, a
   copied URL and a no-JS page load all keep working, because the anchor is the
   mechanism rather than a fallback. This element is for the client-driven
   case, where the page already holds the rows.

   THE QUICK STRIP HAS NO ROVING TABINDEX AND NO ARROW KEYS, deliberately.
   Every mutually-exclusive-row pattern in the APG (tabs, radio group) moves
   selection WITH focus, and that is correct when selecting is free - lt-tabs
   says so in as many words, because its panels are already in the DOM. Here
   selecting refetches, so an arrow sweep across five quick filters would fire
   five requests. Plain Tab between plain buttons, aria-current on the active
   one, nothing clever.

   Properties
     schema   { quick: [{id,label}], facets: [{key,label,type,values,...}] }
              facet types: checkbox | swatch | range
     state    the object above; assigning replaces it and repaints
     count    optional (key, value, state) => number, for the per-value counts.
              Omit it and the counts are omitted, rather than shown as zero.
     results  optional { shown, total }, for the summary line and the sheet's
              apply button
   Methods    clear()
   Events     lt-filter-change { state }
   -------------------------------------------------------------------------- */

const SVG_NS = "http://www.w3.org/2000/svg";

/** An <svg><use> referencing a sprite symbol, built as nodes. */
function spriteIcon(id, cls = "lt-icon") {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", cls);
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const use = document.createElementNS(SVG_NS, "use");
  use.setAttribute("href", `#${id}`);
  svg.appendChild(use);
  return svg;
}

function emptyFilterState() {
  return { quick: null, q: "", facets: {}, range: {} };
}

class LtFilter extends HTMLElement {
  #schema = { quick: [], facets: [] };
  #state = emptyFilterState();
  #count = null;
  #results = null;
  #els = {};
  #openKey = null;
  #reposition = null;
  #onOutside = null;
  #nativePop = false;

  connectedCallback() {
    if (this.#els.bar) return;
    this.#build();
    this.render();
  }

  disconnectedCallback() {
    this.#unwatch();
    if (this.#onOutside) document.removeEventListener("pointerdown", this.#onOutside, true);
  }

  /* --- public API --------------------------------------------------------- */

  get schema() { return this.#schema; }
  set schema(s) {
    this.#schema = { quick: [], facets: [], ...(s || {}) };
    for (const f of this.#schema.facets) {
      if (f.type === "range") this.#state.range[f.key] ??= { min: null, max: null };
      else this.#state.facets[f.key] ??= [];
    }
    if (this.#state.quick === null && this.#schema.quick.length) {
      this.#state.quick = this.#schema.quick[0].id;
    }
    if (this.#els.bar) this.render();
  }

  get state() { return this.#state; }
  set state(s) {
    this.#state = { ...emptyFilterState(), ...(s || {}) };
    if (this.#els.bar) this.render();
  }

  set count(fn) { this.#count = typeof fn === "function" ? fn : null; if (this.#els.bar) this.render(); }
  set results(r) { this.#results = r; if (this.#els.bar) this.#paintSummary(); }

  clear() {
    this.#state.q = "";
    for (const key of Object.keys(this.#state.facets)) this.#state.facets[key] = [];
    for (const key of Object.keys(this.#state.range)) this.#state.range[key] = { min: null, max: null };
    if (this.#els.search) this.#els.search.value = "";
    this.render();
    this.#emit();
    announce("All filters cleared.");
  }

  /* --- shell -------------------------------------------------------------- */

  #build() {
    const id = this.id || `lt-filter-${Math.random().toString(36).slice(2, 9)}`;
    this.classList.add("lt-filter");

    const quick = document.createElement("div");
    quick.className = "lt-filter__quick";
    quick.setAttribute("role", "group");
    quick.setAttribute("aria-label", this.getAttribute("quick-label") || "Quick filters");

    const bar = document.createElement("div");
    bar.className = "lt-filter__bar";

    const field = document.createElement("div");
    field.className = "lt-field lt-filter__search";
    const label = document.createElement("label");
    label.className = "lt-field__label lt-sr-only";
    label.setAttribute("for", `${id}-q`);
    label.textContent = this.getAttribute("search-label") || "Search";
    const group = document.createElement("div");
    group.className = "lt-input-group";
    const affix = document.createElement("span");
    affix.className = "lt-affix";
    affix.appendChild(spriteIcon("lt-ic-search", "lt-icon"));
    const search = document.createElement("input");
    search.className = "lt-input";
    search.id = `${id}-q`;
    search.type = "search";
    search.autocomplete = "off";
    search.placeholder = this.getAttribute("search-placeholder") || "Search…";
    group.append(affix, search);
    field.append(label, group);

    const triggers = document.createElement("div");
    triggers.className = "lt-filter__triggers";

    const spacer = document.createElement("span");
    spacer.className = "lt-filter__spacer";

    const all = document.createElement("button");
    all.type = "button";
    all.className = "lt-btn lt-btn--secondary lt-filter__all lt-filter__trigger";
    all.append(spriteIcon("lt-ic-filter"), document.createTextNode("All filters"));

    bar.append(field, triggers, spacer, all);

    const chips = document.createElement("div");
    chips.className = "lt-filter__chips";

    const summary = document.createElement("p");
    summary.className = "lt-filter__summary";
    summary.setAttribute("role", "status");

    const pop = document.createElement("div");
    pop.className = "lt-filter__pop lt-panel";
    this.#nativePop = typeof pop.showPopover === "function";
    if (this.#nativePop) {
      pop.setAttribute("popover", "auto");
      pop.addEventListener("toggle", e => {
        if (e.newState === "closed" && this.#openKey) this.#afterPopClose();
      });
    } else {
      pop.hidden = true;
    }

    const sheet = document.createElement("dialog");
    sheet.className = "lt-filter__sheet lt-panel";
    const head = document.createElement("div");
    head.className = "lt-filter__sheethead";
    const title = document.createElement("span");
    title.className = "lt-filter__sheettitle";
    title.textContent = "Filters";
    const headSpacer = document.createElement("span");
    headSpacer.className = "lt-filter__spacer";
    const sheetClear = document.createElement("button");
    sheetClear.type = "button";
    sheetClear.className = "lt-btn lt-btn--ghost";
    sheetClear.dataset.ltAct = "clear";
    sheetClear.textContent = "Clear all";
    const sheetClose = document.createElement("button");
    sheetClose.type = "button";
    sheetClose.className = "lt-btn lt-btn--secondary lt-btn--icon";
    sheetClose.dataset.ltAct = "close-sheet";
    // showModal focuses the first focusable descendant, which is Clear all -
    // so a user who opens the sheet and hits Enter reflexively wipes every
    // filter they just set. Autofocus moves that to the least destructive
    // control in the header.
    sheetClose.autofocus = true;
    sheetClose.setAttribute("aria-label", "Close filters");
    sheetClose.appendChild(spriteIcon("lt-ic-close"));
    head.append(title, headSpacer, sheetClear, sheetClose);

    const body = document.createElement("div");
    body.className = "lt-filter__sheetbody";
    const foot = document.createElement("div");
    foot.className = "lt-filter__sheetfoot";
    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "lt-btn lt-btn--primary lt-btn--full lt-btn--lg";
    apply.dataset.ltAct = "close-sheet";
    foot.appendChild(apply);
    sheet.append(head, body, foot);
    // Escape fires cancel on a native dialog; let it close, then repaint.
    sheet.addEventListener("close", () => this.render());

    this.append(quick, bar, chips, summary, pop, sheet);
    this.#els = { quick, bar, field, search, triggers, all, chips, summary,
                  pop, sheet, sheetBody: body, apply };

    this.addEventListener("click", e => this.#onClick(e));
    this.addEventListener("input", e => this.#onInput(e));
    this.addEventListener("change", e => this.#onChange(e));
    this.#onOutside = e => { if (!this.contains(e.target)) this.#closePop(); };
  }

  /* --- derived ------------------------------------------------------------ */

  #facet(key) { return this.#schema.facets.find(f => f.key === key); }

  /** Normalise a facet's values to { value, label, swatch, code }. */
  #values(facet) {
    return (facet.values || []).map(v =>
      (v && typeof v === "object") ? v : { value: v, label: String(v) });
  }

  #activeCount(facet) {
    if (facet.type === "range") {
      const r = this.#state.range[facet.key] || {};
      return (r.min != null || r.max != null) ? 1 : 0;
    }
    return (this.#state.facets[facet.key] || []).length;
  }

  /** Applied filters, derived from state and never stored separately. */
  #chipList() {
    const out = [];
    for (const facet of this.#schema.facets) {
      if (facet.type === "range") {
        const r = this.#state.range[facet.key] || {};
        if (r.min == null && r.max == null) continue;
        const u = facet.unit ? ` ${facet.unit}` : "";
        const text = r.min != null && r.max != null ? `${r.min}\u2013${r.max}${u}`
          : r.min != null ? `${r.min}${u} and over`
          : `up to ${r.max}${u}`;
        out.push({ kind: "range", key: facet.key, label: facet.label, text });
        continue;
      }
      const picked = this.#state.facets[facet.key] || [];
      for (const v of picked) {
        const entry = this.#values(facet).find(o => o.value === v);
        out.push({ kind: "facet", key: facet.key, value: v, label: facet.label,
                   text: entry ? entry.label : String(v) });
      }
    }
    if (this.#state.q) {
      out.push({ kind: "q", key: "q", label: "Search", text: this.#state.q });
    }
    return out;
  }

  /* --- painting ----------------------------------------------------------- */

  render() {
    this.#paintQuick();
    this.#paintTriggers();
    this.#paintChips();
    this.#paintSummary();
    if (this.#openKey) this.#fillPop();
    if (this.#els.sheet.open) this.#fillSheet();
  }

  #paintQuick() {
    const { quick } = this.#els;
    quick.replaceChildren();
    quick.hidden = !this.#schema.quick.length;
    for (const q of this.#schema.quick) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lt-filter__quickitem";
      b.dataset.ltQuick = q.id;
      if (this.#state.quick === q.id) b.setAttribute("aria-current", "true");
      b.textContent = q.label;
      quick.appendChild(b);
    }
  }

  #paintTriggers() {
    const { triggers } = this.#els;
    triggers.replaceChildren();
    for (const facet of this.#schema.facets) {
      const n = this.#activeCount(facet);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lt-btn lt-btn--secondary lt-filter__trigger";
      b.dataset.ltFacet = facet.key;
      b.setAttribute("aria-expanded", "false");
      if (n) b.dataset.ltActive = "";
      b.appendChild(document.createTextNode(facet.label));
      if (n) {
        const pip = document.createElement("span");
        pip.className = "lt-filter__pip";
        pip.textContent = String(n);
        b.appendChild(pip);
      }
      b.appendChild(spriteIcon("lt-ic-chevron-down"));
      triggers.appendChild(b);
    }
  }

  #paintChips() {
    const { chips } = this.#els;
    chips.replaceChildren();
    const list = this.#chipList();
    list.forEach((c, i) => {
      const chip = document.createElement("span");
      chip.className = "lt-chip";
      const key = document.createElement("span");
      key.className = "lt-chip__key";
      key.textContent = c.label;
      const val = document.createElement("span");
      val.className = "lt-chip__value";
      // TEXT, never a markup string: a search chip is whatever the user typed,
      // and building it as HTML is the door closed in toast() and
      // lt-status-select on 2026-07-29.
      val.textContent = c.text;
      const x = document.createElement("button");
      x.type = "button";
      x.className = "lt-chip__remove";
      x.dataset.ltChip = String(i);
      x.setAttribute("aria-label", `Remove filter ${c.label} ${c.text}`);
      x.appendChild(spriteIcon("lt-ic-close"));
      chip.append(key, val, x);
      chips.appendChild(chip);
    });
    if (list.length) {
      const clear = document.createElement("button");
      clear.type = "button";
      clear.className = "lt-btn lt-btn--ghost";
      clear.dataset.ltAct = "clear";
      clear.textContent = "Clear all";
      chips.appendChild(clear);
    }
  }

  #paintSummary() {
    const { summary, apply } = this.#els;
    const active = this.#chipList().length;
    summary.replaceChildren();
    if (this.#results) {
      const strong = document.createElement("strong");
      strong.textContent = String(this.#results.shown);
      summary.append(strong,
        document.createTextNode(` of ${this.#results.total}`));
    }
    if (active) {
      summary.append(document.createTextNode(
        `${this.#results ? ", " : ""}${active} filter${active === 1 ? "" : "s"} applied`));
    }
    apply.textContent = this.#results
      ? `Show ${this.#results.shown} results` : "Apply filters";
  }

  /* --- facet bodies, identical in the popover and the sheet --------------- */

  #facetBody(facet) {
    const wrap = document.createElement("div");
    wrap.className = "lt-facet";
    const title = document.createElement("p");
    title.className = "lt-facet__title";
    title.textContent = facet.unit ? `${facet.label} (${facet.unit})` : facet.label;
    wrap.appendChild(title);

    if (facet.type === "range") {
      const r = this.#state.range[facet.key] || { min: null, max: null };
      const row = document.createElement("div");
      row.className = "lt-facet__range";
      for (const bound of ["min", "max"]) {
        const f = document.createElement("div");
        f.className = "lt-field";
        const lab = document.createElement("label");
        lab.className = "lt-field__label";
        lab.setAttribute("for", `${facet.key}-${bound}`);
        lab.textContent = bound === "min" ? "Minimum" : "Maximum";
        const g = document.createElement("div");
        g.className = "lt-input-group";
        const input = document.createElement("input");
        input.className = "lt-input lt-input--numeric";
        input.id = `${facet.key}-${bound}`;
        input.type = "number";
        input.inputMode = "decimal";
        if (facet.step) input.step = facet.step;
        input.dataset.ltRange = bound;
        input.dataset.ltKey = facet.key;
        input.value = r[bound] ?? "";
        g.appendChild(input);
        if (facet.unit) {
          const a = document.createElement("span");
          a.className = "lt-affix";
          a.textContent = facet.unit;
          g.appendChild(a);
        }
        f.append(lab, g);
        if (bound === "max") {
          const dash = document.createElement("span");
          dash.className = "lt-facet__dash";
          dash.setAttribute("aria-hidden", "true");
          dash.textContent = "\u2013";
          row.appendChild(dash);
        }
        row.appendChild(f);
      }
      wrap.appendChild(row);
      return wrap;
    }

    const list = document.createElement("div");
    list.className = "lt-facet__list";
    const picked = this.#state.facets[facet.key] || [];
    for (const o of this.#values(facet)) {
      const on = picked.includes(o.value);
      const n = this.#count ? this.#count(facet.key, o.value, this.#state) : null;
      const lab = document.createElement("label");
      lab.className = "lt-check";
      // dimmed, never removed - options that vanish as you tick are the
      // classic faceted-filter complaint
      if (n === 0 && !on) lab.dataset.empty = "";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = on;
      box.dataset.ltValue = String(o.value);
      box.dataset.ltKey = facet.key;
      const text = document.createElement("span");
      if (facet.type === "swatch" && o.swatch) {
        const sw = document.createElement("span");
        sw.className = `lt-swatch lt-swatch--${o.swatch}`;
        sw.textContent = o.code ?? String(o.value);
        text.append(sw, document.createTextNode(` ${o.label}`));
      } else {
        text.textContent = o.label;
      }
      lab.append(box, text);
      if (n !== null) {
        const count = document.createElement("span");
        count.className = "lt-facet__n";
        count.textContent = String(n);
        lab.appendChild(count);
      }
      list.appendChild(lab);
    }
    wrap.appendChild(list);
    return wrap;
  }

  #fillPop() {
    const facet = this.#facet(this.#openKey);
    if (facet) this.#els.pop.replaceChildren(this.#facetBody(facet));
  }

  #fillSheet() {
    this.#els.sheetBody.replaceChildren(
      ...this.#schema.facets.map(f => this.#facetBody(f)));
  }

  /* --- surfaces ----------------------------------------------------------- */

  #openPop(key, trigger) {
    this.#closePop();
    this.#openKey = key;
    this.#fillPop();
    const { pop } = this.#els;
    pop.dataset.ltOpen = "";
    if (this.#nativePop) pop.showPopover();
    else {
      pop.hidden = false;
      document.addEventListener("pointerdown", this.#onOutside, true);
    }
    trigger.setAttribute("aria-expanded", "true");
    placeFloating(this, trigger, pop, { alignStart: true });
    this.#watch(trigger);
    const first = pop.querySelector("input");
    if (first) first.focus();
  }

  #closePop() {
    if (!this.#openKey) return;
    if (this.#nativePop) this.#els.pop.hidePopover();
    this.#afterPopClose();
  }

  #afterPopClose() {
    const key = this.#openKey;
    if (!key) return;
    this.#openKey = null;
    const { pop } = this.#els;
    delete pop.dataset.ltOpen;
    if (!this.#nativePop) {
      pop.hidden = true;
      document.removeEventListener("pointerdown", this.#onOutside, true);
    }
    const t = this.#els.triggers.querySelector(`[data-lt-facet="${CSS.escape(key)}"]`);
    if (t) t.setAttribute("aria-expanded", "false");
    this.#unwatch();
  }

  #watch(trigger) {
    if (this.#reposition) return;
    this.#reposition = () => {
      if (this.#openKey) placeFloating(this, trigger, this.#els.pop, { alignStart: true });
    };
    window.addEventListener("scroll", this.#reposition, true);
    window.addEventListener("resize", this.#reposition);
  }

  #unwatch() {
    if (!this.#reposition) return;
    window.removeEventListener("scroll", this.#reposition, true);
    window.removeEventListener("resize", this.#reposition);
    this.#reposition = null;
  }

  #openSheet() {
    this.#closePop();
    this.#fillSheet();
    const { sheet } = this.#els;
    // showModal, not an open attribute: the top layer, the focus trap and
    // Escape are the reason this is a <dialog> at all.
    if (typeof sheet.showModal === "function") sheet.showModal();
    else sheet.open = true;
  }

  #closeSheet() {
    const { sheet } = this.#els;
    if (typeof sheet.close === "function") sheet.close();
    else sheet.open = false;
    if (this.#els.all.isConnected) this.#els.all.focus();
  }

  /* --- events ------------------------------------------------------------- */

  #onClick(e) {
    const quick = e.target.closest("[data-lt-quick]");
    if (quick) {
      this.#state.quick = quick.dataset.ltQuick;
      this.render();
      this.#emit();
      return;
    }
    const chipX = e.target.closest("[data-lt-chip]");
    if (chipX) { this.#removeChipAt(Number(chipX.dataset.ltChip)); return; }

    const act = e.target.closest("[data-lt-act]");
    if (act) {
      if (act.dataset.ltAct === "clear") this.clear();
      if (act.dataset.ltAct === "close-sheet") this.#closeSheet();
      return;
    }
    if (e.target.closest(".lt-filter__all")) { this.#openSheet(); return; }

    const trigger = e.target.closest("[data-lt-facet]");
    if (trigger) {
      const key = trigger.dataset.ltFacet;
      if (this.#openKey === key) this.#closePop();
      else this.#openPop(key, trigger);
    }
  }

  #onInput(e) {
    if (e.target === this.#els.search) {
      this.#state.q = e.target.value.trim();
      this.#paintChips();
      this.#paintSummary();
      this.#paintTriggers();
      this.#emit();
      return;
    }
    const bound = e.target.closest("[data-lt-range]");
    if (bound) {
      const v = bound.value === "" ? null : Number(bound.value);
      const r = this.#state.range[bound.dataset.ltKey] ||= { min: null, max: null };
      r[bound.dataset.ltRange] = Number.isFinite(v) ? v : null;
      // The bound inputs are inside the surface being repainted, so repaint
      // everything EXCEPT the open surface - otherwise the field the user is
      // typing in is replaced under the caret on every keystroke.
      this.#paintTriggers();
      this.#paintChips();
      this.#paintSummary();
      this.#emit();
    }
  }

  #onChange(e) {
    const box = e.target.closest('input[type="checkbox"][data-lt-key]');
    if (!box) return;
    const key = box.dataset.ltKey;
    const facet = this.#facet(key);
    const raw = box.dataset.ltValue;
    const entry = this.#values(facet).find(o => String(o.value) === raw);
    const value = entry ? entry.value : raw;
    const list = this.#state.facets[key] ||= [];
    const i = list.indexOf(value);
    if (i > -1) list.splice(i, 1); else list.push(value);
    this.render();
    this.#emit();
  }

  #removeChipAt(i) {
    const list = this.#chipList();
    const c = list[i];
    if (!c) return;
    if (c.kind === "q") { this.#state.q = ""; this.#els.search.value = ""; }
    else if (c.kind === "range") this.#state.range[c.key] = { min: null, max: null };
    else {
      const picked = this.#state.facets[c.key] || [];
      const at = picked.indexOf(c.value);
      if (at > -1) picked.splice(at, 1);
    }
    this.render();
    this.#emit();
    // Removing a chip destroys the focused element. Move focus deliberately:
    // the chip that took this one's place, else clear-all, else the search
    // field. Left alone the browser drops focus to the document, and a
    // keyboard user is silently returned to the top of the page.
    const removes = [...this.#els.chips.querySelectorAll(".lt-chip__remove")];
    const next = removes[Math.min(i, removes.length - 1)]
      || this.#els.chips.querySelector("[data-lt-act='clear']")
      || this.#els.search;
    if (next) next.focus();
    announce(`${c.label} ${c.text} filter removed.`);
  }

  #emit() {
    this.dispatchEvent(new CustomEvent("lt-filter-change", {
      bubbles: true, detail: { state: this.#state },
    }));
  }
}
define("lt-filter", LtFilter);


/* -----------------------------------------------------------------------------
   <lt-table>

   Adds column sorting to a plain table. The markup stays a real <table>, so it
   is readable, printable and parseable without the script.

     <lt-table>
       <table class="lt-table">
         <thead><tr>
           <th data-sort="text">Part</th>
           <th data-sort="number" class="lt-num">Diameter</th>
         </tr></thead>
         <tbody>...</tbody>
       </table>
     </lt-table>

   data-sort takes text | number | code. Numbers parse through parseNumber, so a
   column of "1,240.0" sorts numerically rather than as strings.
   -------------------------------------------------------------------------- */

class LtTable extends HTMLElement {
  connectedCallback() {
    this.table = this.querySelector("table");
    if (!this.table) return;
    this.tbody = this.table.querySelector("tbody");
    this.headers = [...this.table.querySelectorAll("th[data-sort]")];

    this.headers.forEach((th, i) => {
      const label = th.textContent.trim();
      th.innerHTML = `<button type="button" class="lt-sort">${label}` +
        `<span class="lt-sr-only" data-sr>, not sorted</span></button>`;
      th.setAttribute("aria-sort", "none");
      th.querySelector("button").addEventListener("click", () => this.sort(i));
    });
  }

  sort(index) {
    const th = this.headers[index];
    const current = th.getAttribute("aria-sort");
    const dir = current === "ascending" ? "descending" : "ascending";
    const kind = th.dataset.sort;
    const colIndex = [...th.parentElement.children].indexOf(th);

    this.headers.forEach(h => {
      h.setAttribute("aria-sort", "none");
      const sr = h.querySelector("[data-sr]");
      if (sr) sr.textContent = ", not sorted";
    });
    th.setAttribute("aria-sort", dir);
    th.querySelector("[data-sr]").textContent =
      dir === "ascending" ? ", sorted ascending" : ", sorted descending";

    const rows = [...this.tbody.rows];
    const key = row => {
      const cell = row.cells[colIndex];
      const raw = cell ? (cell.dataset.sortValue ?? cell.textContent.trim()) : "";
      return kind === "number" ? parseNumber(raw) : raw.toLowerCase();
    };

    rows.sort((a, b) => {
      const ka = key(a), kb = key(b);
      if (kind === "number") {
        const na = Number.isFinite(ka) ? ka : Infinity;   // blanks sink
        const nb = Number.isFinite(kb) ? kb : Infinity;
        return dir === "ascending" ? na - nb : nb - na;
      }
      const cmp = String(ka).localeCompare(String(kb), "en-NZ", { numeric: true });
      return dir === "ascending" ? cmp : -cmp;
    });

    rows.forEach(r => this.tbody.appendChild(r));
    announce(`Sorted by ${th.textContent.trim()}, ${dir}.`);
    this.dispatchEvent(new CustomEvent("lt-sort", {
      bubbles: true, detail: { index, direction: dir },
    }));
  }
}
define("lt-table", LtTable);


/* -----------------------------------------------------------------------------
   <lt-wizard>

   Step-by-step flow for configurators. Shows one step at a time, keeps a step
   indicator in sync, and refuses to advance past an invalid step.

     <lt-wizard>
       <ol class="lt-steps" data-steps></ol>
       <section data-step data-title="Machine">...</section>
       <section data-step data-title="Material">...</section>
       <div data-wizard-actions></div>
     </lt-wizard>

   A step is invalid if it contains an aria-invalid="true" control or a
   :invalid required field. Validation runs on the step being left, never on
   steps the user has not reached.
   -------------------------------------------------------------------------- */

class LtWizard extends HTMLElement {
  #index = 0;

  connectedCallback() {
    this.steps = [...this.querySelectorAll("[data-step]")];
    if (!this.steps.length) return;
    this.list = this.querySelector("[data-steps]");
    this.actions = this.querySelector("[data-wizard-actions]");

    if (this.actions) {
      this.actions.classList.add("lt-form-actions");
      this.actions.innerHTML =
        `<button type="button" class="lt-btn lt-btn--primary" data-w="next">Continue</button>` +
        `<button type="button" class="lt-btn lt-btn--secondary" data-w="back">Back</button>`;
      this.actions.querySelector('[data-w="next"]').addEventListener("click", () => this.next());
      this.actions.querySelector('[data-w="back"]').addEventListener("click", () => this.back());
    }
    this.#paint();
  }

  get index() { return this.#index; }

  #paint() {
    this.steps.forEach((s, i) => {
      s.hidden = i !== this.#index;
      if (i === this.#index) s.setAttribute("tabindex", "-1");
    });

    if (this.list) {
      this.list.innerHTML = this.steps.map((s, i) => {
        const title = s.dataset.title || `Step ${i + 1}`;
        const attrs = i === this.#index ? ' aria-current="step"' : (i < this.#index ? " data-complete" : "");
        return `<li class="lt-steps__step"${attrs}><span>${title}</span></li>`;
      }).join('<li class="lt-steps__sep" aria-hidden="true"></li>');
      this.list.style.counterReset = "";
    }

    if (this.actions) {
      const back = this.actions.querySelector('[data-w="back"]');
      const next = this.actions.querySelector('[data-w="next"]');
      back.disabled = this.#index === 0;
      next.textContent = this.#index === this.steps.length - 1 ? "Finish" : "Continue";
    }
  }

  #stepValid(i) {
    const step = this.steps[i];
    if (step.querySelector('[aria-invalid="true"]')) return false;
    const required = [...step.querySelectorAll("[required]")];
    return required.every(el => (el.checkValidity ? el.checkValidity() : true));
  }

  next() {
    if (!this.#stepValid(this.#index)) {
      announce("This step has something to fix before you can continue.", "assertive");
      const bad = this.steps[this.#index].querySelector('[aria-invalid="true"], [required]:invalid');
      if (bad && bad.focus) bad.focus();
      return false;
    }
    if (this.#index === this.steps.length - 1) {
      this.dispatchEvent(new CustomEvent("lt-wizard-finish", { bubbles: true }));
      return true;
    }
    this.#index += 1;
    this.#paint();
    this.#focusStep();
    return true;
  }

  back() {
    if (this.#index === 0) return;
    this.#index -= 1;
    this.#paint();
    this.#focusStep();
  }

  #focusStep() {
    const step = this.steps[this.#index];
    step.focus({ preventScroll: true });
    announce(`Step ${this.#index + 1} of ${this.steps.length}, ${step.dataset.title || ""}.`);
    this.dispatchEvent(new CustomEvent("lt-wizard-step", {
      bubbles: true, detail: { index: this.#index },
    }));
  }
}
define("lt-wizard", LtWizard);


/* -----------------------------------------------------------------------------
   <lt-file-drop>

   A file field you can drag onto. The dropzone is a <label> around a real
   <input type="file">, so click, Enter, Space, focus and the OS dialog are the
   platform's rather than ours, and the element only adds dragging on top.

   IT DOES NOT OWN THE NETWORK. It collects, validates and lists files, keeps
   the input's FileList in step so a plain form post carries the right set, and
   exposes a progress API for the app to drive. An app owns its endpoint, its
   auth and its retry policy; a design-system component that decided those would
   be wrong in every application that has ever needed to send a file.

   Attributes
     label       the field label
     hint        help text under the zone
     accept      same syntax as the input: ".pdf,.step,image/*"
     multiple    accept more than one file
     max-size    per-file ceiling: a number of bytes, or "10MB" / "500KB"
     max-files   ceiling on how many are held at once
     name        form field name; the input participates in the parent <form>
     required    at least one file
     disabled    zone and input both
     input-id    id for the input, generated when absent

   Properties:  files (File[]), valid (bool)
   Events:      lt-files-change  { files, added, rejected }
   Methods:     setProgress(file|name, 0..1), setError(file|name, message),
                clearError(file|name), clear()
   Keyboard:    the zone is a label, so Tab reaches the input and Enter or Space
                opens the file dialog. Each row's remove button is in the tab
                order after it.
   -------------------------------------------------------------------------- */

const SIZE_UNITS = [
  ["TB", 1024 ** 4], ["GB", 1024 ** 3], ["MB", 1024 ** 2], ["KB", 1024], ["B", 1],
];

/** "10MB" / "500 kb" / "1048576" -> bytes. NaN when it means nothing. */
function parseSize(raw) {
  if (raw == null) return NaN;
  const text = String(raw).trim();
  if (!text) return NaN;
  const m = /^([0-9]*\.?[0-9]+)\s*([a-z]*)$/i.exec(text);
  if (!m) return NaN;
  const n = parseFloat(m[1]);
  const unit = (m[2] || "B").toUpperCase();
  const hit = SIZE_UNITS.find((u) => u[0] === unit || u[0][0] === unit);
  return hit ? n * hit[1] : NaN;
}

/** Bytes as something a person reads. Whole numbers under 10 keep a decimal. */
function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  for (const [unit, size] of SIZE_UNITS) {
    if (bytes >= size || unit === "B") {
      const n = bytes / size;
      const shown = unit === "B" ? Math.round(n) : (n < 10 ? n.toFixed(1) : Math.round(n));
      return `${shown} ${unit}`;
    }
  }
  return `${bytes} B`;
}

/**
 * Does a File satisfy an accept string? Mirrors the input's own rule: a
 * comma-separated list of extensions, exact MIME types, and type/* wildcards.
 * Implemented rather than delegated because the input only enforces accept in
 * its own dialog, and a dropped file never goes near that dialog.
 */
function matchesAccept(file, accept) {
  if (!accept) return true;
  const name = file.name.toLowerCase();
  const type = (file.type || "").toLowerCase();
  return accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)
    .some((rule) => {
      if (rule.startsWith(".")) return name.endsWith(rule);
      if (rule.endsWith("/*")) return type.startsWith(rule.slice(0, -1));
      return type === rule;
    });
}

class LtFileDrop extends HTMLElement {
  static observedAttributes = ["disabled"];

  #input = null;
  #zone = null;
  #list = null;
  #msg = null;
  #files = [];          // the authoritative set; input.files is kept to match
  #errors = new Map();  // key -> message, for app-reported failures
  #progress = new Map();// key -> 0..1
  // dragleave fires when the pointer crosses onto a CHILD of the zone, so a
  // naive enter/leave pair flickers the highlight the whole time you are over
  // the icon or the hint text. Counting entries against leaves is the fix.
  #dragDepth = 0;

  connectedCallback() {
    if (this.#input) return;
    this.#render();
  }

  attributeChangedCallback(name) {
    if (!this.#input) return;
    if (name === "disabled") this.#syncDisabled();
  }

  get files() { return this.#files.slice(); }

  get valid() {
    if (this.hasAttribute("required") && this.#files.length === 0) return false;
    return this.#errors.size === 0;
  }

  #key(fileOrName) {
    return typeof fileOrName === "string" ? fileOrName : fileOrName.name;
  }

  #render() {
    const id = this.getAttribute("input-id")
      || `lt-fd-${Math.random().toString(36).slice(2, 9)}`;
    const label = this.getAttribute("label") || "";
    const hint = this.getAttribute("hint") || "";
    const accept = this.getAttribute("accept") || "";
    const multiple = this.hasAttribute("multiple");

    this.classList.add("lt-field");

    const parts = [];
    if (label) {
      parts.push(`<span class="lt-field__label"${this.hasAttribute("required") ? " data-required" : ""}>${label}</span>`);
    }
    parts.push(
      `<label class="lt-dropzone" for="${id}">` +
        `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" ` +
        `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">` +
        `<path d="M24 32V10"/><path d="m14 20 10-10 10 10"/>` +
        `<path d="M8 30v6a2 2 0 0 0 2 2h28a2 2 0 0 0 2-2v-6"/></svg>` +
        `<span><span class="lt-dropzone__action">Choose ${multiple ? "files" : "a file"}</span>` +
        ` or drag ${multiple ? "them" : "it"} here</span>` +
        (accept ? `<span class="lt-dropzone__hint">${accept}</span>` : "") +
        `<input type="file" id="${id}"` +
          (accept ? ` accept="${accept}"` : "") +
          (multiple ? " multiple" : "") +
          (this.hasAttribute("required") ? " required" : "") +
          (this.hasAttribute("disabled") ? " disabled" : "") +
          (this.getAttribute("name") ? ` name="${this.getAttribute("name")}"` : "") +
        `>` +
      `</label>`
    );
    if (hint) parts.push(`<span class="lt-field__hint" id="${id}-hint">${hint}</span>`);
    parts.push(`<ul class="lt-filelist" hidden></ul>`);
    parts.push(`<span data-msg id="${id}-msg" hidden></span>`);

    this.innerHTML = parts.join("");

    this.#input = this.querySelector("input[type=file]");
    this.#zone = this.querySelector(".lt-dropzone");
    this.#list = this.querySelector(".lt-filelist");
    this.#msg = this.querySelector("[data-msg]");
    if (hint) this.#input.setAttribute("aria-describedby", `${id}-hint`);

    this.#input.addEventListener("change", () => {
      this.#accept(Array.from(this.#input.files || []));
    });

    // preventDefault on dragover is what makes the element a drop target at
    // all; without it the browser navigates to the file and the page is gone.
    ["dragenter", "dragover"].forEach((type) => {
      this.#zone.addEventListener(type, (e) => {
        if (this.hasAttribute("disabled")) return;
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
        if (type === "dragenter") this.#dragDepth++;
        this.#zone.dataset.over = "true";
      });
    });
    this.#zone.addEventListener("dragleave", () => {
      this.#dragDepth = Math.max(0, this.#dragDepth - 1);
      if (this.#dragDepth === 0) delete this.#zone.dataset.over;
    });
    this.#zone.addEventListener("drop", (e) => {
      e.preventDefault();
      this.#dragDepth = 0;
      delete this.#zone.dataset.over;
      if (this.hasAttribute("disabled")) return;
      this.#accept(Array.from(e.dataTransfer?.files || []));
    });

    this.#syncDisabled();
  }

  #syncDisabled() {
    const off = this.hasAttribute("disabled");
    this.#input.disabled = off;
    this.#zone.setAttribute("aria-disabled", String(off));
    this.querySelectorAll(".lt-file button").forEach((b) => { b.disabled = off; });
  }

  /** Validate an incoming batch, keep what passes, report what does not. */
  #accept(incoming) {
    const accept = this.getAttribute("accept") || "";
    const maxSize = parseSize(this.getAttribute("max-size"));
    const maxFiles = parseInt(this.getAttribute("max-files") || "", 10);
    const multiple = this.hasAttribute("multiple");

    const added = [];
    const rejected = [];
    for (const file of incoming) {
      if (!matchesAccept(file, accept)) {
        rejected.push({ file, reason: `Not an accepted file type. Expected ${accept}.` });
        continue;
      }
      if (Number.isFinite(maxSize) && file.size > maxSize) {
        rejected.push({ file, reason: `Too large at ${formatSize(file.size)}. The limit is ${formatSize(maxSize)}.` });
        continue;
      }
      // Same name AND same size is the same file arriving twice, which is what
      // dropping a folder twice looks like. Size is included because two
      // genuinely different files with one name is a real case on a shop floor.
      if (this.#files.some((f) => f.name === file.name && f.size === file.size)) {
        rejected.push({ file, reason: "Already added." });
        continue;
      }
      const room = multiple
        ? (Number.isFinite(maxFiles) ? maxFiles - this.#files.length - added.length : Infinity)
        : 1 - added.length;
      if (room <= 0) {
        rejected.push({
          file,
          reason: multiple ? `Only ${maxFiles} files can be added.` : "Only one file can be added.",
        });
        continue;
      }
      added.push(file);
    }

    this.#files = multiple ? this.#files.concat(added) : added.slice(0, 1);
    this.#syncInput();
    this.#paint(rejected);

    const said = [];
    if (added.length) said.push(`${added.length} file${added.length === 1 ? "" : "s"} added`);
    if (rejected.length) said.push(`${rejected.length} rejected`);
    if (said.length) announce(said.join(", "), rejected.length ? "assertive" : "polite");

    this.dispatchEvent(new CustomEvent("lt-files-change", {
      bubbles: true,
      detail: { files: this.files, added, rejected },
    }));
  }

  /**
   * Rebuild the input's FileList from our set, so a plain form post carries
   * exactly what is on screen. Without this a removed file still posts, which
   * is the bug every hand-rolled version of this component ships with.
   */
  #syncInput() {
    if (typeof DataTransfer !== "function") return;   // jsdom and old engines
    try {
      const dt = new DataTransfer();
      this.#files.forEach((f) => dt.items.add(f));
      this.#input.files = dt.files;
    } catch {
      /* Some engines refuse to construct a FileList. The property API still
         reports the right set; only the no-JS form post degrades. */
    }
  }

  #paint(rejected = []) {
    this.#list.textContent = "";
    this.#list.hidden = this.#files.length === 0;

    for (const file of this.#files) {
      const key = file.name;
      const li = document.createElement("li");
      li.className = "lt-file";
      if (this.#errors.has(key)) li.classList.add("lt-file--error");

      const icon = document.createElementNS(SVG_NS, "svg");
      icon.setAttribute("viewBox", "0 0 24 24");
      icon.setAttribute("fill", "none");
      icon.setAttribute("stroke", "currentColor");
      icon.setAttribute("stroke-width", "2");
      icon.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Zm0 0v5h5");
      icon.appendChild(path);
      li.appendChild(icon);

      // THE NAME IS DATA. A file name is chosen by whoever is at the machine
      // and routinely contains angle brackets and ampersands from a CAM export.
      // It goes in through textContent, never a markup string. Same rule as
      // toast() above, and the <bdi> keeps the RTL truncation from reordering
      // anything in the name itself.
      const name = document.createElement("span");
      name.className = "lt-file__name";
      const bdi = document.createElement("bdi");
      bdi.textContent = file.name;
      name.appendChild(bdi);
      name.title = file.name;
      li.appendChild(name);

      const size = document.createElement("span");
      size.className = "lt-file__size";
      size.textContent = formatSize(file.size);
      li.appendChild(size);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "lt-btn lt-btn--ghost lt-btn--icon";
      remove.setAttribute("aria-label", `Remove ${file.name}`);
      remove.disabled = this.hasAttribute("disabled");
      const x = document.createElementNS(SVG_NS, "svg");
      x.setAttribute("viewBox", "0 0 24 24");
      x.setAttribute("fill", "none");
      x.setAttribute("stroke", "currentColor");
      x.setAttribute("stroke-width", "2");
      x.setAttribute("stroke-linecap", "round");
      x.setAttribute("aria-hidden", "true");
      const x1 = document.createElementNS(SVG_NS, "path");
      x1.setAttribute("d", "M6 6l12 12M18 6 6 18");
      x.appendChild(x1);
      remove.appendChild(x);
      remove.addEventListener("click", () => this.#remove(file));
      li.appendChild(remove);

      if (this.#progress.has(key)) {
        const bar = document.createElement("div");
        bar.className = "lt-file__progress";
        const value = Math.max(0, Math.min(1, this.#progress.get(key)));
        if (value >= 1) bar.dataset.done = "true";
        bar.setAttribute("role", "progressbar");
        bar.setAttribute("aria-valuemin", "0");
        bar.setAttribute("aria-valuemax", "100");
        bar.setAttribute("aria-valuenow", String(Math.round(value * 100)));
        bar.setAttribute("aria-label", `Uploading ${file.name}`);
        const fill = document.createElement("span");
        fill.style.inlineSize = `${value * 100}%`;
        bar.appendChild(fill);
        li.appendChild(bar);
      }

      if (this.#errors.has(key)) {
        const err = document.createElement("span");
        err.className = "lt-file__error";
        err.textContent = this.#errors.get(key);
        li.appendChild(err);
      }

      this.#list.appendChild(li);
    }

    // Rejections are about the batch rather than about any row, so they belong
    // in the field's own message rather than in the list.
    if (rejected.length) {
      this.#msg.hidden = false;
      this.#msg.className = "lt-field__error";
      this.#msg.setAttribute("role", "alert");
      this.#msg.textContent = rejected.length === 1
        ? `${rejected[0].file.name}: ${rejected[0].reason}`
        : `${rejected.length} files were not added. ${rejected[0].file.name}: ${rejected[0].reason}`;
    } else {
      this.#msg.hidden = true;
      this.#msg.textContent = "";
      this.#msg.removeAttribute("role");
      this.#msg.className = "";
    }
    this.#input.setAttribute("aria-invalid", String(!this.valid));
  }

  #remove(file) {
    this.#files = this.#files.filter((f) => f !== file);
    this.#errors.delete(file.name);
    this.#progress.delete(file.name);
    this.#syncInput();
    this.#paint();
    announce(`${file.name} removed`);
    this.dispatchEvent(new CustomEvent("lt-files-change", {
      bubbles: true,
      detail: { files: this.files, added: [], rejected: [] },
    }));
    // Focus would otherwise land on <body> when the row it was in disappears.
    const next = this.querySelector(".lt-file button") || this.#input;
    if (next) next.focus();
  }

  setProgress(fileOrName, fraction) {
    this.#progress.set(this.#key(fileOrName), fraction);
    this.#paint();
  }

  setError(fileOrName, message) {
    this.#errors.set(this.#key(fileOrName), message);
    this.#paint();
    announce(message, "assertive");
  }

  clearError(fileOrName) {
    this.#errors.delete(this.#key(fileOrName));
    this.#paint();
  }

  clear() {
    this.#files = [];
    this.#errors.clear();
    this.#progress.clear();
    this.#syncInput();
    this.#paint();
    this.dispatchEvent(new CustomEvent("lt-files-change", {
      bubbles: true,
      detail: { files: [], added: [], rejected: [] },
    }));
  }
}

define("lt-file-drop", LtFileDrop);


/* -----------------------------------------------------------------------------
   Dates and times

   WHY NOT <input type="date">, which is right there and free. The same argument
   that replaced <input type="number">, one degree worse.

   The native picker cannot read the density tokens, cannot join a surface
   context, and gives a kiosk whatever day-cell size the OS feels like, which is
   routinely under the WCAG target floor this system holds everywhere else. And
   its text half parses BY LOCALE: 03/04/2026 is the third of April on a machine
   set to en-NZ and the fourth of March on one set to en-US, with nothing on
   screen to say which reading you got. That is millimetres-versus-microns
   again, and the system already decided how it feels about a number whose unit
   is not shown.

   So: value is ALWAYS ISO yyyy-mm-dd, whatever is on screen. Typing accepts
   what people actually type. And the parsed date is echoed back in words the
   moment it is understood, because the month NAME is the only thing that
   settles 03/04 and a reader cannot check a numeric date by looking at it.
   -------------------------------------------------------------------------- */

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** ISO yyyy-mm-dd for a Date, in LOCAL time. toISOString() would be wrong: it
 *  converts to UTC first, so an evening in New Zealand reports tomorrow. */
function isoOf(date) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** A local-midnight Date from yyyy-mm-dd. new Date("2026-04-03") parses as UTC
 *  and lands on the 2nd in any negative offset, so the parts go in separately. */
function dateOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").trim());
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  // Rejects 2026-02-31 by seeing whether the parts survived normalisation.
  return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
}

const MONTH_WORD = /^([0-9]{1,2})[ \-]*([a-z]{3,})[ \-]*([0-9]{2,4})?$/i;

/**
 * Parse what a person types into an ISO date, or null.
 *
 * Accepts ISO first and unconditionally, because it is unambiguous and a
 * pasted value from anywhere else in the system is ISO. Then day-first numeric
 * forms with any of / - . as separators, then "3 Apr 2026". A two-digit year
 * maps into the current century, which is wrong exactly once every hundred
 * years and right every other time.
 *
 * dayFirst is a parameter rather than a constant because the ambiguity is real:
 * the caller declares which reading it means and the field then SHOWS that
 * reading back in words, so nobody has to know what the default was.
 */
function parseDateInput(raw, dayFirst = true) {
  const text = String(raw || "").trim();
  if (!text) return null;

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    const norm = `${iso[1]}-${String(+iso[2]).padStart(2, "0")}-${String(+iso[3]).padStart(2, "0")}`;
    return dateOf(norm) ? norm : null;
  }

  const word = MONTH_WORD.exec(text);
  if (word) {
    const idx = MONTHS.findIndex((m) => m.toLowerCase().startsWith(word[2].toLowerCase()));
    if (idx >= 0) {
      const year = word[3] ? expandYear(+word[3]) : new Date().getFullYear();
      const d = new Date(year, idx, +word[1]);
      return d.getDate() === +word[1] ? isoOf(d) : null;
    }
  }

  const num = /^(\d{1,4})[/\-. ](\d{1,2})(?:[/\-. ](\d{1,4}))?$/.exec(text);
  if (num) {
    let a = +num[1], b = +num[2];
    let year = num[3] ? expandYear(+num[3]) : new Date().getFullYear();
    let day, month;
    if (num[1].length === 4) { year = a; month = b; day = num[3] ? +num[3] : 1; }
    else if (dayFirst) { day = a; month = b; }
    else { month = a; day = b; }
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
      ? isoOf(d) : null;
  }

  // A bare run of digits, the way someone types a date on a keypad with no
  // separators at all: 3426 is unreadable, but 030426 and 03042026 are not.
  const bare = /^(\d{6}|\d{8})$/.exec(text);
  if (bare) {
    const s = bare[1];
    const a = +s.slice(0, 2), b = +s.slice(2, 4);
    const year = expandYear(+s.slice(4));
    const day = dayFirst ? a : b, month = dayFirst ? b : a;
    const d = new Date(year, month - 1, day);
    return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day
      ? isoOf(d) : null;
  }
  return null;
}

function expandYear(n) {
  if (n >= 100) return n;
  const century = Math.floor(new Date().getFullYear() / 100) * 100;
  return century + n;
}

/** Display an ISO date in the field's own numeric order. */
function formatDate(iso, dayFirst = true) {
  const d = dateOf(iso);
  if (!d) return "";
  const p = (n) => String(n).padStart(2, "0");
  return dayFirst
    ? `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
    : `${p(d.getMonth() + 1)}/${p(d.getDate())}/${d.getFullYear()}`;
}

/** The echo. This is the part that makes a numeric date checkable. */
function spellDate(iso) {
  const d = dateOf(iso);
  if (!d) return "";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}


/* -----------------------------------------------------------------------------
   <lt-date-field>

   Attributes
     label, hint     as every other field
     value           ISO yyyy-mm-dd
     min, max        ISO, inclusive
     month-first     read and write mm/dd/yyyy instead of dd/mm/yyyy
     name            form field name; posts the ISO value, never the display one
     required, disabled, input-id

   Properties:  value (ISO string), dateValue (Date|null), valid
   Events:      lt-change { value }
   Keyboard:    in the field, Down or Alt+Down opens the calendar. In the
                calendar, arrows move a day or a week, PageUp/PageDown move a
                month, Shift with them moves a year, Home and End go to the ends
                of the week, Enter or Space picks, Escape closes and returns
                focus to the field.
   -------------------------------------------------------------------------- */

class LtDateField extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "disabled"];

  #input = null;
  #posted = null;
  #msg = null;
  #echo = null;
  #cal = null;
  #trigger = null;
  #group = null;
  #iso = "";          // the canonical value, always ISO
  #cursor = null;     // the date the calendar grid is showing
  #open = false;

  connectedCallback() {
    if (this.#input) return;
    this.#render();
    this.#iso = this.getAttribute("value") || "";
    this.#paint();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (!this.#input || oldV === newV) return;
    if (name === "value") { this.#iso = newV || ""; this.#paint(); }
    else if (name === "disabled") {
      this.#input.disabled = this.hasAttribute("disabled");
      this.#trigger.disabled = this.#input.disabled;
      if (this.#posted) this.#posted.disabled = this.#input.disabled;
    } else this.#validate();
  }

  get dayFirst() { return !this.hasAttribute("month-first"); }
  get value() { return this.#iso; }
  set value(v) { this.#iso = v || ""; this.#paint(); }
  get dateValue() { return dateOf(this.#iso); }
  get valid() { return this.#validate(true); }

  #render() {
    const id = this.getAttribute("input-id")
      || `lt-df-${Math.random().toString(36).slice(2, 9)}`;
    const label = this.getAttribute("label") || "";
    const hint = this.getAttribute("hint") || "";
    this.classList.add("lt-field");

    const pattern = this.dayFirst ? "dd/mm/yyyy" : "mm/dd/yyyy";
    const parts = [];
    if (label) {
      parts.push(`<label class="lt-field__label" for="${id}"${this.hasAttribute("required") ? " data-required" : ""}>${label}</label>`);
    }
    parts.push(
      `<div class="lt-input-group">` +
        `<input id="${id}" class="lt-input" type="text" inputmode="numeric" autocomplete="off"` +
          ` placeholder="${pattern}"` +
          (this.hasAttribute("required") ? " required" : "") +
          (this.hasAttribute("disabled") ? " disabled" : "") + `>` +
        `<button type="button" class="lt-btn lt-btn--secondary lt-btn--icon" data-open ` +
          `aria-label="Choose a date" aria-haspopup="dialog" aria-expanded="false">` +
          `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
          `stroke-linecap="round" aria-hidden="true" focusable="false">` +
          `<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>` +
          `</svg></button>` +
      `</div>`
    );
    // The pattern goes in the hint, always, even when the app supplies one of
    // its own: a date field whose order is not stated is the whole failure this
    // element exists to avoid.
    parts.push(`<span class="lt-field__hint" id="${id}-hint">${hint ? hint + " " : ""}${pattern}</span>`);
    parts.push(`<span class="lt-field__echo" data-echo></span>`);
    parts.push(`<span data-msg id="${id}-msg" hidden></span>`);

    this.innerHTML = parts.join("");

    this.#input = this.querySelector("input");
    this.#trigger = this.querySelector("[data-open]");
    this.#group = this.querySelector(".lt-input-group");
    this.#msg = this.querySelector("[data-msg]");
    this.#echo = this.querySelector("[data-echo]");
    this.#input.setAttribute("aria-describedby", `${id}-hint`);

    if (this.getAttribute("name")) {
      this.#posted = document.createElement("input");
      this.#posted.type = "hidden";
      this.#posted.name = this.getAttribute("name");
      this.appendChild(this.#posted);
      // The VISIBLE input stays nameless on purpose, exactly as it does on
      // lt-number-field: what the field shows is a local reading, and a local
      // reading must never be what a form stores.
      this.#input.removeAttribute("name");
    }

    this.#input.addEventListener("input", () => this.#commit(false));
    this.#input.addEventListener("blur", () => { this.#commit(true); this.#paint(); });
    this.#input.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" && (e.altKey || !this.#input.value)) {
        e.preventDefault();
        this.#openCal();
      }
    });
    this.#trigger.addEventListener("click", () => {
      this.#open ? this.#closeCal() : this.#openCal();
    });
  }

  #commit(final) {
    const parsed = parseDateInput(this.#input.value, this.dayFirst);
    if (parsed) this.#iso = parsed;
    else if (final && !this.#input.value.trim()) this.#iso = "";
    this.#echo.textContent = parsed ? spellDate(parsed) : "";
    this.#validate();
    if (this.#posted) this.#posted.value = this.#iso;
    if (parsed || (final && !this.#input.value.trim())) {
      this.dispatchEvent(new CustomEvent("lt-change", {
        bubbles: true, detail: { value: this.#iso },
      }));
    }
  }

  #paint() {
    if (!this.#input) return;
    this.#input.value = this.#iso ? formatDate(this.#iso, this.dayFirst) : "";
    this.#echo.textContent = this.#iso ? spellDate(this.#iso) : "";
    if (this.#posted) this.#posted.value = this.#iso;
    this.#validate();
  }

  #validate(quietly = false) {
    const min = this.getAttribute("min");
    const max = this.getAttribute("max");
    let message = "";
    const typed = this.#input.value.trim();
    if (typed && !parseDateInput(typed, this.dayFirst)) {
      message = `That is not a date. Use ${this.dayFirst ? "dd/mm/yyyy" : "mm/dd/yyyy"}.`;
    } else if (!typed && this.hasAttribute("required")) {
      message = "";   // an empty required field is the form's problem on submit
    } else if (this.#iso && min && this.#iso < min) {
      message = `Must be ${spellDate(min)} or later.`;
    } else if (this.#iso && max && this.#iso > max) {
      message = `Must be ${spellDate(max)} or earlier.`;
    }
    if (quietly) return !message;

    // The chip and aria-invalid are ONE operation, the same way they are on
    // lt-number-field. Painting one without the other is the half-a-field
    // defect lt_dom_audit.py exists to catch.
    if (message) {
      this.#msg.hidden = false;
      this.#msg.className = "lt-field__error";
      this.#msg.setAttribute("role", "alert");
      this.#msg.textContent = message;
      this.#input.setAttribute("aria-invalid", "true");
      this.#input.setAttribute("aria-describedby", `${this.#input.id}-hint ${this.#input.id}-msg`);
    } else {
      this.#msg.hidden = true;
      this.#msg.textContent = "";
      this.#msg.removeAttribute("role");
      this.#msg.className = "";
      this.#input.setAttribute("aria-invalid", "false");
      this.#input.setAttribute("aria-describedby", `${this.#input.id}-hint`);
    }
    return !message;
  }

  /* ---- the calendar ------------------------------------------------------ */

  #openCal() {
    if (this.hasAttribute("disabled")) return;
    this.#cursor = dateOf(this.#iso) || new Date();
    if (!this.#cal) {
      this.#cal = document.createElement("div");
      // .lt-panel because it is a floating light card, and the overlay-plus-
      // page-ink pair measures 1.09:1 in the dark scheme. Same as lt-menu.
      this.#cal.className = "lt-calendar lt-panel";
      this.#cal.setAttribute("role", "dialog");
      this.#cal.setAttribute("aria-modal", "false");
      this.#cal.setAttribute("aria-label", "Choose a date");
      document.body.appendChild(this.#cal);
      this.#cal.addEventListener("keydown", (e) => this.#calKey(e));
    }
    this.#cal.hidden = false;
    this.#open = true;
    this.#trigger.setAttribute("aria-expanded", "true");
    this.#drawCal();
    // Anchor on the GROUP, not on the button that opened it. The trigger is a
    // 36px icon at the far end of the field, so hanging the calendar off it put
    // a 300px panel out to the right of the control, overlapping whatever sat
    // beside it. A picker belongs under the thing it fills in: the popup drops
    // from the field's bottom edge and lines up with its start edge, which is
    // where a reader is already looking.
    placeFloating(this, this.#group || this.#trigger, this.#cal, { alignStart: true });
    const focusTarget = this.#cal.querySelector('[aria-selected="true"]')
      || this.#cal.querySelector('.lt-calendar__day:not(:disabled)');
    if (focusTarget) focusTarget.focus();
    this.#onDocDown = (e) => {
      if (!this.#cal.contains(e.target) && !this.contains(e.target)) this.#closeCal();
    };
    document.addEventListener("pointerdown", this.#onDocDown, true);
  }

  #closeCal(refocus = true) {
    if (!this.#open) return;
    this.#open = false;
    this.#cal.hidden = true;
    this.#trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", this.#onDocDown, true);
    if (refocus) this.#trigger.focus();
  }

  #onDocDown = null;

  #inRange(iso) {
    const min = this.getAttribute("min");
    const max = this.getAttribute("max");
    if (min && iso < min) return false;
    if (max && iso > max) return false;
    return true;
  }

  #drawCal() {
    const cur = this.#cursor;
    const year = cur.getFullYear();
    const month = cur.getMonth();
    this.#cal.textContent = "";

    const head = document.createElement("div");
    head.className = "lt-calendar__head";
    const mk = (label, delta, unit) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "lt-btn lt-btn--ghost lt-btn--icon";
      b.setAttribute("aria-label", label);
      b.textContent = delta < 0 ? "‹" : "›";
      b.addEventListener("click", () => {
        this.#cursor = unit === "y"
          ? new Date(year + delta, month, 1)
          : new Date(year, month + delta, 1);
        this.#drawCal();
      });
      return b;
    };
    head.appendChild(mk("Previous month", -1, "m"));
    const title = document.createElement("span");
    title.className = "lt-calendar__title";
    title.id = `${this.#input.id}-caltitle`;
    title.textContent = `${MONTHS[month]} ${year}`;
    head.appendChild(title);
    head.appendChild(mk("Next month", 1, "m"));
    this.#cal.setAttribute("aria-labelledby", title.id);
    this.#cal.appendChild(head);

    const table = document.createElement("table");
    table.className = "lt-calendar__grid";
    const thead = document.createElement("thead");
    const hr = document.createElement("tr");
    for (const w of WEEKDAYS) {
      const th = document.createElement("th");
      th.scope = "col";
      // The abbreviation is what is drawn; the full name is what is read out,
      // so a screen reader says "Monday" rather than spelling "Mon".
      const abbr = document.createElement("abbr");
      abbr.title = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday",
                     Fri: "Friday", Sat: "Saturday", Sun: "Sunday" }[w];
      abbr.textContent = w;
      th.appendChild(abbr);
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const body = document.createElement("tbody");
    // Weeks start Monday: this is a New Zealand workshop, not a US calendar.
    const first = new Date(year, month, 1);
    const lead = (first.getDay() + 6) % 7;
    const start = new Date(year, month, 1 - lead);
    const today = isoOf(new Date());

    for (let w = 0; w < 6; w++) {
      const tr = document.createElement("tr");
      for (let d = 0; d < 7; d++) {
        const cell = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d);
        const iso = isoOf(cell);
        const td = document.createElement("td");
        const b = document.createElement("button");
        b.type = "button";
        b.className = "lt-calendar__day";
        b.textContent = String(cell.getDate());
        b.dataset.iso = iso;
        if (cell.getMonth() !== month) b.dataset.outside = "true";
        if (iso === today) b.dataset.today = "true";
        b.setAttribute("aria-selected", String(iso === this.#iso));
        // The full date is the accessible name, because "14" on its own tells a
        // screen-reader user nothing about which month they are in.
        b.setAttribute("aria-label", spellDate(iso) + (iso === today ? ", today" : ""));
        b.disabled = !this.#inRange(iso);
        b.tabIndex = iso === (this.#iso || today) ? 0 : -1;
        b.addEventListener("click", () => this.#pick(iso));
        td.appendChild(b);
        tr.appendChild(td);
      }
      body.appendChild(tr);
    }
    table.appendChild(body);
    this.#cal.appendChild(table);

    const foot = document.createElement("div");
    foot.className = "lt-calendar__foot";
    const todayBtn = document.createElement("button");
    todayBtn.type = "button";
    todayBtn.className = "lt-btn lt-btn--ghost";
    todayBtn.textContent = "Today";
    todayBtn.disabled = !this.#inRange(today);
    todayBtn.addEventListener("click", () => this.#pick(today));
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "lt-btn lt-btn--ghost";
    clearBtn.textContent = "Clear";
    clearBtn.addEventListener("click", () => this.#pick(""));
    foot.appendChild(todayBtn);
    foot.appendChild(clearBtn);
    this.#cal.appendChild(foot);
  }

  #pick(iso) {
    this.#iso = iso;
    this.#paint();
    this.#closeCal();
    announce(iso ? spellDate(iso) + " selected" : "Date cleared");
    this.dispatchEvent(new CustomEvent("lt-change", {
      bubbles: true, detail: { value: this.#iso },
    }));
  }

  #calKey(e) {
    const focused = this.#cal.querySelector(".lt-calendar__day:focus");
    if (e.key === "Escape") { e.preventDefault(); this.#closeCal(); return; }
    if (!focused) return;
    const from = dateOf(focused.dataset.iso);
    if (!from) return;
    const move = (days, months = 0, years = 0) => {
      e.preventDefault();
      let to = new Date(from.getFullYear() + years, from.getMonth() + months, from.getDate() + days);
      // CLAMP TO THE RANGE, never step past it. A day outside min/max renders
      // as a disabled button, and .focus() on a disabled button does nothing:
      // the cell the user came from has just been replaced by #drawCal, so
      // focus falls to <body> and a keyboard user is stranded outside the
      // dialog with no way back in. Landing on the boundary is also what the
      // native pickers do. Found by driving the arrows in a real browser,
      // 2026-08-20; jsdom cannot see it because it does not run focus.
      const min = this.getAttribute("min");
      const max = this.getAttribute("max");
      if (min && isoOf(to) < min) to = dateOf(min) || to;
      if (max && isoOf(to) > max) to = dateOf(max) || to;
      this.#cursor = to;
      this.#drawCal();
      const next = this.#cal.querySelector(`[data-iso="${isoOf(to)}"]`);
      if (next && !next.disabled) { next.tabIndex = 0; next.focus(); }
      else {
        // Belt and braces: if the clamp still could not produce a focusable
        // cell, put focus on the first one that is, rather than nowhere.
        const fallback = this.#cal.querySelector(".lt-calendar__day:not(:disabled)");
        if (fallback) { fallback.tabIndex = 0; fallback.focus(); }
      }
    };
    switch (e.key) {
      case "ArrowLeft":  move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowUp":    move(-7); break;
      case "ArrowDown":  move(7); break;
      case "Home":       move(-((from.getDay() + 6) % 7)); break;
      case "End":        move(6 - ((from.getDay() + 6) % 7)); break;
      case "PageUp":     e.shiftKey ? move(0, 0, -1) : move(0, -1); break;
      case "PageDown":   e.shiftKey ? move(0, 0, 1) : move(0, 1); break;
      default: break;
    }
  }
}

define("lt-date-field", LtDateField);


/* -----------------------------------------------------------------------------
   <lt-time-field>

   No popup. A time is two numbers and typing them is faster than any picker,
   which is not true of a date. What it does instead is accept every shape a
   person actually types on a shop floor and normalise it: 1430, 14:30, 2.30pm,
   9, all land on the same value.

   24-hour by default, because a job sheet that says 7:15 without saying which
   one has the same problem as a date that does not say its order.

   Attributes:  label, hint, value (HH:MM), min, max, step (minutes),
                twelve-hour, name, required, disabled, input-id
   Properties:  value (HH:MM), valid
   Events:      lt-change { value }
   -------------------------------------------------------------------------- */

/** Minutes since midnight from what a person typed, or null. */
function parseTimeInput(raw) {
  const text = String(raw || "").trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;
  const m = /^(\d{1,2})(?:[:.h]?(\d{2}))?(am|pm|a|p)?$/.exec(text)
    || /^(\d{3,4})(am|pm|a|p)?$/.exec(text);
  if (!m) return null;

  let h, min, suffix;
  if (m[1].length >= 3) {                    // 930 or 1430, no separator
    h = +m[1].slice(0, m[1].length - 2);
    min = +m[1].slice(-2);
    suffix = m[2];
  } else {
    h = +m[1];
    min = m[2] == null ? 0 : +m[2];
    suffix = m[3];
  }
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return null;
  if (suffix) {
    if (h < 1 || h > 12) return null;
    const pm = suffix[0] === "p";
    h = (h % 12) + (pm ? 12 : 0);
  }
  if (h > 23) return null;
  return h * 60 + min;
}

function formatTime(minutes, twelve = false) {
  if (minutes == null || !Number.isFinite(minutes)) return "";
  const h = Math.floor(minutes / 60), m = minutes % 60;
  const p = (n) => String(n).padStart(2, "0");
  if (!twelve) return `${p(h)}:${p(m)}`;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${p(m)} ${suffix}`;
}

class LtTimeField extends HTMLElement {
  static observedAttributes = ["value", "min", "max", "disabled"];

  #input = null;
  #posted = null;
  #msg = null;
  #echo = null;
  #minutes = null;

  connectedCallback() {
    if (this.#input) return;
    this.#render();
    const v = this.getAttribute("value");
    this.#minutes = v ? parseTimeInput(v) : null;
    this.#paint();
  }

  attributeChangedCallback(name, oldV, newV) {
    if (!this.#input || oldV === newV) return;
    if (name === "value") { this.#minutes = newV ? parseTimeInput(newV) : null; this.#paint(); }
    else if (name === "disabled") {
      this.#input.disabled = this.hasAttribute("disabled");
      if (this.#posted) this.#posted.disabled = this.#input.disabled;
    } else this.#validate();
  }

  get twelve() { return this.hasAttribute("twelve-hour"); }
  get value() { return this.#minutes == null ? "" : formatTime(this.#minutes, false); }
  set value(v) { this.#minutes = v ? parseTimeInput(v) : null; this.#paint(); }
  get valid() { return this.#validate(true); }

  #render() {
    const id = this.getAttribute("input-id")
      || `lt-tf-${Math.random().toString(36).slice(2, 9)}`;
    const label = this.getAttribute("label") || "";
    const hint = this.getAttribute("hint") || "";
    this.classList.add("lt-field");
    const pattern = this.twelve ? "h:mm am" : "hh:mm";

    const parts = [];
    if (label) {
      parts.push(`<label class="lt-field__label" for="${id}"${this.hasAttribute("required") ? " data-required" : ""}>${label}</label>`);
    }
    parts.push(
      `<div class="lt-input-group">` +
        `<input id="${id}" class="lt-input lt-input--numeric" type="text" inputmode="numeric" ` +
          `autocomplete="off" placeholder="${pattern}"` +
          (this.hasAttribute("required") ? " required" : "") +
          (this.hasAttribute("disabled") ? " disabled" : "") + `>` +
        `<span class="lt-affix">${this.twelve ? "12h" : "24h"}</span>` +
      `</div>`
    );
    parts.push(`<span class="lt-field__hint" id="${id}-hint">${hint ? hint + " " : ""}${pattern}</span>`);
    parts.push(`<span class="lt-field__echo" data-echo></span>`);
    parts.push(`<span data-msg id="${id}-msg" hidden></span>`);
    this.innerHTML = parts.join("");

    this.#input = this.querySelector("input");
    this.#msg = this.querySelector("[data-msg]");
    this.#echo = this.querySelector("[data-echo]");
    this.#input.setAttribute("aria-describedby", `${id}-hint`);

    if (this.getAttribute("name")) {
      this.#posted = document.createElement("input");
      this.#posted.type = "hidden";
      this.#posted.name = this.getAttribute("name");
      this.appendChild(this.#posted);
      this.#input.removeAttribute("name");
    }

    this.#input.addEventListener("input", () => this.#commit(false));
    this.#input.addEventListener("blur", () => { this.#commit(true); this.#paint(); });
    this.#input.addEventListener("keydown", (e) => {
      const step = parseInt(this.getAttribute("step") || "15", 10) || 15;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      e.preventDefault();
      const base = this.#minutes == null ? (e.key === "ArrowUp" ? 0 : 24 * 60 - step) : this.#minutes;
      const next = (base + (e.key === "ArrowUp" ? step : -step) + 24 * 60) % (24 * 60);
      this.#minutes = next;
      this.#paint();
      this.dispatchEvent(new CustomEvent("lt-change", { bubbles: true, detail: { value: this.value } }));
    });
  }

  #commit(final) {
    const parsed = parseTimeInput(this.#input.value);
    if (parsed != null) this.#minutes = parsed;
    else if (final && !this.#input.value.trim()) this.#minutes = null;
    // The echo shows the OTHER clock, which is the check: someone who typed
    // 7:15 meaning the evening sees "19:15" and someone who typed 19:15 sees
    // "7:15 pm". Either way the reading they did not type is on screen.
    this.#echo.textContent = parsed == null ? "" : formatTime(parsed, !this.twelve);
    this.#validate();
    if (this.#posted) this.#posted.value = this.value;
    if (parsed != null || (final && !this.#input.value.trim())) {
      this.dispatchEvent(new CustomEvent("lt-change", { bubbles: true, detail: { value: this.value } }));
    }
  }

  #paint() {
    if (!this.#input) return;
    this.#input.value = this.#minutes == null ? "" : formatTime(this.#minutes, this.twelve);
    this.#echo.textContent = this.#minutes == null ? "" : formatTime(this.#minutes, !this.twelve);
    if (this.#posted) this.#posted.value = this.value;
    this.#validate();
  }

  #validate(quietly = false) {
    const min = this.getAttribute("min") ? parseTimeInput(this.getAttribute("min")) : null;
    const max = this.getAttribute("max") ? parseTimeInput(this.getAttribute("max")) : null;
    let message = "";
    const typed = this.#input.value.trim();
    if (typed && parseTimeInput(typed) == null) {
      message = `That is not a time. Use ${this.twelve ? "h:mm am" : "hh:mm"}.`;
    } else if (this.#minutes != null && min != null && this.#minutes < min) {
      message = `Must be ${formatTime(min, this.twelve)} or later.`;
    } else if (this.#minutes != null && max != null && this.#minutes > max) {
      message = `Must be ${formatTime(max, this.twelve)} or earlier.`;
    }
    if (quietly) return !message;
    if (message) {
      this.#msg.hidden = false;
      this.#msg.className = "lt-field__error";
      this.#msg.setAttribute("role", "alert");
      this.#msg.textContent = message;
      this.#input.setAttribute("aria-invalid", "true");
      this.#input.setAttribute("aria-describedby", `${this.#input.id}-hint ${this.#input.id}-msg`);
    } else {
      this.#msg.hidden = true;
      this.#msg.textContent = "";
      this.#msg.removeAttribute("role");
      this.#msg.className = "";
      this.#input.setAttribute("aria-invalid", "false");
      this.#input.setAttribute("aria-describedby", `${this.#input.id}-hint`);
    }
    return !message;
  }
}

define("lt-time-field", LtTimeField);


/* -----------------------------------------------------------------------------
   Toasts and the shared live region

   One live region for the whole page, created lazily. Two of them, in fact:
   polite for progress and confirmations, assertive for things the user must
   notice now. Mixing the two in a single region means an urgent message can be
   queued behind a routine one.
   -------------------------------------------------------------------------- */

let politeRegion = null;
let assertiveRegion = null;

function liveRegion(kind) {
  const existing = kind === "assertive" ? assertiveRegion : politeRegion;
  // isConnected, not just truthiness. Any app that swaps out a container's
  // innerHTML detaches the region, and a cached reference to a detached node
  // accepts text forever without a screen reader ever seeing it. Silent
  // accessibility failures are the worst kind, so re-create when orphaned.
  if (existing && existing.isConnected) return existing;
  const el = document.createElement("div");
  el.className = "lt-sr-only";
  el.setAttribute("role", kind === "assertive" ? "alert" : "status");
  el.setAttribute("aria-live", kind);
  el.setAttribute("aria-atomic", "true");
  document.body.appendChild(el);
  if (kind === "assertive") assertiveRegion = el; else politeRegion = el;
  return el;
}

/** Announce to assistive tech without showing anything on screen. */
export function announce(message, kind = "polite") {
  const region = liveRegion(kind);
  // Clear first: repeating identical text in a live region is often not re-read.
  region.textContent = "";
  requestAnimationFrame(() => { region.textContent = message; });
}

/**
 * Show a toast. Status toasts auto-dismiss; danger toasts do not, because a
 * fault that vanishes after four seconds is a fault nobody actioned.
 */
export function toast(message, { variant = "info", timeout = null, title = "" } = {}) {
  let stack = document.querySelector(".lt-toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "lt-toast-stack";
    document.body.appendChild(stack);
  }

  const el = document.createElement("div");
  el.className = `lt-alert lt-alert--${variant} lt-toast`;
  // THE MESSAGE IS DATA. It goes in through textContent, never through a markup
  // string. Fixed 2026-07-29 alongside the same defect in <lt-status-select>:
  // a toast carries whatever the server had to say, and a server's notice
  // routinely quotes something a user typed ("created iso material sub-group
  // 'X'"). Interpolating that into innerHTML turned a correctly escaped value
  // back into live markup, and the first consumer pipes its notices straight in
  // through `toast({{ n | tojson }})` — tojson escapes for the JS string, not
  // for HTML, so the raw characters arrive here intact. Only the icon, which is
  // this file's own fixed artwork, is still built as markup.
  el.innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true">` +
    (variant === "danger" ? `<circle cx="12" cy="12" r="9"/><path d="M12 8v4"/><path d="M12 16h.01"/>`
      : variant === "warning" ? `<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>`
      : variant === "success" ? `<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>`
      : `<circle cx="12" cy="12" r="9"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`) +
    `</svg>`;

  const body = document.createElement("div");
  if (title) {
    const strong = document.createElement("strong");
    strong.className = "lt-alert__title";
    strong.textContent = title;
    body.appendChild(strong);
  }
  const span = document.createElement("span");
  span.className = "lt-alert__body";
  span.textContent = message;
  body.appendChild(span);

  const dismiss = document.createElement("button");
  dismiss.type = "button";
  dismiss.className = "lt-btn lt-btn--ghost lt-btn--icon";
  dismiss.setAttribute("data-dismiss", "");
  dismiss.setAttribute("aria-label", "Dismiss");
  dismiss.textContent = "×";

  el.append(body, dismiss);

  stack.appendChild(el);
  el.querySelector("[data-dismiss]").addEventListener("click", () => el.remove());

  announce(`${title ? title + ". " : ""}${message}`, variant === "danger" ? "assertive" : "polite");

  const ms = timeout ?? (variant === "danger" ? 0 : 5000);
  if (ms > 0) setTimeout(() => el.remove(), ms);
  return el;
}

/* -----------------------------------------------------------------------------
   Kiosk idle reset

   An unattended kiosk must return to its start state, or the next person
   inherits the last person's session. Opt in per page:

     <body data-lt-idle-reset="90" data-lt-idle-href="/">

   Warns at ten seconds remaining rather than resetting without notice.
   -------------------------------------------------------------------------- */

function initIdleReset() {
  const seconds = Number(document.body.dataset.ltIdleReset || 0);
  if (!seconds) return;
  const href = document.body.dataset.ltIdleHref || location.pathname;
  let timer = null, warnTimer = null, warned = null;

  const reset = () => {
    clearTimeout(timer); clearTimeout(warnTimer);
    if (warned) { warned.remove(); warned = null; }
    warnTimer = setTimeout(() => {
      warned = toast("Returning to the start screen in 10 seconds. Touch anywhere to stay.",
        { variant: "warning", title: "Still there?", timeout: 0 });
    }, Math.max(0, (seconds - 10) * 1000));
    timer = setTimeout(() => { location.href = href; }, seconds * 1000);
  };

  ["pointerdown", "keydown", "touchstart", "focusin"].forEach(evt =>
    document.addEventListener(evt, reset, { passive: true })
  );
  reset();
}

/* -----------------------------------------------------------------------------
   Field audit

   A field error is two things: the chip a person sees, and the attribute
   everything else reads. Written separately, they come apart, and when they do
   the field looks wrong and reports perfectly valid. That is not only an
   accessibility fault. <lt-wizard> decides whether a step may advance by
   looking for aria-invalid="true" inside it, so a step whose fields carry only
   chips lets the user walk straight past a bad value.

   The first consumer shipped exactly this on every hand-rolled field in the
   app, and nothing anywhere complained, which is what put this here. It does
   NOT repair the markup: a system that silently rewrites what you wrote is one
   where the file and the page disagree, and this one is built on them
   agreeing. It tells you instead, and it is the same rule lt_dom_audit.py
   applies to server-rendered HTML. Keep the two in step.

   Opt in per page, the same way the kiosk reset does:

     <body data-lt-audit>

   or call auditFields() directly from a test.
   -------------------------------------------------------------------------- */

/* Native form controls only, and never a button or a hidden input. A custom
   element is deliberately absent: <lt-number-field> builds and marks its own
   inner input, which this matches after upgrade, so the host never needs to be
   a control. contenteditable is absent too, so this agrees with the Python
   mirror, which has no concept of it. */
const AUDIT_CONTROLS =
  'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]),' +
  "select,textarea";

/**
 * Find error chips whose control is not marked invalid.
 *
 * Returns an array of { field, message, problem } — empty when the page is
 * clean. Only `.lt-field__error` is audited, never `.lt-field__warning`: a
 * warning is a value that is legal but worth a second look, so it stays valid
 * on purpose and must NOT carry aria-invalid.
 */
export function auditFields(root = document) {
  const findings = [];
  for (const chip of root.querySelectorAll(".lt-field__error")) {
    const text = chip.textContent.trim();
    const field = chip.closest(".lt-field");
    if (!field) {
      // Falling back to the chip's parent here was worse than useless: the
      // parent of a form-level chip is the form, so the chip was judged
      // against every unrelated control in it, and one correctly marked field
      // elsewhere in that form made a genuinely broken one audit CLEAN. A
      // message belonging to no field belongs in .lt-alert.
      findings.push({
        field: "(no field)",
        message: text,
        problem: "error chip outside any .lt-field, so it names no control; a "
          + "form-level message is an .lt-alert, not a field error",
      });
      continue;
    }
    // Controls of THIS field, not of a .lt-field nested inside it. Without the
    // filter an inner field's control satisfied the outer field's chip.
    const controls = [...field.querySelectorAll(AUDIT_CONTROLS)]
      .filter(c => c.closest(".lt-field") === field);
    if (!controls.length) {
      // No control of its own. Legitimate only when a custom element owns one
      // and has not upgraded yet; otherwise the chip describes nothing.
      if (field.querySelector("*:not(:defined), lt-number-field")) continue;
      findings.push({
        field: field.querySelector(".lt-field__label")?.textContent?.trim() || "(unnamed field)",
        message: text,
        problem: "error chip in a .lt-field that holds no control of its own",
      });
      continue;
    }

    const label = field.querySelector(".lt-field__label")?.textContent?.trim();
    const name = label
      || controls[0].getAttribute("aria-label")
      || controls[0].name
      || controls[0].id
      || "(unnamed field)";

    const invalid = controls.filter(c => c.getAttribute("aria-invalid") === "true");
    if (!invalid.length) {
      findings.push({
        field: name,
        message: text,
        problem: "error chip with no aria-invalid=\"true\" on its control",
      });
      continue;
    }
    if (!chip.id) {
      findings.push({
        field: name,
        message: text,
        problem: "error chip has no id, so aria-describedby cannot point at it",
      });
      continue;
    }
    // The SAME control must carry both halves. Checking them independently let
    // one control be invalid while a different one described the chip.
    const described = invalid.some(c =>
      (c.getAttribute("aria-describedby") || "").split(/\s+/).includes(chip.id));
    if (!described) {
      findings.push({
        field: name,
        message: text,
        problem: "the invalid control's aria-describedby does not reference the error chip",
      });
    }
  }
  return findings;
}

function initFieldAudit() {
  if (!document.body.hasAttribute("data-lt-audit")) return;
  // Warn once per distinct problem. A subtree observer fires many times for one
  // panel swap, and the same finding repeated forty times reads as forty bugs.
  // Keyed on the message too, not just the label and the problem: a table of
  // rows can hold three fields all labelled "Quantity", and collapsing those
  // to one warning hides two real defects.
  const seen = new Set();
  let queued = false;
  const run = () => {
    queued = false;
    for (const f of auditFields()) {
      const key = `${f.field} ${f.problem} ${f.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      console.warn(`lt: ${f.field} — ${f.problem}. Chip reads "${f.message}".`);
    }
  };
  run();
  // Server-rendered apps only paint an error AFTER a failed submit, which
  // arrives as a swapped fragment long after load, so auditing once at load
  // would miss every case worth catching. Attributes are watched as well as
  // children, because removing an aria-invalid in place breaks a field just as
  // thoroughly as never rendering it. Coalesced to one pass per frame, and
  // present only when the page opts in, so no production page pays for it.
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "aria-invalid", "aria-describedby", "id"],
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { initIdleReset(); initFieldAudit(); });
} else {
  initIdleReset();
  initFieldAudit();
}

export {
  parseNumber, formatNumber, UNITS, DEFINED,
  // The date, time and size helpers are pure and are where a wrong day or a
  // wrong unit would actually come from, so they are tested directly rather
  // than only through the elements that use them.
  parseDateInput, formatDate, spellDate, isoOf, dateOf,
  parseTimeInput, formatTime,
  parseSize, formatSize, matchesAccept,
};
