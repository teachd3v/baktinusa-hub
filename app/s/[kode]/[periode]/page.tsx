import { env } from "cloudflare:workers";
import { notFound } from "next/navigation";
import { AwardeeCard } from "@/components/AwardeeCard";
import { BrandHeader } from "@/components/BrandHeader";
import { formatWib } from "@/lib/format";
import { getPublicForm } from "@/lib/survey";
import { TURNSTILE_ACTION } from "@/lib/turnstile";
import { SurveyForm } from "@/components/SurveyForm";

export const dynamic = "force-dynamic";

export default async function SurveyPage({ params }: { params: Promise<{ kode: string; periode: string }> }) {
  const { kode, periode } = await params;
  const lookup = await getPublicForm(kode, periode);
  if (lookup.status === "not_found") notFound();

  if (lookup.status === "unavailable") {
    const { awardee, period, config, reason } = lookup;
    const closed = reason === "closed";
    return (
      <main className="page">
        <BrandHeader title={config.title} subtitle={config.subtitle} />
        <div className="app-screen">
          <AwardeeCard {...awardee} />
          <div className="notice fade-in">
            <div className="notice-emoji" aria-hidden="true">{closed ? "🔒" : "🗓️"}</div>
            <h2 className="section-title">{closed ? "Survei sudah ditutup" : "Survei belum dibuka"}</h2>
            <p className="section-hint">
              {closed
                ? period.closesAt
                  ? `Pengisian ditutup pada ${formatWib(period.closesAt)}. Terima kasih atas perhatian Anda.`
                  : "Pengisian survei ini sudah ditutup. Terima kasih atas perhatian Anda."
                : "Tautan ini sudah benar, tetapi periode penilaiannya belum dimulai. Coba buka lagi nanti."}
            </p>
          </div>
        </div>
      </main>
    );
  }

  const { form } = lookup;
  return (
    <SurveyForm
      variant="public"
      kode={form.awardee.referralCode}
      periode={form.period.slug}
      title={form.config.title}
      subtitle={form.config.subtitle}
      hint={`Seberapa setuju Anda dengan pernyataan berikut tentang ${form.awardee.name}?`}
      draftKey={`baktinusa-hub:draft:${form.awardee.referralCode}:${form.period.slug}`}
      siteKey={env.TURNSTILE_SITE_KEY ?? ""}
      turnstileAction={TURNSTILE_ACTION}
      closesAt={form.period.closesAt}
      awardee={{ name: form.awardee.name, region: form.awardee.region, campus: form.awardee.campus, referralCode: form.awardee.referralCode }}
      profile={{ identity: form.config.identity, relation: form.config.relation, knownDuration: form.config.knownDuration }}
      scale={form.config.scale}
      feedback={form.config.feedback}
      instruments={form.instruments.map(({ code, text, category }) => ({ code, text, category }))}
    />
  );
}
