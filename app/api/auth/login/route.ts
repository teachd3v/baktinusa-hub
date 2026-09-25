import { env } from "cloudflare:workers";
import { isSameOrigin, sessionCookie } from "@/lib/auth";
import { createSession, findUserForLogin } from "@/lib/data/auth";
import { verifyPassword } from "@/lib/data/password";
import { homeFor } from "@/lib/data/scope";
import { deviceFingerprint } from "@/lib/fingerprint";
import { LOGIN_ACTION, verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const reply = (status: number, message: string) => Response.json({ ok: false, message }, { status });

// Satu pesan untuk ID tidak dikenal, kata sandi salah, dan akun nonaktif: daftar akun tidak boleh bisa
// ditebak dengan mencoba-coba ID.
const SALAH = "ID atau kata sandi salah.";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return reply(403, "Permintaan ditolak.");

  let body: { loginId?: unknown; password?: unknown; turnstileToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(400, "Format permintaan tidak valid.");
  }
  const loginId = typeof body.loginId === "string" ? body.loginId.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!loginId || !password) return reply(422, "ID dan kata sandi wajib diisi.");
  if (loginId.length > 20 || password.length > 200) return reply(422, SALAH);

  if (!(await verifyTurnstile(body.turnstileToken, request.headers.get("cf-connecting-ip"), LOGIN_ACTION))) {
    return reply(403, "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.");
  }

  // Dibatasi per perangkat dan per ID: menebak kata sandi satu akun dari banyak perangkat pun tetap tertahan.
  const fingerprint = await deviceFingerprint(request);
  for (const key of [`login:${fingerprint}`, `login-id:${loginId.toUpperCase()}`]) {
    if (!(await env.SUBMIT_LIMITER.limit({ key })).success) {
      return reply(429, "Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi.");
    }
  }

  const found = await findUserForLogin(env.DB, loginId);
  const valid = await verifyPassword(password, found?.passwordHash ?? null);
  if (!found || !valid || found.status !== "active") return reply(401, SALAH);

  const token = await createSession(env.DB, found.user.id);
  return Response.json(
    { ok: true, redirect: homeFor(found.user.role) },
    { headers: { "set-cookie": sessionCookie(token), "cache-control": "no-store" } },
  );
}
