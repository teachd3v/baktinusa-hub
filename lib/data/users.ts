import { writeAudit } from "./audit.ts";
import { checkLoginId, checkPassword, hashPassword, normalizeLoginId } from "./password.ts";
import { ScopeError, type Role, type SessionUser } from "./scope.ts";

// Manajemen akun: hanya Admin. Setiap fungsi memeriksa pelakunya sendiri, supaya halaman yang lupa
// mengecek peran tetap tidak bisa memakainya.

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola akun");
}

export type UserListItem = {
  id: number;
  name: string;
  email: string;
  role: Role;
  status: "active" | "disabled";
  loginId: string | null;
  region: string | null;
  awardee: string | null;
  lastLoginAt: string | null;
};

export async function listUsers(db: D1Database, actor: SessionUser): Promise<UserListItem[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at, u.login_id,
              COALESCE(r.name, ar.name) AS region, a.name AS awardee
       FROM users u
       LEFT JOIN regions r ON r.id = u.region_id
       LEFT JOIN awardees a ON a.id = u.awardee_id
       LEFT JOIN regions ar ON ar.id = a.region_id
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'manwil' THEN 1 ELSE 2 END, region, u.name`,
    )
    .all<{ id: number; name: string; email: string; role: Role; status: "active" | "disabled"; last_login_at: string | null; login_id: string | null; region: string | null; awardee: string | null }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    loginId: r.login_id,
    region: r.region,
    awardee: r.awardee,
    lastLoginAt: r.last_login_at,
  }));
}

export type NewUser = { email: string; name: string; role: Role; regionId?: number | null; awardeeId?: number | null; loginId: string; password: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function createUser(db: D1Database, actor: SessionUser, input: NewUser): Promise<{ ok: true; id: number } | { ok: false; message: string }> {
  assertAdmin(actor);
  const email = input.email.trim().toLowerCase();
  const name = input.name.trim();
  if (!EMAIL_PATTERN.test(email) || email.length > 200) return { ok: false, message: "Alamat email tidak valid." };
  if (!name || name.length > 120) return { ok: false, message: "Nama wajib diisi (maksimal 120 karakter)." };

  const regionId = input.role === "manwil" ? input.regionId ?? null : null;
  const awardeeId = input.role === "awardee" ? input.awardeeId ?? null : null;
  if (input.role === "manwil" && !regionId) return { ok: false, message: "Pilih wilayah yang dipegang Manwil ini." };
  if (input.role === "awardee" && !awardeeId) return { ok: false, message: "Pilih data awardee untuk akun ini." };

  const badId = checkLoginId(input.loginId);
  if (badId) return badId;
  const badPassword = checkPassword(input.password);
  if (badPassword) return badPassword;
  const loginId = normalizeLoginId(input.loginId);

  const clash = await db
    .prepare("SELECT email, login_id, awardee_id FROM users WHERE email = ? OR login_id = ? OR (? IS NOT NULL AND awardee_id = ?)")
    .bind(email, loginId, awardeeId, awardeeId)
    .first<{ email: string; login_id: string | null; awardee_id: number | null }>();
  if (clash?.email.toLowerCase() === email) return { ok: false, message: "Email ini sudah terdaftar." };
  if (clash?.login_id === loginId) return { ok: false, message: `ID masuk "${loginId}" sudah dipakai akun lain.` };
  if (clash) return { ok: false, message: "Awardee ini sudah punya akun." };

  const row = await db
    .prepare(
      `INSERT INTO users (email, name, role, region_id, awardee_id, login_id, password_hash, password_updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
    )
    .bind(email, name, input.role, regionId, awardeeId, loginId, await hashPassword(input.password), new Date().toISOString())
    .first<{ id: number }>();
  await writeAudit(db, actor, {
    action: "akun.buat",
    entity: "user",
    entityId: row!.id,
    summary: `Akun "${name}" (${loginId}, ${input.role}) dibuat`,
  });
  return { ok: true, id: row!.id };
}

export async function setUserStatus(db: D1Database, actor: SessionUser, userId: number, status: "active" | "disabled"): Promise<void> {
  assertAdmin(actor);
  if (userId === actor.id && status === "disabled") throw new ScopeError("Admin tidak bisa menonaktifkan akunnya sendiri");
  await db.batch([
    db.prepare("UPDATE users SET status = ? WHERE id = ?").bind(status, userId),
    // Menonaktifkan akun langsung memutus semua sesinya.
    ...(status === "disabled" ? [db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId)] : []),
  ]);
  await writeAudit(db, actor, {
    action: "akun.status",
    entity: "user",
    entityId: userId,
    summary: `Akun #${userId} diubah jadi ${status === "active" ? "aktif" : "nonaktif"}`,
  });
}

// Admin mengatur ulang ID masuk dan/atau kata sandi. Kata sandi kosong berarti "biarkan yang lama".
export async function setCredentials(
  db: D1Database,
  actor: SessionUser,
  userId: number,
  input: { loginId: string; password: string },
): Promise<{ ok: true } | { ok: false; message: string }> {
  assertAdmin(actor);
  const badId = checkLoginId(input.loginId);
  if (badId) return badId;
  const loginId = normalizeLoginId(input.loginId);
  if (input.password && checkPassword(input.password)) return checkPassword(input.password)!;

  const target = await db.prepare("SELECT name, login_id FROM users WHERE id = ?").bind(userId).first<{ name: string; login_id: string | null }>();
  if (!target) return { ok: false, message: "Akun tidak ditemukan." };

  const taken = await db.prepare("SELECT 1 AS ada FROM users WHERE login_id = ? AND id <> ?").bind(loginId, userId).first<{ ada: number }>();
  if (taken) return { ok: false, message: `ID masuk "${loginId}" sudah dipakai akun lain.` };

  if (input.password) {
    // Kata sandi baru memutus semua sesi lama: kalau akunnya dibajak, mengganti sandi benar-benar mengusir.
    await db.batch([
      db
        .prepare("UPDATE users SET login_id = ?, password_hash = ?, password_updated_at = ? WHERE id = ?")
        .bind(loginId, await hashPassword(input.password), new Date().toISOString(), userId),
      db.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
    ]);
  } else {
    await db.prepare("UPDATE users SET login_id = ? WHERE id = ?").bind(loginId, userId).run();
  }

  await writeAudit(db, actor, {
    action: "akun.kredensial",
    entity: "user",
    entityId: userId,
    summary: `Akun "${target.name}": ID masuk ${loginId}${input.password ? " dan kata sandi diperbarui" : " diperbarui"}`,
  });
  return { ok: true };
}

export async function getUserForAdmin(db: D1Database, actor: SessionUser, userId: number) {
  assertAdmin(actor);
  return db
    .prepare("SELECT id, name, email, role, status, login_id FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: number; name: string; email: string; role: Role; status: string; login_id: string | null }>();
}

// Pilihan untuk form akun baru. Wilayah bukan data pribadi; daftar awardee tanpa akun tetap khusus Admin.
export async function listRegions(db: D1Database): Promise<{ id: number; name: string }[]> {
  const { results } = await db.prepare("SELECT id, name FROM regions ORDER BY name").all<{ id: number; name: string }>();
  return results;
}

export async function listAwardeesWithoutAccount(db: D1Database, actor: SessionUser): Promise<{ id: number; name: string; region: string }[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT a.id, a.name, r.name AS region FROM awardees a JOIN regions r ON r.id = a.region_id
       WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.awardee_id = a.id)
       ORDER BY r.name, a.name`,
    )
    .all<{ id: number; name: string; region: string }>();
  return results;
}
