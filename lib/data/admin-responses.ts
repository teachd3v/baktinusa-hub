// Moderasi respons: melihat data mentah dan menghapus kiriman ganda.
//
// Menghapus respons adalah satu-satunya tindakan merusak di konsol, jadi ia hanya untuk Admin, selalu
// meninggalkan jejak audit lengkap dengan isinya, dan tidak punya bentuk "hapus semua".

import { writeAudit } from "./audit.ts";
import type { Fail, Ok } from "./admin-periods.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh memoderasi respons");
}

export type ResponseRow = {
  id: number;
  awardee: string;
  region: string;
  type: string;
  respondentName: string | null;
  respondentCity: string | null;
  relation: string | null;
  submittedAt: string | null;
  source: string;
  scores: number;
  duplicateOf: number | null;
};

// Dua kiriman dianggap kembar kalau sidik jari perangkatnya sama untuk awardee & tipe yang sama.
// Ditandai, bukan dihapus otomatis: satu keluarga bisa saja mengisi dari satu ponsel.
export async function listResponsesForAdmin(db: D1Database, actor: SessionUser, periodId: number, limit = 300): Promise<ResponseRow[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT r.id, a.name AS awardee, g.name AS region, rt.name AS tipe, r.respondent_name, r.respondent_city,
          r.relation, r.submitted_at, r.source, r.fingerprint,
          (SELECT COUNT(*) FROM response_scores s WHERE s.response_id = r.id) AS scores,
          (SELECT MIN(x.id) FROM responses x
             WHERE x.period_id = r.period_id AND x.awardee_id = r.awardee_id
               AND x.respondent_type_id = r.respondent_type_id
               AND x.fingerprint IS NOT NULL AND x.fingerprint = r.fingerprint) AS first_same
       FROM responses r
       JOIN awardees a ON a.id = r.awardee_id
       JOIN regions g ON g.id = a.region_id
       JOIN respondent_types rt ON rt.id = r.respondent_type_id
       WHERE r.period_id = ?
       ORDER BY r.id DESC LIMIT ?`,
    )
    .bind(periodId, Math.min(Math.max(limit, 1), 1000))
    .all<{ id: number; awardee: string; region: string; tipe: string; respondent_name: string | null; respondent_city: string | null; relation: string | null; submitted_at: string | null; source: string; fingerprint: string | null; scores: number; first_same: number | null }>();

  return results.map((r) => ({
    id: r.id,
    awardee: r.awardee,
    region: r.region,
    type: r.tipe,
    respondentName: r.respondent_name,
    respondentCity: r.respondent_city,
    relation: r.relation,
    submittedAt: r.submitted_at,
    source: r.source,
    scores: r.scores,
    duplicateOf: r.first_same !== null && r.first_same !== r.id ? r.first_same : null,
  }));
}

export async function deleteResponse(db: D1Database, actor: SessionUser, responseId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(
      `SELECT r.id, a.name AS awardee, rt.name AS tipe, r.respondent_name, r.submitted_at, r.source,
          (SELECT COUNT(*) FROM response_scores s WHERE s.response_id = r.id) AS scores
       FROM responses r JOIN awardees a ON a.id = r.awardee_id JOIN respondent_types rt ON rt.id = r.respondent_type_id
       WHERE r.id = ?`,
    )
    .bind(responseId)
    .first<{ id: number; awardee: string; tipe: string; respondent_name: string | null; submitted_at: string | null; source: string; scores: number }>();
  if (!row) return { ok: false, message: "Respons tidak ditemukan." };

  // Skor dan saran ikut terhapus lewat ON DELETE CASCADE; jejaknya menyimpan ringkasan isi yang hilang.
  await db.prepare("DELETE FROM responses WHERE id = ?").bind(responseId).run();
  await writeAudit(db, actor, {
    action: "respons.hapus",
    entity: "response",
    entityId: responseId,
    summary: `Respons #${responseId} untuk "${row.awardee}" (${row.tipe}) dihapus beserta ${row.scores} skornya`,
    detail: row,
  });
  return { ok: true };
}
