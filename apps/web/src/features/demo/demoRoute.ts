import type { DashboardTab } from "../../types.js";

export interface DemoRouteState {
  enabled: boolean;
  tab: DashboardTab;
}

const dashboardTabs: DashboardTab[] = ["pending", "claimable", "locked", "archive", "users", "tokens"];

export function readDemoRoute(search = globalThis.location?.search ?? ""): DemoRouteState {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  return {
    enabled: params.get("demo") === "1" || params.get("demo") === "true",
    tab: dashboardTabs.includes(tab as DashboardTab) ? (tab as DashboardTab) : "pending",
  };
}

export function readForcedTheme(search = globalThis.location?.search ?? ""): "light" | "dark" | undefined {
  const theme = new URLSearchParams(search).get("theme");
  return theme === "light" || theme === "dark" ? theme : undefined;
}
