import { cpSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, '.next', 'standalone');
if (!existsSync(path.join(output, 'server.js'))) {
  console.error('Production build missing. Run pnpm build first.');
  process.exit(1);
}
// Standalone intentionally omits static assets. Copy these for local production
// starts; the Dockerfile performs the equivalent copy when building the image.
cpSync(path.join(root, '.next', 'static'), path.join(output, '.next', 'static'), { recursive: true });
if (existsSync(path.join(root, 'public'))) cpSync(path.join(root, 'public'), path.join(output, 'public'), { recursive: true });
const portFlag = process.argv.indexOf('--port');
if (portFlag !== -1) process.env.PORT = process.argv[portFlag + 1];
process.env.HOSTNAME = '0.0.0.0';
await import('../.next/standalone/server.js');
