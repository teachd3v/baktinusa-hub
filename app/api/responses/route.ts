import { env } from "cloudflare:workers";
import { deviceFingerprint } from "@/lib/fingerprint";
import { getPublicForm, receiptCode, saveResponse, validateSubmission, type Submission } from "@/lib/survey";
import { TURNSTILE_ACTION, verifyTurnstile } from "@/lib/turnstile";

export const dynamic = "force-dynamic";

const fail = (status: number, message: string) => Response.json({ ok: false, message }, { status });

type Body = Partial<Submission> & { kode?: unknown; periode?: unknown; turnstileToken?: unknown };

export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 64_000) return fail(413, "Isian terlalu panjang.");

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return fail(400, "Format kiriman tidak valid.");
  }
  if (typeof body.kode !== "string" || typeof body.periode !== "string") return fail(400, "Tautan survei tidak lengkap.");

  // Periksa hal yang murah dulu: token Turnstile hanya bisa dipakai sekali.
  const lookup = await getPublicForm(body.kode, body.periode);
  if (lookup.status === "not_found") return fail(404, "Survei atau awardee tidak ditemukan.");
  if (lookup.status === "unavailable") {
    return fail(409, lookup.reason === "closed" ? "Survei ini sudah ditutup." : "Survei ini belum dibuka.");
  }
  const { form } = lookup;

  const checked = validateSubmission(form, body);
  if (!checked.ok) return fail(422, checked.message);

  const ip = request.headers.get("cf-connecting-ip");
  if (!(await verifyTurnstile(body.turnstileToken, ip, TURNSTILE_ACTION))) {
    return fail(403, "Verifikasi keamanan gagal. Muat ulang halaman lalu coba kirim lagi.");
  }

  const fingerprint = await deviceFingerprint(request);
  const { success } = await env.SUBMIT_LIMITER.limit({ key: `${fingerprint}:${form.awardee.id}` });
  if (!success) return fail(429, "Terlalu banyak kiriman dalam waktu singkat. Tunggu satu menit lalu coba lagi.");

  const publicId = await saveResponse(form, checked.value, fingerprint);
  return Response.json({ ok: true, receipt: receiptCode(publicId) });
}
