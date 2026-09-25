// Satu tempat setup orang: akun (users) dan data awardee (awardees) dikelola berdampingan.
//
// Dua tabel itu sengaja tidak digabung — `responses` menunjuk ke awardee, sementara sesi dan izin
// menunjuk ke akun, dan ada 55 awardee yang memang belum punya akun. Yang disatukan hanya tampilannya:
// modul ini yang menjahit keduanya supaya halaman Pengguna cukup satu daftar dan satu form.

import { writeAudit } from "./audit.ts";
import { checkLoginId, checkPassword, hashPassword, normalizeLoginId } from "./password.ts";
import { ScopeError, type Role, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola pengguna");
}

export type Fail = { ok: false; message: string };
export type Ok = { ok: true };

export type Person = {
  userId: number | null;
  awardeeId: number | null;
  name: string;
  email: string | null;
  loginId: string | null;
  role: Role | null; // null = data awardee yang belum punya akun
  status: "active" | "disabled" | null;
  regionId: number | null;
  region: string | null;
  batch: string | null;
  campus: string | null;
  referralCode: string | null;
  lastLoginAt: string | null;
  responses: number;
  submitted: number; // penilaian yang ia kirim sebagai pengisi
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CODE_PATTERN = /^[A-Z0-9]{6,12}$/;

// Satu daftar berisi semua orang: akun dari `users`, ditambah awardee yang belum punya akun.
export async function listPeople(db: D1Database, actor: SessionUser): Promise<Person[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT * FROM (
         SELECT u.id AS user_id, a.id AS awardee_id, COALESCE(u.name, a.name) AS name, u.email, u.login_id, u.role,
          u.status, u.last_login_at, a.batch, a.campus, a.referral_code,
          COALESCE(u.region_id, a.region_id) AS region_id,
          COALESCE(gu.name, ga.name) AS region,
          (SELECT COUNT(*) FROM responses r WHERE a.id IS NOT NULL AND r.awardee_id = a.id) AS responses,
          (SELECT COUNT(*) FROM responses r WHERE u.id IS NOT NULL AND r.submitted_by = u.id) AS submitted
       FROM users u
       LEFT JOIN awardees a ON a.id = u.awardee_id
       LEFT JOIN regions gu ON gu.id = u.region_id
       LEFT JOIN regions ga ON ga.id = a.region_id

       UNION ALL

       SELECT NULL, a.id, a.name, NULL, NULL, NULL, NULL, NULL, a.batch, a.campus, a.referral_code,
          a.region_id, g.name,
          (SELECT COUNT(*) FROM responses r WHERE r.awardee_id = a.id), 0
       FROM awardees a JOIN regions g ON g.id = a.region_id
       WHERE NOT EXISTS (SELECT 1 FROM users u2 WHERE u2.awardee_id = a.id)

       )
       ORDER BY role IS NULL, CASE role WHEN 'admin' THEN 0 WHEN 'manwil' THEN 1 ELSE 2 END, region, name`,
    )
    .all<{
      user_id: number | null;
      awardee_id: number | null;
      name: string;
      email: string | null;
      login_id: string | null;
      role: Role | null;
      status: "active" | "disabled" | null;
      last_login_at: string | null;
      batch: string | null;
      campus: string | null;
      referral_code: string | null;
      region_id: number | null;
      region: string | null;
      responses: number;
      submitted: number;
    }>();

  return results.map((r) => ({
    userId: r.user_id,
    awardeeId: r.awardee_id,
    name: r.name,
    email: r.email,
    loginId: r.login_id,
    role: r.role,
    status: r.status,
    regionId: r.region_id,
    region: r.region,
    batch: r.batch,
    campus: r.campus,
    referralCode: r.referral_code,
    lastLoginAt: r.last_login_at,
    responses: r.responses,
    submitted: r.submitted,
  }));
}

export type PersonInput = {
  role: Role;
  loginId: string;
  name: string;
  email: string;
  password: string;
  status: "active" | "disabled";
  regionId: number | null;
  awardeeId: number | null; // hubungkan ke data awardee yang sudah ada
  batch: string;            // dipakai saat membuat data awardee baru
  campus: string;
  referralCode: string;
};

function validate(input: PersonInput, { needPassword }: { needPassword: boolean }): Fail | null {
  const name = input.name.trim();
  if (!name || name.length > 120) return { ok: false, message: "Nama wajib diisi (maksimal 120 karakter)." };

  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email) || email.length > 200) return { ok: false, message: "Alamat email tidak valid." };

  const badId = checkLoginId(input.loginId);
  if (badId) return badId;

  if (needPassword || input.password) {
    const badPassword = checkPassword(input.password);
    if (badPassword) return badPassword;
  }

  if (input.role === "manwil" && !input.regionId) return { ok: false, message: "Pilih wilayah yang dipegang Manwil ini." };
  if (input.role === "awardee") {
    if (!input.awardeeId) {
      if (!input.regionId) return { ok: false, message: "Pilih wilayah awardee." };
      if (!input.batch.trim()) return { ok: false, message: "Angkatan wajib diisi, misalnya BA16." };
      if (!CODE_PATTERN.test(input.referralCode.trim().toUpperCase())) {
        return { ok: false, message: "Kode referal harus 6–12 karakter, hanya huruf besar dan angka." };
      }
    }
  }
  return null;
}

const clean = (v: string) => (v.trim() ? v.trim() : null);

// Membuat orang baru. Untuk peran Awardee, data awardee ikut dibuat kalau belum ada — dua tabel,
// satu langkah bagi penggunanya.
export async function createPerson(db: D1Database, actor: SessionUser, input: PersonInput): Promise<({ userId: number } & Ok) | Fail> {
  assertAdmin(actor);
  const invalid = validate(input, { needPassword: true });
  if (invalid) return invalid;

  const email = input.email.trim().toLowerCase();
  const loginId = normalizeLoginId(input.loginId);
  const name = input.name.trim();

  const clash = await db
    .prepare("SELECT email, login_id FROM users WHERE email = ? OR login_id = ?")
    .bind(email, loginId)
    .first<{ email: string; login_id: string | null }>();
  if (clash?.email.toLowerCase() === email) return { ok: false, message: "Email ini sudah terdaftar." };
  if (clash) return { ok: false, message: `ID masuk "${loginId}" sudah dipakai akun lain.` };

  let awardeeId = input.role === "awardee" ? input.awardeeId : null;

  if (input.role === "awardee" && !awardeeId) {
    const code = input.referralCode.trim().toUpperCase();
    const taken = await db.prepare("SELECT 1 AS ada FROM awardees WHERE referral_code = ?").bind(code).first<{ ada: number }>();
    if (taken) return { ok: false, message: `Kode referal "${code}" sudah dipakai awardee lain.` };
    const region = await db.prepare("SELECT 1 AS ada FROM regions WHERE id = ?").bind(input.regionId).first<{ ada: number }>();
    if (!region) return { ok: false, message: "Wilayah tidak dikenal." };

    const row = await db
      .prepare("INSERT INTO awardees (region_id, batch, name, campus, referral_code) VALUES (?, ?, ?, ?, ?) RETURNING id")
      .bind(input.regionId, input.batch.trim().toUpperCase(), name, clean(input.campus), code)
      .first<{ id: number }>();
    awardeeId = row!.id;
  }

  if (awardeeId) {
    const used = await db.prepare("SELECT 1 AS ada FROM users WHERE awardee_id = ?").bind(awardeeId).first<{ ada: number }>();
    if (used) {
      return { ok: false, message: "Awardee ini sudah punya akun." };
    }
  }

  const user = await db
    .prepare(
      `INSERT INTO users (email, name, role, region_id, awardee_id, status, login_id, password_hash, password_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(
      email,
      name,
      input.role,
      input.role === "manwil" ? input.regionId : null,
      awardeeId,
      input.status,
      loginId,
      await hashPassword(input.password),
      new Date().toISOString(),
    )
    .first<{ id: number }>();

  await writeAudit(db, actor, {
    action: "pengguna.buat",
    entity: "user",
    entityId: user!.id,
    summary: `${input.role} "${name}" (${loginId}) dibuat`,
  });
  return { ok: true, userId: user!.id };
}

// Memperbarui orang. Kata sandi kosong berarti "biarkan yang lama"; mengganti kata sandi memutus sesi lama.
export async function updatePerson(
  db: D1Database,
  actor: SessionUser,
  userId: number,
  input: PersonInput,
): Promise<Ok | Fail> {
  assertAdmin(actor);
  const invalid = validate(input, { needPassword: false });
  if (invalid) return invalid;

  const before = await db
    .prepare("SELECT name, role, awardee_id, status FROM users WHERE id = ?")
    .bind(userId)
    .first<{ name: string; role: Role; awardee_id: number | null; status: string }>();
  if (!before) return { ok: false, message: "Akun tidak ditemukan." };
  if (before.role !== input.role) return { ok: false, message: "Peran akun tidak bisa diubah. Hapus akunnya lalu buat yang baru." };
  if (userId === actor.id && input.status === "disabled") return { ok: false, message: "Anda tidak bisa menonaktifkan akun sendiri." };

  const email = input.email.trim().toLowerCase();
  const loginId = normalizeLoginId(input.loginId);
  const name = input.name.trim();

  const clash = await db
    .prepare("SELECT email, login_id FROM users WHERE (email = ? OR login_id = ?) AND id <> ?")
    .bind(email, loginId, userId)
    .first<{ email: string; login_id: string | null }>();
  if (clash?.email.toLowerCase() === email) return { ok: false, message: "Email ini sudah dipakai akun lain." };
  if (clash) return { ok: false, message: `ID masuk "${loginId}" sudah dipakai akun lain.` };

  const statements = [
    db
      .prepare("UPDATE users SET name = ?, email = ?, login_id = ?, status = ?, region_id = ? WHERE id = ?")
      .bind(name, email, loginId, input.status, input.role === "manwil" ? input.regionId : null, userId),
  ];

  // Nama, wilayah, dan kampus awardee ikut diperbarui supaya kartu di form publik tidak ketinggalan.
  if (before.awardee_id) {
    const code = input.referralCode.trim().toUpperCase();
    if (code && !CODE_PATTERN.test(code)) return { ok: false, message: "Kode referal harus 6–12 karakter, hanya huruf besar dan angka." };
    if (code) {
      const taken = await db
        .prepare("SELECT 1 AS ada FROM awardees WHERE referral_code = ? AND id <> ?")
        .bind(code, before.awardee_id)
        .first<{ ada: number }>();
      if (taken) return { ok: false, message: `Kode referal "${code}" sudah dipakai awardee lain.` };
    }
    statements.push(
      db
        .prepare(
          `UPDATE awardees SET name = ?, campus = ?, region_id = COALESCE(?, region_id), batch = COALESCE(?, batch),
              referral_code = COALESCE(?, referral_code) WHERE id = ?`,
        )
        .bind(name, clean(input.campus), input.regionId, clean(input.batch)?.toUpperCase() ?? null, code || null, before.awardee_id),
    );
  }

  if (input.password) {
    statements.push(
      db
        .prepare("UPDATE users SET password_hash = ?, password_updated_at = ? WHERE id = ?")
        .bind(await hashPassword(input.password), new Date().toISOString(), userId),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    );
  }
  // Akun yang dimatikan tidak boleh tetap punya sesi berjalan.
  if (input.status === "disabled" && before.status === "active") {
    statements.push(db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId));
  }

  await db.batch(statements);
  await writeAudit(db, actor, {
    action: "pengguna.ubah",
    entity: "user",
    entityId: userId,
    summary: `Data "${name}" (${loginId}) diperbarui${input.password ? ", kata sandi diganti" : ""}`,
  });
  return { ok: true };
}

// Menghapus akun. Data awardee-nya sengaja ditinggalkan: penilaian yang masuk untuk orang itu tetap utuh.
export async function deleteAccount(db: D1Database, actor: SessionUser, userId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (userId === actor.id) return { ok: false, message: "Anda tidak bisa menghapus akun sendiri." };

  const row = await db
    .prepare(
      `SELECT name, login_id, (SELECT COUNT(*) FROM responses r WHERE r.submitted_by = users.id) AS submitted
       FROM users WHERE id = ?`,
    )
    .bind(userId)
    .first<{ name: string; login_id: string | null; submitted: number }>();
  if (!row) return { ok: false, message: "Akun tidak ditemukan." };
  if (row.submitted > 0) {
    return { ok: false, message: `Akun ini sudah mengirim ${row.submitted} penilaian, jadi tidak bisa dihapus. Nonaktifkan saja.` };
  }

  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM login_tokens WHERE user_id = ?").bind(userId),
    db.prepare("DELETE FROM users WHERE id = ?").bind(userId),
  ]);
  await writeAudit(db, actor, {
    action: "pengguna.hapus",
    entity: "user",
    entityId: userId,
    summary: `Akun "${row.name}" (${row.login_id ?? "tanpa ID"}) dihapus`,
  });
  return { ok: true };
}

