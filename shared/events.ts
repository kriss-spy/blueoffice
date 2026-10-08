import type { ChatItem, OfficeAgent, Snapshot } from "./office.js";

type Collections = "messages" | "requests" | "receipts" | "conversations";
type Collection<T> = { upsert: T[]; remove: string[]; order?: string[] };
export interface AgentChange {
  fields: Partial<Omit<OfficeAgent, Collections>>;
  unset: string[];
  messages: Collection<ChatItem> & {
    append: { id: string; text: string; chunkIds: string[] }[];
  };
  requests: Collection<OfficeAgent["requests"][number]>;
  receipts: Collection<OfficeAgent["receipts"][number]>;
  conversations: Collection<OfficeAgent["conversations"][number]>;
}
export interface OfficeEvent {
  revision: number;
  key: string;
  agentId: string;
  kind: string;
  at: string;
  change: AgentChange;
}
export interface EventBatch {
  journalId: string;
  from: number;
  to: number;
  events: OfficeEvent[];
  context: Pick<Snapshot, "routes" | "mode" | "pendingAdoptions">;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function collection<T>(
  previous: T[],
  next: T[],
  key: (item: T) => string,
): Collection<T> {
  const before = new Map(previous.map((item) => [key(item), item]));
  const after = new Set(next.map(key));
  return {
    ...(!same(previous.map(key), next.map(key))
      ? { order: next.map(key) }
      : {}),
    upsert: next.filter((item) => !same(item, before.get(key(item)))),
    remove: previous.filter((item) => !after.has(key(item))).map(key),
  };
}
export function agentChange(
  previous: OfficeAgent | undefined,
  next: OfficeAgent,
): AgentChange {
  const { messages, requests, receipts, conversations, ...fields } = next;
  const changedFields = Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => !same(value, previous?.[key as keyof OfficeAgent]),
    ),
  );
  const changedMessages = collection(
    previous?.messages ?? [],
    messages,
    (m) => m.id,
  );
  const append: AgentChange["messages"]["append"] = [];
  changedMessages.upsert = changedMessages.upsert.filter((message) => {
    const old = previous?.messages.find((m) => m.id === message.id);
    if (
      !old ||
      !message.text.startsWith(old.text) ||
      !same(message.chunkIds.slice(0, old.chunkIds.length), old.chunkIds)
    )
      return true;
    const { text: _oldText, chunkIds: _oldIds, ...oldFields } = old;
    const { text: _newText, chunkIds: _newIds, ...newFields } = message;
    if (!same(oldFields, newFields)) return true;
    append.push({
      id: message.id,
      text: message.text.slice(old.text.length),
      chunkIds: message.chunkIds.slice(old.chunkIds.length),
    });
    return false;
  });
  return {
    fields: changedFields,
    unset: Object.keys(previous ?? {}).filter(
      (key) =>
        !["messages", "requests", "receipts", "conversations"].includes(key) &&
        fields[key as keyof typeof fields] === undefined,
    ),
    messages: { ...changedMessages, append },
    requests: collection(previous?.requests ?? [], requests, (r) => r.id),
    receipts: collection(previous?.receipts ?? [], receipts, (r) => r.id),
    conversations: collection(
      previous?.conversations ?? [],
      conversations,
      (c) => c.epoch,
    ),
  };
}
function applyCollection<T>(
  current: T[],
  change: Collection<T>,
  key: (item: T) => string,
): T[] {
  const result = new Map(
    current
      .filter((item) => !change.remove.includes(key(item)))
      .map((item) => [key(item), item]),
  );
  for (const item of change.upsert) result.set(key(item), item);
  return change.order
    ? change.order.map((id) => {
        const item = result.get(id);
        if (!item)
          throw new Error("Collection replay requires a new snapshot.");
        return item;
      })
    : [...result.values()];
}
export function applyAgentChange(
  current: OfficeAgent | undefined,
  change: AgentChange,
): OfficeAgent {
  const messages = applyCollection(
    current?.messages ?? [],
    change.messages,
    (m) => m.id,
  );
  for (const item of change.messages.append) {
    const index = messages.findIndex((m) => m.id === item.id);
    if (index < 0) throw new Error("Message replay requires a new snapshot.");
    const previous = messages[index];
    messages[index] = {
      ...previous,
      text: previous.text + item.text,
      chunkIds: [...previous.chunkIds, ...item.chunkIds],
    };
  }
  const fields = { ...current, ...change.fields };
  for (const key of change.unset) delete fields[key as keyof typeof fields];
  return {
    ...fields,
    messages,
    requests: applyCollection(
      current?.requests ?? [],
      change.requests,
      (r) => r.id,
    ),
    receipts: applyCollection(
      current?.receipts ?? [],
      change.receipts,
      (r) => r.id,
    ),
    conversations: applyCollection(
      current?.conversations ?? [],
      change.conversations,
      (c) => c.epoch,
    ),
  } as OfficeAgent;
}
export function applyEventBatch(
  current: Snapshot,
  batch: EventBatch,
): Snapshot {
  if (batch.journalId !== current.journalId || batch.from > current.revision)
    throw new Error("Event gap requires a new snapshot.");
  if (batch.to < current.revision) return current;
  let revision = current.revision;
  const agents = new Map(current.agents.map((a) => [a.id, a]));
  for (const event of batch.events) {
    if (event.revision <= revision) continue;
    if (event.revision !== revision + 1)
      throw new Error("Event order requires a new snapshot.");
    agents.set(
      event.agentId,
      applyAgentChange(agents.get(event.agentId), event.change),
    );
    revision = event.revision;
  }
  if (batch.to > revision)
    throw new Error("Incomplete replay requires a new snapshot.");
  return {
    ...current,
    ...batch.context,
    revision,
    agents: [...agents.values()],
  };
}
