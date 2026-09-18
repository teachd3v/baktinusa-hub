import { env } from "cloudflare:workers";
import { SESSION_COOKIE, clearedSessionCookie, isSameOrigin } from "@/lib/auth";
import { deleteSession } from "@/lib/data/auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Permintaan ditolak.", { status: 403 });
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${SESSION_COOKIE}=`))
    ?.slice(SESSION_COOKIE.length + 1);
  await deleteSession(env.DB, token);
  return new Response(null, {
    status: 303,
    headers: { location: new URL("/masuk", request.url).toString(), "set-cookie": clearedSessionCookie() },
  });
}
