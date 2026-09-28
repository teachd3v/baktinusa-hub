// Kampus: daftar pilihan milik wilayah, dipakai dropdown "Kampus" di form Pengguna.
//
// Seperti wilayah, daftarnya boleh dibaca siapa pun yang sudah masuk — kampus bukan data pribadi.
// Yang dijaga hanya perubahannya, itu khusus Admin.
//
// Satu aturan yang dipegang di mana-mana: kampus milik wilayah X hanya boleh dipakai awardee wilayah X.
// Itu yang membuat dropdown-nya bisa disaring, dan yang membuat menghapus wilayah kosong aman.

import { writeAudit } from "./audit.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola kampus");
}

export type Fail = { ok: false; message: string };
export type Ok = { ok: true };

export type CampusRow = {
  id: number;
  regionId: number;
  name: string;
  awardees: number;
};

export type CampusOption = { id: number; regionId: number; name: string };

// Untuk halaman Wilayah: tiap baris wilayah menampilkan kampus miliknya sendiri.
export async function listCampusesForAdmin(db: D1Database, actor: SessionUser): Promise<CampusRow[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT c.id, c.region_id AS regionId, c.name,
          (SELECT COUNT(*) FROM awardees a WHERE a.campus_id = c.id) AS awardees
       FROM campuses c ORDER BY c.name`,
    )
    .all<CampusRow>();
  return results;
}

// Untuk dropdown di form Pengguna. regionId ikut dikirim supaya penyaringannya terjadi di browser,
// tanpa perlu bolak-balik ke server tiap kali wilayahnya diganti.
export async function listCampusOptions(db: D1Database): Promise<CampusOption[]> {
  const { results } = await db
    .prepare("SELECT id, region_id AS regionId, name FROM campuses ORDER BY name")
    .all<CampusOption>();
  return results;
}

function checkName(name: string): Fail | null {
  const clean = name.trim();
  if (!clean || clean.length > 120) return { ok: false, message: "Nama kampus wajib diisi (maksimal 120 karakter)." };
  return null;
}

async function nameTaken(db: D1Database, regionId: number, name: string, exceptId?: number): Promise<boolean> {
  const row = await db
    .prepare("SELECT 1 AS ada FROM campuses WHERE region_id = ? AND lower(name) = lower(?) AND id <> ?")
    .bind(regionId, name.trim(), exceptId ?? -1)
    .first<{ ada: number }>();
  return Boolean(row);
}

export async function createCampus(
  db: D1Database,
  actor: SessionUser,
  regionId: number,
  name: string,
): Promise<({ id: number } & Ok) | Fail> {
  assertAdmin(actor);
  const invalid = checkName(name);
  if (invalid) return invalid;

  const region = await db.prepare("SELECT name FROM regions WHERE id = ?").bind(regionId).first<{ name: string }>();
  if (!region) return { ok: false, message: "Wilayah tidak ditemukan." };
  if (await nameTaken(db, regionId, name)) {
    return { ok: false, message: `"${name.trim()}" sudah ada di wilayah ${region.name}.` };
  }

  const row = await db
    .prepare("INSERT INTO campuses (region_id, name) VALUES (?, ?) RETURNING id")
    .bind(regionId, name.trim())
    .first<{ id: number }>();
  await writeAudit(db, actor, {
    action: "kampus.buat",
    entity: "campus",
    entityId: row!.id,
    summary: `Kampus "${name.trim()}" ditambahkan di wilayah ${region.name}`,
  });
  return { ok: true, id: row!.id };
}

// Aman kapan saja: awardee menunjuk ke id, bukan ke namanya. Ini justru gunanya tabel ini —
// merapikan ejaan satu kali, bukan 55 kali.
export async function renameCampus(db: D1Database, actor: SessionUser, campusId: number, name: string): Promise<Ok | Fail> {
  assertAdmin(actor);
  const invalid = checkName(name);
  if (invalid) return invalid;

  const before = await db
    .prepare("SELECT c.name, c.region_id AS regionId FROM campuses c WHERE c.id = ?")
    .bind(campusId)
    .first<{ name: string; regionId: number }>();
  if (!before) return { ok: false, message: "Kampus tidak ditemukan." };
  if (before.name === name.trim()) return { ok: true };
  if (await nameTaken(db, before.regionId, name, campusId)) {
    return { ok: false, message: `"${name.trim()}" sudah ada di wilayah ini.` };
  }

  await db.prepare("UPDATE campuses SET name = ? WHERE id = ?").bind(name.trim(), campusId).run();
  await writeAudit(db, actor, {
    action: "kampus.ubah",
    entity: "campus",
    entityId: campusId,
    summary: `Kampus "${before.name}" diganti nama jadi "${name.trim()}"`,
  });
  return { ok: true };
}

export async function deleteCampus(db: D1Database, actor: SessionUser, campusId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(
      `SELECT c.name, (SELECT COUNT(*) FROM awardees a WHERE a.campus_id = c.id) AS awardees
       FROM campuses c WHERE c.id = ?`,
    )
    .bind(campusId)
    .first<{ name: string; awardees: number }>();
  if (!row) return { ok: false, message: "Kampus tidak ditemukan." };
  if (row.awardees > 0) {
    return {
      ok: false,
      message: `"${row.name}" masih dipakai ${row.awardees} awardee. Pindahkan kampus mereka dulu lewat menu Pengguna.`,
    };
  }

  await db.prepare("DELETE FROM campuses WHERE id = ?").bind(campusId).run();
  await writeAudit(db, actor, {
    action: "kampus.hapus",
    entity: "campus",
    entityId: campusId,
    summary: `Kampus "${row.name}" dihapus`,
  });
  return { ok: true };
}

// Dipakai lapisan yang menyimpan awardee: memastikan kampus pilihan benar-benar milik wilayahnya,
// supaya dropdown yang disaring tidak bisa ditembus lewat kiriman form yang dikarang.
export async function campusBelongsTo(db: D1Database, campusId: number, regionId: number | null): Promise<Fail | null> {
  const row = await db
    .prepare("SELECT c.name, c.region_id AS regionId, g.name AS region FROM campuses c JOIN regions g ON g.id = c.region_id WHERE c.id = ?")
    .bind(campusId)
    .first<{ name: string; regionId: number; region: string }>();
  if (!row) return { ok: false, message: "Kampus tidak ditemukan." };
  if (regionId !== null && row.regionId !== regionId) {
    return { ok: false, message: `Kampus "${row.name}" milik wilayah ${row.region}, bukan wilayah yang dipilih.` };
  }
  return null;
}
