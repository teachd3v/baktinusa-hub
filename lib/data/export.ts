// Ekspor CSV. Dua bentuk: matriks agregat (satu baris per awardee) dan data mentah (satu baris per pengisi).
//
// Keduanya lewat Scope yang sama dengan dashboard, jadi Manwil tidak bisa mengekspor wilayah lain.
// Data mentah memuat identitas responden, jadi pemanggilnya dibatasi Admin di lapisan route.

import { awardeeFilter, type Scope } from "./scope.ts";
import { listCategories, resultsForScope, type AwardeeResult } from "./results.ts";

// Excel di Windows membaca CSV dengan pemisah titik koma saat lokalnya Indonesia; koma di dalam nilai
// tetap aman karena setiap sel dikutip.
const SEP = ";";

export function toCsv(rows: (string | number | null)[][]): string {
  const cell = (v: string | number | null) => {
    if (v === null) return "";
    const text = String(v);
    return /["\n\r;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  // BOM supaya Excel mengenali UTF-8 dan nama dengan tanda baca tidak berubah.
  return `﻿${rows.map((r) => r.map(cell).join(SEP)).join("\r\n")}\r\n`;
}

export const csvFilename = (kind: string, periodSlug: string) =>
  `baktinusa-${kind}-${periodSlug}-${new Date().toISOString().slice(0, 10)}.csv`;

export function matrixRows(results: AwardeeResult[], categories: { id: number; name: string }[]): (string | number | null)[][] {
  const types = results[0]?.types ?? [];
  const header = [
    "Nama",
    "Wilayah",
    "Kampus",
    "Kode referal",
    ...types.flatMap((t) => [`${t.name} — IPK`, `${t.name} — responden`]),
    ...categories.map((c) => `${c.name} (360°)`),
  ];

  const body = results.map((a) => {
    const external = a.types.find((t) => t.code === "external");
    return [
      a.name,
      a.region,
      a.campus,
      a.referralCode,
      ...a.types.flatMap((t) => [t.ipk, t.responses]),
      ...categories.map((c) => external?.categories.find((x) => x.id === c.id)?.average ?? null),
    ];
  });

  return [header, ...body];
}

export async function matrixCsv(db: D1Database, scope: Scope, periodId: number): Promise<string> {
  const [results, categories] = await Promise.all([resultsForScope(db, scope, periodId), listCategories(db, periodId)]);
  return toCsv(matrixRows(results, categories));
}

// Data mentah: satu baris per respons, satu kolom per pertanyaan — bentuk yang dulu ada di spreadsheet,
// supaya analisis lanjutan tidak perlu menunggu fitur baru di hub.
export async function rawCsv(db: D1Database, scope: Scope, periodId: number): Promise<string> {
  const f = awardeeFilter(scope);
  const [{ results: instruments }, { results: responses }, { results: scores }, { results: feedback }] = await Promise.all([
    db
      .prepare(
        `SELECT i.id, i.code FROM instruments i JOIN periods p ON p.measurement_id = i.measurement_id
         WHERE p.id = ? ORDER BY i.order_index`,
      )
      .bind(periodId).all<{ id: number; code: string }>(),
    db
      .prepare(
        `SELECT r.id, a.name AS awardee, g.name AS region, rt.name AS tipe, r.respondent_name, r.respondent_city,
            r.relation, r.known_duration, r.submitted_at, r.source
         FROM responses r
         JOIN awardees a ON a.id = r.awardee_id
         JOIN regions g ON g.id = a.region_id
         JOIN respondent_types rt ON rt.id = r.respondent_type_id
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
