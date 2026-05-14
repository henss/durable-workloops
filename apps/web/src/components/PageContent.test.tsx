import { MantineProvider } from "@mantine/core";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { appTheme } from "../theme.js";
import { PageContent, pageContentMaxWidth } from "./PageContent.js";

describe("PageContent", () => {
  it("renders a wide centered shell for queue dashboards", () => {
    const html = renderToStaticMarkup(
      <MantineProvider theme={appTheme}>
        <PageContent mode="wide" dataTestId="queue-content">
          Queue dashboard
        </PageContent>
      </MantineProvider>,
    );

    expect(pageContentMaxWidth.wide).toContain("100rem");
    expect(html).toContain('data-layout-mode="wide"');
    expect(html).toContain('data-testid="queue-content"');
    expect(html).toContain("Queue dashboard");
  });
});
