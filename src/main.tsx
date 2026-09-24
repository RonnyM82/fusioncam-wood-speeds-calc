import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { LivetoolsProvider } from "@livetools/ui";
import "./globals.css";
import { App } from "./App";

// scheme="system": the page follows the device's light or dark setting, as it
// always has (the plan's rulings). The provider's own default is light, which
// would give every dark-mode user a light page. Density and theme are what the
// page ran on before the conversion, where the tokens' defaults applied.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LivetoolsProvider scheme="system" density="comfortable" theme="operational">
      <App />
    </LivetoolsProvider>
  </StrictMode>,
);
