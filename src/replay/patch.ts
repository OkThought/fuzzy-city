import type { ReplayPatchOperation } from "./types";

function samePrimitive(a: unknown, b: unknown) {
  return Object.is(a, b);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function diffReplayValues(
  before: unknown,
  after: unknown,
  path: (string | number)[] = [],
  operations: ReplayPatchOperation[] = [],
): ReplayPatchOperation[] {
  if (samePrimitive(before, after)) return operations;
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length !== after.length) {
      operations.push({ path, value: after });
      return operations;
    }
    for (let index = 0; index < after.length; index++)
      diffReplayValues(before[index], after[index], [...path, index], operations);
    return operations;
  }
  if (isRecord(before) && isRecord(after)) {
    for (const key of Object.keys(before))
      if (!(key in after)) operations.push({ path: [...path, key], delete: true });
    for (const [key, value] of Object.entries(after))
      if (!(key in before)) operations.push({ path: [...path, key], value });
      else diffReplayValues(before[key], value, [...path, key], operations);
    return operations;
  }
  operations.push({ path, value: after });
  return operations;
}

export function applyReplayPatch<T>(target: T, operations: ReplayPatchOperation[]): T {
  let root: unknown = target;
  for (const operation of operations) {
    if (!operation.path.length) {
      if (operation.delete) throw new Error("Replay patch cannot delete its root");
      root = structuredClone(operation.value);
      continue;
    }
    let parent = root as Record<string | number, unknown>;
    for (const key of operation.path.slice(0, -1)) {
      const next = parent[key];
      if (next === null || typeof next !== "object")
        throw new Error("Replay patch path does not exist");
      parent = next as Record<string | number, unknown>;
    }
    const key = operation.path.at(-1)!;
    if (operation.delete) {
      if (Array.isArray(parent)) throw new Error("Replay patch cannot delete array slots");
      delete parent[key];
    } else parent[key] = structuredClone(operation.value);
  }
  return root as T;
}
