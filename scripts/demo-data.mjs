// Mengisi D1 LOKAL dengan respons palsu supaya dashboard bisa dilihat dan diuji.
//
// Pakai:  npm run demo-data                         (SEMUA siklus: tulis SQL + terapkan ke D1 lokal)
//         npm run demo-data -- --siklus=ba15-awal   (hanya satu siklus)
//         npm run demo-data -- --buka-siklus        (siklus yang diisi dan masih draft ikut dibuka)
//         npm run demo-data -- --sql                (hanya tulis .seed/demo.sql, tidak menerapkan)
//         npm run demo-data -- --reset              (hapus respons demo saja)
//         npm run demo-data -- --persist-to=<dir>   (pakai state D1 lokal di folder lain, untuk uji coba)
//
// Script ini SENGAJA tidak punya mode --remote: data ini palsu dan tidak boleh mendekati production.
//
// Sejak migrasi 0008 satu SIKLUS menjalankan beberapa JENIS pengukuran sekaligus, dan siapa yang mengisi
// ditentukan `measurements.filled_by`. Jadi script ini membaca peta siklus × jenis apa adanya dari
// database — yang diatur Admin di konsol — lalu mengarang respons sesuai pengisinya:
//
//   public → banyak responden anonim lewat tautan referal
//   self   → satu per awardee, atas nama akun awardee itu sendiri
//   peer   → rekan se-wilayah, atas nama akun masing-masing
//   manwil → Manajer Wilayah wilayah itu
//   admin  → satu per awardee, atas nama akun Admin
//
// Respons berakun memakai `submitted_by` sungguhan kalau akunnya ada, jadi indeks unik
// "satu pengisi satu penilaian" ikut teruji. Kalau akunnya belum ada, barisnya tetap dibuat tanpa pengisi.
//
// CERITA ANTAR SIKLUS. Tiap awardee punya tingkat dasar dan laju perubahan sendiri (sebagian kecil
// justru turun), sehingga nilainya bergerak Awal → Tengah → Akhir. Tanpa itu tiga siklus akan tampak
// kembar dan filter siklus di Analitik tidak punya apa-apa untuk diperlihatkan. Profil tiap awardee
// diturunkan dari id-nya, jadi tetap sama walau yang dijalankan hanya satu siklus.
//
// Siklus yang masih `draft` tidak tampil di halaman Hasil maupun Analitik (lihat isRunningOrDone).
// Script ini TIDAK mengubah status siklus kecuali diminta lewat --buka-siklus, dan hanya draft → open,
// persis yang akan dikerjakan penjadwal (cron) begitu jadwal bukanya tiba.

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
if (args.includes("--remote")) {
  console.error("Data contoh hanya untuk D1 lokal. Tidak ada mode --remote.");
  process.exit(1);
}
const sqlOnly = args.includes("--sql");
const reset = args.includes("--reset");
const openCycles = args.includes("--buka-siklus");
const valueOf = (name, fallback) => args.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const ONLY = valueOf("siklus", null);
const persistTo = valueOf("persist-to", null);

const where = persistTo ? ` --persist-to "${persistTo}"` : "";
const q = (s) => (s === null || s === undefined ? "NULL" : `'${String(s).replaceAll("'", "''")}'`);

