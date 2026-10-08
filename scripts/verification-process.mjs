import { spawn } from "node:child_process";

/** Bounded even when a detached descendant retains the child's stdout/stderr pipes. */
export function runProcess({
  executable,
  args,
  env,
  timeout = 180_000,
  killGrace = 10_000,
  signal,
  onStdout,
  onStderr,
}) {
  if (signal?.aborted)
    return Promise.resolve({
      code: null,
      signal: "SIGTERM",
      interrupted: true,
    });
  return new Promise((resolve) => {
    const child = spawn(executable, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let timedOut = false,
      interrupted = false,
      error,
      finished = false,
      escalation;
    const kill = (value) => {
      if (!child.pid) return;
      try {
        process.kill(
          process.platform === "win32" ? child.pid : -child.pid,
          value,
        );
      } catch (failure) {
        if (failure.code !== "ESRCH") error = failure.message;
      }
    };
    const finish = (code, terminationSignal) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearTimeout(escalation);
      signal?.removeEventListener("abort", abort);
      resolve({
        code,
        signal: terminationSignal,
        error,
        timedOut,
        interrupted,
      });
    };
    const terminate = () => {
      kill("SIGTERM");
      if (escalation) return;
      escalation = setTimeout(() => {
        kill("SIGKILL");
        // A detached grandchild can escape the group and keep these pipes open.
        // Finalization must be bounded independently of child.close.
        child.stdout.destroy();
        child.stderr.destroy();
        finish(child.exitCode, child.signalCode ?? "SIGKILL");
      }, killGrace);
    };
    const abort = () => {
      interrupted = true;
      terminate();
    };
    const deadline = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeout);
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", onStdout ?? (() => {}));
    child.stderr.on("data", onStderr ?? (() => {}));
    child.once("error", (failure) => {
      error = failure.message;
      finish(null, null);
    });
    child.once("close", finish);
  });
}
