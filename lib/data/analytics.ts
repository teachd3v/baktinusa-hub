// Analitik: membaca satu siklus dari sudut pandang JENIS PENGUKURAN, bukan dari sudut pandang awardee.
//
// Halaman Hasil menjawab "bagaimana awardee ini?". Analitik menjawab "bagaimana pengukuran ini berjalan?" —
// soal mana yang paling lemah se-wilayah, wilayah mana yang tertinggal, siapa yang belum dinilai.
//
// Dua aturan yang dipegang berkas ini:
//
//  1. Saringan DIPADUKAN dengan lingkup, tidak pernah menggantikannya. Manwil yang menyaring wilayah lain
//     mendapat nol baris, bukan data wilayah itu — karena predikat lingkupnya tetap ikut di setiap query.
//  2. Hanya awardee seangkatan dengan siklusnya yang dihitung, aturan yang sama dipakai pantauan target
//     (lihat shortfalls di cron.ts). Siklus BA15 tidak boleh menampilkan awardee BA16 sebagai "belum dinilai".

import { awardeeFilter, type Scope } from "./scope.ts";
import { IPK_SCALE, predicateOf, type Predicate, type PredicateCount } from "./results.ts";

// Tiga saringan dashboard, bertingkat: jenis pengukuran → wilayah → awardee. Yang belakangan selalu
// lebih sempit, jadi memilih wilayah mempersempit daftar awardee yang bisa dipilih.
export type AnalyticsFilter = { code: string | null; regionId: number | null; awardeeId: number | null };

export const EMPTY_FILTER: AnalyticsFilter = { code: null, regionId: null, awardeeId: null };

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

// Predikat awardee: lingkup, lalu saringan, lalu angkatan siklusnya.
//
// `code` tidak ikut di sini — ia menyaring JENIS, bukan orang; pemakaiannya ada di analyticsDashboard.
function scoped(scope: Scope, filter: AnalyticsFilter, alias = "a") {
  const base = awardeeFilter(scope, alias);
  const sql = [base.sql];
  const params: (string | number)[] = [...base.params];
  if (filter.regionId !== null) {
    sql.push(`${alias}.region_id = ?`);
    params.push(filter.regionId);
  }
  if (filter.awardeeId !== null) {
    sql.push(`${alias}.id = ?`);
    params.push(filter.awardeeId);
  }
  return { sql: sql.join(" AND "), params };
}

// Skor dinormalkan ke skala IPK sebelum dirata-ratakan, sama seperti di results.ts: ambang predikat
// berasal dari rubrik berskala 4 sementara tiap soal boleh berskala lain.
const NORMALISED = `AVG(s.score * CAST(${IPK_SCALE} AS REAL) / i.scale_max)`;

// ---------- pilihan untuk saringan ----------

export type RegionOption = { id: number; name: string };

// Wilayah yang boleh dipilih di saringan — sudah disaring lingkup, jadi Manwil hanya melihat wilayahnya.
export async function regionOptions(db: D1Database, scope: Scope): Promise<RegionOption[]> {
  const f = awardeeFilter(scope);
  const { results } = await db
    .prepare(
      `SELECT DISTINCT g.id, g.name FROM regions g JOIN awardees a ON a.region_id = g.id
       WHERE ${f.sql} ORDER BY g.name`,
    )
    .bind(...f.params)
    .all<RegionOption>();
  return results;
}

export type AwardeeOption = { id: number; name: string; region: string };

// Pilihan awardee di saringan — bertingkat: kalau wilayah sudah dipilih, daftarnya menyempit ke wilayah
// itu saja. Angkatan siklus ikut membatasi, supaya nama dari angkatan lain tidak muncul di siklus ini.
export async function awardeeOptions(
  db: D1Database,
  scope: Scope,
  periodId: number,
  regionId: number | null,
): Promise<AwardeeOption[]> {
  const f = awardeeFilter(scope);
  const extra = regionId !== null ? " AND a.region_id = ?" : "";
  const { results } = await db
    .prepare(
      `SELECT a.id, a.name, g.name AS region FROM awardees a JOIN regions g ON g.id = a.region_id
       WHERE ${f.sql} AND a.batch = (SELECT batch FROM periods WHERE id = ?)${extra}
       ORDER BY a.name`,
    )
    .bind(...f.params, periodId, ...(regionId !== null ? [regionId] : []))
    .all<AwardeeOption>();
  return results;
}

