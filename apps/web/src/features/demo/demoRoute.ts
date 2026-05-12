import type { DashboardTab } from "../../types.js";

export interface DemoRouteState {
  enabled: boolean;
  tab: DashboardTab;
  detailPlanId?: string;
  detailTab?: "overview" | "slices" | "policies" | "raw";
}

const dashboardTabs: DashboardTab[] = ["pending", "claimable", "locked", "archive", "new-plan", "users", "tokens"];
const detailTabs = ["overview", "slices", "policies", "raw"];

export function readDemoRoute(search = globalThis.location?.search ?? ""): DemoRouteState {
  const params = new URLSearchParams(search);
  const tab = params.get("tab");
  const detailTab = params.get("detailTab");
  return {
    enabled: params.get("demo") === "1" || params.get("demo") === "true",
    tab: dashboardTabs.includes(tab as DashboardTab) ? (tab as DashboardTab) : "pending",
    detailPlanId: params.get("detail") ?? undefined,
    detailTab: detailTabs.includes(detailTab ?? "") ? (detailTab as DemoRouteState["detailTab"]) : undefined,
  };
}

export function readForcedTheme(search = globalThis.location?.search ?? ""): "light" | "dark" | undefined {
  const theme = new URLSearchParams(search).get("theme");
  return theme === "light" || theme === "dark" ? theme : undefined;
}
