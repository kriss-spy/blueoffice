import type { Frame } from "./rpc.js";

/** Hold possible credential prefixes until the next delta proves them safe. */
export class FrameRedactor {
  private tails = new Map<unknown, string>();
  constructor(private secret: string | undefined) {}

  checkpoint(session: string, snapshot: Record<string, unknown>) {
    this.tails.delete(session);
    const inflight = snapshot.inflight as Record<string, unknown> | undefined;
    if (!inflight || typeof inflight.assistant !== "string") return;
    const original = inflight.assistant;
    // Native snapshot text is cumulative but may end midway through a key.
    // Seed the same redactor used by subsequent deltas before publishing it.
    const [safe] = this.frames({
      jsonrpc: "2.0",
      method: "event",
      params: {
        session_id: session,
        type: "message.delta",
        payload: { text: original },
      },
    });
    inflight.assistant = (safe.params!.payload as Record<string, unknown>).text;
    if (Array.isArray(snapshot.messages))
      for (const row of snapshot.messages)
        if (row?.role === "assistant" && row.text === original)
          row.text = inflight.assistant;
  }

  frames(frame: Frame): Frame[] {
    if (!this.secret) return [frame];
    const secret = this.secret;
    const result: Frame[] = [];
    const params = frame.params;
    const payload = params?.payload as Record<string, unknown> | undefined;
    const session = params?.session_id;
    if (frame.method === "event" && payload) {
      if (
        params?.type === "message.delta" &&
        typeof payload.text === "string"
      ) {
        let safe = ((this.tails.get(session) ?? "") + payload.text).replaceAll(
          secret,
          "[redacted]",
        );
        let held = 0;
        for (
          let length = Math.min(secret.length - 1, safe.length);
          length > 0;
          length--
        ) {
          if (safe.endsWith(secret.slice(0, length))) {
            held = length;
            break;
          }
        }
        this.tails.set(session, held ? safe.slice(-held) : "");
        payload.text = held ? safe.slice(0, -held) : safe;
      } else if (
        params?.type === "message.complete" ||
        params?.type === "message.interim"
      ) {
        const tail = this.tails.get(session);
        // Full terminal text replaces streamed text. Empty terminal text retains it.
        if (tail && (!payload.text || payload.already_streamed === false)) {
          result.push({
            jsonrpc: "2.0",
            method: "event",
            params: {
              ...params,
              type: "message.delta",
              seq: `${params.seq}:redaction-tail`,
              payload: { text: tail },
            },
          });
        }
        this.tails.delete(session);
      }
    }
    result.push(frame);
    // Other public strings, including requests and RPC results, need ordinary redaction too.
    return result.map(
      (item) =>
        JSON.parse(JSON.stringify(item), (_key, value) =>
          typeof value === "string"
            ? value.replaceAll(secret, "[redacted]")
            : value,
        ) as Frame,
    );
  }
}
