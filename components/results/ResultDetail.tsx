import { CategoryTable, TypeCards } from "@/components/results/Pieces";
import { FeedbackList, QuestionHighlights } from "@/components/results/Panels";
import type { AwardeeDetail } from "@/lib/data/results";

// Rincian satu awardee, dipakai bersama oleh halaman Awardee (dirinya), Manwil (binaannya), dan Admin.
// `showProgram` hanya untuk pengelola: saran untuk program bukan cermin diri awardee.
//
// Dulu di sini ada baris "asesmen mandiri bergerak dari X ke Y". Baris itu membandingkan kode
// 'self_initial' dengan 'self_mid', dua kode yang dilebur jadi satu SA oleh migrasi 0008, jadi ia tidak
// pernah muncul lagi. Perbandingannya juga tidak mungkin dihitung di sini: halaman ini memegang SATU
// siklus, sementara SA awal dan SA tengah hidup di siklus yang berbeda. Kalau pergerakan itu mau
// ditampilkan kembali, ia butuh query lintas siklus — bukan sekadar cari kode lain.
export function ResultDetail({ detail, showProgram = false }: { detail: AwardeeDetail; showProgram?: boolean }) {
  // Kekuatan dan catatan diambil dari sudut pandang orang lain yang datanya paling banyak — biasanya jejaring eksternal.
  const byOthers = detail.types
    .filter((t) => t.audience !== "self" && t.responses > 0)
    .sort((a, b) => b.responses - a.responses)[0];
  const questions = byOthers ? (detail.questions[byOthers.code] ?? []) : [];

  return (
    <>
      <section className="card">
        <h2 className="section-title">IPK per sudut pandang</h2>
        <p className="section-hint">Skala 0 sampai 4, rata-rata seluruh soal dalam tiap jenis pengukuran.</p>
        <TypeCards types={detail.types} />
      </section>

      <section className="card">
        <h2 className="section-title">Perbandingan sudut pandang</h2>
        <p className="section-hint">Bagaimana penilaian diri dibanding penilaian orang lain.</p>
        <CategoryTable types={detail.types} />
      </section>

      <section className="card">
        <h2 className="section-title">Kekuatan &amp; catatan</h2>
        <p className="section-hint">
          {byOthers ? `Menurut ${byOthers.name.toLowerCase()}, ${byOthers.responses} responden.` : "Belum ada penilaian dari orang lain."}
        </p>
        <QuestionHighlights questions={questions} />
      </section>

      <section className="card">
        <h2 className="section-title">Masukan dari penilai</h2>
        <p className="section-hint">Ditulis tanpa nama pengisi, supaya masukannya bisa jujur.</p>
        <FeedbackList entries={detail.feedback} field="saran_diri" from="others" />
      </section>

      {detail.feedback.some((f) => f.audience === "self" && f.field === "saran_diri") && (
        <section className="card">
          <h2 className="section-title">Refleksi pribadi</h2>
          <p className="section-hint">Ditulis sendiri saat mengisi asesmen mandiri.</p>
          <FeedbackList entries={detail.feedback} field="saran_diri" from="self" />
        </section>
      )}

      {showProgram && (
        <section className="card">
          <h2 className="section-title">Saran untuk program</h2>
          <p className="section-hint">Masukan responden tentang program BAKTI NUSA, bukan tentang awardee.</p>
          <FeedbackList entries={detail.feedback} field="saran_program" />
        </section>
      )}
    </>
  );
}
