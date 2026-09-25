import { normalizeLoginId } from "./password.ts";
import type { Role, SessionUser } from "./scope.ts";

// Token acak 32 byte (base64url). Database hanya menyimpan hash SHA-256-nya: kalau isi D1 bocor,
// sesi dan tautan masuk tetap tidak bisa dipakai.

export const SESSION_TTL_MS = 14 * 24 * 3_600_000; // 14 hari, diperpanjang saat dipakai
export const EMAIL_LINK_TTL_MS = 15 * 60_000; // tautan dari email: 15 menit
export const MANUAL_LINK_TTL_MS = 3 * 24 * 3_600_000; // tautan yang dibagikan Admin lewat WhatsApp dsb.: 3 hari
const TOUCH_INTERVAL_MS = 60 * 60_000; // perpanjangan sesi ditulis paling sering sejam sekali

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token)));
  return Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("");
}

const isoIn = (ms: number, from = Date.now()) => new Date(from + ms).toISOString();

type UserRow = {
  id: number;
  name: string;
  email: string;
  role: Role;
  region_id: number | null;
  awardee_id: number | null;
};

const toSessionUser = (row: UserRow): SessionUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role,
  regionId: row.region_id,
  awardeeId: row.awardee_id,
});

// ---------- tautan masuk ----------

export async function createLoginToken(db: D1Database, userId: number, ttlMs: number): Promise<string> {
  const token = newToken();
  const now = Date.now();
  await db
    .prepare("INSERT INTO login_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await hashToken(token), userId, new Date(now).toISOString(), isoIn(ttlMs, now))
    .run();
  return token;
}

// Untuk halaman konfirmasi: menampilkan nama tanpa memakai token.
export async function peekLoginToken(db: D1Database, token: string): Promise<{ name: string } | null> {
  if (!token) return null;
  const row = await db
    .prepare(
      `SELECT u.name FROM login_tokens t JOIN users u ON u.id = t.user_id
       WHERE t.token_hash = ? AND t.expires_at > ? AND u.status = 'active'`,
    )
    .bind(await hashToken(token), new Date().toISOString())
    .first<{ name: string }>();
  return row ?? null;
}

// Sekali pakai: DELETE ... RETURNING membuat dua klik bersamaan tidak bisa sama-sama berhasil.
export async function consumeLoginToken(db: D1Database, token: string): Promise<SessionUser | null> {
  if (!token) return null;
  const used = await db
    .prepare("DELETE FROM login_tokens WHERE token_hash = ? RETURNING user_id, expires_at")
    .bind(await hashToken(token))
    .first<{ user_id: number; expires_at: string }>();
  if (!used || Date.parse(used.expires_at) <= Date.now()) return null;
  const user = await db
    .prepare("SELECT id, name, email, role, region_id, awardee_id FROM users WHERE id = ? AND status = 'active'")
    .bind(used.user_id)
    .first<UserRow>();
  return user ? toSessionUser(user) : null;
}

// ---------- sesi ----------

export async function createSession(db: D1Database, userId: number): Promise<string> {
  const token = newToken();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  await db.batch([
    db
      .prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)")
      .bind(await hashToken(token), userId, nowIso, isoIn(SESSION_TTL_MS, now), nowIso),
    db.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(nowIso, userId),
    // Bersihkan token & sesi kedaluwarsa milik pengguna ini sekalian.
    db.prepare("DELETE FROM login_tokens WHERE user_id = ? AND expires_at <= ?").bind(userId, nowIso),
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(userId, nowIso),
  ]);
  return token;
}

export async function getSessionUser(db: D1Database, token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const row = await db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.region_id, u.awardee_id, s.expires_at, s.last_seen_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND u.status = 'active'`,
    )
    .bind(tokenHash)
    .first<UserRow & { expires_at: string; last_seen_at: string }>();
  if (!row) return null;

  const now = Date.now();
  if (Date.parse(row.expires_at) <= now) {
    await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
    return null;
  }
  if (now - Date.parse(row.last_seen_at) > TOUCH_INTERVAL_MS) {
    await db
      .prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE token_hash = ?")
      .bind(new Date(now).toISOString(), isoIn(SESSION_TTL_MS, now), tokenHash)
      .run();
  }
  return toSessionUser(row);
}

export async function deleteSession(db: D1Database, token: string | undefined): Promise<void> {
  if (!token) return;
  await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await hashToken(token)).run();
}

// ---------- masuk dengan ID & kata sandi ----------

// Satu-satunya jalur yang boleh membaca password_hash. Akun nonaktif tetap dicari lalu ditolak di
// pemanggil, supaya waktu jawabnya tidak membedakan "ID salah" dari "akun dimatikan".
export async function findUserForLogin(
  db: D1Database,
  loginId: string,
): Promise<{ user: SessionUser; passwordHash: string | null; status: string } | null> {
  const row = await db
    .prepare(
      `SELECT id, name, email, role, region_id, awardee_id, password_hash, status
       FROM users WHERE login_id = ?`,
    )
    .bind(normalizeLoginId(loginId))
    .first<UserRow & { password_hash: string | null; status: string }>();
  if (!row) return null;
  return { user: toSessionUser(row), passwordHash: row.password_hash, status: row.status };
}
