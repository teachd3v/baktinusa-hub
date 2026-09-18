// Verifikasi impor BA15 terhadap dashboard lama.
//
// 1. Menjalankan dataLoader.js lama apa adanya terhadap sheet dashboard.
// 2. Menghitung ulang angka yang sama dari isi D1 dengan batas kategori LAMA (Q1–19 / Q20–39 / Q40–50);
//    hasilnya harus identik, kecuali untuk baris yang memang berbeda sumbernya.
// 3. Menghitung dengan batas kategori dari rubrik (disimpan di D1) dan melaporkan dampak perbaikan Q19.
//
// Pakai:
//   npx wrangler d1 export baktinusa-hub-db --local --output .import/d1-local.sql   (atau --remote)
//   node --env-file=.env.import scripts/verify-ba15.mjs .import/d1-local.sql

import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";
import Papa from "papaparse";

const dumpPath = process.argv[2];
if (!dumpPath) throw new Error("Berikan path file dump D1, mis. .import/d1-local.sql");
const oldLoaderPath = process.env.BA15_OLD_DATALOADER;
if (!oldLoaderPath) throw new Error("Variabel BA15_OLD_DATALOADER belum diisi di .env.import");

const db = new DatabaseSync(":memory:");
db.exec(await readFile(dumpPath, "utf8"));

// ---------- angka dashboard lama ----------

const fetchCsv = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengambil CSV (${res.status})`);
  return Papa.parse(await res.text(), { header: true, dynamicTyping: true, skipEmptyLines: true }).data;
};
const { reconstructSurveyData } = await import(pathToFileURL(oldLoaderPath).href);
const old = reconstructSurveyData(
  await fetchCsv(process.env.BA15_CSV_ASSESSMENT),
  await fetchCsv(process.env.BA15_CSV_INSTRUMEN_ASSESSMENT),
  await fetchCsv(process.env.BA15_CSV_LEADPRO),
  await fetchCsv(process.env.BA15_CSV_INSTRUMEN_LEADPRO),
);

// ---------- angka dari D1 ----------

const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/['’`]/g, "").replace(/\s+/g, " ");
const r3 = (x) => Number.parseFloat(x.toFixed(3));
const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);

const awardees = db.prepare("SELECT id, name FROM awardees").all();
const awardeeIdByName = new Map(awardees.map((a) => [normName(a.name), a.id]));
const types = db.prepare("SELECT id, name FROM respondent_types").all();
const typeIdByName = new Map(types.map((t) => [t.name, t.id]));
const categories = db.prepare("SELECT id, period_id, name, weight, order_index FROM instrument_categories ORDER BY period_id, order_index").all();

const groups = db.prepare(`
  SELECT r.awardee_id AS a, r.respondent_type_id AS t, i.period_id AS p, i.order_index AS q, i.category_id AS c,
         AVG(s.score) AS avg, COUNT(*) AS n
  FROM responses r
  JOIN response_scores s ON s.response_id = r.id
  JOIN instruments i ON i.id = s.instrument_id
  GROUP BY r.awardee_id, r.respondent_type_id, s.instrument_id`).all();
const responseCounts = new Map(
  db.prepare("SELECT awardee_id AS a, respondent_type_id AS t, COUNT(*) AS n FROM responses GROUP BY 1, 2").all().map((x) => [`${x.a}|${x.t}`, x.n]),
);

// Rata-rata per pertanyaan untuk sekumpulan tipe responden (bobot = jumlah responden, seperti dataLoader lama).
function questionAverages(awardeeId, typeIds) {
  const acc = new Map();
  for (const g of groups) {
    if (g.a !== awardeeId || !typeIds.includes(g.t)) continue;
    const cur = acc.get(g.q) ?? { sum: 0, n: 0, c: g.c };
    cur.sum += g.avg * g.n;
    cur.n += g.n;
    acc.set(g.q, cur);
  }
  return new Map([...acc].map(([q, v]) => [q, { avg: v.sum / v.n, c: v.c }]));
}
const byRange = (qa, from, to) => mean([...qa].filter(([q]) => q >= from && q <= to).map(([, v]) => v.avg));
const byCategory = (qa, categoryId) => mean([...qa].filter(([, v]) => v.c === categoryId).map(([, v]) => v.avg));

function assessmentOld(qa) {
  const sm = r3(byRange(qa, 1, 19)), ce = r3(byRange(qa, 20, 39)), bi = r3(byRange(qa, 40, 50));
  return { self_maturity: sm, competency_enrichment: ce, bringing_inspiration: bi, ipk: r3((sm + ce + bi) / 3) };
}
function assessmentNew(qa) {
  const cats = categories.filter((c) => c.period_id === 1);
  const [sm, ce, bi] = cats.map((c) => r3(byCategory(qa, c.id)));
  const totalWeight = cats.reduce((s, c) => s + c.weight, 0);
  return { self_maturity: sm, competency_enrichment: ce, bringing_inspiration: bi, ipk: r3(cats.reduce((s, c, i) => s + [sm, ce, bi][i] * c.weight, 0) / totalWeight) };
}
function leadproOld(qa) {
  const d = r3(byRange(qa, 1, 7)), p = r3(byRange(qa, 8, 12)), k = r3(byRange(qa, 13, 17)), rf = r3(byRange(qa, 18, 22));
  return { dampak: d, peran: p, kapasitas: k, refleksi: rf, ipk: r3((d + p + k + rf) / 4) };
}

