import { env } from "cloudflare:workers";
import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/data/auth";
import { homeFor, type Role } from "@/lib/data/scope";

const SESSION_COOKIE = "bh_session";

const AREAS: [prefix: string, role: Role][] = [
  ["/admin", "admin"],
  ["/manwil", "manwil"],
  ["/awardee", "awardee"],
];

// Gerbang pertama: tanpa sesi → /masuk; peran salah → beranda perannya sendiri.
// Halaman dan server action tetap memeriksa ulang lewat requireUser(), dan data tetap disaring scopeFor().
export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const required = AREAS.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1];
  if (!required) return NextResponse.next();

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user = await getSessionUser(env.DB, token);
  if (!user) {
    const response = NextResponse.redirect(new URL("/masuk", request.url));
    if (token) response.cookies.delete(SESSION_COOKIE);
    return response;
  }
  if (user.role !== required) return NextResponse.redirect(new URL(homeFor(user.role), request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/manwil/:path*", "/awardee/:path*"],
};
