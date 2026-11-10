// Seed data master BA15: wilayah, kampus, awardee, jenis pengukuran, siklus, dan kuesioner.
//
// Idempoten dan aman dijalankan ulang ke production: semua baris di-upsert, tidak ada yang dihapus.
// Siklus baru dibuat sebagai draft tanpa tanggal; status & tanggal siklus yang sudah diatur Admin tidak ditimpa.
//
// ---------- bentuk datanya sejak migrasi 0008 & 0009 ----------
//
// Dulu: dua periode (pengukuran & leadpro), masing-masing memegang satu kuesioner, dengan sepuluh
// `respondent_types` yang menempel lewat `period_respondent_types`. Soal punya dua versi teks dalam satu
// baris — "Saya …" untuk asesmen mandiri dan "Yang bersangkutan …" untuk penilai lain — dan dikelompokkan
// ke `instrument_categories`.
//
// Sekarang: **jenis pengukuran** memegang kuesionernya sendiri dan menyatakan siapa pengisinya lewat
// `filled_by`; **siklus** (Awal/Tengah/Akhir) tinggal jadwal milik satu angkatan yang menjalankan beberapa
// jenis sekaligus lewat `period_measurements`. Kategori tidak ada lagi, dan tiap soal hanya punya satu
// `statement`. Karena itu kuesioner 50 soal yang dulu dipakai bersama kini disalin menjadi empat set —
// satu per jenis yang memakainya — dan SA mengambil versi "Saya …" sementara sisanya versi "Yang bersangkutan …".
//
// Sepuluh tipe responden lama menyusut jadi lima jenis di sini (UA/Uji Akhir tidak punya kuesioner BA15,
// jadi dibuat dari konsol kalau memang dipakai):
//
//   self_initial + self_mid                                  → SA, dijalankan di DUA siklus berbeda
//   peer                                                     → PA
//   manwil                                                   → MA
//   external                                                 → PU
//   lp_team + lp_beneficiary + lp_volunteer + lp_partner + lp_other → LA
//     (bedanya pindah ke isian hubungan pada formnya, tersimpan apa adanya di responses.relation)
//
// Kuesioner dibaca dari seed/kuesioner-ba15.csv dan konfigurasi form dari seed/formulir-ba15.json (keduanya
// di repo). Daftar awardee dibaca dari luar repo karena berisi data pribadi — default-nya CSV app
// leadpro-survey lama, bisa diganti lewat BA15_AWARDEE_CSV.
//
// Pakai:  npm run seed:ba15
//         npx wrangler d1 execute baktinusa-hub-db --remote --file .seed/ba15.sql
// Keluaran .seed/ba15.sql berisi nama awardee dan tidak boleh di-commit.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import Papa from "papaparse";

const BATCH = "BA15";
const AWARDEE_CSV = process.env.BA15_AWARDEE_CSV ?? "../leadpro-survey/survey-app/src/data/daftar_awardee.csv";

// Jenis pengukuran BA15. `soal` menunjuk kolom `periode` di kuesioner-ba15.csv, `teks` memilih versi mana
// yang dipakai, dan `form` menunjuk kunci di formulir-ba15.json.
//
// Id-nya dipegang tetap supaya seed ulang menimpa baris yang sama, dan dipakai juga sebagai blok id soal
// (jenis 1 → soal 1001.., jenis 2 → 2001.., dan seterusnya) sehingga nomor soal tidak pernah bertabrakan
// antar jenis walau kodenya sama-sama Q1.
const MEASUREMENTS = [
  { id: 1, code: "SA", slug: "ba15-asesmen-mandiri", name: "Asesmen Mandiri", filledBy: "self", soal: "pengukuran", teks: "diri", form: "pengukuran" },
  { id: 2, code: "PA", slug: "ba15-peer-awardee", name: "Peer Awardee", filledBy: "peer", soal: "pengukuran", teks: "publik", form: "pengukuran" },
  { id: 3, code: "MA", slug: "ba15-manajer-wilayah", name: "Manajer Wilayah", filledBy: "manwil", soal: "pengukuran", teks: "publik", form: "pengukuran" },
  { id: 4, code: "PU", slug: "ba15-evaluasi-publik", name: "Evaluasi Publik", filledBy: "public", soal: "pengukuran", teks: "publik", form: "pengukuran" },
  { id: 5, code: "LA", slug: "ba15-leadership-project", name: "Leadership Project", filledBy: "public", soal: "leadpro", teks: "publik", form: "leadpro" },
];

// Siklus BA15. Dulu "Asesmen Awal" dan "Asesmen Tengah" adalah dua tipe responden dalam satu periode;
// sekarang keduanya jadi SIKLUS, dan jenis yang sama (SA) dijalankan dua kali.
const CYCLES = [
  { id: 1, cycle: "awal", slug: "ba15-awal", name: "BA15 · Siklus Awal" },
  { id: 2, cycle: "tengah", slug: "ba15-tengah", name: "BA15 · Siklus Tengah" },
];

