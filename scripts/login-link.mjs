// Membuat tautan masuk sekali pakai dari terminal — untuk Admin pertama, atau kalau semua Admin terkunci.
//
// Pakai:  npm run login-link -- <email> [--admin "Nama Lengkap"] [--local]
// Dengan --admin, akun Admin dibuat kalau email itu belum terdaftar.
// Tautan hanya dicetak di terminal ini dan berlaku 30 menit. Jangan tempel di chat atau dokumen bersama.

import { execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const local = args.includes("--local");
const adminAt = args.indexOf("--admin");
const nameAt = adminAt >= 0 ? adminAt + 1 : -1;
const adminName = nameAt >= 0 ? args[nameAt]?.trim() : null;
const email = args.find((a, i) => !a.startsWith("--") && i !== nameAt)?.trim().toLowerCase();

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (adminAt >= 0 && !adminName)) {
  console.error('Pakai: npm run login-link -- <email> [--admin "Nama Lengkap"] [--local]');
  process.exit(1);
}

const token = randomBytes(32).toString("base64url");
const hash = createHash("sha256").update(token).digest("hex");
const now = new Date();
const expires = new Date(now.getTime() + 30 * 60_000);
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

const sql = [
  adminName
    ? `INSERT INTO users (email, name, role) SELECT ${q(email)}, ${q(adminName)}, 'admin' WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = ${q(email)});`
    : null,
  `INSERT INTO login_tokens (token_hash, user_id, created_at, expires_at)
   SELECT ${q(hash)}, id, ${q(now.toISOString())}, ${q(expires.toISOString())} FROM users WHERE email = ${q(email)} AND status = 'active';`,
].filter(Boolean).join("\n");

// Semua bagian perintah berasal dari script ini sendiri (hash hex, path tetap), bukan dari input pengguna.
const wrangler = (extra) =>
  execSync(["npx wrangler d1 execute baktinusa-hub-db", local ? "--local" : "--remote", ...extra].join(" "), {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

mkdirSync(".seed", { recursive: true });
writeFileSync(".seed/login-link.sql", sql + "\n");
try {
  wrangler(["--file", ".seed/login-link.sql", "--yes"]);
  const out = wrangler(["--json", "--command", `"SELECT COUNT(*) AS n FROM login_tokens WHERE token_hash = '${hash}'"`]);
  const created = JSON.parse(out)[0].results[0].n === 1;
  if (!created) {
    console.error(`Email ${email} tidak terdaftar atau akunnya nonaktif. Tambahkan --admin "Nama" untuk membuat akun Admin baru.`);
    process.exit(1);
  }
} finally {
  rmSync(".seed/login-link.sql", { force: true });
}

const origin = local ? "http://localhost:5173" : "https://baktinusa-hub.te4ch.workers.dev";
console.log(`\nTautan masuk untuk ${email} (sekali pakai, berlaku sampai ${expires.toLocaleTimeString("id-ID", { timeZone: "Asia/Jakarta" })} WIB):\n`);
console.log(`${origin}/masuk/verifikasi?t=${token}\n`);
