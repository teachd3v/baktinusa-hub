// Seed data master BA15: wilayah, awardee, tipe responden, dan kuesioner.
//
// Idempoten dan aman dijalankan ulang ke production: semua baris di-upsert, tidak ada yang dihapus. Periode baru dibuat
// sebagai draft tanpa tanggal; status & tanggal periode yang sudah diatur Admin tidak ditimpa.
//
// Kuesioner dibaca dari seed/kuesioner-ba15.csv dan konfigurasi form dari seed/formulir-ba15.json (keduanya di repo).
// Daftar awardee dibaca dari luar repo karena berisi data pribadi — default-nya CSV app leadpro-survey lama,
// bisa diganti lewat BA15_AWARDEE_CSV.
//
// Pakai:  npm run seed:ba15
//         npx wrangler d1 execute baktinusa-hub-db --remote --file .seed/ba15.sql
// Keluaran .seed/ba15.sql berisi nama awardee dan tidak boleh di-commit.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import Papa from "papaparse";

const BATCH = "BA15";
const AWARDEE_CSV = process.env.BA15_AWARDEE_CSV ?? "../leadpro-survey/survey-app/src/data/daftar_awardee.csv";

const RESPONDENT_TYPES = [
  { id: 1, code: "self_initial", name: "Asesmen Awal", audience: "self" },
  { id: 2, code: "self_mid", name: "Asesmen Tengah", audience: "self" },
  { id: 3, code: "peer", name: "Peer Awardee", audience: "internal" },
  { id: 4, code: "manwil", name: "Manajer Wilayah", audience: "internal" },
  { id: 5, code: "external", name: "Jejaring Eksternal", audience: "external" },
  { id: 6, code: "lp_team", name: "Tim Leadership Project", audience: "external" },
  { id: 7, code: "lp_beneficiary", name: "Penerima Manfaat Leadership Project", audience: "external" },
  { id: 8, code: "lp_volunteer", name: "Volunteer Leadership Project", audience: "external" },
  { id: 9, code: "lp_partner", name: "Mitra", audience: "external" },
  { id: 10, code: "lp_other", name: "Lainnya", audience: "external" },
];

const PERIODS = [
  { id: 1, key: "pengukuran", slug: "ba15-pengukuran", name: "BA15 · Pengukuran Awardee", kind: "assessment" },
  { id: 2, key: "leadpro", slug: "ba15-leadpro", name: "BA15 · Leadership Project", kind: "leadpro" },
];

// Target minimal dari dashboard lama: Manwil 1, Peer = awardee lain se-wilayah, Eksternal 20.
const PERIOD_TYPES = [
  { period: 1, type: 1, rule: "fixed", min: 1 },
  { period: 1, type: 2, rule: "fixed", min: 1 },
  { period: 1, type: 3, rule: "region_peers", min: null },
  { period: 1, type: 4, rule: "fixed", min: 1 },
  { period: 1, type: 5, rule: "fixed", min: 20 },
  ...[6, 7, 8, 9, 10].map((type) => ({ period: 2, type, rule: "none", min: null })),
];

const clean = (s) => String(s ?? "").trim();
const readCsv = async (path) => Papa.parse((await readFile(path, "utf8")).replace(/^﻿/, ""), { header: true, skipEmptyLines: true }).data;

const sql = (value) =>
  value === null || value === undefined ? "NULL"
  : typeof value === "number" ? String(value)
  : `'${String(value).replaceAll("'", "''")}'`;

// D1 membatasi satu pernyataan SQL 100 KB, dan VALUES yang terlalu panjang membuat SQLite lokal kehabisan memori.
// conflict: kolom unik yang dicocokkan + kolom yang diperbarui bila barisnya sudah ada.
function upsertStatements(table, columns, rows, conflict, maxBytes = 80_000, maxRows = 500) {
  const head = `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n`;
  const tail = `\nON CONFLICT(${conflict.on.join(", ")}) DO UPDATE SET ${conflict.update.map((c) => `${c} = excluded.${c}`).join(", ")};`;
  const out = [];
  let chunk = [];
  let size = head.length + tail.length;
  for (const row of rows) {
    const tuple = `(${row.map(sql).join(", ")})`;
    if (chunk.length && (size + tuple.length + 2 > maxBytes || chunk.length >= maxRows)) {
      out.push(head + chunk.join(",\n") + tail);
      chunk = [];
      size = head.length + tail.length;
    }
    chunk.push(tuple);
    size += tuple.length + 2;
  }
  if (chunk.length) out.push(head + chunk.join(",\n") + tail);
  return out;
}

// ---------- awardee & wilayah ----------

const master = (await readCsv(AWARDEE_CSV)).filter((r) => clean(r["Nama Awardee"]));
const regionNames = [...new Set(master.map((r) => clean(r.Wilayah)))].sort((a, b) => a.localeCompare(b, "id"));
const regionId = new Map(regionNames.map((name, i) => [name, i + 1]));

const numbers = master.map((r) => Number.parseInt(clean(r.No), 10));
const useSourceNumbers = new Set(numbers).size === master.length && numbers.every((n) => n >= 1 && n <= master.length);
const ordered = useSourceNumbers
  ? master
  : [...master].sort((a, b) => clean(a.Wilayah).localeCompare(clean(b.Wilayah), "id") || clean(a["Nama Awardee"]).localeCompare(clean(b["Nama Awardee"]), "id"));
