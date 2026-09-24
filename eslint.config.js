// The React page's lint: the Livetools app rules, extended from the package
// and never copied. Scoped to src/, the React app. The vanilla files (the
// Fusion panel, the engine, the data layer, the tests, the tools, and
// legacy.html's app.js until the conversion retires it) are not React code
// and conformance.py gates them instead.
import livetools from "@livetools/ui/eslint";

export default [
  { name: "wood/react-app-only", ignores: ["**/*", "!src/", "!src/**"] },
  ...livetools.configs.recommended,
];
