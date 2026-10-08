import type { Frame } from "./rpc.js";

/** Sequence before redaction: a secret may span ordered message fragments. */
export class EventSequence {
  private sessions = new Map<
    string,
    { cursor: number; pending: Map<number, Frame> }
  >();
  private state(session: string) {
    let state = this.sessions.get(session);
    if (!state) {
      state = { cursor: 0, pending: new Map() };
      this.sessions.set(session, state);
    }
    return state;
  }
  hasGap(session: string) {
    return this.state(session).pending.size > 0;
  }
  cursor(session: string) {
    return this.state(session).cursor;
  }
  accept(frame: Frame): { frames: Frame[]; gap?: string } {
    const { seq, session_id: session } = frame.params ?? {};
    if (
      frame.method !== "event" ||
      typeof session !== "string" ||
      !Number.isSafeInteger(seq) ||
      Number(seq) < 1
    )
      return { frames: [frame] };
    const state = this.state(session);
    if (Number(seq) > state.cursor && !state.pending.has(Number(seq))) {
      if (state.pending.size >= 1024 && !state.pending.has(Number(seq)))
        throw new Error("Native event recovery buffer exceeded its limit.");
      if (JSON.stringify([...state.pending.values(), frame]).length > 4_000_000)
        throw new Error(
          "Native event recovery buffer exceeded its byte limit.",
        );
      state.pending.set(Number(seq), frame);
    }
    const frames: Frame[] = [];
    while (state.pending.has(state.cursor + 1)) {
      frames.push(state.pending.get(++state.cursor)!);
      state.pending.delete(state.cursor);
    }
    return { frames, ...(state.pending.size ? { gap: session } : {}) };
  }
  checkpoint(session: string, cursor: number): Frame[] {
    const state = this.state(session);
    if (cursor < state.cursor)
      throw new Error("Native checkpoint moved backwards.");
    state.cursor = cursor;
    for (const seq of state.pending.keys())
      if (seq <= cursor) state.pending.delete(seq);
    const frames: Frame[] = [];
    while (state.pending.has(state.cursor + 1)) {
      frames.push(state.pending.get(++state.cursor)!);
      state.pending.delete(state.cursor);
    }
    return frames;
  }
}
