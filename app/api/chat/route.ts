import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const DEFAULT_OLLAMA_URL = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3.1";

type OllamaMessage = { role: "user" | "assistant" | "system"; content: string };

/** ngrok free tier serves an HTML interstitial unless this header is present (any value). */
function isNgrokUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().includes("ngrok");
  } catch {
    return url.toLowerCase().includes("ngrok");
  }
}

/** Cloudflare quick tunnel hostnames (`*.trycloudflare.com`). */
function isTryCloudflareUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.endsWith(".trycloudflare.com") || h.includes("cfargotunnel");
  } catch {
    return url.toLowerCase().includes("trycloudflare");
  }
}

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
          "OLLAMA_URL is not set. A Vercel deployment cannot reach Ollama on your computer unless you set OLLAMA_URL to your tunnel URL (e.g. https://….trycloudflare.com or https://….ngrok-free.dev).",
        hint: "Vercel → Project → Settings → Environment Variables → add OLLAMA_URL, then redeploy.",
      },
      { status: 502 },
    );
  }

  const ollamaHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (isNgrokUrl(baseUrl)) {
    ollamaHeaders["ngrok-skip-browser-warning"] = "69420";
  }
  if (isNgrokUrl(baseUrl) || isTryCloudflareUrl(baseUrl)) {
    // Some tunnel edges reject default Node fetch; mimic a browser (helps ngrok / occasional CF quick-tunnel 403).
    ollamaHeaders["User-Agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
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
      redirect: "follow",
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

  const contentType = ollamaRes.headers.get("content-type") ?? "";

  if (ollamaRes.ok && contentType.includes("text/html")) {
    ollamaRes.body?.cancel();
    console.error("[api/chat] Upstream returned HTML instead of Ollama stream (often ngrok interstitial)", {
      host: (() => {
        try {
          return new URL(baseUrl).host;
        } catch {
          return baseUrl;
        }
      })(),
    });
    return NextResponse.json(
      {
        error: "Tunnel returned an HTML page instead of Ollama",
        detail:
          "This usually means ngrok’s browser warning page was served instead of your API. " +
          "Redeploy after updating this app, confirm OLLAMA_URL uses https and matches your ngrok URL, " +
          "or use ngrok paid / another tunnel (Cloudflare Tunnel) without that page.",
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
    const looksLikeNgrokPage =
      preview.includes("<!DOCTYPE html") && isNgrokUrl(baseUrl);
    const ngrokErr = ollamaRes.headers.get("ngrok-error-code");

    let fallbackDetail: string;
    if (looksLikeNgrokPage) {
      fallbackDetail =
        "ngrok returned its HTML warning/interstitial page instead of forwarding to Ollama. " +
        "The app sends ngrok-skip-browser-warning; redeploy this version, confirm OLLAMA_URL matches your tunnel (https, no typo), and that ngrok is still running. " +
        "If it persists, try Cloudflare Tunnel or ngrok’s paid plan.";
    } else if (preview) {
      fallbackDetail = preview;
    } else if (isNgrokUrl(baseUrl) && ollamaRes.status === 403) {
      fallbackDetail =
        "ngrok returned HTTP 403 with an empty body. That usually means ngrok’s edge blocked the request before it reached your PC — " +
        "common causes: Traffic Policy / IP allowlists on this tunnel in the ngrok dashboard, account or endpoint restrictions, or known issues with server-side calls from cloud hosts (e.g. Vercel) on the free tier. " +
        "Open ngrok.com → your tunnel → Traffic Inspector for the failing request; remove deny rules. " +
        "If it still fails, use Cloudflare Tunnel (cloudflared) instead of ngrok, or run chat only locally. " +
        (ngrokErr ? `ngrok-error-code: ${ngrokErr}. ` : "");
    } else if (isTryCloudflareUrl(baseUrl) && ollamaRes.status === 403) {
      fallbackDetail =
        "Cloudflare quick tunnel returned HTTP 403 with an empty body. Common causes: (1) OLLAMA_URL on Vercel does not match the current tunnel — each time you restart `cloudflared`, the *.trycloudflare.com hostname changes; update env and redeploy. " +
        "(2) `cloudflared` is not running or Ollama is not on 127.0.0.1:11434. " +
        "(3) The tunnel edge sometimes blocks requests from cloud hosts — try again after redeploy with this app version (sends a browser User-Agent), or run the Next app locally, or set up a named Cloudflare Tunnel on your account for a stable hostname.";
    } else {
      fallbackDetail =
        `Empty body from ${host} (HTTP ${ollamaRes.status} ${ollamaRes.statusText || ""}). ` +
        "Typical causes: stale or wrong OLLAMA_URL on Vercel vs your current tunnel URL; tunnel or Ollama not running; " +
        `model "${model}" missing — run ollama pull on the Ollama machine and match OLLAMA_MODEL.`;
    }

    console.error("[api/chat] Ollama upstream not OK", {
      upstreamStatus: ollamaRes.status,
      upstreamStatusText: ollamaRes.statusText,
      host,
      model,
      bodyLength: text.length,
      bodyPreview: preview.slice(0, 500),
      ngrokErrorCode: ngrokErr,
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
