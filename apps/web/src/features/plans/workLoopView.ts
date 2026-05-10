import type { WorkLoop } from "@agent-workloops/api";

export function countSlicesByStatus(workLoop: WorkLoop): Record<string, number> {
  return workLoop.slices.reduce<Record<string, number>>((counts, slice) => {
    counts[slice.status] = (counts[slice.status] ?? 0) + 1;
    return counts;
  }, {});
}

export function getBlockedByLabels(slice: WorkLoop["slices"][number], workLoop: WorkLoop): string[] {
  return slice.dependsOn.map((dependencyId) => {
    const dependency = workLoop.slices.find((candidate) => candidate.id === dependencyId);
    return dependency ? dependency.title : dependencyId;
  });
}

export function getSliceProgress(workLoop: WorkLoop): { completed: number; total: number; value: number } {
  const total = workLoop.slices.length;
  const completed = workLoop.slices.filter((slice) => slice.status === "done").length;
  return {
    completed,
    total,
    value: total === 0 ? 0 : Math.round((completed / total) * 100),
  };
}