// ---------- data awardee yang belum punya akun ----------

// Sengaja tidak memakai updateAwardee() dari admin-awardees: fungsi itu menulis semua kolom, termasuk
// kunci foto R2 dan data Leadpro, sehingga mengubah nama dari halaman ini akan ikut menghapusnya.
export async function updateAwardeeData(
  db: D1Database,
  actor: SessionUser,
  awardeeId: number,
  input: { name: string; regionId: number | null; batch: string; campus: string; referralCode: string },
): Promise<Ok | Fail> {
  assertAdmin(actor);
  const name = input.name.trim();
  const batch = input.batch.trim().toUpperCase();
  const code = input.referralCode.trim().toUpperCase();
  if (!name || name.length > 120) return { ok: false, message: "Nama wajib diisi (maksimal 120 karakter)." };
  if (!batch) return { ok: false, message: "Angkatan wajib diisi, misalnya BA16." };
  if (!CODE_PATTERN.test(code)) return { ok: false, message: "Kode referal harus 6–12 karakter, hanya huruf besar dan angka." };
  if (!input.regionId) return { ok: false, message: "Pilih wilayah." };

  const before = await db
    .prepare("SELECT batch, (SELECT COUNT(*) FROM responses r WHERE r.awardee_id = awardees.id) AS responses FROM awardees WHERE id = ?")
    .bind(awardeeId)
    .first<{ batch: string; responses: number }>();
  if (!before) return { ok: false, message: "Data awardee tidak ditemukan." };
  // Angkatan menentukan periode mana yang berlaku baginya; memindahkannya akan menggantungkan jawaban yang sudah masuk.
  if (before.responses > 0 && batch !== before.batch) {
    return { ok: false, message: `Awardee ini sudah punya ${before.responses} penilaian, jadi angkatannya tidak bisa dipindah.` };
  }

  const taken = await db
    .prepare("SELECT 1 AS ada FROM awardees WHERE referral_code = ? AND id <> ?")
    .bind(code, awardeeId)
    .first<{ ada: number }>();
  if (taken) return { ok: false, message: `Kode referal "${code}" sudah dipakai awardee lain.` };

  await db
    .prepare("UPDATE awardees SET name = ?, region_id = ?, batch = ?, campus = ?, referral_code = ? WHERE id = ?")
    .bind(name, input.regionId, batch, clean(input.campus), code, awardeeId)
    .run();
  await writeAudit(db, actor, {
    action: "awardee.ubah",
    entity: "awardee",
    entityId: awardeeId,
    summary: `Data awardee "${name}" (${code}) diperbarui`,
  });
  return { ok: true };
}
