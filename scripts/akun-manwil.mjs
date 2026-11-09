// Satu akun Manwil untuk tiap wilayah di D1 LOKAL (aturan program: satu Manwil memegang satu wilayah).
//
// Pakai:  npm run akun-manwil
//
// Aman dijalankan ulang: akun MW15xxx dihapus dulu lalu dibuat lagi. Wilayah yang sudah punya Manwil
// lain (bukan MW15xxx) dilewati, supaya aturan satu wilayah satu Manwil tidak dilanggar. Seperti
// akun-dummy, script ini tidak punya mode --remote dan kata sandinya pendek, hanya untuk mencoba.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hashPassword } from "../lib/data/password.ts";

if (process.argv.includes("--remote")) {
  console.error("Akun Manwil dummy hanya untuk D1 lokal. Tidak ada mode --remote.");
  process.exit(1);
}

const PASSWORD = "BA@2026!";
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;

const d1 = (sql) => {
  const out = execSync(`npx wrangler d1 execute baktinusa-hub-db --local --json --command "${sql.replaceAll('"', '\\"')}"`, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

const regions = d1(
  "SELECT r.id, r.name FROM regions r WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.role = 'manwil' AND u.region_id = r.id AND u.login_id NOT LIKE 'MW15%') ORDER BY r.name",
);
if (regions.length === 0) {
  console.error("Tidak ada wilayah yang perlu akun Manwil. Jalankan seed dulu atau cek daftar Wilayah.");
  process.exit(1);
}

const now = new Date().toISOString();
const akun = regions.map((r, i) => {
  const kode = `MW15${String(i + 1).padStart(3, "0")}`;
  return { loginId: kode, email: `${kode.toLowerCase()}@contoh.id`, name: `Manwil ${r.name}`, regionId: r.id, region: r.name };
});

const statements = ["DELETE FROM users WHERE login_id LIKE 'MW15%';"];
for (const a of akun) {
  const hash = await hashPassword(PASSWORD);
  statements.push(
    `INSERT INTO users (email, name, role, region_id, awardee_id, status, login_id, password_hash, password_updated_at)
     VALUES (${q(a.email)}, ${q(a.name)}, 'manwil', ${a.regionId}, NULL, 'active', ${q(a.loginId)}, ${q(hash)}, ${q(now)});`,
  );
}

mkdirSync(".seed", { recursive: true });
writeFileSync(".seed/akun-manwil.sql", `${statements.join("\n\n")}\n`);
execSync("npx wrangler d1 execute baktinusa-hub-db --local --file .seed/akun-manwil.sql --yes", { stdio: "inherit" });

console.log("\nAkun Manwil (D1 lokal saja):");
for (const a of akun) console.log(`  ${a.loginId.padEnd(8)} ${PASSWORD}   ${a.region}`);
console.log("\nJangan pakai kata sandi ini di production.");
