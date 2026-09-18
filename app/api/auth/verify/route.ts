import { env } from "cloudflare:workers";
import { isSameOrigin, sessionCookie } from "@/lib/auth";
import { consumeLoginToken, createSession } from "@/lib/data/auth";
import { homeFor } from "@/lib/data/scope";

export const dynamic = "force-dynamic";

const seeOther = (request: Request, path: string, cookie?: string) =>
  new Response(null, {
    status: 303,
    headers: { location: new URL(path, request.url).toString(), ...(cookie ? { "set-cookie": cookie } : {}) },
  });

// Token dipakai lewat POST dari tombol "Masuk", bukan saat tautan dibuka: pemindai tautan di layanan email
// sering membuka (GET) tautan lebih dulu dan akan menghanguskan token sekali pakai.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return new Response("Permintaan ditolak.", { status: 403 });
  const form = await request.formData();
  const token = form.get("t");
  const user = typeof token === "string" ? await consumeLoginToken(env.DB, token) : null;
  if (!user) return seeOther(request, "/masuk/verifikasi?gagal=1");

  const session = await createSession(env.DB, user.id);
  return seeOther(request, homeFor(user.role), sessionCookie(session));
}
