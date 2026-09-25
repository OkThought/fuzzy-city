import { benchmarkConfig } from "../../../benchmark/runner";
import {
  getBenchmark,
  startBenchmark,
  stopBenchmark,
} from "../../../benchmark/service";
import { providerService } from "../../../ai/providerService";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function local(request: Request) {
  const url = new URL(request.url);
  const target = new URL(
    `${url.protocol}//${request.headers.get("host") || url.host}`,
  );
  const origin = request.headers.get("origin");
  return (
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) &&
    (!origin || origin === target.origin)
  );
}
export async function GET() {
  const service = providerService();
  return Response.json(
    {
      run: getBenchmark() ?? null,
      provider: service.provider.id,
      model: service.provider.model,
      queue: service.pool.snapshot(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  if (!local(request))
    return Response.json(
      { error: "Start stress tests from localhost." },
      { status: 403 },
    );
  try {
    const body = await request.text();
    if (body.length > 4096)
      return Response.json({ error: "Request too large" }, { status: 413 });
    const config = benchmarkConfig(JSON.parse(body));
    if (providerService().benchmarkActive)
      return Response.json(
        { error: "A benchmark is already running" },
        { status: 409 },
      );
    return Response.json({ run: startBenchmark(config) }, { status: 202 });
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Invalid benchmark request",
      },
      { status: 400 },
    );
  }
}
export async function DELETE(request: Request) {
  if (!local(request))
    return Response.json(
      { error: "Stop stress tests from localhost." },
      { status: 403 },
    );
  return Response.json({ run: stopBenchmark() ?? null });
}
