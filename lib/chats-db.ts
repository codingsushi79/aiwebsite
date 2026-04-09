import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

export type StoredMessage = { id: string; role: "user" | "assistant"; content: string };

export type SavedChatRow = {
  id: string;
  title: string;
  updatedAt: string;
  messages: StoredMessage[];
};

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  const dbPath = path.join(process.cwd(), "data", "chats.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY NOT NULL,
      user_name TEXT NOT NULL,
      title TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      messages TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_chats_user_updated ON chats(user_name, updated_at DESC);
  `);
  return db;
}

export function listChatsMeta(userName: string): { id: string; title: string; updatedAt: string }[] {
  const d = getDb();
  return d
    .prepare(
      `SELECT id, title, updated_at AS updatedAt FROM chats WHERE user_name = ? ORDER BY updated_at DESC`,
    )
    .all(userName) as { id: string; title: string; updatedAt: string }[];
}

export function getChatForUser(
  id: string,
  userName: string,
): SavedChatRow | null {
  const d = getDb();
  const row = d
    .prepare(
      `SELECT id, title, updated_at AS updatedAt, messages FROM chats WHERE id = ? AND user_name = ?`,
    )
    .get(id, userName) as { id: string; title: string; updatedAt: string; messages: string } | undefined;
  if (!row) return null;
  let messages: StoredMessage[];
  try {
    messages = JSON.parse(row.messages) as StoredMessage[];
  } catch {
    return null;
  }
  return { id: row.id, title: row.title, updatedAt: row.updatedAt, messages };
}

export function insertChat(
  userName: string,
  id: string,
  title: string,
  messages: StoredMessage[],
): void {
  const d = getDb();
  const now = new Date().toISOString();
  d.prepare(
    `INSERT INTO chats (id, user_name, title, updated_at, messages) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, userName, title, now, JSON.stringify(messages));
}

export function updateChat(
  userName: string,
  id: string,
  title: string,
  messages: StoredMessage[],
): boolean {
  const d = getDb();
  const now = new Date().toISOString();
  const info = d
    .prepare(
      `UPDATE chats SET title = ?, updated_at = ?, messages = ? WHERE id = ? AND user_name = ?`,
    )
    .run(title, now, JSON.stringify(messages), id, userName);
  return info.changes > 0;
}

export function deleteChat(userName: string, id: string): boolean {
  const d = getDb();
  const info = d.prepare(`DELETE FROM chats WHERE id = ? AND user_name = ?`).run(id, userName);
  return info.changes > 0;
}
