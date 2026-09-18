import { env } from "cloudflare:workers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SurveyForm } from "@/components/SurveyForm";
import { getCurrentUser } from "@/lib/auth";
import { resolveInternalForm, type ResolveFailure } from "@/lib/data/evaluations";

const REFUSED: Record<Exclude<ResolveFailure, "not_found" | "forbidden">, { emoji: string; title: string; text: string }> = {
  closed: { emoji: "🔒", title: "Penilaian tidak dibuka", text: "Periode atau jendela pengisian penilaian ini sedang tidak dibuka." },
  submitted: { emoji: "✅", title: "Sudah terkirim", text: "Anda sudah mengisi penilaian ini. Jawaban yang sudah dikirim tidak bisa diubah." },
};

// Halaman form berakun, dipakai bersama route Awardee dan Manwil. Layout peran sudah memanggil requireUser();
// izin atas sasaran diperiksa lagi di resolveInternalForm — dan sekali lagi saat dikirim.
export async function EvaluationPage({ params, returnTo }: { params: Promise<{ periode: string; tipe: string; kode: string }>; returnTo: string }) {
  const { periode, tipe, kode } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();

  const resolved = await resolveInternalForm(env.DB, user, periode, tipe, kode);
  // Sasaran di luar wewenang diperlakukan sama dengan yang tidak ada, supaya kode referal orang lain tidak bisa ditebak.
  if (!resolved.ok && (resolved.reason === "not_found" || resolved.reason === "forbidden")) notFound();
  if (!resolved.ok) {
    const notice = REFUSED[resolved.reason as keyof typeof REFUSED];
    return (
      <div className="notice fade-in">
        <div className="notice-emoji" aria-hidden="true">{notice.emoji}</div>
        <h2 className="section-title">{notice.title}</h2>
        <p className="section-hint">{notice.text}</p>
        <Link href={returnTo} className="btn btn-inline">Kembali ke daftar</Link>
      </div>
    );
  }

  const { form } = resolved;
  const isSelf = form.kind === "self";
  return (
    <SurveyForm
      variant="internal"
      kode={form.target.referralCode}
      periode={form.period.slug}
      tipe={form.type.code}
      returnTo={returnTo}
      title={form.title}
      subtitle={form.period.name}
      hint={isSelf ? "Seberapa sesuai pernyataan berikut dengan diri Anda?" : `Seberapa setuju Anda dengan pernyataan berikut tentang ${form.target.name}?`}
      draftKey={`baktinusa-hub:draft:u${user.id}:${form.period.slug}:${form.type.code}:${form.target.referralCode}`}
      closesAt={form.period.closesAt}
      awardee={{ name: form.target.name, region: form.target.region, campus: form.target.campus, referralCode: form.target.referralCode }}
      scale={form.scale}
      feedback={form.feedback}
      instruments={form.instruments.map(({ code, text, category }) => ({ code, text, category }))}
    />
  );
}
