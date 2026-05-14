import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { appTheme } from "../../theme.js";
import { PlanLifecycleHelp } from "./PlanLifecycleHelp.js";

describe("PlanLifecycleHelp", () => {
  it("renders a compact lifecycle strip with the current step announced", () => {
    const html = renderToStaticMarkup(
      <MantineProvider theme={appTheme}>
        <PlanLifecycleHelp activeTab="claimable" />
      </MantineProvider>,
    );

    expect(html).toContain("Plan lifecycle");
    expect(html).toContain("How this works");
    expect(html).toContain("Ready to Claim");
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Current");
    expect(html).not.toContain("System model");
  });
});

