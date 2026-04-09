import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "site_session";

function getSecret(): string {
  const raw = process.env.SESSION_SECRET ?? process.env.SITE_PASSWORD;
  if (!raw) {
    throw new Error("Set SITE_PASSWORD (or SESSION_SECRET) in .env.local");
  }
  return raw;
}

/** HS256-style HMAC over the payload string (Node APIs; used in API routes). */

export function createSessionToken(displayName: string): string {
  const name = displayName.trim();
  if (!name) throw new Error("Name required");
  const exp = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ name, exp }), "utf8").toString("base64url");
  const sig = createHmac("sha256", getSecret()).update(payload, "utf8").digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { name: string } | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot === -1) return null;
    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expected = createHmac("sha256", getSecret()).update(payload, "utf8").digest("base64url");
    const a = Buffer.from(sig, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      name?: string;
      exp?: number;
    };
    if (typeof json.name !== "string" || !json.name.trim()) return null;
    if (typeof json.exp !== "number" || json.exp < Date.now()) return null;
    return { name: json.name.trim() };
  } catch {
    return null;
  }
}