// ---------- keterangan siklus ----------

export type CycleFacts = { awardees: number; responses: number; lastAt: string | null };

// Gambaran SELURUH siklus dalam lingkup pembaca, tanpa saringan. Kartu angka di dashboard mengikuti
// saringan; keterangan ini sengaja tidak, supaya orang selalu bisa melihat seberapa besar siklusnya
// sebelum mempersempitnya.
export async function cycleFacts(db: D1Database, scope: Scope, periodId: number): Promise<CycleFacts> {
  const f = awardeeFilter(scope);
  const [awardees, responses] = await Promise.all([
    db
      .prepare(`SELECT COUNT(*) AS n FROM awardees a WHERE ${f.sql} AND a.batch = (SELECT batch FROM periods WHERE id = ?)`)
      .bind(...f.params, periodId)
      .first<{ n: number }>(),
    db
      .prepare(
        `SELECT COUNT(*) AS n, MAX(r.submitted_at) AS last FROM responses r
         JOIN awardees a ON a.id = r.awardee_id WHERE r.period_id = ? AND ${f.sql}`,
      )
      .bind(periodId, ...f.params)
      .first<{ n: number; last: string | null }>(),
  ]);
  return { awardees: awardees?.n ?? 0, responses: responses?.n ?? 0, lastAt: responses?.last ?? null };
}

export type AnalyticsType = {
  id: number;
  code: string;
  name: string;
  filledBy: string;
  questionCount: number;
  targetRule: string;
  targetMin: number | null;
};

// Jenis yang dijalankan siklus ini. Jenis tanpa soal ikut disebut — supaya ketahuan kuesionernya belum diisi.
export async function listAnalyticsTypes(db: D1Database, periodId: number): Promise<AnalyticsType[]> {
  const { results } = await db
    .prepare(
      `SELECT m.id, m.code, m.name, m.filled_by AS filledBy, pm.target_rule AS targetRule, pm.target_min AS targetMin,
          (SELECT COUNT(*) FROM instruments i WHERE i.measurement_id = m.id) AS questionCount
       FROM period_measurements pm JOIN measurements m ON m.id = pm.measurement_id
       WHERE pm.period_id = ? ORDER BY m.id`,
    )
    .bind(periodId)
    .all<AnalyticsType>();
  return results;
}

// ---------- saringan yang cocok dengan pilihan yang tersedia ----------

export type ResolvedFilter = {
  filter: AnalyticsFilter;
  types: AnalyticsType[];
  regions: RegionOption[];
  awardees: AwardeeOption[];
};

// Saringan datang dari alamat, jadi bisa menyebut hal yang tidak ada di dropdown: jenis yang tidak
// dijalankan siklus ini, wilayah di luar lingkup, atau awardee dari angkatan lain. Dropdown tidak bisa
// menampilkan nilai seperti itu, jadi angkanya pun tidak boleh dihitung dari nilai itu — kalau tidak,
// layar menunjukkan "Semua awardee" sementara kartu angkanya diam-diam bicara tentang satu orang.
//
// Yang tidak cocok dibuang satu per satu, dari yang paling luas: wilayah dulu, karena daftar awardee
// bergantung padanya. Ini hanya soal konsistensi tampilan; izin tetap ditegakkan di SQL oleh lingkup.
export async function resolveFilter(
  db: D1Database,
  scope: Scope,
  periodId: number,
  raw: AnalyticsFilter,
): Promise<ResolvedFilter> {
  const [types, regions] = await Promise.all([listAnalyticsTypes(db, periodId), regionOptions(db, scope)]);
  const regionId = raw.regionId !== null && regions.some((r) => r.id === raw.regionId) ? raw.regionId : null;
  const awardees = await awardeeOptions(db, scope, periodId, regionId);
  return {
    filter: {
      code: raw.code !== null && types.some((t) => t.code === raw.code) ? raw.code : null,
      regionId,
      awardeeId: raw.awardeeId !== null && awardees.some((a) => a.id === raw.awardeeId) ? raw.awardeeId : null,
    },
    types,
    regions,
    awardees,
  };
}

