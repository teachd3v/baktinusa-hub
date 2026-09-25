// Kelola data awardee dari konsol: menambah angkatan baru, memperbaiki data, dan mengganti kode referal.

import { writeAudit } from "./audit.ts";
import type { Fail, Ok } from "./admin-periods.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola data awardee");
}

export type AwardeeAdminRow = {
  id: number;
  name: string;
  batch: string;
  campus: string | null;
  referralCode: string;
  regionId: number;
  region: string;
  photoKey: string | null;
  leadproName: string | null;
  hasAccount: boolean;
  responses: number;
};

export type AwardeeInput = {
  name: string;
  batch: string;
  regionId: number;
  campus: string | null;
  referralCode: string;
  photoKey: string | null;
  leadproName: string | null;
  leadproField: string | null;
  leadproDescription: string | null;
};

// Kode referal jadi bagian URL yang dibagikan ke publik: huruf besar, angka, tanpa spasi.
const CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

export async function listAwardeesForAdmin(db: D1Database, actor: SessionUser, batch?: string): Promise<AwardeeAdminRow[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT a.id, a.name, a.batch, a.campus, a.referral_code, a.region_id, a.photo_key, a.leadpro_name, g.name AS region,
          (SELECT COUNT(*) FROM users u WHERE u.awardee_id = a.id) AS accounts,
          (SELECT COUNT(*) FROM responses r WHERE r.awardee_id = a.id) AS responses
       FROM awardees a JOIN regions g ON g.id = a.region_id
       ${batch ? "WHERE a.batch = ?" : ""}
       ORDER BY a.batch DESC, g.name, a.name`,
    )
    .bind(...(batch ? [batch] : []))
    .all<{ id: number; name: string; batch: string; campus: string | null; referral_code: string; region_id: number; photo_key: string | null; leadpro_name: string | null; region: string; accounts: number; responses: number }>();

  return results.map((r) => ({
    id: r.id,
    name: r.name,
    batch: r.batch,
    campus: r.campus,
    referralCode: r.referral_code,
    regionId: r.region_id,
    region: r.region,
    photoKey: r.photo_key,
    leadproName: r.leadpro_name,
    hasAccount: r.accounts > 0,
    responses: r.responses,
  }));
}

export async function getAwardeeForAdmin(db: D1Database, actor: SessionUser, id: number): Promise<AwardeeAdminRow | null> {
  assertAdmin(actor);
  const rows = await listAwardeesForAdmin(db, actor);
  return rows.find((r) => r.id === id) ?? null;
}

function validate(input: AwardeeInput): Fail | null {
  if (!input.name.trim() || input.name.length > 120) return { ok: false, message: "Nama awardee wajib diisi (maksimal 120 karakter)." };
  if (!input.batch.trim() || input.batch.length > 20) return { ok: false, message: "Angkatan wajib diisi, misalnya BA16." };
  if (!Number.isInteger(input.regionId) || input.regionId < 1) return { ok: false, message: "Pilih wilayah." };
  if (!CODE_PATTERN.test(input.referralCode.trim().toUpperCase())) {
    return { ok: false, message: "Kode referal harus 6–12 karakter, hanya huruf besar dan angka." };
  }
  return null;
}

const clean = (v: string | null) => (v?.trim() ? v.trim() : null);

export async function createAwardee(db: D1Database, actor: SessionUser, input: AwardeeInput): Promise<({ id: number } & Ok) | Fail> {
  assertAdmin(actor);
  const invalid = validate(input);
  if (invalid) return invalid;
  const code = input.referralCode.trim().toUpperCase();

  const taken = await db.prepare("SELECT 1 AS ada FROM awardees WHERE referral_code = ?").bind(code).first<{ ada: number }>();
  if (taken) return { ok: false, message: `Kode referal "${code}" sudah dipakai awardee lain.` };
  const region = await db.prepare("SELECT name FROM regions WHERE id = ?").bind(input.regionId).first<{ name: string }>();
  if (!region) return { ok: false, message: "Wilayah tidak dikenal." };

  const row = await db
    .prepare(
      `INSERT INTO awardees (region_id, batch, name, campus, referral_code, photo_key, leadpro_name, leadpro_field, leadpro_description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      input.regionId,
      input.batch.trim().toUpperCase(),
      input.name.trim(),
      clean(input.campus),
      code,
      clean(input.photoKey),
      clean(input.leadproName),
      clean(input.leadproField),
      clean(input.leadproDescription),
    )
    .first<{ id: number }>();

  await writeAudit(db, actor, {
    action: "awardee.tambah",
    entity: "awardee",
    entityId: row!.id,
    summary: `Awardee "${input.name.trim()}" (${input.batch.trim().toUpperCase()}, ${region.name}) ditambahkan`,
  });
  return { ok: true, id: row!.id };
}

