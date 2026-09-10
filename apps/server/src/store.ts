import { DatabaseSync } from 'node:sqlite';
import type { Task } from '@ambient/shared';

export class Store {
  private db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS kv (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  }
  get<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM kv WHERE key = ?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : fallback;
  }
  set(key: string, value: unknown) { this.db.prepare('INSERT OR REPLACE INTO kv (key,value) VALUES (?,?)').run(key, JSON.stringify(value)); }
  tasks(): Task[] { return this.get<Task[]>('tasks', []); }
  close() { this.db.close(); }
}
