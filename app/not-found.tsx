import { BrandHeader } from "@/components/BrandHeader";

export default function NotFound() {
  return (
    <main className="page">
      <BrandHeader title="Halaman tidak ditemukan" subtitle="BAKTINUSA HUB" />
      <div className="app-screen">
        <div className="notice fade-in">
          <div className="notice-emoji" aria-hidden="true">🧭</div>
          <h2 className="section-title">Tautan ini tidak dikenali</h2>
          <p className="section-hint">Periksa kembali tautan survei yang Anda terima dari awardee. Kode referal terdiri dari 8 huruf dan angka.</p>
        </div>
      </div>
    </main>
  );
}
