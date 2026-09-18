import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { SESSION_TTL_MS, getSessionUser } from "./data/auth.ts";
import { homeFor, type Role, type SessionUser } from "./data/scope.ts";

export const SESSION_COOKIE = "bh_session";

// Sekali per request, walau dipanggil dari layout dan halaman sekaligus.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getSessionUser(env.DB, token);
});

// Pertahanan kedua setelah proxy.ts: setiap halaman & server action tetap memeriksa perannya sendiri.
export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/masuk");
  if (roles.length > 0 && !roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

export const sessionCookie = (token: string) =>
  `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`;

export const clearedSessionCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// POST dari situs lain ditolak: header Origin harus sama dengan origin hub.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  return origin !== null && origin === new URL(request.url).origin;
}
