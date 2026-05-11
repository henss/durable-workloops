import "@mantine/core/styles.css";
import "./styles.css";
import React from "react";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { readForcedTheme } from "./features/demo/demoRoute.js";
import { appTheme } from "./theme.js";

const forcedColorScheme = readForcedTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme={forcedColorScheme ?? "auto"} forceColorScheme={forcedColorScheme} theme={appTheme}>
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
