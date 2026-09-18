import { BrandHeader } from "@/components/BrandHeader";

export default function Home() {
  return (
    <main className="page">
      <BrandHeader title="BAKTINUSA HUB" subtitle="BAKTI NUSA · Angkatan 15" />
      <div className="app-screen">
        <div className="notice">
          <h2 className="section-title">Portal pengukuran awardee</h2>
          <p className="section-hint">
            Ingin menilai seorang awardee? Buka tautan survei yang dibagikan awardee tersebut kepada Anda.
          </p>
        </div>
      </div>
    </main>
  );
}
