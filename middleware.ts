import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionTokenEdge } from "@/lib/session-edge";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  const denyApi = () =>
    NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const denyPage = () => {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  };

  if (pathname === "/api/auth/login") {
    return NextResponse.next();
  }

  if (pathname === "/login") {
    if (token) {
      const session = await verifySessionTokenEdge(token);
      if (session) {
        return NextResponse.redirect(new URL("/", request.url));
      }
    }
    return NextResponse.next();
  }

  if (pathname === "/api/auth/logout" || pathname === "/api/auth/me") {
    return NextResponse.next();
  }

  if (!token) {
    if (pathname.startsWith("/api")) return denyApi();
    return denyPage();
  }

  const session = await verifySessionTokenEdge(token);
  if (!session) {
    if (pathname.startsWith("/api")) return denyApi();
    return denyPage();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/login", "/api/chat", "/api/saved-chats/:path*"],
};
