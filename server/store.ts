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
