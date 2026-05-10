import type { PlanRecord } from "@agent-workloops/api";

export interface PlanBuckets {
  pending: PlanRecord[];
  claimable: PlanRecord[];
  locked: PlanRecord[];
  other: PlanRecord[];
}

export function bucketPlans(plans: PlanRecord[]): PlanBuckets {
  return plans.reduce<PlanBuckets>(
    (buckets, plan) => {
      if (plan.approvalStatus === "pending") {
        buckets.pending.push(plan);
      } else if (plan.status === "locked") {
        buckets.locked.push(plan);
      } else if (
        plan.status === "queued" &&
        (plan.approvalStatus === "approved" || plan.approvalStatus === "not_required")
      ) {
        buckets.claimable.push(plan);
      } else {
        buckets.other.push(plan);
      }
      return buckets;
    },
    { pending: [], claimable: [], locked: [], other: [] },
  );
}
