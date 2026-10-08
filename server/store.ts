import {
  initialLayout,
  layoutSnapshotSchema,
  validateLayout,
  type LayoutSave,
  type LayoutSnapshot,
  type LayoutDraft,
} from "../shared/layout.js";
import { LayoutError } from "./layout.js";
import type { CharacterPack } from "../shared/assets.js";
import { randomUUID } from "node:crypto";
import { agentChange, type OfficeEvent } from "../shared/events.js";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import type { OfficeAgent } from "../shared/office.js";
import type { ModelId } from "../shared/routes.js";

export interface AdoptionIntent {
  id: string;
  name: string;
  profileHome: string;
  model: ModelId;
  workspace: string;
}

/** Office records and normalized events never write Hermes' database. */
export class OfficeStore {
  private db: DatabaseSync;
  constructor(
    path: string,
    private retention = 512,
  ) {
    if (!Number.isSafeInteger(retention) || retention < 1)
      throw new Error("Event retention must be a positive integer.");
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS character_packs (asset_id TEXT NOT NULL, version TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY(asset_id,version));
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS layout_revisions (revision INTEGER PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE NOT NULL, agent_id TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (agent_id TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(agent_id,id));
      CREATE TABLE IF NOT EXISTS adoption_intents (profile_home TEXT PRIMARY KEY, body TEXT NOT NULL);`);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS office_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    this.db
      .prepare("INSERT OR IGNORE INTO office_meta VALUES ('journal_id',?)")
      .run(randomUUID());
    const columns = this.db.prepare("PRAGMA table_info(events)").all();
    if (!columns.some((c) => c.name === "body"))
      this.db.exec("ALTER TABLE events ADD COLUMN body TEXT");
  }
  hasSavedLayout(): boolean {
    return !!this.db.prepare("SELECT 1 FROM layout_revisions LIMIT 1").get();
  }
  /** Read and recover the full layout/assignment transaction, retaining a monotonic revision. */
  layoutSnapshot(): LayoutSnapshot {
    const rows = this.db
      .prepare(
        "SELECT revision,body FROM layout_revisions ORDER BY revision DESC",
      )
      .all();
    if (!rows.length) {
      const agents = this.agents();
      const draft = initialLayout(agents);
      const ids = new Set(draft.placements.map((p) => p.id));
      const occupied = new Set<string>();
      let repaired = false;
      for (const agent of agents) {
        if (
          agent.deskId &&
          (!ids.has(agent.deskId) || occupied.has(agent.deskId))
        ) {
          draft.assignments[agent.id] = null;
          repaired = true;
        } else if (agent.deskId) occupied.add(agent.deskId);
      }
      const issues = validateLayout(draft);
      if (issues.length)
        throw new LayoutError(
          issues.map((issue) => issue.message).join(" "),
          422,
        );
      return this.writeLayout(draft, 1, repaired ? 0 : undefined);
    }
    for (const row of rows) {
      let candidate: unknown;
      try {
        candidate = JSON.parse(String(row.body));
      } catch {
        continue;
      }
      const parsed = layoutSnapshotSchema.safeParse(candidate);
      if (
        !parsed.success ||
        parsed.data.revision !== Number(row.revision) ||
        validateLayout(parsed.data).length
      )
        continue;
      if (Number(row.revision) === Number(rows[0].revision)) {
        const agents = this.agents();
        const ids = new Set(agents.map((agent) => agent.id));
        if (
          Object.keys(parsed.data.assignments).some((id) => !ids.has(id)) ||
          agents.some((agent) => !(agent.id in parsed.data.assignments))
        )
          continue;
        return parsed.data;
      }
      const agents = this.agents();
      const draft: LayoutDraft = {
        placements: parsed.data.placements,
        assignments: Object.fromEntries(
          agents.map((agent) => [
            agent.id,
            parsed.data.assignments[agent.id] ?? null,
          ]),
        ),
      };
      return this.writeLayout(
        draft,
        Number(rows[0].revision) + 1,
        parsed.data.revision,
      );
    }
    // If every revision is unreadable, retain safe agent state and regenerate a known valid room.
    const draft = initialLayout(
      this.agents().map((agent) => ({ id: agent.id, deskId: null })),
    );
    return this.writeLayout(draft, Number(rows[0].revision) + 1, 0);
  }
  saveLayout(input: LayoutSave): LayoutSnapshot {
    const current = this.layoutSnapshot();
    if (input.baseRevision !== current.revision)
      throw new LayoutError(
        "The office layout changed in another tab. Cancel and reopen Edit mode to load the latest revision.",
      );
    const agents = this.agents();
    const ids = new Set(agents.map((agent) => agent.id));
    if (
      Object.keys(input.draft.assignments).some((id) => !ids.has(id)) ||
      agents.some((agent) => !(agent.id in input.draft.assignments))
    )
      throw new LayoutError(
        "Assistant inventory changed. Cancel and reopen Edit mode before saving.",
      );
    const issues = validateLayout(input.draft);
    if (issues.length)
      throw new LayoutError(
        issues.map((issue) => issue.message).join(" "),
        422,
      );
    return this.writeLayout(input.draft, current.revision + 1);
  }
  private writeLayout(
    draft: LayoutDraft,
    revision: number,
    recoveredFrom?: number,
  ): LayoutSnapshot {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const latest = Number(
        this.db
          .prepare(
            "SELECT COALESCE(MAX(revision),0) AS revision FROM layout_revisions",
          )
          .get()!.revision,
      );
      if (latest !== revision - 1)
        throw new LayoutError(
          "The office layout changed while saving. Reload the latest revision before trying again.",
        );
      const snapshot: LayoutSnapshot = {
        ...draft,
        schemaVersion: 1,
        revision,
        ...(recoveredFrom === undefined ? {} : { recoveredFrom }),
      };
      this.db
        .prepare("INSERT INTO layout_revisions VALUES (?,?)")
        .run(revision, JSON.stringify(snapshot));
      for (const previous of this.agents()) {
        const deskId = draft.assignments[previous.id] ?? null;
        if (previous.deskId === deskId) continue;
        const agent = { ...previous, deskId };
        this.db
          .prepare("UPDATE agents SET body=? WHERE id=?")
          .run(JSON.stringify(agent), agent.id);
        this.db
          .prepare(
            "INSERT INTO events(event_key,agent_id,kind,at,body) VALUES (?,?,?,?,?)",
          )
          .run(
            randomUUID(),
            agent.id,
            "layout.assigned",
            new Date().toISOString(),
            JSON.stringify(agentChange(previous, agent)),
          );
      }
      this.db
        .prepare("DELETE FROM events WHERE seq <= ?")
        .run(this.revision() - this.retention);
      this.db.exec("COMMIT");
      return snapshot;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  private recordLayoutAssignment(agent: OfficeAgent) {
    const row = this.db
      .prepare(
        "SELECT revision,body FROM layout_revisions ORDER BY revision DESC LIMIT 1",
      )
      .get();
    if (!row) return;
    let value: unknown;
    try {
      value = JSON.parse(String(row.body));
    } catch {
      return;
    }
    const parsed = layoutSnapshotSchema.safeParse(value);
    if (!parsed.success || parsed.data.assignments[agent.id] === agent.deskId)
      return;
    const updated: LayoutSnapshot = {
      ...parsed.data,
      revision: Number(row.revision) + 1,
      assignments: { ...parsed.data.assignments, [agent.id]: agent.deskId },
    };
    delete updated.recoveredFrom;
    if (validateLayout(updated).length)
      throw new LayoutError(
        "The selected workstation is unavailable or incomplete.",
      );
    this.db
      .prepare("INSERT INTO layout_revisions VALUES (?,?)")
      .run(updated.revision, JSON.stringify(updated));
  }
  characterPacks(): CharacterPack[] {
    return this.db
      .prepare("SELECT body FROM character_packs ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(r.body as string));
  }
  saveCharacterPack(pack: CharacterPack) {
    this.db
      .prepare(
        "INSERT INTO character_packs VALUES (?,?,?) ON CONFLICT(asset_id,version) DO UPDATE SET body=excluded.body",
      )
      .run(pack.ref.assetId, pack.ref.version, JSON.stringify(pack));
  }
  journalId(): string {
    return this.db
      .prepare("SELECT value FROM office_meta WHERE key='journal_id'")
      .get()!.value as string;
  }
  checkpoint() {
    this.db.exec("BEGIN");
    try {
      const checkpoint = {
        journalId: this.journalId(),
        revision: this.revision(),
        agents: this.agents(),
      };
      this.db.exec("COMMIT");
      return checkpoint;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  since(revision: number): OfficeEvent[] | undefined {
    const latest = this.revision();
    if (!Number.isSafeInteger(revision) || revision < 0 || revision > latest)
      return undefined;
    const rows = this.db
      .prepare(
        "SELECT seq,event_key,agent_id,kind,at,body FROM events WHERE seq>? ORDER BY seq",
      )
      .all(revision);
    if (
      rows.length !== latest - revision ||
      rows.some((r) => typeof r.body !== "string")
    )
      return undefined;
    return rows.map((r) => ({
      revision: Number(r.seq),
      key: String(r.event_key),
      agentId: String(r.agent_id),
      kind: String(r.kind),
      at: String(r.at),
      change: JSON.parse(r.body as string),
    }));
  }
  adoptions(): AdoptionIntent[] {
    return this.db
      .prepare("SELECT body FROM adoption_intents")
      .all()
      .map((row) => JSON.parse(row.body as string));
  }
  beginAdoption(intent: AdoptionIntent) {
    this.db
      .prepare(
        "INSERT INTO adoption_intents VALUES (?,?) ON CONFLICT(profile_home) DO UPDATE SET body=excluded.body",
      )
      .run(intent.profileHome, JSON.stringify(intent));
  }
  finishAdoption(profileHome: string) {
    this.db
      .prepare("DELETE FROM adoption_intents WHERE profile_home=?")
      .run(profileHome);
  }
  agents(): OfficeAgent[] {
    return this.db
      .prepare("SELECT body FROM agents ORDER BY rowid")
      .all()
      .map((r) => JSON.parse(r.body as string));
  }
  revision(): number {
    return Number(
      this.db.prepare("SELECT COALESCE(MAX(seq),0) AS seq FROM events").get()!
        .seq,
    );
  }
  hasEvent(key: string): boolean {
    return !!this.db.prepare("SELECT 1 FROM events WHERE event_key=?").get(key);
  }
  command(agentId: string, id: string): string | undefined {
    return this.db
      .prepare("SELECT fingerprint FROM commands WHERE agent_id=? AND id=?")
      .get(agentId, id)?.fingerprint as string | undefined;
  }
  save(
    agent: OfficeAgent,
    kind: string,
    key: string,
    command?: { id: string; fingerprint: string },
  ): void {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const previous = this.db
        .prepare("SELECT body FROM agents WHERE id=?")
        .get(agent.id)?.body as string | undefined;
      const change = agentChange(
        previous ? JSON.parse(previous) : undefined,
        agent,
      );
      if (command)
        this.db
          .prepare("INSERT INTO commands VALUES (?,?,?)")
          .run(agent.id, command.id, command.fingerprint);
      this.db
        .prepare(
          "INSERT INTO agents VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        )
        .run(agent.id, JSON.stringify(agent));
      this.recordLayoutAssignment(agent);
      this.db
        .prepare(
          "INSERT INTO events(event_key,agent_id,kind,at,body) VALUES (?,?,?,?,?)",
        )
        .run(
          key,
          agent.id,
          kind,
          new Date().toISOString(),
          JSON.stringify(change),
        );
      this.db
        .prepare("DELETE FROM events WHERE seq <= ?")
        .run(this.revision() - this.retention);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() {
    this.db.close();
  }
}
