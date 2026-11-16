import nextEnv from '@next/env';
import { workerConfiguration, runWorker } from './worker-runtime.mjs';
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
let configuration;
try { configuration = workerConfiguration(process.env); } catch (error) {
  console.error(error.message);
  process.exit(1);
}
const shutdown = new AbortController();
process.on('SIGTERM', () => shutdown.abort());
process.on('SIGINT', () => shutdown.abort());
process.exitCode = await runWorker({ ...configuration, signal: shutdown.signal, once: process.argv.includes('--once') });
