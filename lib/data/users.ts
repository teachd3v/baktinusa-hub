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
  region: string | null;
  awardee: string | null;
  lastLoginAt: string | null;
};

export async function listUsers(db: D1Database, actor: SessionUser): Promise<UserListItem[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.status, u.last_login_at,
              COALESCE(r.name, ar.name) AS region, a.name AS awardee
       FROM users u
       LEFT JOIN regions r ON r.id = u.region_id
       LEFT JOIN awardees a ON a.id = u.awardee_id
       LEFT JOIN regions ar ON ar.id = a.region_id
       ORDER BY CASE u.role WHEN 'admin' THEN 0 WHEN 'manwil' THEN 1 ELSE 2 END, region, u.name`,
    )
    .all<{ id: number; name: string; email: string; role: Role; status: "active" | "disabled"; last_login_at: string | null; region: string | null; awardee: string | null }>();
  return results.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role,
    status: r.status,
    region: r.region,
    awardee: r.awardee,
    lastLoginAt: r.last_login_at,
  }));
}

export type NewUser = { email: string; name: string; role: Role; regionId?: number | null; awardeeId?: number | null };

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

  const clash = await db
    .prepare("SELECT email, awardee_id FROM users WHERE email = ? OR (? IS NOT NULL AND awardee_id = ?)")
    .bind(email, awardeeId, awardeeId)
    .first<{ email: string; awardee_id: number | null }>();
  if (clash?.email.toLowerCase() === email) return { ok: false, message: "Email ini sudah terdaftar." };
  if (clash) return { ok: false, message: "Awardee ini sudah punya akun." };

  const row = await db
    .prepare("INSERT INTO users (email, name, role, region_id, awardee_id) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(email, name, input.role, regionId, awardeeId)
    .first<{ id: number }>();
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
}

export async function getUserForAdmin(db: D1Database, actor: SessionUser, userId: number) {
  assertAdmin(actor);
  return db
    .prepare("SELECT id, name, email, role, status FROM users WHERE id = ?")
    .bind(userId)
    .first<{ id: number; name: string; email: string; role: Role; status: string }>();
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
