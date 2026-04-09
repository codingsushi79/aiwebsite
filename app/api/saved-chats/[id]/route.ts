import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  deleteChat,
  getChatForUser,
  updateChat,
  type StoredMessage,
} from "@/lib/chats-db";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const chat = getChatForUser(id, session.name);
  if (!chat) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ chat });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: { title?: string; messages?: StoredMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const existing = getChatForUser(id, session.name);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const messages = body.messages ?? existing.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Expected non-empty messages" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : existing.title;

  const ok = updateChat(session.name, id, title, messages);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const row = getChatForUser(id, session.name);
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    chat: { id: row.id, title: row.title, updatedAt: row.updatedAt },
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ok = deleteChat(session.name, id);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
