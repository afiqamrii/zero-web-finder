import { spawn } from 'node:child_process';
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start'], { stdio: 'inherit', env: process.env });
let stopping = false;
let worker, restartTimer, shutdownTimer;
let exitCode = 0;
function finishShutdown() {
  if (!stopping) return;
  const exited = child => !child || child.exitCode !== null || child.signalCode !== null || !child.pid;
  if (exited(app) && exited(worker)) { clearTimeout(shutdownTimer); process.exit(exitCode); }
}
function startWorker() {
  worker = spawn(process.execPath, ['scripts/worker.mjs'], { stdio: 'inherit', env: process.env });
  worker.on('error', () => stop(1));
  worker.on('exit', code => {
    if (stopping) { finishShutdown(); return; }
    console.error(`Automation worker stopped (${code}); restarting in five seconds.`);
    restartTimer = setTimeout(startWorker, 5000);
  });
}
startWorker();
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  clearTimeout(restartTimer);
  // Allow the active web request to finish before Render's 300-second deadline.
  shutdownTimer = setTimeout(() => { app.kill('SIGKILL'); worker?.kill('SIGKILL'); process.exit(exitCode || 1); }, 290000);
  app.kill('SIGTERM'); worker?.kill('SIGTERM');
  finishShutdown();
}
app.on('error', () => stop(1));
app.on('exit', code => { if (stopping) finishShutdown(); else stop(code ?? 1); });
process.on('SIGTERM', () => stop());
process.on('SIGINT', () => stop());
