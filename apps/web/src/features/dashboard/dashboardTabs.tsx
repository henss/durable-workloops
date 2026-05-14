import { Archive, CheckCircle2, Clock3, FilePlus2, KeyRound, Lock, UsersRound } from "lucide-react";
import type { DashboardTab } from "../../types.js";
import { dashboardTabCopy } from "./productCopy.js";

export function getDashboardTabs(counts: Record<DashboardTab, number>) {
  return [
    { value: "pending", ...dashboardTabCopy.pending, count: counts.pending, showCount: true, icon: <Clock3 size={16} /> },
    { value: "claimable", ...dashboardTabCopy.claimable, count: counts.claimable, showCount: true, icon: <CheckCircle2 size={16} /> },
    { value: "locked", ...dashboardTabCopy.locked, count: counts.locked, showCount: true, icon: <Lock size={16} /> },
    { value: "archive", ...dashboardTabCopy.archive, count: counts.archive, showCount: true, icon: <Archive size={16} /> },
    { value: "new-plan", ...dashboardTabCopy["new-plan"], count: counts["new-plan"], showCount: false, icon: <FilePlus2 size={16} /> },
    { value: "users", ...dashboardTabCopy.users, count: counts.users, showCount: true, icon: <UsersRound size={16} /> },
    { value: "tokens", ...dashboardTabCopy.tokens, count: counts.tokens, showCount: true, icon: <KeyRound size={16} /> },
  ] as const;
}
