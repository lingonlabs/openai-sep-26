import initSqlJs, { type Database } from "sql.js";
import { createRequire } from "node:module";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { dirname } from "node:path";
import type { AgentInputItem, Session } from "@openai/agents";
const require = createRequire(import.meta.url);
export class Store {
  private constructor(
    private db: Database,
    private path: string | null,
  ) {}
  static async open(path: string | null) {
    const SQL = await initSqlJs({
      locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
    });
    const db = new SQL.Database(
      path && existsSync(path) ? readFileSync(path) : undefined,
    );
    db.run(
      "CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (kind,id))",
    );
    return new Store(db, path);
  }
  get<T>(kind: string, id: string): T | undefined {
    const statement = this.db.prepare(
      "SELECT data FROM entities WHERE kind=? AND id=?",
    );
    try {
      statement.bind([kind, id]);
      return statement.step()
        ? JSON.parse(String(statement.get()[0]))
        : undefined;
    } finally {
      statement.free();
    }
  }
  all<T>(kind: string): T[] {
    const statement = this.db.prepare(
      "SELECT data FROM entities WHERE kind=? ORDER BY updated_at ASC",
    );
    const values: T[] = [];
    try {
      statement.bind([kind]);
      while (statement.step())
        values.push(JSON.parse(String(statement.get()[0])));
      return values;
    } finally {
      statement.free();
    }
  }
  put<T>(kind: string, id: string, value: T) {
    this.db.run(
      "INSERT INTO entities(kind,id,data,updated_at) VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at",
      [kind, id, JSON.stringify(value), new Date().toISOString()],
    );
    this.flush();
    return value;
  }
  remove(kind: string, id: string) {
    this.db.run("DELETE FROM entities WHERE kind=? AND id=?", [kind, id]);
    this.flush();
  }
  private flush() {
    if (!this.path) return;
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const temporary = this.path + ".tmp";
    writeFileSync(temporary, this.db.export(), { mode: 0o600 });
    renameSync(temporary, this.path);
  }
  close() {
    this.flush();
    this.db.close();
  }
}
export class SqliteSession implements Session {
  constructor(
    private store: Store,
    private id: string,
  ) {}
  async getSessionId() {
    return this.id;
  }
  async getItems(limit?: number) {
    const items = this.store.get<AgentInputItem[]>("session", this.id) ?? [];
    return limit === undefined ? items : items.slice(-limit);
  }
  async addItems(items: AgentInputItem[]) {
    this.store.put("session", this.id, [...(await this.getItems()), ...items]);
  }
  async popItem() {
    const items = await this.getItems();
    const last = items.pop();
    this.store.put("session", this.id, items);
    return last;
  }
  async clearSession() {
    this.store.remove("session", this.id);
  }
}
