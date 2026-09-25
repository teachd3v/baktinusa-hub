// Tiga akun uji coba untuk D1 LOKAL: satu Admin, satu Awardee Bogor, satu Manwil Bogor.
//
// Pakai:  npm run akun-dummy
//
// Seperti data contoh, script ini tidak punya mode --remote. Kata sandinya sama untuk ketiganya dan
// pendek — itu memang untuk mencoba alur masuk, bukan untuk dipakai di production.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { hashPassword } from "../lib/data/password.ts";

if (process.argv.includes("--remote")) {
  console.error("Akun dummy hanya untuk D1 lokal. Tidak ada mode --remote.");
  process.exit(1);
}

const PASSWORD = "BA2026";
const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);

const d1 = (sql) => {
  const out = execSync(`npx wrangler d1 execute baktinusa-hub-db --local --json --command "${sql.replaceAll('"', '\\"')}"`, {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results;
};

const [bogor] = d1("SELECT id FROM regions WHERE name = 'Bogor'");
if (!bogor) {
  console.error("Wilayah Bogor tidak ada di D1 lokal. Jalankan seed dulu.");
  process.exit(1);
}

// Awardee dummy memakai data awardee Bogor yang belum punya akun, supaya lingkup datanya nyata.
const [awardee] = d1(
  `SELECT a.id, a.name FROM awardees a WHERE a.region_id = ${bogor.id} AND NOT EXISTS (SELECT 1 FROM users u WHERE u.awardee_id = a.id) ORDER BY a.id LIMIT 1`,
);
if (!awardee) {
  console.error("Semua awardee Bogor sudah punya akun. Hapus salah satunya dulu, atau ganti wilayahnya.");
  process.exit(1);
}

const akun = [
  { loginId: "ADM001", name: "Admin Dummy", email: "adm001@contoh.id", role: "admin", regionId: null, awardeeId: null },
  { loginId: "BA00126", name: awardee.name, email: "ba00126@contoh.id", role: "awardee", regionId: null, awardeeId: awardee.id },
  { loginId: "MW00126", name: "Manwil Bogor Dummy", email: "mw00126@contoh.id", role: "manwil", regionId: bogor.id, awardeeId: null },
];

const now = new Date().toISOString();
const statements = ["DELETE FROM users WHERE login_id IN ('ADM001', 'BA00126', 'MW00126');"];

for (const a of akun) {
  // Tiap akun punya garam sendiri, jadi tiga baris ini tetap berbeda meski kata sandinya sama.
  const hash = await hashPassword(PASSWORD);
  statements.push(
    `INSERT INTO users (email, name, role, region_id, awardee_id, status, login_id, password_hash, password_updated_at)
     VALUES (${q(a.email)}, ${q(a.name)}, ${q(a.role)}, ${a.regionId ?? "NULL"}, ${a.awardeeId ?? "NULL"}, 'active', ${q(a.loginId)}, ${q(hash)}, ${q(now)});`,
  );
}

mkdirSync(".seed", { recursive: true });
writeFileSync(".seed/akun-dummy.sql", `${statements.join("\n\n")}\n`);
execSync("npx wrangler d1 execute baktinusa-hub-db --local --file .seed/akun-dummy.sql --yes", { stdio: "inherit" });

console.log("\nAkun uji coba (D1 lokal saja):");
for (const a of akun) console.log(`  ${a.loginId.padEnd(8)} ${PASSWORD}   ${a.role.padEnd(8)} ${a.name}`);
console.log("\nJangan pakai kata sandi ini di production.");
