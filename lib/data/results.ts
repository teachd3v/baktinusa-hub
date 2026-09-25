// Hasil penilaian: rata-rata per kategori, IPK, dan predikat.
//
// Kategori dibaca dari `instruments.category_id`, tidak pernah dari rentang nomor soal — inilah yang membuat
// bug Q19 di dashboard lama (Q1–Q19 & Q20–Q39) tidak mungkin terulang.
//
// IPK = rata-rata berbobot dari rata-rata tiap kategori, bukan rata-rata datar seluruh jawaban. Dashboard lama
// memakai rumus yang sama; keduanya identik selama tiap responden mengisi semua soal, dan validasi form
// memang mewajibkan itu.

import { awardeeFilter, type Scope } from "./scope.ts";

export type Predicate = "cumlaude" | "sangat_memuaskan" | "memuaskan" | "perlu_peningkatan";

export const PREDICATE_LABEL: Record<Predicate, string> = {
  cumlaude: "Cumlaude",
  sangat_memuaskan: "Sangat Memuaskan",
  memuaskan: "Memuaskan",
  perlu_peningkatan: "Perlu Peningkatan",
};

// Ambang dari program BA15 (skala 0–4), dipertahankan apa adanya supaya predikat di hub sama dengan rapor lama.
export function predicateOf(ipk: number | null): Predicate | null {
  if (ipk === null || Number.isNaN(ipk)) return null;
  if (ipk >= 3.51) return "cumlaude";
  if (ipk >= 2.76) return "sangat_memuaskan";
  if (ipk >= 2.0) return "memuaskan";
  return "perlu_peningkatan";
}

export type Category = { id: number; name: string; weight: number; orderIndex: number };
export type CategoryScore = Category & { average: number | null };
export type TypeResult = {
  typeId: number;
  code: string;
  name: string;
  audience: string;
  responses: number;
  ipk: number | null;
  predicate: Predicate | null;
  categories: CategoryScore[];
};
export type AwardeeResult = {
  id: number;
  name: string;
  campus: string | null;
  referralCode: string;
  regionId: number;
  region: string;
  types: TypeResult[];
};

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

// IPK hanya dihitung dari kategori yang punya jawaban; kategori kosong tidak dianggap nol.
export function ipkOf(categories: CategoryScore[]): number | null {
  let sum = 0;
  let weight = 0;
  for (const c of categories) {
    if (c.average === null) continue;
    sum += c.average * c.weight;
    weight += c.weight;
  }
  return weight === 0 ? null : round(sum / weight);
}

export async function listCategories(db: D1Database, periodId: number): Promise<Category[]> {
  const { results } = await db
    .prepare("SELECT id, name, weight, order_index FROM instrument_categories WHERE period_id = ? ORDER BY order_index")
    .bind(periodId)
    .all<{ id: number; name: string; weight: number; order_index: number }>();
  return results.map((r) => ({ id: r.id, name: r.name, weight: r.weight, orderIndex: r.order_index }));
}

type AggRow = { awardee_id: number; type_id: number; category_id: number; average: number; responses: number };

const AGGREGATE = `SELECT r.awardee_id, r.respondent_type_id AS type_id, i.category_id,
    AVG(s.score) AS average, COUNT(DISTINCT r.id) AS responses
  FROM response_scores s
  JOIN responses r ON r.id = s.response_id
  JOIN instruments i ON i.id = s.instrument_id
  JOIN awardees a ON a.id = r.awardee_id
  WHERE r.period_id = ?`;

function buildTypes(
  categories: Category[],
  types: { id: number; code: string; name: string; audience: string }[],
  rows: AggRow[],
): TypeResult[] {
  return types.map((t) => {
    const mine = rows.filter((r) => r.type_id === t.id);
    const scored: CategoryScore[] = categories.map((c) => {
      const row = mine.find((r) => r.category_id === c.id);
      return { ...c, average: row ? round(row.average) : null };
    });
    return {
      typeId: t.id,
      code: t.code,
      name: t.name,
      audience: t.audience,
      responses: mine[0]?.responses ?? 0,
      ipk: ipkOf(scored),
      predicate: predicateOf(ipkOf(scored)),
      categories: scored,
    };
  });
}