// Query dirapatkan jadi satu baris: newline di dalam argumen --command memotong perintahnya di shell
// Windows, dan sisanya dieksekusi sebagai SQL yang tidak lengkap.
const d1 = (sql) => {
  const satuBaris = sql.replace(/\s*\n\s*/g, " ").trim();
  const out = execSync(`npx wrangler d1 execute baktinusa-hub-db --local${where} --json --command "${satuBaris.replaceAll('"', '\\"')}"`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return JSON.parse(out.slice(out.indexOf("[")))[0].results; // wrangler menyisipkan banner sebelum JSON
};
const apply = (file) => execSync(`npx wrangler d1 execute baktinusa-hub-db --local${where} --file ${file} --yes`, { stdio: "inherit" });
const write = (sql) => {
  mkdirSync(".seed", { recursive: true });
  writeFileSync(".seed/demo.sql", `${sql}\n`);
};

// Acak yang bisa diulang: angka dashboard sama tiap kali script dijalankan.
let seed = 20260925;
const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = (list) => list[Math.floor(rand() * list.length)];

// Acak per-kunci (mulberry32): profil awardee tidak boleh bergeser hanya karena urutan siklus yang dijalankan.
const seededRand = (key) => {
  let t = (key * 2654435761) >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- siklus yang akan diisi ----------

const cycles = d1(
  `SELECT id, slug, batch, cycle, status, opens_at, closes_at FROM periods
   ${ONLY ? `WHERE slug = ${q(ONLY)}` : ""}
   ORDER BY batch, CASE cycle WHEN 'awal' THEN 0 WHEN 'tengah' THEN 1 ELSE 2 END`,
);
if (cycles.length === 0) {
  console.error(ONLY ? `Siklus ${ONLY} tidak ada di D1 lokal.` : "Belum ada siklus di D1 lokal. Jalankan seed dulu.");
  console.error("Siklus yang ada:", d1("SELECT slug FROM periods ORDER BY id").map((p) => p.slug).join(", ") || "(belum ada)");
  process.exit(1);
}
const cycleIds = cycles.map((c) => c.id).join(", ");

if (reset) {
  write(`DELETE FROM responses WHERE source = 'demo' AND period_id IN (${cycleIds});`);
  apply(".seed/demo.sql");
  console.log(`Respons demo dihapus dari: ${cycles.map((c) => c.slug).join(", ")}. Status siklus tidak diubah.`);
  process.exit(0);
}

// ---------- bahan bersama ----------

// Tempat tiap siklus berada dalam perjalanan program: dasar cerita naik-turunnya nilai.
const POSITION = { awal: 0, tengah: 0.5, akhir: 1 };
// Dipakai hanya bila siklusnya belum punya jadwal buka — supaya tanggal kirimnya tetap masuk akal.
const FALLBACK_START = { awal: "2026-08-03T00:00:00.000Z", tengah: "2026-09-14T00:00:00.000Z", akhir: "2026-10-05T00:00:00.000Z" };
const NOW = Date.now();
const DAY = 86_400_000;

function windowOf(c) {
  const start = Date.parse(c.opens_at ?? FALLBACK_START[c.cycle]);
  const closes = c.closes_at ? Date.parse(c.closes_at) : start + 21 * DAY;
  // Tidak ada respons dari masa depan: batas atasnya dipotong sampai "sekarang".
  return [start, Math.max(start + DAY, Math.min(closes, NOW))];
}

// Jenis & soalnya sama di semua siklus, jadi dibaca sekali.
const allMeasurements = d1("SELECT id, code, name, filled_by, form_config FROM measurements ORDER BY id");
const instrumentsOf = new Map(
  allMeasurements.map((m) => [m.id, d1(`SELECT id, scale_max FROM instruments WHERE measurement_id = ${m.id} ORDER BY order_index`)]),
);

// Isian saran mengikuti form_config jenisnya: LA memakai pesan/kritik/saran_keberlanjutan, bukan saran_diri.
// Kolom `field` punya CHECK di basis data, jadi menebak nama sendiri akan ditolak.
const feedbackFieldsOf = new Map(
  allMeasurements.map((m) => {
    const cfg = m.form_config ? JSON.parse(m.form_config) : null;
    return [m.id, (cfg?.feedback ?? []).map((f) => f.field)];
  }),
);

// Akun yang ada: dipakai supaya respons berakun punya submitted_by sungguhan.
const userOfAwardee = new Map(d1("SELECT id, awardee_id FROM users WHERE awardee_id IS NOT NULL").map((u) => [u.awardee_id, u.id]));
const userOfRegion = new Map(d1("SELECT id, region_id FROM users WHERE role = 'manwil' AND region_id IS NOT NULL").map((u) => [u.region_id, u.id]));
const [anyAdmin] = d1("SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1");

const NAMES = ["Rizki", "Salsabila", "Fajar", "Nabila", "Arif", "Putri", "Hendra", "Maya", "Yusuf", "Dinda", "Bayu", "Intan"];
const SURNAMES = ["Pratama", "Ramadhan", "Wijaya", "Lestari", "Hidayat", "Anggraini", "Saputra", "Nurhaliza"];
const CITIES = ["Medan", "Jakarta", "Bandung", "Surabaya", "Makassar", "Yogyakarta", "Padang", "Malang"];
const RELATIONS = ["Rekan organisasi", "Pembina/Mentor", "Teman kuliah", "Penerima manfaat program", "Rekan kerja"];
const SARAN = {
  saran_diri: [
    "Tetap konsisten dan jangan cepat puas dengan capaian sekarang.",
    "Perlu lebih berani mengambil peran di depan saat diskusi kelompok.",
    "Kemampuan mengelola waktu masih bisa ditingkatkan.",
    "Sudah baik dalam merangkul orang lain, teruskan.",
  ],
  saran_program: [
    "Perbanyak sesi mentoring langsung dengan praktisi.",
    "Jadwal kegiatan sebaiknya diumumkan lebih awal.",
    "Materi kepemimpinan sudah relevan, tambah studi kasus lokal.",
  ],
  pesan: ["Senang bisa terlibat; timnya terbuka pada masukan.", "Kegiatannya terasa manfaatnya langsung di lapangan."],
  kritik: ["Koordinasi menjelang hari pelaksanaan masih terburu-buru.", "Dokumentasi kegiatan belum rapi."],
  saran_keberlanjutan: [
    "Libatkan warga setempat sejak perencanaan supaya berlanjut sendiri.",
    "Cari mitra tetap agar programnya tidak berhenti saat pendanaan habis.",
  ],
};

// Profil tiap awardee: tingkat dasar + laju perubahan sepanjang program. Laju sengaja bisa negatif untuk
// sebagian kecil orang (sekitar sepertujuh), karena data yang semuanya naik terlihat palsu.
const profileOf = new Map();
function profile(awardee) {
  if (!profileOf.has(awardee.id)) {
    const r = seededRand(awardee.id);
    profileOf.set(awardee.id, { base: 2.0 + r() * 1.5, gain: -0.25 + r() * 1.15 });
  }
  return profileOf.get(awardee.id);
}
const levelAt = (awardee, cycle) => {
  const p = profile(awardee);
  return Math.max(0.3, Math.min(3.95, p.base + p.gain * POSITION[cycle]));
};

// ---------- membangun respons ----------

const rows = { responses: [], scores: [], feedback: [] };
const perCycle = []; // untuk laporan akhir
let responseId = 100000; // jauh dari id respons nyata supaya mudah dikenali

for (const cycle of cycles) {
  const measurements = d1(
    `SELECT m.id, m.code, m.name, m.filled_by FROM period_measurements pm JOIN measurements m ON m.id = pm.measurement_id
      WHERE pm.period_id = ${cycle.id} ORDER BY m.id`,
  );
  // Hanya awardee seangkatan dengan siklusnya — sama seperti aturan form publik dan halaman pantauan.
  const awardees = d1(`SELECT id, region_id, name FROM awardees WHERE batch = ${q(cycle.batch)} ORDER BY id`);
  const used = measurements.filter((m) => instrumentsOf.get(m.id).length > 0);

  if (used.length === 0 || awardees.length === 0) {
    perCycle.push({
      cycle,
      skipped: measurements.length === 0 ? "belum menjalankan jenis apa pun" : awardees.length === 0 ? `tidak ada awardee ${cycle.batch}` : "semua jenisnya belum punya soal",
    });
    continue;
  }

  const [start, end] = windowOf(cycle);
  const sentAt = () => new Date(start + rand() * (end - start)).toISOString();
  const peersOf = (a) => awardees.filter((x) => x.region_id === a.region_id && x.id !== a.id);
  const sudahMengisi = new Set(); // menjaga indeks unik: satu pengisi, satu penilaian, per awardee per jenis per siklus
  const counts = new Map(used.map((m) => [m.code, 0]));

  const add = (awardee, m, { name, city = null, relation, submittedBy = null, spread = 0.55 }) => {
    if (submittedBy !== null) {
      const key = `${awardee.id}:${m.id}:${submittedBy}`;
      if (sudahMengisi.has(key)) return;
      sudahMengisi.add(key);
    }
    const id = ++responseId;
    const base = levelAt(awardee, cycle.cycle) + (rand() - 0.5) * spread;
    rows.responses.push(
      `(${id}, ${cycle.id}, ${awardee.id}, ${m.id}, ${q(name)}, ${q(city)}, ${q(relation)}, ${q(sentAt())}, 'demo', ${submittedBy ?? "NULL"})`,
    );
    for (const i of instrumentsOf.get(m.id)) {
      const noise = (rand() - 0.5) * 1.2;
      // Tingkat awardee dinyatakan pada skala 0–4; soal berskala lain ikut diregangkan.
      const score = Math.max(0, Math.min(i.scale_max, Math.round((base / 4) * i.scale_max + noise)));
      rows.scores.push(`(${id}, ${i.id}, ${score})`);
    }
    for (const field of feedbackFieldsOf.get(m.id)) {
      if (!SARAN[field] || rand() > 0.5) continue;
      rows.feedback.push(`(${id}, ${q(field)}, ${q(pick(SARAN[field]))})`);
    }
    counts.set(m.code, counts.get(m.code) + 1);
  };

  for (const a of awardees) {
    for (const m of used) {
      switch (m.filled_by) {
        case "public": {
          // Sengaja tidak semua awardee memenuhi targetnya, supaya kolom pemenuhan terlihat hidup.
          const jumlah = 6 + Math.floor(rand() * 18);
          for (let i = 0; i < jumlah; i++) add(a, m, { name: `${pick(NAMES)} ${pick(SURNAMES)}`, city: pick(CITIES), relation: pick(RELATIONS) });
          break;
        }
        case "self":
          add(a, m, { name: a.name, relation: m.name, submittedBy: userOfAwardee.get(a.id) ?? null, spread: 0.3 });
          break;
        case "peer":
          for (const peer of peersOf(a)) {
            if (rand() < 0.7) add(a, m, { name: peer.name, relation: m.name, submittedBy: userOfAwardee.get(peer.id) ?? null });
          }
          break;
        case "manwil":
          if (rand() < 0.8) add(a, m, { name: `Manwil wilayah ${a.region_id}`, relation: m.name, submittedBy: userOfRegion.get(a.region_id) ?? null });
          break;
        case "admin":
          if (rand() < 0.6) add(a, m, { name: "Admin program", relation: m.name, submittedBy: anyAdmin?.id ?? null });
          break;
      }
    }
  }
  perCycle.push({ cycle, awardees: awardees.length, counts, kosong: measurements.filter((m) => !used.includes(m)).map((m) => m.code) });
}

// ---------- tulis SQL ----------

// D1 kehabisan memori pada INSERT yang terlalu besar; 500 baris per statement aman.
const chunked = (table, columns, values) => {
  const out = [];
  for (let i = 0; i < values.length; i += 500) {
    out.push(`INSERT INTO ${table} (${columns}) VALUES\n${values.slice(i, i + 500).join(",\n")};`);
  }
  return out;
};

const filled = perCycle.filter((p) => !p.skipped).map((p) => p.cycle);
const toOpen = openCycles ? filled.filter((c) => c.status === "draft") : [];

const sql = [
  `DELETE FROM responses WHERE source = 'demo' AND period_id IN (${cycleIds});`,
  ...chunked(
    "responses",
    "id, period_id, awardee_id, measurement_id, respondent_name, respondent_city, relation, submitted_at, source, submitted_by",
    rows.responses,
  ),
  ...chunked("response_scores", "response_id, instrument_id, score", rows.scores),
  ...chunked("response_feedback", "response_id, field, body", rows.feedback),
  // Hanya draft → open, hanya untuk siklus yang barusan diisi.
  ...(toOpen.length ? [`UPDATE periods SET status = 'open' WHERE status = 'draft' AND id IN (${toOpen.map((c) => c.id).join(", ")});`] : []),
].join("\n\n");

write(sql);

// ---------- laporan ----------

for (const p of perCycle) {
  const c = p.cycle;
  if (p.skipped) {
    console.log(`${c.slug.padEnd(14)} dilewati: ${p.skipped}`);
    continue;
  }
  const detail = [...p.counts].map(([code, n]) => `${code} ${n}`).join(" · ");
  console.log(`${c.slug.padEnd(14)} ${String(p.awardees).padStart(3)} awardee   ${detail}${p.kosong.length ? `   (tanpa soal, dilewati: ${p.kosong.join(", ")})` : ""}`);
}
console.log(`${rows.responses.length} respons, ${rows.scores.length} skor, ${rows.feedback.length} saran → .seed/demo.sql`);

if (!sqlOnly) apply(".seed/demo.sql");

if (toOpen.length) console.log(`Siklus ${sqlOnly ? "akan dibuka" : "dibuka"} (draft → open): ${toOpen.map((c) => c.slug).join(", ")}`);
const masihDraft = filled.filter((c) => c.status === "draft" && !openCycles);
if (masihDraft.length) {
  console.log(`\nPERHATIAN: ${masihDraft.map((c) => c.slug).join(", ")} masih draft, jadi belum tampil di halaman Hasil dan Analitik.`);
  console.log("Buka dari konsol Admin (menu Siklus), atau jalankan ulang dengan --buka-siklus.");
}
