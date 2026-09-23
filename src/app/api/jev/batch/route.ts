import { validJob } from "../../../../ai/jevApiTypes";
import { evaluateLive, serverPool } from "../../../../ai/jevServer";
import { mockEvaluation } from "../../../../ai/mockEngine";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json({ error: "Origin not allowed" }, { status: 403 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 1_000_000)
      return Response.json({ error: "Batch too large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const jobs = (body as { jobs?: unknown })?.jobs;
  if (
    !Array.isArray(jobs) ||
    jobs.length < 1 ||
    jobs.length > 32 ||
    !jobs.every(validJob)
  )
    return Response.json(
      { error: "Expected 1–32 valid simulation jobs" },
      { status: 400 },
    );
  try {
    const results = await Promise.all(
      jobs.map((job) =>
        serverPool.run(async () =>
          process.env.JEV_MODE === "live"
            ? evaluateLive(job, {
                key: process.env.TYPESAFE_API_KEY ?? "",
                model: process.env.TYPESAFE_MODEL || "jev-latest",
              })
            : mockEvaluation(job),
        ),
      ),
    );
    return Response.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return Response.json(
      { error: "Decision queue full. Try later." },
      { status: 503 },
    );
  }
}