async function typesOfPeriod(db: D1Database, periodId: number) {
  const { results } = await db
    .prepare(
      `SELECT rt.id, rt.code, rt.name, rt.audience FROM period_respondent_types prt
       JOIN respondent_types rt ON rt.id = prt.respondent_type_id
       WHERE prt.period_id = ? ORDER BY rt.id`,
    )
    .bind(periodId)
    .all<{ id: number; code: string; name: string; audience: string }>();
  return results;
}

// Satu baris per awardee dalam lingkup, lengkap dengan IPK tiap tipe penilai.
export async function resultsForScope(db: D1Database, scope: Scope, periodId: number): Promise<AwardeeResult[]> {
  const f = awardeeFilter(scope);
  const [categories, types, { results: rows }, { results: awardees }] = await Promise.all([
    listCategories(db, periodId),
    typesOfPeriod(db, periodId),
    db
      .prepare(`${AGGREGATE} AND ${f.sql} GROUP BY r.awardee_id, r.respondent_type_id, i.category_id`)
      .bind(periodId, ...f.params)
      .all<AggRow>(),
    db
      .prepare(
        `SELECT a.id, a.name, a.campus, a.referral_code, a.region_id, g.name AS region
         FROM awardees a JOIN regions g ON g.id = a.region_id
         WHERE ${f.sql} ORDER BY g.name, a.name`,
      )
      .bind(...f.params)
      .all<{ id: number; name: string; campus: string | null; referral_code: string; region_id: number; region: string }>(),
  ]);

  return awardees.map((a) => ({
    id: a.id,
    name: a.name,
    campus: a.campus,
    referralCode: a.referral_code,
    regionId: a.region_id,
    region: a.region,
    types: buildTypes(categories, types, rows.filter((r) => r.awardee_id === a.id)),
  }));
}

// ---------- rincian satu awardee ----------

export type QuestionScore = { code: string; text: string; categoryId: number; average: number; responses: number };
export type FeedbackEntry = { field: string; body: string; typeCode: string; typeName: string; audience: string; relation: string | null };
export type AwardeeDetail = AwardeeResult & { questions: Record<string, QuestionScore[]>; feedback: FeedbackEntry[] };

// `questions` dikunci per kode tipe penilai supaya kekuatan/kelemahan bisa dilihat per sudut pandang.
export async function awardeeDetail(
  db: D1Database,
  scope: Scope,
  periodId: number,
  referralCode: string,
): Promise<AwardeeDetail | null> {
  const f = awardeeFilter(scope);
  const awardee = await db
    .prepare(
      `SELECT a.id, a.name, a.campus, a.referral_code, a.region_id, g.name AS region
       FROM awardees a JOIN regions g ON g.id = a.region_id
       WHERE ${f.sql} AND a.referral_code = ?`,
    )
    .bind(...f.params, referralCode.trim().toUpperCase())
    .first<{ id: number; name: string; campus: string | null; referral_code: string; region_id: number; region: string }>();
  if (!awardee) return null;

  const [categories, types, { results: rows }, { results: questionRows }, { results: feedbackRows }] = await Promise.all([
    listCategories(db, periodId),
    typesOfPeriod(db, periodId),
    db
      .prepare(`${AGGREGATE} AND a.id = ? GROUP BY r.awardee_id, r.respondent_type_id, i.category_id`)
      .bind(periodId, awardee.id)
      .all<AggRow>(),
    db
      .prepare(
        `SELECT rt.code AS type_code, i.code, i.text_public AS text, i.category_id,
            AVG(s.score) AS average, COUNT(*) AS responses
         FROM response_scores s
         JOIN responses r ON r.id = s.response_id
         JOIN instruments i ON i.id = s.instrument_id
         JOIN respondent_types rt ON rt.id = r.respondent_type_id
         WHERE r.period_id = ? AND r.awardee_id = ?
         GROUP BY rt.code, i.id
         ORDER BY i.order_index`,
      )
      .bind(periodId, awardee.id)
      .all<{ type_code: string; code: string; text: string; category_id: number; average: number; responses: number }>(),
    db
      .prepare(
        `SELECT fb.field, fb.body, rt.code AS type_code, rt.name AS type_name, rt.audience, r.relation
         FROM response_feedback fb
         JOIN responses r ON r.id = fb.response_id
         JOIN respondent_types rt ON rt.id = r.respondent_type_id
         WHERE r.period_id = ? AND r.awardee_id = ?
         ORDER BY rt.id, r.id`,
      )
      .bind(periodId, awardee.id)
      .all<{ field: string; body: string; type_code: string; type_name: string; audience: string; relation: string | null }>(),
  ]);

  const questions: Record<string, QuestionScore[]> = {};
  for (const q of questionRows) {
    (questions[q.type_code] ??= []).push({
      code: q.code,
      text: q.text,
      categoryId: q.category_id,
      average: round(q.average),
      responses: q.responses,
    });
  }

  return {
    id: awardee.id,
    name: awardee.name,
    campus: awardee.campus,
    referralCode: awardee.referral_code,
    regionId: awardee.region_id,
    region: awardee.region,
    types: buildTypes(categories, types, rows),
    questions,
    feedback: feedbackRows.map((r) => ({
      field: r.field,
      body: r.body,
      typeCode: r.type_code,
      typeName: r.type_name,
      audience: r.audience,
      relation: r.relation,
    })),
  };
}

