import { presentAgent, type OfficeAgent } from "./office.js";

/** Initial/replayed history is not a new completion. A pending request consumes, but suppresses, a cue. */
export class CompletionTracker {
  private initialized = false;
  private seen = new Set<string>();
  observe(agents: OfficeAgent[], connected: boolean): string[] {
    const cues: string[] = [];
    for (const agent of agents) {
      const view = presentAgent(agent, connected);
      if (!view.terminalKey || this.seen.has(view.terminalKey)) continue;
      this.seen.add(view.terminalKey);
      if (this.initialized && view.canCelebrate) cues.push(agent.id);
    }
    if (connected) this.initialized = true;
    return cues;
  }
}
