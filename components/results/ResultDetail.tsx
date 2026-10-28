import { CollapseCard } from "@/components/CollapseCard";
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
      <CollapseCard title="IPK per sudut pandang" openMobile>
        <p className="section-hint hide-mobile">Skala 0 sampai 4, rata-rata seluruh soal dalam tiap jenis pengukuran.</p>
        <TypeCards types={detail.types} />
      </CollapseCard>

      <CollapseCard title="Perbandingan sudut pandang">
        <p className="section-hint hide-mobile">Bagaimana penilaian diri dibanding penilaian orang lain.</p>
        <CategoryTable types={detail.types} />
      </CollapseCard>

      <CollapseCard title="Kekuatan &amp; catatan">
        <p className="section-hint">
          {byOthers ? `Menurut ${byOthers.name.toLowerCase()}, ${byOthers.responses} responden.` : "Belum ada penilaian dari orang lain."}
        </p>
        <QuestionHighlights questions={questions} />
      </CollapseCard>

      <CollapseCard title="Masukan dari penilai">
        <p className="section-hint hide-mobile">Ditulis tanpa nama pengisi, supaya masukannya bisa jujur.</p>
        <FeedbackList entries={detail.feedback} field="saran_diri" from="others" />
      </CollapseCard>

      {detail.feedback.some((f) => f.audience === "self" && f.field === "saran_diri") && (
        <CollapseCard title="Refleksi pribadi">
          <p className="section-hint hide-mobile">Ditulis sendiri saat mengisi asesmen mandiri.</p>
          <FeedbackList entries={detail.feedback} field="saran_diri" from="self" />
        </CollapseCard>
      )}

      {showProgram && (
        <CollapseCard title="Saran untuk program">
          <p className="section-hint hide-mobile">Masukan responden tentang program BAKTI NUSA, bukan tentang awardee.</p>
          <FeedbackList entries={detail.feedback} field="saran_program" />
        </CollapseCard>
      )}
    </>
  );
}
