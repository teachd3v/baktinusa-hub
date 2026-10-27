// Mengosongkan D1 sampai ke skema, lalu menyisakan SATU akun Admin.
//
// Pakai:  node scripts/reset-total.mjs [--remote] [--id ADM001] [--email admin@contoh.id]
//
// Yang TIDAK dihapus:
//   d1_migrations — catatan migrasi. Menghapusnya membuat wrangler menjalankan ulang semuanya.
//
// Semua sisanya hilang: akun, sesi, awardee, wilayah, kampus, jenis pengukuran, soal, siklus, jawaban,
// skor, jejak. Setelah reset, isi lagi dengan `npm run seed:ba15` atau lewat konsol Admin — tidak ada
// data master yang dibuat migrasi, termasuk jenis pengukuran.
//
// Kata sandinya tidak pernah lewat argumen (argumen terbaca di daftar proses) dan tidak pernah
// dicetak untuk --remote. Isi lewat env: set SUPERADMIN_PASSWORD=... lalu jalankan.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hashPassword, checkLoginId, checkPassword, normalizeLoginId } from "../lib/data/password.ts";

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const REMOTE = argv.includes("--remote");
const LOGIN_ID = normalizeLoginId(flag("id", "ADM001"));
const EMAIL = flag("email", "admin@baktinusa.id");
const NAME = flag("nama", "Super Admin");

// Lokal boleh memakai kata sandi contoh yang sama dengan akun dummy; production tidak pernah.
const PASSWORD = process.env.SUPERADMIN_PASSWORD ?? (REMOTE ? null : "BA2026");
if (!PASSWORD) {
  console.error("SUPERADMIN_PASSWORD belum diisi. Untuk --remote kata sandinya wajib datang dari env,");
  console.error("supaya tidak ikut tercatat di riwayat perintah.\n");
  console.error("  cmd :  set SUPERADMIN_PASSWORD=...  &&  node scripts/reset-total.mjs --remote");
  console.error("  bash:  SUPERADMIN_PASSWORD=... node scripts/reset-total.mjs --remote");
  process.exit(1);
}

for (const [label, problem] of [["ID", checkLoginId(LOGIN_ID)], ["Kata sandi", checkPassword(PASSWORD)]]) {
  if (problem) {
    console.error(`${label} ditolak: ${problem}`);
    process.exit(1);
  }
}

const where = REMOTE ? "--remote" : "--local";
const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);

const d1 = (sql) => {
  const out = execSync(
    `npx wrangler d1 execute baktinusa-hub-db ${where} --json --command "${sql.replaceAll('"', '\\"')}"`,
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

// Urutan anak → induk. Tabel yang belum ada di basis data ini dilewati, jadi script yang sama
// tetap jalan di production yang migrasinya belum selengkap lokal.
const ORDER = [
  "response_feedback",
  "response_scores",
  "responses",
  "period_measurements",
  "period_respondent_types", // nama lama, dibuang migrasi 0008 — dilewati sendiri kalau tidak ada
  "periods",
  "instruments",
  "instrument_categories", // dibuang migrasi 0009
  "measurements",
  "sessions",
  "login_tokens",
  "audit_log",
  "users",
  "awardees",
  // campuses lahir di migrasi 0007 dan sempat tidak ada di daftar ini, sehingga DELETE FROM regions
  // selalu kandas: awardees sudah hilang, tapi campuses masih memegang region_id.
  "campuses",
  "regions",
];

const ada = new Set(d1("SELECT name FROM sqlite_master WHERE type = 'table'").map((r) => r.name));
const dihapus = ORDER.filter((t) => ada.has(t));
const dilewati = ORDER.filter((t) => !ada.has(t));

// Akun ID+kata sandi butuh kolom dari migrasi 0005. Diperiksa DULU: kalau tidak, penghapusannya
// terlanjur jalan dan INSERT-nya gagal — basis data kosong tanpa satu pun akun untuk masuk.
const kolom = new Set(d1("PRAGMA table_info(users)").map((r) => r.name));
const kurang = ["login_id", "password_hash", "password_updated_at"].filter((c) => !kolom.has(c));
if (kurang.length) {
  console.error(`Tabel users belum punya kolom: ${kurang.join(", ")}.`);
  console.error(`Jalankan migrasinya dulu, lalu ulangi:
  npm run db:migrate:${REMOTE ? "remote" : "local"}`);
  process.exit(1);
}

const hash = await hashPassword(PASSWORD);
const now = new Date().toISOString();

const statements = [
  ...dihapus.map((t) => `DELETE FROM ${t};`),
  // Nomor id mulai dari 1 lagi, supaya basis data barunya benar-benar terlihat baru.
  ada.has("sqlite_sequence") ? `DELETE FROM sqlite_sequence;` : null,
  `INSERT INTO users (email, name, role, region_id, awardee_id, status, login_id, password_hash, password_updated_at)
   VALUES (${q(EMAIL)}, ${q(NAME)}, 'admin', NULL, NULL, 'active', ${q(LOGIN_ID)}, ${q(hash)}, ${q(now)});`,
].filter(Boolean);

mkdirSync(".seed", { recursive: true });
const file = ".seed/reset-total.sql";
writeFileSync(file, `${statements.join("\n")}\n`);

console.log(`Sasaran   : ${REMOTE ? "PRODUCTION (--remote)" : "D1 lokal"}`);
console.log(`Dikosongkan: ${dihapus.join(", ")}`);
if (dilewati.length) console.log(`Dilewati   : ${dilewati.join(", ")} (tabelnya belum ada)`);
console.log(`Disisakan  : respondent_types, d1_migrations`);
console.log(`Akun baru  : ${LOGIN_ID} · ${NAME} · ${EMAIL} · admin\n`);

execSync(`npx wrangler d1 execute baktinusa-hub-db ${where} --file ${file} --yes`, { stdio: "inherit" });

console.log("\nSelesai.");
if (!REMOTE && !process.env.SUPERADMIN_PASSWORD) console.log(`Kata sandi lokal: ${PASSWORD}`);