// ---------- 1) D1 dengan batas lama == dashboard lama ----------

const mismatches = [];
const compare = (awardee, label, fields, oldStat, oldCount, d1Stat, d1Count) => {
  if (oldCount !== d1Count) mismatches.push({ awardee, label, field: "respondent_count", old: oldCount, d1: d1Count });
  for (const f of fields) if (oldStat[f] !== d1Stat[f]) mismatches.push({ awardee, label, field: f, old: oldStat[f], d1: d1Stat[f] });
};
let comparedGroups = 0;
for (const [name, aw] of Object.entries(old.assessments)) {
  const awardeeId = awardeeIdByName.get(normName(name));
  for (const [category, stat] of Object.entries(aw.stats)) {
    const typeId = typeIdByName.get(category);
    compare(name, category, ["self_maturity", "competency_enrichment", "bringing_inspiration", "ipk"],
      stat, stat.respondent_count, assessmentOld(questionAverages(awardeeId, [typeId])), responseCounts.get(`${awardeeId}|${typeId}`) ?? 0);
    comparedGroups++;
  }
}
const leadproTypeIds = types.filter((t) => t.id >= 6).map((t) => t.id);
for (const [name, lp] of Object.entries(old.leadpro)) {
  const awardeeId = awardeeIdByName.get(normName(name));
  const overallCount = leadproTypeIds.reduce((s, t) => s + (responseCounts.get(`${awardeeId}|${t}`) ?? 0), 0);
  compare(name, "Leadpro (keseluruhan)", ["dampak", "peran", "kapasitas", "refleksi", "ipk"],
    lp.overall, lp.overall.respondent_count, leadproOld(questionAverages(awardeeId, leadproTypeIds)), overallCount);
  comparedGroups++;
  for (const [relation, stat] of Object.entries(lp.by_relation)) {
    const typeId = typeIdByName.get(relation);
    compare(name, `Leadpro · ${relation}`, ["dampak", "peran", "kapasitas", "refleksi", "ipk"],
      stat, stat.respondent_count, leadproOld(questionAverages(awardeeId, [typeId])), responseCounts.get(`${awardeeId}|${typeId}`) ?? 0);
    comparedGroups++;
  }
}

// ---------- 2) dampak perbaikan batas kategori ----------

const deltas = [];
for (const a of awardees) {
  for (const t of types.filter((x) => x.id <= 5)) {
    if (!responseCounts.get(`${a.id}|${t.id}`)) continue;
    const qa = questionAverages(a.id, [t.id]);
    const before = assessmentOld(qa), after = assessmentNew(qa);
    deltas.push({ awardee: a.name, type: t.name, before, after, diff: Object.fromEntries(Object.keys(before).map((k) => [k, r3(after[k] - before[k])])) });
  }
}
const summarize = (field) => {
  const xs = deltas.map((d) => d.diff[field]);
  const abs = xs.map(Math.abs);
  return { berubah: xs.filter((x) => x !== 0).length, dari: xs.length, naik: xs.filter((x) => x > 0).length, turun: xs.filter((x) => x < 0).length, rata_abs: r3(mean(abs)), maks_abs: r3(Math.max(...abs)) };
};

// ---------- 3) integritas ----------

const integrity = {
  foreign_key_violations: db.prepare("PRAGMA foreign_key_check").all().length,
  respons_skor_tidak_lengkap: db.prepare(`
    SELECT COUNT(*) AS n FROM responses r
    WHERE (SELECT COUNT(*) FROM response_scores s WHERE s.response_id = r.id)
       <> (SELECT COUNT(*) FROM instruments i WHERE i.period_id = r.period_id)`).get().n,
  skor_di_luar_skala: db.prepare(`
    SELECT COUNT(*) AS n FROM response_scores s JOIN instruments i ON i.id = s.instrument_id
    WHERE s.score < 0 OR s.score > i.scale_max`).get().n,
  awardee_tanpa_tepat_satu: Object.fromEntries(["Asesmen Awal", "Asesmen Tengah", "Manajer Wilayah"].map((name) => {
    const t = typeIdByName.get(name);
    return [name, awardees.filter((a) => (responseCounts.get(`${a.id}|${t}`) ?? 0) !== 1).map((a) => a.name)];
  })),
};

const result = {
  kelompok_dibandingkan: comparedGroups,
  selisih_batas_lama_vs_dashboard: mismatches,
  dampak_perbaikan_q19: {
    self_maturity: summarize("self_maturity"),
    competency_enrichment: summarize("competency_enrichment"),
    bringing_inspiration: summarize("bringing_inspiration"),
    ipk: summarize("ipk"),
  },
  integritas: integrity,
};
await writeFile(".import/verify-report.json", JSON.stringify({ ...result, rincian_dampak: deltas }, null, 2) + "\n", "utf8");
console.log(JSON.stringify(result, null, 2));
