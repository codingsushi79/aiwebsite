import { NextResponse } from "next/server";
import { SESSION_COOKIE, createSessionToken } from "@/lib/session-token";
import { isSitePasswordConfigured, validateSitePassword } from "@/lib/site-password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSitePasswordConfigured()) {
    return NextResponse.json(
      { error: "Server missing SITE_PASSWORD in .env.local." },
      { status: 503 },
    );
  }

  let body: { name?: string; password?: string; acceptedLocalDataHandling?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.acceptedLocalDataHandling !== true) {
    return NextResponse.json(
      {
        error:
          "You must agree to the local data handling notice before you can use this app.",
      },
      { status: 400 },
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) {
    return NextResponse.json({ error: "Enter your name (used to label your saved chats)." }, { status: 400 });
  }

  if (!validateSitePassword(password)) {
    return NextResponse.json({ error: "Invalid password." }, { status: 401 });
  }

  let token: string;
  try {
    token = createSessionToken(name);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create session";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, name });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}
