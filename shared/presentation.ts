import { presentAgent, type OfficeAgent } from "./office.js";

export type CompletionCues = Record<string, { key: string; until: number }>;

/** Losing eligibility cancels a running cue permanently, even if the same turn becomes eligible again. */
export function updateCompletionCues(
  previous: CompletionCues,
  agents: OfficeAgent[],
  connected: boolean,
  newlyCompleted: string[],
  until: number,
): CompletionCues {
  const views = new Map(
    agents.map((agent) => [agent.id, presentAgent(agent, connected)]),
  );
  const next = Object.fromEntries(
    Object.entries(previous).filter(([id, cue]) => {
      const view = views.get(id);
      return view?.canCelebrate && view.terminalKey === cue.key;
    }),
  );
  for (const id of newlyCompleted) {
    const view = views.get(id);
    if (view?.canCelebrate && view.terminalKey)
      next[id] = { key: view.terminalKey, until };
  }
  return Object.keys(previous).length === Object.keys(next).length &&
    Object.entries(next).every(([id, cue]) => previous[id] === cue)
    ? previous
    : next;
}

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
