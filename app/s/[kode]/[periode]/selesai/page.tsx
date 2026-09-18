import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { findAwardee } from "@/lib/survey";

export const dynamic = "force-dynamic";

export default async function ThankYou({
  params,
  searchParams,
}: {
  params: Promise<{ kode: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const [{ kode }, { r }] = await Promise.all([params, searchParams]);
  const awardee = await findAwardee(kode);
  const receipt = typeof r === "string" && /^[A-Z0-9]{8}$/.test(r) ? r : null;

  return (
    <main className="page">
      <BrandHeader title="Terima kasih!" subtitle="Penilaian Anda sudah tersimpan" emoji="🎉" />
      <div className="app-screen">
        <div className="notice fade-in">
          <h2 className="section-title">Evaluasi berhasil dikirim</h2>
          <p className="section-hint">
            {awardee
              ? `Masukan Anda akan membantu ${awardee.name} bertumbuh sebagai pemimpin.`
              : "Masukan Anda akan membantu awardee bertumbuh sebagai pemimpin."}
          </p>
          {receipt && (
            <p className="section-hint">
              Kode bukti pengisian
              <br />
              <span className="receipt">{receipt}</span>
            </p>
          )}
          <Link className="btn" href="/" style={{ marginTop: "1rem" }}>
            Selesai
          </Link>
        </div>
      </div>
    </main>
  );
}
