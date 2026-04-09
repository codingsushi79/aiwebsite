import { timingSafeEqual } from "crypto";

/** True if `SITE_PASSWORD` is set in `.env.local` and matches `password`. */

export function isSitePasswordConfigured(): boolean {
  return Boolean(process.env.SITE_PASSWORD?.length);
}

export function validateSitePassword(password: string): boolean {
  const expected = process.env.SITE_PASSWORD ?? "";
  if (!expected) return false;
  try {
    const a = Buffer.from(password, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
