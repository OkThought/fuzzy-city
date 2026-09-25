// The CLI uses the app's benchmark coordinator: ordinary simulation requests
// cannot contend with the measured workload in the same app process.
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? fallback : process.argv[i + 1];
};
const base = arg("--url", "http://localhost:3000");
const config = {
  populations: arg("--populations", "100,250,500,1000").split(",").map(Number),
  minutes: Number(arg("--minutes", "35")),
  concurrency: Number(arg("--concurrency", "1")),
  seed: arg("--seed", "fuzzy-city-001"),
};
const response = await fetch(`${base}/api/benchmark`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(config),
});
const initial = await response.json();
if (!response.ok) throw new Error(initial.error);
console.log(
  JSON.stringify({
    id: initial.run.id,
    provider: initial.run.provider,
    model: initial.run.model,
    config,
  }),
);
process.once("SIGINT", () => {
  void fetch(`${base}/api/benchmark`, { method: "DELETE" });
});
let previous = "";
while (true) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  const { run } = await (await fetch(`${base}/api/benchmark`)).json();
  if (!run || run.id !== initial.run.id)
    throw new Error(
      "Benchmark coordinator changed; inspect its persisted report.",
    );
  const latest = run.cases.at(-1);
  const update = `${run.phase} | completed=${latest?.summary.completedDecisions ?? 0} | queue=${latest?.summary.queue.current ?? 0}`;
  if (update !== previous) {
    console.log(update);
    previous = update;
  }
  if (["complete", "cancelled", "failed"].includes(run.status)) {
    console.log(JSON.stringify(run, null, 2));
    if (run.status !== "complete") process.exitCode = 1;
    break;
  }
}
export {};
