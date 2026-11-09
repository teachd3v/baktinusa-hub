import { hashToken } from "./auth.ts";
import { checkPassword, hashPassword, verifyPassword } from "./password.ts";

export type ChangePasswordResult = { ok: true } | { ok: false; message: string };

// Ganti kata sandi akun sendiri. Kata sandi lama wajib benar, supaya sesi yang tertinggal di perangkat orang lain
// tidak cukup untuk merebut akun. Setelah berhasil, semua sesi lain akun ini dicabut dan hanya sesi yang sedang dipakai
// yang tersisa.
export async function changeOwnPassword(
  db: D1Database,
  userId: number,
  currentPassword: string,
  newPassword: string,
  currentToken: string | undefined,
): Promise<ChangePasswordResult> {
  const row = await db
    .prepare("SELECT password_hash FROM users WHERE id = ? AND status = 'active'")
    .bind(userId)
    .first<{ password_hash: string | null }>();
  if (!row) return { ok: false, message: "Akun tidak ditemukan." };

  if (!(await verifyPassword(currentPassword, row.password_hash))) {
    return { ok: false, message: "Kata sandi saat ini salah." };
  }
  const problem = checkPassword(newPassword);
  if (problem) return { ok: false, message: problem.message };
  if (newPassword === currentPassword) return { ok: false, message: "Kata sandi baru harus berbeda dari yang lama." };

  const now = new Date().toISOString();
  const keep = currentToken ? await hashToken(currentToken) : "";
  await db.batch([
    db
      .prepare("UPDATE users SET password_hash = ?, password_updated_at = ? WHERE id = ?")
      .bind(await hashPassword(newPassword), now, userId),
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").bind(userId, keep),
    db.prepare("DELETE FROM login_tokens WHERE user_id = ?").bind(userId),
  ]);
  return { ok: true };
}