// Jenis mana dijalankan siklus mana, beserta target minimalnya. Target diambil apa adanya dari dashboard
// lama: Manwil 1, Peer = semua awardee lain se-wilayah, Eksternal 20, asesmen mandiri 1, Leadpro tanpa target.
//
// PEMBACAAN JADWAL BA15 ADA DI SINI. Model lama tidak menyimpan siklus, jadi pemetaan di bawah adalah
// tafsir yang paling dekat: putaran 360° (PA/MA/PU) dan Leadership Project berjalan bersama asesmen tengah.
// Kalau BA15 sebenarnya berjalan lain, cukup ubah tabel ini — tidak ada tempat lain yang perlu disentuh.
const SCHEDULE = [
  { cycle: 1, code: "SA", rule: "fixed", min: 1 },
  { cycle: 2, code: "SA", rule: "fixed", min: 1 },
  { cycle: 2, code: "PA", rule: "region_peers", min: null },
  { cycle: 2, code: "MA", rule: "fixed", min: 1 },
  { cycle: 2, code: "PU", rule: "fixed", min: 20 },
  { cycle: 2, code: "LA", rule: "none", min: null },
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

// Kampus jadi daftar pilihan milik wilayah (migrasi 0007), jadi ikut dibentuk dari CSV yang sama.
// Dikunci per wilayah dan tanpa peduli huruf besar-kecil, mengikuti indeks unik di basis data:
// kalau CSV memuat "IPB" dan "ipb" di satu wilayah, keduanya jadi satu baris dengan ejaan yang pertama muncul.
const campusKey = (region, campus) => `${region.toLowerCase()}|${campus.toLowerCase()}`;
const campusSeen = new Map(); // kunci -> { region, name }
for (const r of master) {
  const campus = clean(r.Kampus);
  if (!campus) continue;
  const key = campusKey(clean(r.Wilayah), campus);
  if (!campusSeen.has(key)) campusSeen.set(key, { region: clean(r.Wilayah), name: campus });
}
const campusId = new Map([...campusSeen.keys()].map((key, i) => [key, i + 1]));
const campuses = [...campusSeen.entries()].map(([key, c]) => [campusId.get(key), regionId.get(c.region), c.name]);

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
  clean(r.Kampus) ? campusId.get(campusKey(clean(r.Wilayah), clean(r.Kampus))) : null,
  clean(r.Referal),
  `awardees/${BATCH.toLowerCase()}/${clean(r.Referal)}.webp`,
]);
// LeadPro: tabel sendiri, bidangnya menunjuk ke tabel acuan (migrasi 0013).
const leadpros = ordered
  .map((r, i) => ({ id: awardees[i][0], name: clean(r.Leadpro), field: clean(r.Bidang), description: clean(r["Deskripsi Leadpro"]) }))
  .filter((l) => l.name);
const leadproFields = [...new Map(leadpros.filter((l) => l.field).map((l) => [l.field.toLowerCase(), l.field])).values()].sort((a, b) => a.localeCompare(b, "id"));

// ---------- kuesioner ----------

const questionnaire = await readCsv("seed/kuesioner-ba15.csv");
const formConfigs = JSON.parse(await readFile("seed/formulir-ba15.json", "utf8"));

const byCode = new Map(MEASUREMENTS.map((m) => [m.code, m]));
for (const row of SCHEDULE) {
  if (!byCode.has(row.code)) throw new Error(`Jadwal menunjuk jenis "${row.code}" yang tidak ada di MEASUREMENTS`);
  if (!CYCLES.some((c) => c.id === row.cycle)) throw new Error(`Jadwal menunjuk siklus #${row.cycle} yang tidak ada di CYCLES`);
  if ((row.rule === "fixed") !== (row.min !== null)) {
    throw new Error(`Jenis "${row.code}" di siklus #${row.cycle}: target "fixed" wajib punya angka, aturan lain wajib tanpa angka`);
  }
}

const instruments = [];
for (const m of MEASUREMENTS) {
  if (!formConfigs[m.form]) throw new Error(`seed/formulir-ba15.json tidak punya konfigurasi "${m.form}" untuk jenis ${m.code}`);
  const rows = questionnaire.filter((r) => clean(r.periode) === m.soal);
  if (rows.length === 0) throw new Error(`seed/kuesioner-ba15.csv tidak punya soal "${m.soal}" untuk jenis ${m.code}`);

  for (const row of rows) {
    const code = clean(row.kode);
    const statement = m.teks === "diri" ? clean(row.teks_diri) : clean(row.teks_publik);
    if (!statement) {
      throw new Error(`Soal ${m.soal}/${code} tidak punya teks_${m.teks === "diri" ? "diri" : "publik"} — dibutuhkan jenis ${m.code}`);
    }
    const order = Number.parseInt(code.replace(/^Q/, ""), 10);
    // Blok id per jenis: soal yang sama di jenis berbeda tetap baris sendiri, dan nomornya terbaca.
    instruments.push([m.id * 1000 + order, m.id, code, statement, 4, order]);
  }
}