// ---------- ringkasan untuk dashboard ----------

export type RegionSummary = { regionId: number; region: string; awardees: number; ipk: number | null; responses: number };

// Rata-rata IPK per wilayah, dihitung dari IPK awardee yang sudah punya nilai — bukan dari seluruh jawaban mentah,
// supaya awardee dengan banyak responden tidak menenggelamkan yang sedikit.
export function summarizeRegions(results: AwardeeResult[], typeCode?: string): RegionSummary[] {
  const byRegion = new Map<number, { region: string; ipks: number[]; awardees: number; responses: number }>();
  for (const a of results) {
    const bucket = byRegion.get(a.regionId) ?? { region: a.region, ipks: [], awardees: 0, responses: 0 };
    const types = typeCode ? a.types.filter((t) => t.code === typeCode) : a.types;
    const ipks = types.map((t) => t.ipk).filter((n): n is number => n !== null);
    if (ipks.length > 0) bucket.ipks.push(ipks.reduce((s, n) => s + n, 0) / ipks.length);
    bucket.awardees += 1;
    bucket.responses += types.reduce((s, t) => s + t.responses, 0);
    byRegion.set(a.regionId, bucket);
  }
  return [...byRegion.entries()]
    .map(([regionId, b]) => ({
      regionId,
      region: b.region,
      awardees: b.awardees,
      responses: b.responses,
      ipk: b.ipks.length === 0 ? null : round(b.ipks.reduce((s, n) => s + n, 0) / b.ipks.length),
    }))
    .sort((a, b) => a.region.localeCompare(b.region, "id"));
}

export type PredicateCount = { predicate: Predicate | null; count: number };

// Sebaran predikat untuk satu tipe penilai — pengganti donat "Kategori Asesmen Awal/Tengah/…" di dashboard lama.
export function predicateSpread(results: AwardeeResult[], typeCode: string): PredicateCount[] {
  const order: (Predicate | null)[] = ["cumlaude", "sangat_memuaskan", "memuaskan", "perlu_peningkatan", null];
  const counts = new Map<Predicate | null, number>(order.map((p) => [p, 0]));
  for (const a of results) {
    const type = a.types.find((t) => t.code === typeCode);
    const p = type?.predicate ?? null;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return order.map((predicate) => ({ predicate, count: counts.get(predicate) ?? 0 }));
}

export const ipkAcross = (types: TypeResult[]): number | null => {
  const ipks = types.map((t) => t.ipk).filter((n): n is number => n !== null);
  return ipks.length === 0 ? null : round(ipks.reduce((s, n) => s + n, 0) / ipks.length);
};
