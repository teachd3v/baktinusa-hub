import { awardeeFilter, type Scope } from "./scope.ts";

// Semua fungsi di sini WAJIB menerima Scope: tidak ada cara membaca awardee atau respons tanpa lewat scopeFor().

export type AwardeeSummary = {
  id: number;
  name: string;
  campus: string | null;
  referralCode: string;
  regionId: number;
  region: string;
};

type AwardeeRow = { id: number; name: string; campus: string | null; referral_code: string; region_id: number; region: string };

const toSummary = (r: AwardeeRow): AwardeeSummary => ({
  id: r.id,
  name: r.name,
  campus: r.campus,
  referralCode: r.referral_code,
  regionId: r.region_id,
  region: r.region,
});

const SELECT_AWARDEE = `SELECT a.id, a.name, a.campus, a.referral_code, a.region_id, r.name AS region
  FROM awardees a JOIN regions r ON r.id = a.region_id`;

export async function listAwardees(db: D1Database, scope: Scope): Promise<AwardeeSummary[]> {
  const f = awardeeFilter(scope);
  const { results } = await db
    .prepare(`${SELECT_AWARDEE} WHERE ${f.sql} ORDER BY r.name, a.name`)
    .bind(...f.params)
    .all<AwardeeRow>();
  return results.map(toSummary);
}

export async function getAwardee(db: D1Database, scope: Scope, referralCode: string): Promise<AwardeeSummary | null> {
  const f = awardeeFilter(scope);
  const row = await db
    .prepare(`${SELECT_AWARDEE} WHERE ${f.sql} AND a.referral_code = ?`)
    .bind(...f.params, referralCode.trim().toUpperCase())
    .first<AwardeeRow>();
  return row ? toSummary(row) : null;
}

export type ResponseRef = { id: number; awardeeId: number; periodId: number; typeCode: string };

export async function listResponses(db: D1Database, scope: Scope, periodId?: number): Promise<ResponseRef[]> {
  const f = awardeeFilter(scope);
  const { results } = await db
    .prepare(
      `SELECT r.id, r.awardee_id, r.period_id, rt.code AS type_code
       FROM responses r
       JOIN awardees a ON a.id = r.awardee_id
       JOIN respondent_types rt ON rt.id = r.respondent_type_id
       WHERE ${f.sql} ${periodId === undefined ? "" : "AND r.period_id = ?"}
       ORDER BY r.id`,
    )
    .bind(...f.params, ...(periodId === undefined ? [] : [periodId]))
    .all<{ id: number; awardee_id: number; period_id: number; type_code: string }>();
  return results.map((r) => ({ id: r.id, awardeeId: r.awardee_id, periodId: r.period_id, typeCode: r.type_code }));
}

// ---------- pantauan target per awardee ----------

export type TypeProgress = { code: string; name: string; count: number; target: number | null };
export type AwardeeProgress = AwardeeSummary & { types: TypeProgress[] };

export async function progressForScope(db: D1Database, scope: Scope, periodId: number): Promise<AwardeeProgress[]> {
  const awardees = await listAwardees(db, scope);
  if (awardees.length === 0) return [];
  const f = awardeeFilter(scope);

  const [{ results: types }, { results: counts }, { results: regionSizes }] = await Promise.all([
    db
      .prepare(
        `SELECT rt.id, rt.code, rt.name, prt.target_rule, prt.target_min
         FROM period_respondent_types prt JOIN respondent_types rt ON rt.id = prt.respondent_type_id
         WHERE prt.period_id = ? ORDER BY rt.id`,
      )
      .bind(periodId)
      .all<{ id: number; code: string; name: string; target_rule: string; target_min: number | null }>(),
    db
      .prepare(
        `SELECT r.awardee_id, r.respondent_type_id, COUNT(*) AS n
         FROM responses r JOIN awardees a ON a.id = r.awardee_id
         WHERE r.period_id = ? AND ${f.sql}
         GROUP BY r.awardee_id, r.respondent_type_id`,
      )
      .bind(periodId, ...f.params)
      .all<{ awardee_id: number; respondent_type_id: number; n: number }>(),
    // Target Peer = awardee lain se-wilayah; butuh ukuran wilayah penuh, bukan hanya yang ada di lingkup.
    db
      .prepare("SELECT region_id, COUNT(*) AS n FROM awardees GROUP BY region_id")
      .all<{ region_id: number; n: number }>(),
  ]);

  const sizeOf = new Map(regionSizes.map((r) => [r.region_id, r.n]));
  const countOf = new Map(counts.map((c) => [`${c.awardee_id}:${c.respondent_type_id}`, c.n]));

  return awardees.map((a) => ({
    ...a,
    types: types.map((t) => ({
      code: t.code,
      name: t.name,
      count: countOf.get(`${a.id}:${t.id}`) ?? 0,
      target:
        t.target_rule === "fixed" ? t.target_min
        : t.target_rule === "region_peers" ? Math.max(0, (sizeOf.get(a.regionId) ?? 1) - 1)
        : null,
    })),
  }));
}
