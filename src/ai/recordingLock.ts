import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function recordingOwnsGpu() {
  const path = join(process.cwd(), ".recording-gpu.lock");
  if (!existsSync(path)) return false;
  try {
    const { pid } = JSON.parse(readFileSync(path, "utf8"));
    if (!Number.isInteger(pid) || pid <= 0) return true;
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== "ESRCH";
  }
}
