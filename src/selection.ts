import type { WorkLoop, WorkLoopSlice } from "./schema.js";

export function selectNextWorkLoopSlice(workLoop: WorkLoop): WorkLoopSlice | undefined {
  const doneSliceIds = new Set(
    workLoop.slices.filter((slice) => slice.status === "done").map((slice) => slice.id),
  );
  return workLoop.slices.find(
    (slice) =>
      (slice.status === "repair_queued" || slice.status === "ready") &&
      slice.dependsOn.every((dependency) => doneSliceIds.has(dependency)),
  );
}

export function selectRunningWorkLoopSlice(workLoop: WorkLoop): WorkLoopSlice | undefined {
  return workLoop.slices.find((slice) => slice.status === "running");
}

export function markSliceRunning(workLoop: WorkLoop, sliceId: string): WorkLoop {
  return {
    ...workLoop,
    status: "active",
    slices: workLoop.slices.map((slice) =>
      slice.id === sliceId
        ? {
            ...slice,
            status: "running",
            attemptCount: slice.attemptCount + 1,
          }
        : slice,
    ),
  };
}
