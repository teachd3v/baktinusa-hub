// Konsol periode: membuka, menutup, dan menjadwalkan tiap tipe penilai — semuanya data, bukan kode.
// Inilah yang menggantikan deadline yang dulu ditulis tangan di enam berkas.

import { writeAudit } from "./audit.ts";
import type { PeriodItem } from "./periods.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola periode");
}

export type Fail = { ok: false; message: string };
export type Ok = { ok: true };

export type PeriodTypeConfig = {
  typeId: number;
  code: string;
  name: string;
  audience: string;
  targetRule: "none" | "fixed" | "region_peers";
  targetMin: number | null;
  opensAt: string | null;
  closesAt: string | null;
  responses: number;
};

export type PeriodDetail = PeriodItem & {
  instruments: number;
  responses: number;
  types: PeriodTypeConfig[];
  available: { id: number; code: string; name: string; audience: string }[];
};

const STATUSES = ["draft", "open", "closed", "archived"] as const;
export type PeriodStatus = (typeof STATUSES)[number];
export const isStatus = (v: unknown): v is PeriodStatus => STATUSES.includes(v as PeriodStatus);

export async function getPeriodDetail(db: D1Database, actor: SessionUser, slug: string): Promise<PeriodDetail | null> {
  assertAdmin(actor);
  const period = await db
    .prepare("SELECT id, slug, name, batch, kind, status, opens_at, closes_at FROM periods WHERE slug = ?")
    .bind(slug.trim())
    .first<{ id: number; slug: string; name: string; batch: string; kind: PeriodItem["kind"]; status: PeriodStatus; opens_at: string | null; closes_at: string | null }>();
  if (!period) return null;

  const [{ results: types }, { results: available }, counts] = await Promise.all([
    db
      .prepare(
        `SELECT rt.id, rt.code, rt.name, rt.audience, prt.target_rule, prt.target_min, prt.opens_at, prt.closes_at,
            (SELECT COUNT(*) FROM responses r WHERE r.period_id = prt.period_id AND r.respondent_type_id = rt.id) AS responses
         FROM period_respondent_types prt JOIN respondent_types rt ON rt.id = prt.respondent_type_id
         WHERE prt.period_id = ? ORDER BY rt.id`,
      )
      .bind(period.id)
      .all<{ id: number; code: string; name: string; audience: string; target_rule: PeriodTypeConfig["targetRule"]; target_min: number | null; opens_at: string | null; closes_at: string | null; responses: number }>(),
    db
      .prepare(
        `SELECT id, code, name, audience FROM respondent_types
         WHERE id NOT IN (SELECT respondent_type_id FROM period_respondent_types WHERE period_id = ?) ORDER BY id`,
      )
      .bind(period.id)
      .all<{ id: number; code: string; name: string; audience: string }>(),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM instruments WHERE period_id = ?1) AS instruments,
                (SELECT COUNT(*) FROM responses WHERE period_id = ?1) AS responses`,
      )
      .bind(period.id)
      .first<{ instruments: number; responses: number }>(),
  ]);

  return {
    id: period.id,
    slug: period.slug,
    name: period.name,
    batch: period.batch,
    kind: period.kind,
    status: period.status,
    opensAt: period.opens_at,
    closesAt: period.closes_at,
    instruments: counts?.instruments ?? 0,
    responses: counts?.responses ?? 0,
    types: types.map((t) => ({
      typeId: t.id,
      code: t.code,
      name: t.name,
      audience: t.audience,
      targetRule: t.target_rule,
      targetMin: t.target_min,
      opensAt: t.opens_at,
      closesAt: t.closes_at,
      responses: t.responses,
    })),
    available,
  };
}

const orderOk = (opens: string | null, closes: string | null) => !(opens && closes && opens >= closes);

// ---------- jadwal periode ----------

export async function updatePeriod(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  input: { name: string; opensAt: string | null; closesAt: string | null },
): Promise<Ok | Fail> {
  assertAdmin(actor);
  const name = input.name.trim();
  if (!name || name.length > 120) return { ok: false, message: "Nama periode wajib diisi (maksimal 120 karakter)." };
  if (!orderOk(input.opensAt, input.closesAt)) return { ok: false, message: "Waktu tutup harus setelah waktu buka." };

  const before = await db
    .prepare("SELECT name, opens_at, closes_at FROM periods WHERE id = ?")
    .bind(periodId)
    .first<{ name: string; opens_at: string | null; closes_at: string | null }>();
  if (!before) return { ok: false, message: "Periode tidak ditemukan." };

  await db
    .prepare("UPDATE periods SET name = ?, opens_at = ?, closes_at = ? WHERE id = ?")
    .bind(name, input.opensAt, input.closesAt, periodId)
    .run();
  await writeAudit(db, actor, {
    action: "periode.ubah",
    entity: "period",
    entityId: periodId,
    summary: `Jadwal & nama periode "${name}" diperbarui`,
    detail: { before, after: { name, opens_at: input.opensAt, closes_at: input.closesAt } },
  });
  return { ok: true };
}

export async function setPeriodStatus(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  status: PeriodStatus,
): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(
      `SELECT p.name, p.status,
          (SELECT COUNT(*) FROM instruments WHERE period_id = p.id) AS instruments,
          (SELECT COUNT(*) FROM period_respondent_types WHERE period_id = p.id) AS types,
          (SELECT COUNT(*) FROM responses WHERE period_id = p.id) AS responses
       FROM periods p WHERE p.id = ?`,
    )
    .bind(periodId)
    .first<{ name: string; status: PeriodStatus; instruments: number; types: number; responses: number }>();
  if (!row) return { ok: false, message: "Periode tidak ditemukan." };
  if (row.status === status) return { ok: true };

  // Periode kosong yang dibuka akan menampilkan form tanpa pertanyaan kepada responden.
  if (status === "open" && row.instruments === 0) return { ok: false, message: "Periode belum punya pertanyaan, jadi belum bisa dibuka." };
  if (status === "open" && row.types === 0) return { ok: false, message: "Tentukan dulu tipe penilai untuk periode ini." };
  // Draft menyembunyikan periode dari dashboard; jawaban yang sudah masuk akan ikut hilang dari pandangan.
  if (status === "draft" && row.responses > 0) {
    return { ok: false, message: "Periode ini sudah menerima jawaban, jadi tidak bisa dikembalikan ke draft. Tutup saja." };
  }

  await db.prepare("UPDATE periods SET status = ? WHERE id = ?").bind(status, periodId).run();
  await writeAudit(db, actor, {
    action: "periode.status",
    entity: "period",
    entityId: periodId,
    summary: `Periode "${row.name}": ${row.status} → ${status}`,
    detail: { before: row.status, after: status, responses: row.responses },
  });
  return { ok: true };
}

// ---------- tipe penilai dalam periode ----------

export async function updateTypeConfig(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  typeId: number,
  input: { targetRule: PeriodTypeConfig["targetRule"]; targetMin: number | null; opensAt: string | null; closesAt: string | null },
): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (!orderOk(input.opensAt, input.closesAt)) return { ok: false, message: "Waktu tutup harus setelah waktu buka." };
  // Skema mewajibkan target_min ada tepat saat aturannya 'fixed'.
  const targetMin = input.targetRule === "fixed" ? input.targetMin : null;
  if (input.targetRule === "fixed" && (!targetMin || targetMin < 1 || targetMin > 1000)) {
    return { ok: false, message: "Isi target minimal responden (1–1000)." };
  }

  const before = await db
    .prepare(
      `SELECT rt.name, prt.target_rule, prt.target_min, prt.opens_at, prt.closes_at
       FROM period_respondent_types prt JOIN respondent_types rt ON rt.id = prt.respondent_type_id
       WHERE prt.period_id = ? AND prt.respondent_type_id = ?`,
    )
    .bind(periodId, typeId)
    .first<{ name: string; target_rule: string; target_min: number | null; opens_at: string | null; closes_at: string | null }>();
  if (!before) return { ok: false, message: "Tipe penilai ini tidak ada di periode tersebut." };

  await db
    .prepare(
      `UPDATE period_respondent_types SET target_rule = ?, target_min = ?, opens_at = ?, closes_at = ?
       WHERE period_id = ? AND respondent_type_id = ?`,
    )
    .bind(input.targetRule, targetMin, input.opensAt, input.closesAt, periodId, typeId)
    .run();
  await writeAudit(db, actor, {
    action: "tipe.jadwal",
    entity: "period_respondent_type",
    entityId: typeId,
    summary: `${before.name}: jadwal & target diperbarui`,
    detail: { periodId, before, after: { ...input, target_min: targetMin } },
  });
  return { ok: true };
}

export async function addTypeToPeriod(db: D1Database, actor: SessionUser, periodId: number, typeId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const type = await db.prepare("SELECT name FROM respondent_types WHERE id = ?").bind(typeId).first<{ name: string }>();
  if (!type) return { ok: false, message: "Tipe penilai tidak dikenal." };
  const exists = await db
    .prepare("SELECT 1 AS ada FROM period_respondent_types WHERE period_id = ? AND respondent_type_id = ?")
    .bind(periodId, typeId)
    .first<{ ada: number }>();
  if (exists) return { ok: false, message: "Tipe penilai itu sudah ada di periode ini." };

  await db
    .prepare("INSERT INTO period_respondent_types (period_id, respondent_type_id, target_rule) VALUES (?, ?, 'none')")
    .bind(periodId, typeId)
    .run();
  await writeAudit(db, actor, {
    action: "tipe.tambah",
    entity: "period_respondent_type",
    entityId: typeId,
    summary: `Tipe penilai "${type.name}" ditambahkan ke periode`,
    detail: { periodId },
  });
  return { ok: true };
}

export async function removeTypeFromPeriod(db: D1Database, actor: SessionUser, periodId: number, typeId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(
      `SELECT rt.name, (SELECT COUNT(*) FROM responses r WHERE r.period_id = ? AND r.respondent_type_id = rt.id) AS responses
       FROM respondent_types rt WHERE rt.id = ?`,
    )
    .bind(periodId, typeId)
    .first<{ name: string; responses: number }>();
  if (!row) return { ok: false, message: "Tipe penilai tidak dikenal." };
  // Menghapusnya akan memutus respons yang sudah masuk dari tipe itu.
  if (row.responses > 0) return { ok: false, message: `"${row.name}" sudah punya ${row.responses} jawaban, jadi tidak bisa dilepas.` };

  await db
    .prepare("DELETE FROM period_respondent_types WHERE period_id = ? AND respondent_type_id = ?")
    .bind(periodId, typeId)
    .run();
  await writeAudit(db, actor, {
    action: "tipe.hapus",
    entity: "period_respondent_type",
    entityId: typeId,
    summary: `Tipe penilai "${row.name}" dilepas dari periode`,
    detail: { periodId },
  });
  return { ok: true };
}
