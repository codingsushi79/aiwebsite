/**
 * Edge-safe session verification (same token format as `session-token.ts`).
 */

export const SESSION_COOKIE = "site_session";

function getSecret(): string {
  const raw = process.env.SESSION_SECRET ?? process.env.SITE_PASSWORD;
  if (!raw) return "";
  return raw;
}

function base64UrlToUtf8(b64url: string): string {
  const pad = (4 - (b64url.length % 4)) % 4;
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const raw = atob(b64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function verifySessionTokenEdge(token: string): Promise<{ name: string } | null> {
  const secret = getSecret();
  if (!secret) return null;

  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sigBuf = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(payload),
    );
    const expected = base64UrlEncode(sigBuf);

    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) {
      diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    }
    if (diff !== 0) return null;

    const json = JSON.parse(base64UrlToUtf8(payload)) as { name?: string; exp?: number };
    if (typeof json.name !== "string" || !json.name.trim()) return null;
    if (typeof json.exp !== "number" || json.exp < Date.now()) return null;
    return { name: json.name.trim() };
  } catch {
    return null;
  }
}