export async function updateAwardee(db: D1Database, actor: SessionUser, id: number, input: AwardeeInput): Promise<Ok | Fail> {
  assertAdmin(actor);
  const invalid = validate(input);
  if (invalid) return invalid;
  const code = input.referralCode.trim().toUpperCase();

  const before = await db
    .prepare("SELECT name, batch, referral_code, region_id, (SELECT COUNT(*) FROM responses r WHERE r.awardee_id = awardees.id) AS responses FROM awardees WHERE id = ?")
    .bind(id)
    .first<{ name: string; batch: string; referral_code: string; region_id: number; responses: number }>();
  if (!before) return { ok: false, message: "Awardee tidak ditemukan." };

  if (code !== before.referral_code) {
    const taken = await db.prepare("SELECT 1 AS ada FROM awardees WHERE referral_code = ? AND id <> ?").bind(code, id).first<{ ada: number }>();
    if (taken) return { ok: false, message: `Kode referal "${code}" sudah dipakai awardee lain.` };
  }
  // Mengganti angkatan memindahkan awardee ke kuesioner periode lain — jawaban yang sudah masuk jadi menggantung.
  if (before.responses > 0 && input.batch.trim().toUpperCase() !== before.batch) {
    return { ok: false, message: `Awardee ini sudah punya ${before.responses} jawaban, jadi angkatannya tidak bisa dipindah.` };
  }

  await db
    .prepare(
      `UPDATE awardees SET region_id = ?, batch = ?, name = ?, campus = ?, referral_code = ?, photo_key = ?,
          leadpro_name = ?, leadpro_field = ?, leadpro_description = ? WHERE id = ?`,
    )
    .bind(
      input.regionId,
      input.batch.trim().toUpperCase(),
      input.name.trim(),
      clean(input.campus),
      code,
      clean(input.photoKey),
      clean(input.leadproName),
      clean(input.leadproField),
      clean(input.leadproDescription),
      id,
    )
    .run();

  await writeAudit(db, actor, {
    action: "awardee.ubah",
    entity: "awardee",
    entityId: id,
    summary: `Data awardee "${input.name.trim()}" diperbarui`,
    detail: { before: { name: before.name, referral_code: before.referral_code }, after: { name: input.name.trim(), referral_code: code } },
  });
  return { ok: true };
}

// Tidak ada penghapusan awardee yang sudah punya jawaban atau akun: data penilaian tidak boleh menggantung.
export async function deleteAwardee(db: D1Database, actor: SessionUser, id: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(
      `SELECT name,
          (SELECT COUNT(*) FROM responses r WHERE r.awardee_id = awardees.id) AS responses,
          (SELECT COUNT(*) FROM users u WHERE u.awardee_id = awardees.id) AS accounts
       FROM awardees WHERE id = ?`,
    )
    .bind(id)
    .first<{ name: string; responses: number; accounts: number }>();
  if (!row) return { ok: false, message: "Awardee tidak ditemukan." };
  if (row.responses > 0) return { ok: false, message: `"${row.name}" sudah punya ${row.responses} jawaban, jadi tidak bisa dihapus.` };
  if (row.accounts > 0) return { ok: false, message: `"${row.name}" masih terhubung ke akun. Nonaktifkan akunnya dulu.` };

  await db.prepare("DELETE FROM awardees WHERE id = ?").bind(id).run();
  await writeAudit(db, actor, { action: "awardee.hapus", entity: "awardee", entityId: id, summary: `Awardee "${row.name}" dihapus` });
  return { ok: true };
}

// Kode referal acak yang belum terpakai — panjang 8, tanpa huruf/angka yang mudah tertukar saat didikte.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function suggestReferralCode(db: D1Database, actor: SessionUser): Promise<string> {
  assertAdmin(actor);
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    const code = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
    const taken = await db.prepare("SELECT 1 AS ada FROM awardees WHERE referral_code = ?").bind(code).first<{ ada: number }>();
    if (!taken) return code;
  }
  throw new Error("Tidak menemukan kode referal yang belum terpakai");
}
