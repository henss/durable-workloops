import { Archive, CheckCircle2, Clock3, KeyRound, Lock, UsersRound } from "lucide-react";
import type { DashboardTab } from "../../types.js";

export function getDashboardTabs(counts: Record<DashboardTab, number>) {
  return [
    { value: "pending", label: "Pending", heading: "Pending approval", description: "Plans waiting for a reviewer decision.", count: counts.pending, icon: <Clock3 size={16} /> },
    { value: "claimable", label: "Claimable", heading: "Claimable plans", description: "Approved or ungated plans available to executor clients.", count: counts.claimable, icon: <CheckCircle2 size={16} /> },
    { value: "locked", label: "Locked", heading: "Locked plans", description: "Plans currently leased by a client executor.", count: counts.locked, icon: <Lock size={16} /> },
    { value: "archive", label: "Archive", heading: "Completed archive", description: "Plans completed by executor clients.", count: counts.archive, icon: <Archive size={16} /> },
    { value: "users", label: "Users", heading: "Users", description: "Local accounts and roles.", count: counts.users, icon: <UsersRound size={16} /> },
    { value: "tokens", label: "Tokens", heading: "Client tokens", description: "Bearer tokens for CLI and executor clients.", count: counts.tokens, icon: <KeyRound size={16} /> },
  ] as const;
}
