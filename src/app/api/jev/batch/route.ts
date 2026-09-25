import { validJob } from "../../../../ai/jevApiTypes";
import { providerService } from "../../../../ai/providerService";
import { recordingOwnsGpu } from "../../../../ai/recordingLock";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const url = new URL(request.url);
  const expectedOrigin = `${url.protocol}//${request.headers.get("host") || url.host}`;
  if (origin && origin !== expectedOrigin)
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
    if (recordingOwnsGpu()) return Response.json({ error: "Recorder owns the local GPU." }, { status: 409 });
    const service = providerService();
    if (service.benchmarkActive)
      return Response.json(
        { error: "Benchmark owns the provider. Wait for it to finish." },
        { status: 409 },
      );
    const results = await service.engine.evaluate(jobs);
    return Response.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Decision backend unavailable",
      },
      { status: 503 },
    );
  }
}