const awardees = ordered.map((r, i) => [
  useSourceNumbers ? Number.parseInt(clean(r.No), 10) : i + 1,
  regionId.get(clean(r.Wilayah)),
  BATCH,
  clean(r["Nama Awardee"]),
  clean(r.Kampus) || null,
  clean(r.Referal),
  `awardees/${BATCH.toLowerCase()}/${clean(r.Referal)}.webp`,
  clean(r.Leadpro) || null,
  clean(r.Bidang) || null,
  clean(r["Deskripsi Leadpro"]) || null,
]);

// ---------- kuesioner ----------

const questionnaire = await readCsv("seed/kuesioner-ba15.csv");
const formConfigs = JSON.parse(await readFile("seed/formulir-ba15.json", "utf8"));
for (const period of PERIODS) {
  const config = formConfigs[period.key];
  if (!config) throw new Error(`seed/formulir-ba15.json tidak punya konfigurasi "${period.key}"`);
  for (const option of config.relation.options) {
    const allowed = PERIOD_TYPES.some((x) => x.period === period.id && RESPONDENT_TYPES.find((t) => t.id === x.type).code === option.type);
    if (!allowed) throw new Error(`Pilihan hubungan "${option.label}" memakai tipe "${option.type}" yang tidak dibuka di periode ${period.slug}`);
  }
}
const categories = [];
const instruments = [];
for (const period of PERIODS) {
  for (const row of questionnaire.filter((r) => clean(r.periode) === period.key)) {
    let category = categories.find((c) => c.periodId === period.id && c.name === clean(row.kategori));
    if (!category) {
      category = { id: categories.length + 1, periodId: period.id, name: clean(row.kategori), order: categories.filter((c) => c.periodId === period.id).length + 1 };
      categories.push(category);
    }
    const code = clean(row.kode);
    instruments.push([instruments.length + 1, period.id, category.id, code, clean(row.teks_diri) || null, clean(row.teks_publik), 4, Number.parseInt(code.replace(/^Q/, ""), 10)]);
  }
}

// ---------- tulis SQL ----------

const statements = [
  "-- Dihasilkan oleh scripts/seed-ba15.mjs. Berisi nama awardee: jangan di-commit.",
  ...upsertStatements("regions", ["id", "name"], regionNames.map((name) => [regionId.get(name), name]), { on: ["id"], update: ["name"] }),
  ...upsertStatements("respondent_types", ["id", "code", "name", "audience"], RESPONDENT_TYPES.map((t) => [t.id, t.code, t.name, t.audience]),
    { on: ["id"], update: ["code", "name", "audience"] }),
  ...upsertStatements("awardees", ["id", "region_id", "batch", "name", "campus", "referral_code", "photo_key", "leadpro_name", "leadpro_field", "leadpro_description"], awardees,
    { on: ["id"], update: ["region_id", "batch", "name", "campus", "referral_code", "photo_key", "leadpro_name", "leadpro_field", "leadpro_description"] }),
  // Status & tanggal periode tidak ikut diperbarui: itu wewenang Admin.
  ...upsertStatements("periods", ["id", "slug", "name", "batch", "kind", "opens_at", "closes_at", "status", "form_config"],
    PERIODS.map((p) => [p.id, p.slug, p.name, BATCH, p.kind, null, null, "draft", JSON.stringify(formConfigs[p.key])]),
    { on: ["id"], update: ["slug", "name", "batch", "kind", "form_config"] }),
  ...upsertStatements("period_respondent_types", ["period_id", "respondent_type_id", "target_rule", "target_min", "opens_at", "closes_at"],
    PERIOD_TYPES.map((x) => [x.period, x.type, x.rule, x.min, null, null]),
    { on: ["period_id", "respondent_type_id"], update: ["target_rule", "target_min"] }),
  ...upsertStatements("instrument_categories", ["id", "period_id", "name", "weight", "order_index"],
    categories.map((c) => [c.id, c.periodId, c.name, 1, c.order]),
    { on: ["id"], update: ["period_id", "name", "weight", "order_index"] }),
  ...upsertStatements("instruments", ["id", "period_id", "category_id", "code", "text_self", "text_public", "scale_max", "order_index"], instruments,
    { on: ["id"], update: ["period_id", "category_id", "code", "text_self", "text_public", "scale_max", "order_index"] }),
];

await mkdir(".seed", { recursive: true });
await writeFile(".seed/ba15.sql", statements.join("\n") + "\n", "utf8");

console.log(`wilayah ${regionNames.length}, awardee ${awardees.length} (ID dari kolom No: ${useSourceNumbers}), kategori ${categories.length}, instrumen ${instruments.length}`);
for (const c of categories) {
  const codes = instruments.filter((x) => x[2] === c.id).map((x) => x[7]);
  console.log(`  ${PERIODS.find((p) => p.id === c.periodId).slug}  Q${Math.min(...codes)}–Q${Math.max(...codes)}  ${c.name}`);
}
console.log(`SQL: .seed/ba15.sql (${statements.length} pernyataan)`);
