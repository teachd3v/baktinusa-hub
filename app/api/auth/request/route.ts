import { env } from "cloudflare:workers";
import { isSameOrigin } from "@/lib/auth";
import { EMAIL_LINK_TTL_MS, createLoginToken, findActiveUserByEmail } from "@/lib/data/auth";
import { deviceFingerprint } from "@/lib/fingerprint";
import { deliverLoginLink, deliveryMode } from "@/lib/login-delivery";
import { LOGIN_ACTION, verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const reply = (status: number, message: string) => Response.json({ ok: status === 200, message }, { status });

// Jawaban untuk email terdaftar dan tidak terdaftar sengaja sama persis, supaya daftar akun tidak bisa ditebak.
const SENT = "Kalau email itu terdaftar, tautan masuk sudah dikirim. Cek kotak masuk dan folder spam. Tautan berlaku 15 menit.";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return reply(403, "Permintaan ditolak.");
  if (deliveryMode() === "unavailable") return reply(503, "Pengiriman tautan lewat email belum aktif. Minta tautan masuk kepada Admin.");

  let body: { email?: unknown; turnstileToken?: unknown };
  try {
    body = await request.json();
  } catch {
    return reply(400, "Format permintaan tidak valid.");
  }
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return reply(422, "Masukkan alamat email yang valid.");

  if (!(await verifyTurnstile(body.turnstileToken, request.headers.get("cf-connecting-ip"), LOGIN_ACTION))) {
    return reply(403, "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.");
  }
  const fingerprint = await deviceFingerprint(request);
  if (!(await env.SUBMIT_LIMITER.limit({ key: `login:${fingerprint}` })).success) {
    return reply(429, "Terlalu banyak permintaan. Tunggu satu menit lalu coba lagi.");
  }

  const user = await findActiveUserByEmail(env.DB, email);
  if (user) {
    const token = await createLoginToken(env.DB, user.id, EMAIL_LINK_TTL_MS);
    const url = `${new URL(request.url).origin}/masuk/verifikasi?t=${encodeURIComponent(token)}`;
    try {
      await deliverLoginLink(user, url, EMAIL_LINK_TTL_MS / 60_000);
    } catch (error) {
      console.error("[masuk] gagal mengirim tautan", error);
      return reply(502, "Tautan masuk gagal dikirim. Coba lagi beberapa saat lagi atau hubungi Admin.");
    }
  }
  return reply(200, SENT);
}
