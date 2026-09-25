import type { World } from "./types";
export function exportRun(world: World) {
  return {
    schemaVersion: "fuzzy-city/v1",
    config: {
      seed: world.seed,
      population: world.citizens.length,
      mode: world.mode,
      memoryLimit: 12,
      initialMinute: 990,
      tickMinutes: 1,
      modelNames: [...new Set(world.traces.map((t) => t.model))],
    },
    seed: world.seed,
    cityPrincipleHistory: world.principleHistory,
    metricsByDay: world.metrics,
    decisionTraces: world.traces,
    judgmentCount: world.judgments,
    tokenUsage: { input: world.inputTokens, output: world.outputTokens },
    world,
  };
}
export function downloadRun(world: World) {
  const blob = new Blob([JSON.stringify(exportRun(world))], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fuzzy-city-${world.seed}-day-${world.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
// IndexedDB keeps the full causal history together with the resumable RNG state.
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("fuzzy-city", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("runs");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveRun(world: World) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("runs", "readwrite");
      transaction.objectStore("runs").put(structuredClone(world), "latest");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}
export async function loadRun(): Promise<World | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction("runs").objectStore("runs").get("latest");
      request.onsuccess = () => resolve(request.result as World | undefined);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
