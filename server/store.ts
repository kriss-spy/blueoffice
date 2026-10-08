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
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
      CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT UNIQUE NOT NULL, agent_id TEXT NOT NULL, kind TEXT NOT NULL, at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS commands (agent_id TEXT NOT NULL, id TEXT NOT NULL, fingerprint TEXT NOT NULL, PRIMARY KEY(agent_id,id));
      CREATE TABLE IF NOT EXISTS adoption_intents (profile_home TEXT PRIMARY KEY, body TEXT NOT NULL);`);
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
          "INSERT INTO events(event_key,agent_id,kind,at) VALUES (?,?,?,?)",
        )
        .run(key, agent.id, kind, new Date().toISOString());
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
