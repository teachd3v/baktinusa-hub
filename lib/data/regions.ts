// Wilayah: sumber tunggal untuk dropdown wilayah di seluruh portal.
//
// Wilayah bukan data pribadi, jadi daftarnya boleh dibaca siapa pun yang sudah masuk (dipakai form
// akun dan lingkup Manwil). Yang dijaga hanya perubahannya — itu khusus Admin.

import { writeAudit } from "./audit.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola wilayah");
}

export type Fail = { ok: false; message: string };
export type Ok = { ok: true };

export type RegionRow = {
  id: number;
  name: string;
  awardees: number;
  manwils: number;
  responses: number;
};

export async function listRegionsForAdmin(db: D1Database, actor: SessionUser): Promise<RegionRow[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT g.id, g.name,
          (SELECT COUNT(*) FROM awardees a WHERE a.region_id = g.id) AS awardees,
          (SELECT COUNT(*) FROM users u WHERE u.region_id = g.id) AS manwils,
          (SELECT COUNT(*) FROM responses r JOIN awardees a ON a.id = r.awardee_id WHERE a.region_id = g.id) AS responses
       FROM regions g ORDER BY g.name`,
    )
    .all<RegionRow>();
  return results;
}

function checkName(name: string): Fail | null {
  const clean = name.trim();
  if (!clean || clean.length > 60) return { ok: false, message: "Nama wilayah wajib diisi (maksimal 60 karakter)." };
  return null;
}

// Nama dibandingkan tanpa peduli huruf besar-kecil supaya "bogor" tidak lolos jadi wilayah kedua.
async function nameTaken(db: D1Database, name: string, exceptId?: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ada FROM regions WHERE lower(name) = lower(?) AND id <> ?")
    .bind(name.trim(), exceptId ?? -1)
    .first<{ ada: number }>();
  return Boolean(row);
}

export async function createRegion(db: D1Database, actor: SessionUser, name: string): Promise<({ id: number } & Ok) | Fail> {
  assertAdmin(actor);
  const invalid = checkName(name);
  if (invalid) return invalid;
  if (await nameTaken(db, name)) return { ok: false, message: `Wilayah "${name.trim()}" sudah ada.` };

  const row = await db.prepare("INSERT INTO regions (name) VALUES (?) RETURNING id").bind(name.trim()).first<{ id: number }>();
  await writeAudit(db, actor, {
    action: "wilayah.buat",
    entity: "region",
    entityId: row!.id,
    summary: `Wilayah "${name.trim()}" ditambahkan`,
  });
  return { ok: true, id: row!.id };
}

// Mengganti nama aman dilakukan kapan saja: awardee dan Manwil menunjuk ke id, bukan ke namanya.
export async function renameRegion(db: D1Database, actor: SessionUser, regionId: number, name: string): Promise<Ok | Fail> {
  assertAdmin(actor);
  const invalid = checkName(name);
  if (invalid) return invalid;

  const before = await db.prepare("SELECT name FROM regions WHERE id = ?").bind(regionId).first<{ name: string }>();
  if (!before) return { ok: false, message: "Wilayah tidak ditemukan." };
  if (before.name === name.trim()) return { ok: true };
  if (await nameTaken(db, name, regionId)) return { ok: false, message: `Wilayah "${name.trim()}" sudah ada.` };

  await db.prepare("UPDATE regions SET name = ? WHERE id = ?").bind(name.trim(), regionId).run();
  await writeAudit(db, actor, {
    action: "wilayah.ubah",
    entity: "region",
    entityId: regionId,
    summary: `Wilayah "${before.name}" diganti nama jadi "${name.trim()}"`,
  });
  return { ok: true };
}

// Wilayah yang masih dipegang siapa pun tidak bisa dihapus: memaksanya akan memutus lingkup data Manwil
// dan membuat awardee kehilangan wilayahnya.
export async function deleteRegion(db: D1Database, actor: SessionUser, regionId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(
      `SELECT g.name,
          (SELECT COUNT(*) FROM awardees a WHERE a.region_id = g.id) AS awardees,
          (SELECT COUNT(*) FROM users u WHERE u.region_id = g.id) AS manwils
       FROM regions g WHERE g.id = ?`,
    )
    .bind(regionId)
    .first<{ name: string; awardees: number; manwils: number }>();
  if (!row) return { ok: false, message: "Wilayah tidak ditemukan." };

  const dipakai = [
    row.awardees > 0 ? `${row.awardees} awardee` : null,
    row.manwils > 0 ? `${row.manwils} akun Manwil` : null,
  ].filter(Boolean);
  if (dipakai.length > 0) {
    return { ok: false, message: `"${row.name}" masih dipakai ${dipakai.join(" dan ")}. Pindahkan dulu, baru wilayahnya bisa dihapus.` };
  }

  await db.prepare("DELETE FROM regions WHERE id = ?").bind(regionId).run();
  await writeAudit(db, actor, {
    action: "wilayah.hapus",
    entity: "region",
    entityId: regionId,
    summary: `Wilayah "${row.name}" dihapus`,
  });
  return { ok: true };
}
