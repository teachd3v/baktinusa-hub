import { CategoryTable, fmt, TypeCards } from "@/components/results/Pieces";
import { FeedbackList, QuestionHighlights } from "@/components/results/Panels";
import type { AwardeeDetail } from "@/lib/data/results";

// Rincian satu awardee, dipakai bersama oleh halaman Awardee (dirinya), Manwil (binaannya), dan Admin.
// `showProgram` hanya untuk pengelola: saran untuk program bukan cermin diri awardee.
export function ResultDetail({ detail, showProgram = false }: { detail: AwardeeDetail; showProgram?: boolean }) {
  const self = detail.types.filter((t) => t.audience === "self");
  const awal = self.find((t) => t.code === "self_initial")?.ipk ?? null;
  const tengah = self.find((t) => t.code === "self_mid")?.ipk ?? null;
  const delta = awal !== null && tengah !== null ? Math.round((tengah - awal) * 100) / 100 : null;

  // Kekuatan dan catatan diambil dari sudut pandang orang lain yang datanya paling banyak — biasanya jejaring eksternal.
  const byOthers = detail.types
    .filter((t) => t.audience !== "self" && t.responses > 0)
    .sort((a, b) => b.responses - a.responses)[0];
  const questions = byOthers ? (detail.questions[byOthers.code] ?? []) : [];

  return (
    <>
      <section className="card">
        <h2 className="section-title">IPK per sudut pandang</h2>
        <p className="section-hint">Skala 0–4, dihitung dari rata-rata tiap kategori.</p>
        <TypeCards types={detail.types} />
        {delta !== null && (
          <p className="section-hint" style={{ marginTop: "0.9rem", marginBottom: 0 }}>
            Asesmen mandiri bergerak dari <b>{fmt(awal)}</b> ke <b>{fmt(tengah)}</b> —{" "}
            <span className={`pill ${delta >= 0 ? "pill-ok" : "pill-bad"}`}>
              {delta >= 0 ? "naik" : "turun"} {fmt(Math.abs(delta))}
            </span>
          </p>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Perbandingan kategori</h2>
        <p className="section-hint">Bagaimana penilaian diri dibanding penilaian orang lain, per kategori.</p>
        <CategoryTable types={detail.types} />
      </section>

      <section className="card">
        <h2 className="section-title">Kekuatan &amp; catatan</h2>
        <p className="section-hint">
          {byOthers ? `Menurut ${byOthers.name.toLowerCase()} — ${byOthers.responses} responden.` : "Belum ada penilaian dari orang lain."}
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
