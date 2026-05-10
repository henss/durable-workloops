import type { AuditEvent, PlanRecord, User } from "@agent-workloops/api";

export type Session = { user: User };
export type PlanDetailRecord = { plan: PlanRecord; audit: AuditEvent[] };
export type DashboardTab = "pending" | "claimable" | "locked" | "archive" | "users" | "tokens";
export type ColorSchemePreference = "light" | "dark" | "auto";
