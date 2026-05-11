import { describe, expect, test } from "vitest";
import { readDemoRoute, readForcedTheme } from "./demoRoute.js";

describe("demo route helpers", () => {
  test("enables screenshot demo mode and parses dashboard tab", () => {
    expect(readDemoRoute("?demo=1&tab=locked")).toEqual({
      enabled: true,
      tab: "locked",
      detailPlanId: undefined,
      detailTab: undefined,
    });
  });

  test("falls back to pending for unknown tabs", () => {
    expect(readDemoRoute("?demo=true&tab=unknown")).toEqual({
      enabled: true,
      tab: "pending",
      detailPlanId: undefined,
      detailTab: undefined,
    });
  });

  test("parses a demo detail plan id", () => {
    expect(readDemoRoute("?demo=true&detail=plan-ui-review")).toEqual({
      enabled: true,
      tab: "pending",
      detailPlanId: "plan-ui-review",
      detailTab: undefined,
    });
  });

  test("parses a demo detail tab", () => {
    expect(readDemoRoute("?demo=true&detail=plan-ui-review&detailTab=slices")).toEqual({
      enabled: true,
      tab: "pending",
      detailPlanId: "plan-ui-review",
      detailTab: "slices",
    });
  });

  test("parses only supported forced themes", () => {
    expect(readForcedTheme("?theme=dark")).toBe("dark");
    expect(readForcedTheme("?theme=auto")).toBeUndefined();
  });
});
