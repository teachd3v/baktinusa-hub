// Mengisi D1 LOKAL dengan respons palsu supaya dashboard bisa dilihat dan diuji.
//
// Pakai:  npm run demo-data            (tulis SQL + terapkan ke D1 lokal)
//         npm run demo-data -- --sql   (hanya tulis .seed/demo.sql, tidak menerapkan)
//
// Script ini SENGAJA tidak punya mode --remote: data ini palsu dan tidak boleh mendekati production.
// Untuk mengosongkan lagi: npm run demo-data -- --reset

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.includes("--remote")) {
  console.error("Data contoh hanya untuk D1 lokal. Tidak ada mode --remote.");
  process.exit(1);
}
const sqlOnly = args.includes("--sql");
const reset = args.includes("--reset");
const PERIOD = "ba15-pengukuran";

const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);
const d1 = (sql) => {
  const out = execSync(`npx wrangler d1 execute baktinusa-hub-db --local --json --command "${sql.replaceAll('"', '\\"')}"`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results; // wrangler menyisipkan banner sebelum JSON
};

// Acak yang bisa diulang: angka dashboard sama tiap kali script dijalankan.
let seed = 20260925;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (list) => list[Math.floor(rand() * list.length)];

const period = d1(`SELECT id FROM periods WHERE slug = ${q(PERIOD)}`)[0];
if (!period) {
  console.error(`Periode ${PERIOD} tidak ada di D1 lokal. Jalankan seed dulu.`);
  process.exit(1);
}

if (reset) {
  const sql = `DELETE FROM responses WHERE period_id = ${period.id} AND source = 'demo';`;
  execSync(`npx wrangler d1 execute baktinusa-hub-db --local --command "${sql}"`, { stdio: "inherit" });
  console.log("Respons demo dihapus.");
  process.exit(0);
}

const awardees = d1("SELECT id, region_id, name FROM awardees ORDER BY id");
const types = d1(
  `SELECT rt.id, rt.code FROM period_respondent_types prt JOIN respondent_types rt ON rt.id = prt.respondent_type_id WHERE prt.period_id = ${period.id}`,
);
const instruments = d1(`SELECT id, scale_max FROM instruments WHERE period_id = ${period.id} ORDER BY order_index`);
const typeOf = Object.fromEntries(types.map((t) => [t.code, t.id]));
const peersOf = (a) => awardees.filter((x) => x.region_id === a.region_id && x.id !== a.id);

const NAMES = ["Rizki", "Salsabila", "Fajar", "Nabila", "Arif", "Putri", "Hendra", "Maya", "Yusuf", "Dinda", "Bayu", "Intan"];
const SURNAMES = ["Pratama", "Ramadhan", "Wijaya", "Lestari", "Hidayat", "Anggraini", "Saputra", "Nurhaliza"];
const CITIES = ["Medan", "Jakarta", "Bandung", "Surabaya", "Makassar", "Yogyakarta", "Padang", "Malang"];
const RELATIONS = ["Rekan organisasi", "Pembina/Mentor", "Teman kuliah", "Penerima manfaat program", "Rekan kerja"];
const SARAN = [
  "Tetap konsisten dan jangan cepat puas dengan capaian sekarang.",
  "Perlu lebih berani mengambil peran di depan saat diskusi kelompok.",
  "Kemampuan mengelola waktu masih bisa ditingkatkan.",
  "Sudah baik dalam merangkul orang lain, teruskan.",
  "Coba perdalam kemampuan analisis sebelum mengambil keputusan.",
];
const SARAN_PROGRAM = [
  "Perbanyak sesi mentoring langsung dengan praktisi.",
  "Jadwal kegiatan sebaiknya diumumkan lebih awal.",
  "Materi kepemimpinan sudah relevan, tambah studi kasus lokal.",
];

// Tiap awardee punya "tingkat" sendiri supaya sebaran predikat di dashboard tidak seragam.
const levelOf = new Map(awardees.map((a) => [a.id, 2.1 + rand() * 1.8]));

const rows = { responses: [], scores: [], feedback: [] };
let responseId = 100000; // jauh dari id respons nyata supaya mudah dikenali

function addResponse(awardee, typeCode, { name, city, relation, submittedBy = null, spread = 0.55 } = {}) {
  const id = ++responseId;
  const base = levelOf.get(awardee.id) + (rand() - 0.5) * spread;
  rows.responses.push(
    `(${id}, ${period.id}, ${awardee.id}, ${typeOf[typeCode]}, ${q(name)}, ${q(city)}, ${q(relation)}, ${q(new Date(2026, 8, 1 + Math.floor(rand() * 20)).toISOString())}, 'demo', ${submittedBy ?? "NULL"})`,
  );
  for (const i of instruments) {
    const noise = (rand() - 0.5) * 1.2;
    const score = Math.max(0, Math.min(i.scale_max, Math.round(base + noise)));
    rows.scores.push(`(${id}, ${i.id}, ${score})`);
  }
  rows.feedback.push(`(${id}, 'saran_diri', ${q(pick(SARAN))})`);
  if (rand() < 0.4) rows.feedback.push(`(${id}, 'saran_program', ${q(pick(SARAN_PROGRAM))})`);
}

for (const a of awardees) {
  // Jejaring eksternal: sengaja tidak semua awardee memenuhi target 20, supaya kolom pemenuhan terlihat hidup.
  const externals = 6 + Math.floor(rand() * 18);
  for (let i = 0; i < externals; i++) {
    addResponse(a, "external", { name: `${pick(NAMES)} ${pick(SURNAMES)}`, city: pick(CITIES), relation: pick(RELATIONS) });
  }
  if (typeOf.manwil && rand() < 0.8) addResponse(a, "manwil", { name: `Manwil ${a.region_id}`, relation: "Manajer Wilayah" });
  for (const peer of peersOf(a)) {
    if (rand() < 0.7) addResponse(a, "peer", { name: peer.name, relation: "Peer Awardee" });
  }
  if (typeOf.self_initial) addResponse(a, "self_initial", { name: a.name, relation: "Asesmen Awal", spread: 0.3 });
  // Asesmen tengah sedikit lebih tinggi: dashboard progres awal→tengah jadi ada isinya.
  if (typeOf.self_mid && rand() < 0.75) {
    levelOf.set(a.id, Math.min(4, levelOf.get(a.id) + 0.3));
    addResponse(a, "self_mid", { name: a.name, relation: "Asesmen Tengah", spread: 0.3 });
  }
}

// D1 kehabisan memori pada INSERT yang terlalu besar; 500 baris per statement aman.
const chunked = (table, columns, values) => {
  const out = [];
  for (let i = 0; i < values.length; i += 500) {
    out.push(`INSERT INTO ${table} (${columns}) VALUES\n${values.slice(i, i + 500).join(",\n")};`);
  }
  return out;
};

const sql = [
  `DELETE FROM responses WHERE period_id = ${period.id} AND source = 'demo';`,
  ...chunked(
    "responses",
    "id, period_id, awardee_id, respondent_type_id, respondent_name, respondent_city, relation, submitted_at, source, submitted_by",
    rows.responses,
  ),
  ...chunked("response_scores", "response_id, instrument_id, score", rows.scores),
  ...chunked("response_feedback", "response_id, field, body", rows.feedback),
].join("\n\n");

mkdirSync(".seed", { recursive: true });
writeFileSync(".seed/demo.sql", `${sql}\n`);
console.log(`${rows.responses.length} respons, ${rows.scores.length} skor, ${rows.feedback.length} saran → .seed/demo.sql`);

if (!sqlOnly) {
  execSync("npx wrangler d1 execute baktinusa-hub-db --local --file .seed/demo.sql --yes", { stdio: "inherit" });
}
