import type { ChatItem, OfficeAgent } from "../shared/office.js";

/** Only the native public display projection enters a recovery checkpoint. */
export function recoverHistory(
  agent: OfficeAgent,
  snapshot: Record<string, unknown>,
) {
  if (!Array.isArray(snapshot.messages) || snapshot.messages_omitted === true)
    throw new Error("Native recovery did not include public history.");
  const previous = agent.messages.filter((m) => m.epoch === agent.epoch);
  const used = new Set<string>();
  let index = 0;
  const recovered: ChatItem[] = [];
  const rows = [...snapshot.messages];
  const inflight = snapshot.inflight as Record<string, unknown> | undefined;
  if (inflight && typeof inflight === "object") {
    // Native history may lag the current public turn. Never project its error body,
    // display metadata, corrections, reasoning, tool arguments or results.
    const lastUser = rows.findLastIndex((r) => r?.role === "user");
    const tail = lastUser >= 0 ? rows.slice(lastUser) : [];
    for (const role of ["user", "assistant"] as const) {
      const content = inflight[role];
      const active =
        role === "assistant" && snapshot.running === true && !inflight.error;
      if (
        typeof content !== "string" ||
        (!content && !active) ||
        (role === "assistant" && inflight.error)
      )
        continue;
      const matching = tail.find(
        (row) => row?.role === role && row.text === content,
      );
      if (matching) {
        if (active)
          rows[rows.indexOf(matching)] = { ...matching, recoveryActive: true };
      } else rows.push({ role, text: content, recoveryActive: active });
    }
  }
  for (const value of rows) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    if (
      !["user", "assistant"].includes(String(row.role)) ||
      typeof row.text !== "string"
    )
      continue;
    const active = row.recoveryActive === true;
    const old =
      (active
        ? previous.find(
            (m) => m.id === agent.activeMessageId && m.turnId === agent.turnId,
          )
        : undefined) ??
      previous
        .slice(index)
        .find(
          (m) =>
            m.role === row.role &&
            (m.text === row.text ||
              (m.state === "streaming" && String(row.text).startsWith(m.text))),
        );
    if (old) {
      used.add(old.id);
      index = previous.indexOf(old) + 1;
    }
    recovered.push({
      id:
        old?.id ??
        `recovered:${agent.epoch}:${recovered.length}:${String(row.row_id ?? "row")}`,
      epoch: agent.epoch!,
      turnId:
        old?.turnId ??
        (active && agent.turnId ? agent.turnId : `recovered:${agent.epoch}`),
      role: row.role as "user" | "assistant",
      text: row.text,
      // Historical text proves content, not a missing terminal outcome.
      state:
        old && !["streaming", "pending"].includes(old.state)
          ? old.state
          : "unknown",
      at: old?.at ?? new Date().toISOString(),
      chunkIds: old?.chunkIds ?? [],
    });
    if (active) agent.activeMessageId = recovered.at(-1)!.id;
  }
  // An unacknowledged user message or streaming tail may not have reached native history yet.
  for (const message of previous)
    if (
      !used.has(message.id) &&
      (message.turnId === agent.turnId || message.role === "tool")
    )
      recovered.push({
        ...message,
        state: ["pending", "streaming"].includes(message.state)
          ? "unknown"
          : message.state,
      });
  agent.messages = [
    ...agent.messages.filter((m) => m.epoch !== agent.epoch),
    ...recovered,
  ];
}
