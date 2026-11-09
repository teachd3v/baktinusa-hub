// Membuat berkas SQL berisi data demo dari D1 LOKAL untuk dimuat ke production: wilayah, kampus, awardee,
// akun awardee dan Manwil, jenis pengukuran, siklus, soal, serta respons contoh.
//
// Pakai:  node --experimental-strip-types scripts/ekspor-demo-produksi.mjs
// Lalu:   npx wrangler d1 execute baktinusa-hub-db --remote --file .seed/produksi-demo.sql
//
// Yang sengaja TIDAK ikut: akun Admin lokal (production punya Admin sendiri), sesi, token masuk, jejak
// audit, dan tabel migrasi. Tabel diurutkan induk → anak, jadi tak ada kunci asing yang menggantung.
// Respons yang dikirim oleh akun Admin lokal kehilangan pengirimnya (submitted_by menjadi NULL).

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const DIR = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = readdirSync(DIR).find((f) => f.endsWith(".sqlite") && f !== "metadata.sqlite");
if (!file) throw new Error("D1 lokal tidak ditemukan. Jalankan dev server sekali dulu.");

// Salinan, supaya berkas yang sedang dipakai dev server tidak terkunci.
mkdirSync(".seed", { recursive: true });
// Mode WAL: perubahan terbaru bisa masih di berkas -wal, jadi ikut disalin (tanpa itu data terbaru hilang).
copyFileSync(`${DIR}/${file}`, ".seed/lokal-baca.sqlite");
for (const ext of ["-wal", "-shm"]) {
  if (existsSync(`${DIR}/${file}${ext}`)) copyFileSync(`${DIR}/${file}${ext}`, `.seed/lokal-baca.sqlite${ext}`);
}
const db = new DatabaseSync(".seed/lokal-baca.sqlite", { readOnly: true });

const MAX_BYTES = 70_000;
const lit = (v) => (v === null ? "NULL" : typeof v === "number" || typeof v === "bigint" ? String(v) : `'${String(v).replaceAll("'", "''")}'`);

const adminIds = db.prepare("SELECT id FROM users WHERE role = 'admin'").all().map((r) => r.id);
const notAdmin = adminIds.length ? `WHERE id NOT IN (${adminIds.join(",")})` : "";

const TABEL = [
  ["regions", ""],
  ["campuses", ""],
  ["awardees", ""],
  ["users", notAdmin],
  ["measurements", ""],
  ["periods", ""],
  ["period_measurements", ""],
  ["instruments", ""],
  ["responses", ""],
  ["response_scores", ""],
  ["response_feedback", ""],
];

const out = [];
const ringkas = [];
for (const [tabel, where] of TABEL) {
  const rows = db.prepare(`SELECT * FROM ${tabel} ${where}`).all();
  ringkas.push(`${tabel}: ${rows.length}`);
  if (rows.length === 0) continue;
  const cols = Object.keys(rows[0]);
  const head = `INSERT INTO ${tabel} (${cols.join(", ")}) VALUES\n`;
  let batch = [];
  let bytes = head.length;
  const flush = () => {
    if (batch.length) out.push(`${head}${batch.join(",\n")};`);
    batch = [];
    bytes = head.length;
  };
  for (const r of rows) {
    if (tabel === "responses" && adminIds.includes(r.submitted_by)) r.submitted_by = null;
    const tuple = `(${cols.map((c) => lit(r[c])).join(", ")})`;
    if (bytes + tuple.length > MAX_BYTES) flush();
    batch.push(tuple);
    bytes += tuple.length + 2;
  }
  flush();
}

writeFileSync(".seed/produksi-demo.sql", `${out.join("\n\n")}\n`);
console.log(ringkas.join("\n"));
console.log(`\nDitulis ke .seed/produksi-demo.sql (${out.length} pernyataan).`);
