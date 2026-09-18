import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AwardeeCard } from "@/components/AwardeeCard";
import { BrandHeader } from "@/components/BrandHeader";
import { listOpenForms } from "@/lib/survey";

export const dynamic = "force-dynamic";

// Satu tautan per awardee. Kalau hanya satu survei yang terbuka, langsung ke form-nya.
export default async function AwardeeLanding({ params }: { params: Promise<{ kode: string }> }) {
  const { kode } = await params;
  const data = await listOpenForms(kode);
  if (!data) notFound();
  const { awardee, forms } = data;
  if (forms.length === 1) redirect(`/s/${awardee.referralCode}/${forms[0]!.slug}`);

  return (
    <main className="page">
      <BrandHeader title="Survei Awardee" subtitle="BAKTI NUSA" />
      <div className="app-screen">
        <AwardeeCard name={awardee.name} region={awardee.region} campus={awardee.campus} referralCode={awardee.referralCode} />
        {forms.length === 0 ? (
          <div className="notice fade-in">
            <div className="notice-emoji" aria-hidden="true">🗓️</div>
            <h2 className="section-title">Belum ada survei yang dibuka</h2>
            <p className="section-hint">
              Saat ini tidak ada survei untuk {awardee.name}. Coba buka tautan ini lagi saat periode penilaian berjalan.
            </p>
          </div>
        ) : (
          <section className="card fade-in">
            <h2 className="section-title">Pilih survei</h2>
            <p className="section-hint">Ada beberapa survei yang sedang dibuka untuk {awardee.name}.</p>
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {forms.map((form) => (
                <Link key={form.slug} className="btn" href={`/s/${awardee.referralCode}/${form.slug}`}>
                  {form.title}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
