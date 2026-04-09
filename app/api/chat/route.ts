import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3.1";

type OllamaMessage = { role: "user" | "assistant" | "system"; content: string };

export async function POST(request: Request) {
  if (!(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { messages?: OllamaMessage[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Expected a non-empty messages array" },
      { status: 400 },
    );
  }

  const baseUrl = (process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL).replace(/\/$/, "");
  const model = process.env.OLLAMA_MODEL ?? DEFAULT_MODEL;

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Could not reach Ollama. Is it running on localhost?",
        detail: message,
      },
      { status: 502 },
    );
  }

  if (!ollamaRes.ok) {
    const text = await ollamaRes.text();
    return NextResponse.json(
      {
        error: "Ollama returned an error",
        status: ollamaRes.status,
        detail: text.slice(0, 2000),
      },
      { status: 502 },
    );
  }

  if (!ollamaRes.body) {
    return NextResponse.json({ error: "Empty response from Ollama" }, { status: 502 });
  }

  return new Response(ollamaRes.body, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