// ---------- satu baris per awardee ----------

export type AnalyticsAwardee = {
  id: number;
  name: string;
  referralCode: string;
  regionId: number;
  region: string;
  responses: number;
  ipk: number | null;
  predicate: Predicate | null;
};

type AwardeeRow = {
  id: number;
  name: string;
  referral_code: string;
  region_id: number;
  region: string;
  responses: number;
  average: number | null;
};

// LEFT JOIN, bukan INNER: awardee yang belum dinilai tetap muncul sebagai baris kosong. Itu justru
// pertanyaan yang paling sering dibawa ke halaman ini — siapa yang belum masuk.
const AWARDEE_ROWS = `SELECT a.id, a.name, a.referral_code, a.region_id, g.name AS region,
      COUNT(DISTINCT r.id) AS responses, ${NORMALISED} AS average
   FROM awardees a
   JOIN regions g ON g.id = a.region_id
   LEFT JOIN responses r ON r.awardee_id = a.id AND r.period_id = ?1 AND r.measurement_id = ?2
   LEFT JOIN response_scores s ON s.response_id = r.id
   LEFT JOIN instruments i ON i.id = s.instrument_id
   WHERE a.batch = (SELECT batch FROM periods WHERE id = ?1)`;

const toAwardee = (r: AwardeeRow): AnalyticsAwardee => {
  const ipk = r.average === null ? null : round(r.average);
  return {
    id: r.id,
    name: r.name,
    referralCode: r.referral_code,
    regionId: r.region_id,
    region: r.region,
    responses: r.responses,
    ipk,
    predicate: predicateOf(ipk),
  };
};

// ---------- ringkasan semua jenis ----------

export type TypeSummary = AnalyticsType & {
  awardees: number;
  scored: number;
  responses: number;
  ipk: number | null;
  spread: PredicateCount[];
};

const SPREAD_ORDER: (Predicate | null)[] = ["cumlaude", "sangat_memuaskan", "memuaskan", "perlu_peningkatan", null];

// Tiap awardee berbobot sama, bukan tiap jawaban — aturan yang sama dengan summarizeRegions, supaya
// awardee dengan 20 responden tidak menenggelamkan yang baru punya 2.
function fold(rows: AnalyticsAwardee[]) {
  const ipks = rows.map((r) => r.ipk).filter((n): n is number => n !== null);
  const counts = new Map<Predicate | null, number>(SPREAD_ORDER.map((p) => [p, 0]));
  for (const r of rows) counts.set(r.predicate, (counts.get(r.predicate) ?? 0) + 1);
  return {
    awardees: rows.length,
    scored: ipks.length,
    responses: rows.reduce((s, r) => s + r.responses, 0),
    ipk: ipks.length === 0 ? null : round(ipks.reduce((s, n) => s + n, 0) / ipks.length),
    spread: SPREAD_ORDER.map((predicate) => ({ predicate, count: counts.get(predicate) ?? 0 })),
  };
}

export async function analyticsSummary(
  db: D1Database,
  scope: Scope,
  periodId: number,
  filter: AnalyticsFilter,
): Promise<TypeSummary[]> {
  return (await analyticsDashboard(db, scope, periodId, filter)).types;
}

// ---------- angka besar di kepala dashboard ----------

export type Totals = { awardees: number; regions: number; responses: number; ipk: number | null };

export type Dashboard = { types: TypeSummary[]; totals: Totals };

