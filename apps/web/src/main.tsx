import "@mantine/core/styles.css";
import React from "react";
import { MantineProvider } from "@mantine/core";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { appTheme } from "./theme.js";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MantineProvider defaultColorScheme="auto" theme={appTheme}>
      <App />
    </MantineProvider>
  </React.StrictMode>,
);