// Teks form. `title` hanya terbaca pada form publik (lib/survey.ts); untuk jenis berakun judulnya datang
// dari nama jenisnya, jadi di sana disamakan supaya isi tabel tidak menyesatkan saat dibaca langsung.
//
// Properti `type` pada pilihan hubungan dibuang: dulu ia memilih respondent_type, dan sejak migrasi 0008
// jenisnya ditentukan oleh form yang dibuka. Jawabannya tetap tersimpan apa adanya di responses.relation.
const formConfigFor = (m) => {
  const base = formConfigs[m.form];
  return JSON.stringify({
    ...base,
    title: m.filledBy === "public" ? base.title : m.name,
    relation: { ...base.relation, options: base.relation.options.map(({ type, ...rest }) => rest) },
  });
};

// ---------- tulis SQL ----------

const statements = [
  "-- Dihasilkan oleh scripts/seed-ba15.mjs. Berisi nama awardee: jangan di-commit.",
  ...upsertStatements("regions", ["id", "name"], regionNames.map((name) => [regionId.get(name), name]), { on: ["id"], update: ["name"] }),
  ...upsertStatements("campuses", ["id", "region_id", "name"], campuses, { on: ["id"], update: ["region_id", "name"] }),
  ...upsertStatements("awardees", ["id", "region_id", "batch", "name", "campus_id", "referral_code", "photo_key"], awardees,
    { on: ["id"], update: ["region_id", "batch", "name", "campus_id", "referral_code", "photo_key"] }),
  // Bidang hanya ditambah dan proyek hanya diisi bila belum ada, supaya suntingan Admin tidak tertimpa.
  ...leadproFields.map((name) => `INSERT OR IGNORE INTO leadpro_fields (name) VALUES (${sql(name)});`),
  ...leadpros.map(
    (l) =>
      `INSERT OR IGNORE INTO leadpros (awardee_id, name, field_id, description) VALUES (${l.id}, ${sql(l.name)}, ${l.field ? `(SELECT id FROM leadpro_fields WHERE name = ${sql(l.field)})` : "NULL"}, ${sql(l.description || null)});`,
  ),
  // Jenis pengukuran memegang kuesioner dan menyatakan siapa pengisinya.
  ...upsertStatements("measurements", ["id", "code", "slug", "name", "filled_by", "form_config"],
    MEASUREMENTS.map((m) => [m.id, m.code, m.slug, m.name, m.filledBy, formConfigFor(m)]),
    { on: ["id"], update: ["code", "slug", "name", "filled_by", "form_config"] }),
  // Status & tanggal siklus tidak ikut diperbarui: itu wewenang Admin.
  ...upsertStatements("periods", ["id", "slug", "name", "batch", "cycle", "opens_at", "closes_at", "status"],
    CYCLES.map((c) => [c.id, c.slug, c.name, BATCH, c.cycle, null, null, "draft"]),
    { on: ["id"], update: ["slug", "name", "batch", "cycle"] }),
  ...upsertStatements("period_measurements", ["period_id", "measurement_id", "target_rule", "target_min", "opens_at", "closes_at"],
    SCHEDULE.map((x) => [x.cycle, byCode.get(x.code).id, x.rule, x.min, null, null]),
    { on: ["period_id", "measurement_id"], update: ["target_rule", "target_min"] }),
  ...upsertStatements("instruments", ["id", "measurement_id", "code", "statement", "scale_max", "order_index"], instruments,
    { on: ["id"], update: ["measurement_id", "code", "statement", "scale_max", "order_index"] }),
];

await mkdir(".seed", { recursive: true });
await writeFile(".seed/ba15.sql", statements.join("\n") + "\n", "utf8");

console.log(`wilayah ${regionNames.length}, kampus ${campuses.length}, awardee ${awardees.length} (ID dari kolom No: ${useSourceNumbers})`);
for (const m of MEASUREMENTS) {
  const mine = instruments.filter((i) => i[1] === m.id);
  const jadwal = SCHEDULE.filter((s) => s.code === m.code).map((s) => CYCLES.find((c) => c.id === s.cycle).cycle);
  console.log(`  ${m.code.padEnd(3)} ${m.filledBy.padEnd(7)} ${String(mine.length).padStart(2)} soal (teks ${m.teks})  siklus: ${jadwal.join(", ") || "—"}`);
}
console.log(`SQL: .seed/ba15.sql (${statements.length} pernyataan, ${instruments.length} soal)`);
