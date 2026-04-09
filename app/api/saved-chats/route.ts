import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSession } from "@/lib/session";
import {
  insertChat,
  listChatsMeta,
  type StoredMessage,
} from "@/lib/chats-db";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const chats = listChatsMeta(session.name);
  return NextResponse.json({ chats });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { title?: string; messages?: StoredMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Expected non-empty messages array" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : `Chat ${new Date().toLocaleString()}`;

  const id = randomUUID();
  insertChat(session.name, id, title, messages);

  return NextResponse.json({
    chat: { id, title, updatedAt: new Date().toISOString() },
  });
}
