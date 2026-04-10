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

  if (process.env.VERCEL === "1" && !(process.env.OLLAMA_URL ?? "").trim()) {
    return NextResponse.json(
      {
        error:
          "OLLAMA_URL is not set. A Vercel deployment cannot reach Ollama on your computer unless you set OLLAMA_URL to a public URL (for example your ngrok https URL).",
        hint: "Vercel → Project → Settings → Environment Variables → add OLLAMA_URL, then redeploy.",
      },
      { status: 502 },
    );
  }

  const ollamaHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (baseUrl.includes("ngrok")) {
    ollamaHeaders["ngrok-skip-browser-warning"] = "true";
  }

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: ollamaHeaders,
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
    let host = baseUrl;
    try {
      host = new URL(baseUrl).host;
    } catch {
      /* keep baseUrl */
    }
    const preview = text.trim().slice(0, 2000);
    const fallbackDetail =
      preview ||
      `Empty body from ${host} (HTTP ${ollamaRes.status} ${ollamaRes.statusText || ""}). ` +
        "Typical causes: stale or wrong OLLAMA_URL on Vercel vs current ngrok URL; Ollama not running; " +
        `model "${model}" missing — run ollama pull on the Ollama machine and match OLLAMA_MODEL.`;

    console.error("[api/chat] Ollama upstream not OK", {
      upstreamStatus: ollamaRes.status,
      upstreamStatusText: ollamaRes.statusText,
      host,
      model,
      bodyLength: text.length,
      bodyPreview: preview.slice(0, 500),
    });

    return NextResponse.json(
      {
        error: "Ollama returned an error",
        status: ollamaRes.status,
        detail: fallbackDetail,
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
