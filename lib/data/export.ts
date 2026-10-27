// Ekspor CSV. Dua bentuk: matriks agregat (satu baris per awardee) dan data mentah (satu baris per pengisi).
//
// Keduanya lewat Scope yang sama dengan dashboard, jadi Manwil tidak bisa mengekspor wilayah lain.
// Data mentah memuat identitas responden, jadi pemanggilnya dibatasi Admin di lapisan route.

import { awardeeFilter, type Scope } from "./scope.ts";
import { resultsForScope, type AwardeeResult } from "./results.ts";

// Excel di Windows membaca CSV dengan pemisah titik koma saat lokalnya Indonesia; koma di dalam nilai
// tetap aman karena setiap sel dikutip.
const SEP = ";";

// Sel yang diawali = + - @ (atau tab/CR) dibaca Excel dan Sheets sebagai FORMULA, bukan teks. Kolom
// identitas dan saran di ekspor data mentah diisi responden publik tanpa akun, jadi tanpa pagar ini
// seorang responden bisa menitipkan formula yang berjalan di komputer Admin saat berkasnya dibuka.
// Mengutip selnya tidak menolong — Excel tetap mengevaluasi isi di dalam kutip; yang menolong adalah
// awalan kutip tunggal, penanda "baca sebagai teks". Hanya berlaku untuk teks: angka dari aplikasi
// sendiri (skor, IPK, id) dibiarkan apa adanya supaya nilai negatif tidak ikut dipagari.
const FORMULA_LEAD = /^[=+\-@\t\r]/;

export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    const text = typeof v === "number" ? String(v) : FORMULA_LEAD.test(v) ? `'${v}` : v;
    return /["\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  // BOM supaya Excel mengenali UTF-8 dan nama dengan tanda baca tidak berubah.
  return `﻿${rows.map((r) => r.map(cell).join(SEP)).join("\r\n")}\r\n`;
}

export const csvFilename = (kind: string, periodSlug: string) =>
  `baktinusa-${kind}-${periodSlug}-${new Date().toISOString().slice(0, 10)}.csv`;

// Satu kolom IPK + responden per jenis pengukuran. Kolom rincian per sub pengukuran hilang bersama
// sub pengukurannya (migrasi 0009); rincian per soal tetap ada di ekspor data mentah.
export function matrixRows(results: AwardeeResult[]): (string | number | null)[][] {
  const types = results[0]?.types ?? [];
  const header = [
    "Nama",
    "Wilayah",
    "Kampus",
    "Kode referal",
    ...types.flatMap((t) => [`${t.name} — IPK`, `${t.name} — responden`]),
  ];

  const body = results.map((a) => [
    a.name,
    a.region,
    a.campus,
    a.referralCode,
    ...a.types.flatMap((t) => [t.ipk, t.responses]),
  ]);

  return [header, ...body];
}

export async function matrixCsv(db: D1Database, scope: Scope, periodId: number): Promise<string> {
  return toCsv(matrixRows(await resultsForScope(db, scope, periodId)));
}

// Data mentah: satu baris per respons, satu kolom per pertanyaan — bentuk yang dulu ada di spreadsheet,
// supaya analisis lanjutan tidak perlu menunggu fitur baru di hub.
export async function rawCsv(db: D1Database, scope: Scope, periodId: number): Promise<string> {
  const f = awardeeFilter(scope);
  const [{ results: instruments }, { results: responses }, { results: scores }, { results: feedback }] = await Promise.all([
    db
      .prepare(
        // Satu siklus menjalankan beberapa jenis, dan kode soal hanya unik DI DALAM jenisnya —
        // tanpa awalan kode jenis, kolomnya jadi "Q1;Q1;Q1;Q1" dan tidak bisa dibaca siapa pun.
        `SELECT i.id, m.code || '·' || i.code AS code
         FROM instruments i
         JOIN measurements m ON m.id = i.measurement_id
         JOIN period_measurements pm ON pm.measurement_id = i.measurement_id
         WHERE pm.period_id = ? ORDER BY m.code, i.order_index`,
      )
      .bind(periodId).all<{ id: number; code: string }>(),
    db
      .prepare(
        `SELECT r.id, a.name AS awardee, g.name AS region, rt.name AS tipe, r.respondent_name, r.respondent_city,
            r.relation, r.known_duration, r.submitted_at, r.source
         FROM responses r
         JOIN awardees a ON a.id = r.awardee_id
         JOIN regions g ON g.id = a.region_id
         JOIN measurements rt ON rt.id = r.measurement_id
         WHERE r.period_id = ? AND ${f.sql}
         ORDER BY a.name, rt.id, r.id`,
      )
      .bind(periodId, ...f.params)
      .all<{ id: number; awardee: string; region: string; tipe: string; respondent_name: string | null; respondent_city: string | null; relation: string | null; known_duration: string | null; submitted_at: string | null; source: string }>(),
    db
      .prepare(
        `SELECT s.response_id, s.instrument_id, s.score
         FROM response_scores s JOIN responses r ON r.id = s.response_id JOIN awardees a ON a.id = r.awardee_id
         WHERE r.period_id = ? AND ${f.sql}`,
      )
      .bind(periodId, ...f.params)
      .all<{ response_id: number; instrument_id: number; score: number }>(),
    db
      .prepare(
        `SELECT fb.response_id, fb.field, fb.body
         FROM response_feedback fb JOIN responses r ON r.id = fb.response_id JOIN awardees a ON a.id = r.awardee_id
         WHERE r.period_id = ? AND ${f.sql}`,
      )
      .bind(periodId, ...f.params)
      .all<{ response_id: number; field: string; body: string }>(),
  ]);

  const scoreOf = new Map(scores.map((s) => [`${s.response_id}:${s.instrument_id}`, s.score]));
  const fields = [...new Set(feedback.map((f2) => f2.field))].sort();
  const feedbackOf = new Map(feedback.map((f2) => [`${f2.response_id}:${f2.field}`, f2.body]));

  const header = [
    "ID respons",
    "Awardee",
    "Wilayah",
    "Tipe penilai",
    "Nama responden",
    "Kota",
    "Hubungan",
    "Lama kenal",
    "Waktu kirim",
    "Sumber",
    ...instruments.map((i) => i.code),
    ...fields,
  ];

  const body = responses.map((r) => [
    r.id,
    r.awardee,
    r.region,
    r.tipe,
    r.respondent_name,
    r.respondent_city,
    r.relation,
    r.known_duration,
    r.submitted_at,
    r.source,
    ...instruments.map((i) => scoreOf.get(`${r.id}:${i.id}`) ?? null),
    ...fields.map((field) => feedbackOf.get(`${r.id}:${field}`) ?? null),
  ]);

  return toCsv([header, ...body]);
}