// Satu kali baca untuk seluruh dashboard: kartu angka dan grafik perbandingan dihitung dari baris yang sama.
//
// `filter.code` mempersempit jenis yang dihitung — memilih satu pengukuran di dropdown membuat kartu
// angka ikut bicara tentang pengukuran itu saja, bukan tetap menampilkan total seluruh siklus.
export async function analyticsDashboard(
  db: D1Database,
  scope: Scope,
  periodId: number,
  filter: AnalyticsFilter,
): Promise<Dashboard> {
  const semua = await listAnalyticsTypes(db, periodId);
  const code = filter.code?.trim().toUpperCase() ?? null;
  const dipakai = code ? semua.filter((t) => t.code === code) : semua;

  const f = scoped(scope, filter);
  const types: TypeSummary[] = [];
  // IPK tiap awardee dikumpulkan lintas jenis, supaya kartu "Rata-rata IPK" memberi bobot sama tiap
  // orang — bukan tiap jawaban, dan bukan tiap jenis.
  const perAwardee = new Map<number, { regionId: number; ipks: number[]; responses: number }>();

  for (const type of dipakai) {
    const { results } = await db
      .prepare(`${AWARDEE_ROWS} AND ${f.sql} GROUP BY a.id`)
      .bind(periodId, type.id, ...f.params)
      .all<AwardeeRow>();
    const rows = results.map(toAwardee);
    types.push({ ...type, ...fold(rows) });

    for (const r of rows) {
      const bucket = perAwardee.get(r.id) ?? { regionId: r.regionId, ipks: [], responses: 0 };
      if (r.ipk !== null) bucket.ipks.push(r.ipk);
      bucket.responses += r.responses;
      perAwardee.set(r.id, bucket);
    }
  }

  const orang = [...perAwardee.values()];
  const rataOrang = orang
    .filter((o) => o.ipks.length > 0)
    .map((o) => o.ipks.reduce((s, n) => s + n, 0) / o.ipks.length);

  return {
    types,
    totals: {
      awardees: orang.length,
      regions: new Set(orang.map((o) => o.regionId)).size,
      responses: orang.reduce((s, o) => s + o.responses, 0),
      ipk: rataOrang.length === 0 ? null : round(rataOrang.reduce((s, n) => s + n, 0) / rataOrang.length),
    },
  };
}

// ---------- satu jenis, dirinci ----------

export type QuestionStat = { code: string; text: string; average: number; responses: number };
export type RegionStat = { regionId: number; region: string; awardees: number; scored: number; responses: number; ipk: number | null };

export type MeasurementAnalytics = TypeSummary & {
  rows: AnalyticsAwardee[];
  questions: QuestionStat[];
  regions: RegionStat[];
};

export async function measurementAnalytics(
  db: D1Database,
  scope: Scope,
  periodId: number,
  code: string,
  filter: AnalyticsFilter,
): Promise<MeasurementAnalytics | null> {
  const type = (await listAnalyticsTypes(db, periodId)).find((t) => t.code === code.trim().toUpperCase());
  if (!type) return null;

  const f = scoped(scope, filter);
  const [{ results: awardeeRows }, { results: questionRows }] = await Promise.all([
    db.prepare(`${AWARDEE_ROWS} AND ${f.sql} GROUP BY a.id ORDER BY g.name, a.name`).bind(periodId, type.id, ...f.params).all<AwardeeRow>(),
    // Rata-rata per soal di seluruh lingkup — ini yang tidak bisa dibaca dari halaman Hasil, karena di
    // sana rinciannya selalu milik satu awardee.
    db
      .prepare(
        `SELECT i.code, i.statement AS text, ${NORMALISED} AS average, COUNT(DISTINCT r.id) AS responses
         FROM response_scores s
         JOIN responses r ON r.id = s.response_id
         JOIN instruments i ON i.id = s.instrument_id
         JOIN awardees a ON a.id = r.awardee_id
         WHERE r.period_id = ? AND r.measurement_id = ? AND ${f.sql}
         GROUP BY i.id ORDER BY i.order_index`,
      )
      .bind(periodId, type.id, ...f.params)
      .all<{ code: string; text: string; average: number; responses: number }>(),
  ]);

  const rows = awardeeRows.map(toAwardee);

  const byRegion = new Map<number, AnalyticsAwardee[]>();
  for (const r of rows) byRegion.set(r.regionId, [...(byRegion.get(r.regionId) ?? []), r]);
  const regions: RegionStat[] = [...byRegion.entries()]
    .map(([regionId, mine]) => {
      const { awardees, scored, responses, ipk } = fold(mine);
      return { regionId, region: mine[0]!.region, awardees, scored, responses, ipk };
    })
    .sort((a, b) => a.region.localeCompare(b.region, "id"));

  return {
    ...type,
    ...fold(rows),
    rows,
    questions: questionRows.map((q) => ({ code: q.code, text: q.text, average: round(q.average), responses: q.responses })),
    regions,
  };
}
