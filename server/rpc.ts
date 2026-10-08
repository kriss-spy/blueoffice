import {
  spawn,
  type ChildProcessWithoutNullStreams,
  type SpawnOptionsWithoutStdio,
} from "node:child_process";
import { EventEmitter } from "node:events";

export type Frame = {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string };
};
export class RpcFailure extends Error {
  constructor(
    message: string,
    public uncertain = false,
  ) {
    super(message);
  }
}
export interface Launch {
  executable: string;
  args: string[];
  options: SpawnOptionsWithoutStdio;
}

/** One transport belongs to one child. No global process name/PID lookup is used for signals. */
export class RpcChild extends EventEmitter {
  readonly child: ChildProcessWithoutNullStreams;
  readonly ready: Promise<void>;
  readonly exited: Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private nextId = 0;
  private failed = false;
  private exitObserved = false;
  private ownsGroup: boolean;
  constructor(launch: Launch, timeout = 20_000) {
    super();
    this.child = spawn(launch.executable, launch.args, {
      ...launch.options,
      shell: false,
      stdio: "pipe",
    });
    this.ownsGroup =
      launch.options.detached === true && process.platform === "linux";
    let readyResolve!: () => void, readyReject!: (error: Error) => void;
    this.ready = new Promise((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
    });
    // Attach rejection handling immediately, even when process exit wins the startup race.
    void this.ready.catch(() => {});
    const readyTimer = setTimeout(
      () =>
        this.fail(
          new RpcFailure(
            "Hermes did not become ready before the startup deadline.",
          ),
        ),
      timeout,
    );
    this.once("failure", (error) => {
      clearTimeout(readyTimer);
      readyReject(error);
    });
    this.exited = new Promise((resolve) => {
      const exited = (code: number | null, signal: NodeJS.Signals | null) => {
        if (this.exitObserved) return;
        this.exitObserved = true;
        clearTimeout(readyTimer);
        this.fail(
          new RpcFailure(
            `Owned runtime exited (${signal ?? code ?? "unknown"}).`,
            true,
          ),
        );
        resolve({ code, signal });
        this.emit("exit", { code, signal });
        this.child.stdin.destroy();
        this.child.stdout.destroy();
        this.child.stderr.destroy();
      };
      this.child.once("exit", exited);
      this.child.once("close", exited); // Failed spawn emits close without exit.
    });
    this.child.on("error", () =>
      this.fail(
        new RpcFailure("Could not launch the trusted Hermes interpreter."),
      ),
    );
    this.child.stdin.on("error", () =>
      this.fail(
        new RpcFailure("The owned runtime command channel closed.", true),
      ),
    );
    const secret = launch.options.env?.BLUEOFFICE_PROXY_KEY;
    const redact = (_key: string, value: unknown) =>
      typeof value === "string" && secret
        ? value.replaceAll(secret, "[redacted]")
        : value;
    let buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => {
      if (this.failed) return;
      buffer += chunk;
      if (buffer.length > 4_000_000) {
        this.fail(
          new RpcFailure("Hermes exceeded the protocol frame limit.", true),
        );
        return;
      }
      let newline: number;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (!line.trim()) continue;
        try {
          const frame = JSON.parse(line, redact) as Frame;
          if (!frame || frame.jsonrpc !== "2.0" || typeof frame !== "object")
            throw new Error();
          if (
            frame.method === "event" &&
            frame.params?.type === "gateway.ready"
          ) {
            clearTimeout(readyTimer);
            readyResolve();
          }
          if (!frame.method && typeof frame.id === "number") {
            const pending = this.pending.get(frame.id);
            if (pending) {
              this.pending.delete(frame.id);
              clearTimeout(pending.timer);
              // Raw upstream errors can contain credentials or private arguments.
              if (frame.error)
                pending.reject(
                  new RpcFailure(
                    `Hermes rejected the operation (RPC ${Number.isInteger(frame.error.code) ? frame.error.code : "unknown"}).`,
                  ),
                );
              else pending.resolve(frame.result);
            }
          } else this.emit("frame", frame);
        } catch {
          this.fail(
            new RpcFailure("Hermes emitted a malformed protocol frame.", true),
          );
          return;
        }
      }
    });
    // Drain stderr, but never forward raw process diagnostics/secrets to ordinary logs or clients.
    this.child.stderr.on("data", () => {});
  }
  private fail(error: RpcFailure) {
    if (this.failed) return;
    this.failed = true;
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(error);
    }
    this.pending.clear();
    this.emit("failure", error);
  }
  request<T = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown>,
    timeout = 15_000,
  ): Promise<T> {
    if (this.failed)
      return Promise.reject(
        new RpcFailure(
          "Runtime transport is unavailable. Reconcile before retrying.",
          true,
        ),
      );
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new RpcFailure(
            "Hermes acknowledgement timed out; delivery is unknown.",
            true,
          ),
        );
      }, timeout);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      this.child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n",
      );
    });
  }
  response(id: string | number, result: unknown) {
    if (this.failed)
      throw new RpcFailure(
        "Runtime transport is unavailable; reply delivery is unknown.",
        true,
      );
    this.child.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n",
    );
  }
  async stop(grace = 5_000) {
    if (this.exitObserved) return { forced: false, ...(await this.exited) };
    this.child.kill("SIGTERM");
    let timer: NodeJS.Timeout | undefined;
    const exited = await Promise.race([
      this.exited.then(() => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), grace);
      }),
    ]);
    clearTimeout(timer);
    if (!exited) {
      // A live detached child is the verified leader of this owned process group.
      // Kill the group only while that handle still proves ownership, never by saved PID.
      if (
        this.ownsGroup &&
        this.child.pid &&
        this.child.exitCode === null &&
        this.child.signalCode === null
      ) {
        try {
          process.kill(-this.child.pid, "SIGKILL");
        } catch {
          this.child.kill("SIGKILL");
        }
      } else this.child.kill("SIGKILL");
      await this.exited;
    }
    return { forced: !exited, ...(await this.exited) };
  }
}
