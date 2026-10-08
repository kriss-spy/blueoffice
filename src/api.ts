import { applyEventBatch, type EventBatch } from "../shared/events";
import type { Snapshot } from "../shared/office";
let csrf = "";
export async function session(signal?: AbortSignal): Promise<Snapshot> {
  const response = await fetch("/api/session", { signal });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error ?? "Could not connect to BlueOffice.");
  signal?.throwIfAborted();
  csrf = data.csrf;
  return data.snapshot;
}
export async function command(
  path: string,
  body: unknown = {},
): Promise<unknown> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-BlueOffice-CSRF": csrf },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "The command failed.");
  return data;
}

/** Reauthenticate and take a fresh checkpoint after every broken stream. Commands are never retried. */
export function connectOffice(
  onSnapshot: (snapshot: Snapshot) => void,
  onConnection: (connected: boolean) => void,
  onError: (message: string) => void,
) {
  let stopped = false,
    generation = 0,
    stream: EventSource | undefined,
    attempt: AbortController | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  const reconnect = () => {
    if (stopped) return;
    generation++;
    attempt?.abort();
    stream?.close();
    onConnection(false);
    clearTimeout(timer);
    timer = setTimeout(() => void connect(), 500);
  };
  const connect = async () => {
    const token = ++generation;
    attempt?.abort();
    attempt = new AbortController();
    clearTimeout(timer);
    stream?.close();
    onConnection(false);
    try {
      let current = await session(attempt.signal);
      if (stopped || token !== generation) return;
      onSnapshot(current);
      stream = new EventSource(
        `/api/events?since=${current.revision}&journal=${encodeURIComponent(current.journalId ?? "")}`,
      );
      const receive = (event: MessageEvent, full: boolean) => {
        if (stopped || token !== generation) return;
        try {
          current = full
            ? (JSON.parse(event.data) as Snapshot)
            : applyEventBatch(current, JSON.parse(event.data) as EventBatch);
          onSnapshot(current);
          onConnection(true);
        } catch {
          reconnect();
        }
      };
      stream.addEventListener("snapshot", (event) =>
        receive(event as MessageEvent, true),
      );
      stream.addEventListener("updates", (event) =>
        receive(event as MessageEvent, false),
      );
      stream.onerror = () => {
        if (token === generation) reconnect();
      };
    } catch (error) {
      if (stopped || token !== generation) return;
      onError((error as Error).message);
      reconnect();
    }
  };
  const online = () => void connect();
  window.addEventListener("online", online);
  void connect();
  return () => {
    stopped = true;
    attempt?.abort();
    generation++;
    clearTimeout(timer);
    stream?.close();
    window.removeEventListener("online", online);
  };
}
