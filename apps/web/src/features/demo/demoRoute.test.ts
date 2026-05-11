import { describe, expect, test } from "vitest";
import { readDemoRoute, readForcedTheme } from "./demoRoute.js";

describe("demo route helpers", () => {
  test("enables screenshot demo mode and parses dashboard tab", () => {
    expect(readDemoRoute("?demo=1&tab=locked")).toEqual({ enabled: true, tab: "locked" });
  });

  test("falls back to pending for unknown tabs", () => {
    expect(readDemoRoute("?demo=true&tab=unknown")).toEqual({ enabled: true, tab: "pending" });
  });

  test("parses only supported forced themes", () => {
    expect(readForcedTheme("?theme=dark")).toBe("dark");
    expect(readForcedTheme("?theme=auto")).toBeUndefined();
  });
});
