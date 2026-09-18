import { env } from "cloudflare:workers";
import { getCurrentUser, isSameOrigin } from "@/lib/auth";
import { resolveInternalForm, saveInternalResponse, type ResolveFailure } from "@/lib/data/evaluations";

export const dynamic = "force-dynamic";

const fail = (status: number, message: string) => Response.json({ ok: false, message }, { status });

const REFUSED: Record<ResolveFailure, [number, string]> = {
  not_found: [404, "Penilaian tidak ditemukan."],
  forbidden: [403, "Anda tidak berhak mengisi penilaian ini."],
  closed: [409, "Penilaian ini sedang tidak dibuka."],
  submitted: [409, "Anda sudah mengisi penilaian ini."],
};

// Penilaian berakun (asesmen mandiri, Peer, Manwil). Tanpa Turnstile: sesi login adalah pengamannya,
// dan tipe penilai serta sasarannya ditentukan server dari akun, bukan dipilih pengisi.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return fail(403, "Permintaan ditolak.");
  const user = await getCurrentUser();
  if (!user) return fail(401, "Sesi Anda sudah berakhir. Masuk lagi lalu kirim ulang — jawaban Anda tersimpan di perangkat ini.");
  if (Number(request.headers.get("content-length") ?? 0) > 64_000) return fail(413, "Isian terlalu panjang.");

  let body: { periode?: unknown; tipe?: unknown; kode?: unknown; scores?: unknown; feedback?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail(400, "Format kiriman tidak valid.");
  }
  if (typeof body.periode !== "string" || typeof body.tipe !== "string" || typeof body.kode !== "string") {
    return fail(400, "Kiriman tidak lengkap.");
  }

  const resolved = await resolveInternalForm(env.DB, user, body.periode, body.tipe, body.kode);
  if (!resolved.ok) return fail(...REFUSED[resolved.reason]);

  const saved = await saveInternalResponse(env.DB, user, resolved.form, body);
  if (!saved.ok) return fail(saved.status, saved.message);
  return Response.json({ ok: true, receipt: saved.receipt });
}
