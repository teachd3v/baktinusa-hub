// Impor data BA15 dari sistem lama (Google Sheets + CSV) menjadi file SQL untuk D1.
//
// Aturan rekonsiliasi:
// - Konten (skor, kategori responden, awardee, saran) diambil dari sheet dashboard lama,
//   karena itu versi yang sudah dibersihkan tim.
// - Metadata yang tidak ada di dashboard (waktu kirim, nama & kota penilai, hubungan, lama kenal)
//   diambil dari Sheet1 / Sheet2, yaitu kiriman mentah form.
// - Baris dipasangkan lewat sidik jari: nama awardee (tanpa apostrof, huruf kecil) + deret skor.
// - Baris Sheet1 yang tidak ada di dashboard tetap diimpor (source 'import:sheet1').
// - Baris dashboard yang tidak ada di Sheet1 diimpor kalau BA15_INCLUDE_DASHBOARD_ONLY=1 (source 'import:dashboard').
// - Batas kategori asesmen mengikuti rubrik (Q1–Q18, Q19–Q39, Q40–Q50), bukan rentang di dataLoader.js lama.
//
// Pakai:  node --env-file=.env.import scripts/import-ba15.mjs
// Keluaran .import/ba15.sql dan .import/ba15-report.json berisi data pribadi dan tidak boleh di-commit.

import { createSign } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import Papa from "papaparse";

const env = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") throw new Error(`Variabel ${name} belum diisi di .env.import`);
  return value;
};

const BATCH = "BA15";
const INCLUDE_DASHBOARD_ONLY = env("BA15_INCLUDE_DASHBOARD_ONLY", "1") === "1";
const ASSESSMENT_CLOSES_AT = "2026-06-24T16:59:00.000Z"; // 24 Juni 23:59 WIB, sesuai app eval-public
const LEADPRO_CLOSES_AT = "2026-06-24T16:59:59.000Z"; // 24 Juni 23:59:59 WIB, sesuai app leadpro-survey

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
const typeByName = new Map(RESPONDENT_TYPES.map((t) => [t.name, t]));

const PERIODS = [
  { id: 1, slug: "ba15-pengukuran", name: "BA15 · Pengukuran Awardee", kind: "assessment", closesAt: ASSESSMENT_CLOSES_AT, questions: 50 },
  { id: 2, slug: "ba15-leadpro", name: "BA15 · Leadership Project", kind: "leadpro", closesAt: LEADPRO_CLOSES_AT, questions: 22 },
];

// Target minimal dari dashboard lama (app.js): Manwil 1, Peer = awardee lain se-wilayah, Eksternal 20.
const PERIOD_TYPES = [
  { period: 1, type: 1, rule: "fixed", min: 1, closesAt: null },
  { period: 1, type: 2, rule: "fixed", min: 1, closesAt: null },
  { period: 1, type: 3, rule: "region_peers", min: null, closesAt: ASSESSMENT_CLOSES_AT },
  { period: 1, type: 4, rule: "fixed", min: 1, closesAt: ASSESSMENT_CLOSES_AT },
  { period: 1, type: 5, rule: "fixed", min: 20, closesAt: ASSESSMENT_CLOSES_AT },
  ...[6, 7, 8, 9, 10].map((type) => ({ period: 2, type, rule: "none", min: null, closesAt: LEADPRO_CLOSES_AT })),
];

// Pemetaan pilihan "hubungan" di form evaluasi publik ke tipe responden.
const categoryOfRelation = (relation) =>
  relation === "Manager Wilayah" ? "Manajer Wilayah"
  : relation === "Awardee angkatan se-Wilayah (Peer)" ? "Peer Awardee"
  : "Jejaring Eksternal";

// ---------- util ----------

const normName = (s) => String(s ?? "").trim().toLowerCase().replace(/['’`]/g, "").replace(/\s+/g, " ");
const clean = (s) => String(s ?? "").trim();
const cleanFeedback = (s) => {
  const v = clean(s);
  return v === "" || v === "-" ? null : v;
};
const parseScores = (cells, n, where) =>
  Array.from({ length: n }, (_, i) => {
    const v = Number.parseInt(clean(cells[i]), 10);
    if (!Number.isInteger(v) || v < 0 || v > 4) throw new Error(`Skor tidak valid di ${where}, Q${i + 1}: "${cells[i]}"`);
    return v;
  });
const fingerprint = (awardeeName, scores) => `${normName(awardeeName)}|${scores.join(",")}`;

async function readCsvFile(path) {
  return Papa.parse(await readFile(path, "utf8"), { header: true, skipEmptyLines: true }).data;
}

async function fetchCsv(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengambil CSV (${res.status})`);
  return Papa.parse(await res.text(), { header: true, skipEmptyLines: true }).data;
}

async function googleAccessToken(keyFile) {
  const key = JSON.parse(await readFile(keyFile, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 600,
  })}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(key.private_key, "base64url");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
  });
  if (!res.ok) throw new Error(`Gagal mendapat token Google (${res.status})`);
  return (await res.json()).access_token;
}

async function sheetRows(token, spreadsheetId, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Gagal membaca ${range} (${res.status})`);
  const values = (await res.json()).values ?? [];
  return values.slice(1).filter((row) => row.some((cell) => clean(cell) !== ""));
}

const sql = (value) =>
  value === null || value === undefined ? "NULL"
  : typeof value === "number" ? String(value)
  : `'${String(value).replaceAll("'", "''")}'`;

// D1 membatasi satu pernyataan SQL 100 KB, dan VALUES yang terlalu panjang membuat SQLite lokal kehabisan memori.
function insertStatements(table, columns, rows, maxBytes = 80_000, maxRows = 500) {
  const head = `INSERT INTO ${table} (${columns.join(", ")}) VALUES\n`;
  const out = [];
  let chunk = [];
  let size = head.length;
  for (const row of rows) {
    const tuple = `(${row.map(sql).join(", ")})`;
    if (chunk.length && (size + tuple.length + 2 > maxBytes || chunk.length >= maxRows)) {
      out.push(head + chunk.join(",\n") + ";");
      chunk = [];
      size = head.length;
    }
    chunk.push(tuple);
    size += tuple.length + 2;
  }
  if (chunk.length) out.push(head + chunk.join(",\n") + ";");
  return out;
}

// ---------- baca sumber ----------

const token = await googleAccessToken(env("BA15_GOOGLE_KEY_FILE"));
const spreadsheetId = env("BA15_SPREADSHEET_ID");
const [sheet1, sheet2, dashAssessment, dashLeadpro, instrAssessment, instrLeadpro, masterRows, rubricAssessment, rubricLeadpro] =
  await Promise.all([
    sheetRows(token, spreadsheetId, "Sheet1!A:CZ"),
    sheetRows(token, spreadsheetId, "Sheet2!A:CZ"),
    fetchCsv(env("BA15_CSV_ASSESSMENT")),
    fetchCsv(env("BA15_CSV_LEADPRO")),
    fetchCsv(env("BA15_CSV_INSTRUMEN_ASSESSMENT")),
    fetchCsv(env("BA15_CSV_INSTRUMEN_LEADPRO")),
    readCsvFile(env("BA15_AWARDEE_CSV")),
    readCsvFile(env("BA15_RUBRIK_ASSESSMENT")),
    readCsvFile(env("BA15_RUBRIK_LEADPRO")),
  ]);

const report = { sources: {}, warnings: [], counts: {} };
report.sources = {
  sheet1: sheet1.length, sheet2: sheet2.length,
  dashboardAssessment: dashAssessment.length, dashboardLeadpro: dashLeadpro.length,
  masterAwardees: masterRows.filter((r) => clean(r["Nama Awardee"])).length,
};

// ---------- wilayah & awardee ----------

const master = masterRows.filter((r) => clean(r["Nama Awardee"]));
const regionNames = [...new Set(master.map((r) => clean(r.Wilayah)))].sort((a, b) => a.localeCompare(b, "id"));
const regions = regionNames.map((name, i) => ({ id: i + 1, name }));
const regionId = new Map(regions.map((r) => [r.name, r.id]));

const numbers = master.map((r) => Number.parseInt(clean(r.No), 10));
const useSourceNumbers = new Set(numbers).size === master.length && numbers.every((n) => n >= 1 && n <= master.length);
const orderedMaster = useSourceNumbers
  ? master
  : [...master].sort((a, b) => clean(a.Wilayah).localeCompare(clean(b.Wilayah), "id") || clean(a["Nama Awardee"]).localeCompare(clean(b["Nama Awardee"]), "id"));
const awardees = orderedMaster.map((r, i) => ({
  id: useSourceNumbers ? Number.parseInt(clean(r.No), 10) : i + 1,
  regionId: regionId.get(clean(r.Wilayah)),
  name: clean(r["Nama Awardee"]),
  campus: clean(r.Kampus) || null,
  referral: clean(r.Referal),
  photoKey: `awardees/${BATCH.toLowerCase()}/${clean(r.Referal)}.webp`,
  leadproName: clean(r.Leadpro) || null,
  leadproField: clean(r.Bidang) || null,
  leadproDescription: clean(r["Deskripsi Leadpro"]) || null,
}));
report.counts.awardeeIdsFromSourceNumbering = useSourceNumbers;
const awardeeByName = new Map(awardees.map((a) => [normName(a.name), a]));
const awardeeByReferral = new Map(awardees.map((a) => [a.referral, a]));
const findAwardeeByName = (name, where) => {
  const a = awardeeByName.get(normName(name));
  if (!a) throw new Error(`Awardee "${name}" (${where}) tidak ada di daftar master`);
  return a;
};

// ---------- kategori & instrumen ----------

function buildCategories(periodId, rubric, startId) {
  const names = [];
  for (const r of rubric) {
    const name = clean(r.Kategori);
    if (name && !names.includes(name)) names.push(name);
  }
  return names.map((name, i) => ({ id: startId + i, periodId, name, order: i + 1 }));
}
const categories = [...buildCategories(1, rubricAssessment, 1)];
categories.push(...buildCategories(2, rubricLeadpro, categories.length + 1));
const categoryId = (periodId, name) => categories.find((c) => c.periodId === periodId && c.name === clean(name)).id;

function buildInstruments(periodId, instrumentRows, rubric, startId, textSelf, textPublic) {
  const rubricByNo = new Map(rubric.map((r) => [Number.parseInt(clean(r.No), 10), r]));
  return instrumentRows.map((row, i) => {
    const code = clean(row.Kode);
    const number = Number.parseInt(code.replace(/^Q/, ""), 10);
    const rubricRow = rubricByNo.get(number);
    if (!rubricRow) throw new Error(`Rubrik tidak punya nomor ${code}`);
    const publicText = clean(row[textPublic]);
    if (normName(publicText) !== normName(rubricRow["Indikator Penilaian"])) {
      report.warnings.push(`Teks ${code} (periode ${periodId}) berbeda antara sheet instrumen dan rubrik CSV; memakai versi sheet.`);
    }
    return {
      id: startId + i, periodId, categoryId: categoryId(periodId, rubricRow.Kategori), code,
      textSelf: textSelf ? clean(row[textSelf]) || null : null, textPublic: publicText, order: number,
    };
  });
}
const instruments = buildInstruments(1, instrAssessment, rubricAssessment, 1, "Pertanyaan Assesmen Awal & Tengah", "Pertanyaan Manajer Wilayah dan Jejaring Eksternal");
instruments.push(...buildInstruments(2, instrLeadpro, rubricLeadpro, instruments.length + 1, null, "Pertanyaan"));
const instrumentIds = (periodId) => instruments.filter((x) => x.periodId === periodId).sort((a, b) => a.order - b.order).map((x) => x.id);

// ---------- respons: periode pengukuran ----------

const responses = [];
const scores = [];
const feedback = [];
const addResponse = (r, scoreList, fb) => {
  const id = responses.length + 1;
  responses.push({ id, ...r });
  instrumentIds(r.periodId).forEach((instrumentId, i) => scores.push([id, instrumentId, scoreList[i]]));
  for (const [field, body] of Object.entries(fb)) if (body) feedback.push([id, field, body]);
};
const Q = (n) => Array.from({ length: n }, (_, i) => `Q${i + 1}`);

// 1) Asesmen mandiri: hanya ada di dashboard.
const selfRows = dashAssessment.filter((r) => /^Asesmen (Awal|Tengah)$/.test(clean(r.Kategori)));
for (const r of selfRows) {
  const a = findAwardeeByName(r["Nama Awardee"], "asesmen mandiri");
  addResponse(
    { periodId: 1, awardeeId: a.id, typeId: typeByName.get(clean(r.Kategori)).id, name: null, city: null, relation: null, duration: null, submittedAt: null, source: "import:dashboard" },
    parseScores(Q(50).map((q) => r[q]), 50, `dashboard asesmen ${a.name}`),
    { saran_diri: cleanFeedback(r["Saran Diri"]), saran_program: cleanFeedback(r["Saran Program"]) },
  );
}

// 2) Evaluasi publik: pasangkan dashboard dengan Sheet1.
const dashPublic = dashAssessment.filter((r) => !/^Asesmen (Awal|Tengah)$/.test(clean(r.Kategori)));
const dashPool = new Map();
dashPublic.forEach((r, i) => {
  const key = fingerprint(r["Nama Awardee"], parseScores(Q(50).map((q) => r[q]), 50, `dashboard baris ${i + 2}`));
  dashPool.set(key, [...(dashPool.get(key) ?? []), i]);
});
const usedDash = new Set();
let referralNameMismatch = 0;
const sheet1Only = [];
sheet1.forEach((row, i) => {
  const where = `Sheet1 baris ${i + 2}`;
  const rowScores = parseScores(row.slice(8, 58), 50, where);
  const bySheetReferral = awardeeByReferral.get(clean(row[1]));
  if (!bySheetReferral || normName(bySheetReferral.name) !== normName(row[2])) referralNameMismatch++;
  const candidates = dashPool.get(fingerprint(row[2], rowScores));
  const dashIndex = candidates?.length ? candidates.shift() : undefined;
  const meta = { name: clean(row[4]) || null, city: clean(row[5]) || null, relation: clean(row[6]) || null, duration: clean(row[7]) || null, submittedAt: clean(row[0]) || null, source: "import:sheet1" };
  if (dashIndex !== undefined) {
    usedDash.add(dashIndex);
    const d = dashPublic[dashIndex];
    const a = findAwardeeByName(d["Nama Awardee"], where);
    addResponse({ periodId: 1, awardeeId: a.id, typeId: typeByName.get(clean(d.Kategori)).id, ...meta }, rowScores,
      { saran_diri: cleanFeedback(d["Saran Diri"]), saran_program: cleanFeedback(d["Saran Program"]) });
  } else {
    const a = bySheetReferral ?? findAwardeeByName(row[2], where);
    const type = categoryOfRelation(clean(row[6]));
    sheet1Only.push({ awardee: a.name, type, submittedAt: meta.submittedAt });
    addResponse({ periodId: 1, awardeeId: a.id, typeId: typeByName.get(type).id, ...meta }, rowScores,
      { saran_diri: cleanFeedback(row[58]), saran_program: cleanFeedback(row[59]) });
  }
});
const dashboardOnly = dashPublic.map((r, i) => ({ r, i })).filter(({ i }) => !usedDash.has(i));
for (const { r, i } of dashboardOnly) {
  if (!INCLUDE_DASHBOARD_ONLY) continue;
  const a = findAwardeeByName(r["Nama Awardee"], `dashboard baris ${i + 2}`);
  addResponse(
    { periodId: 1, awardeeId: a.id, typeId: typeByName.get(clean(r.Kategori)).id, name: null, city: null, relation: null, duration: null, submittedAt: null, source: "import:dashboard" },
    parseScores(Q(50).map((q) => r[q]), 50, `dashboard baris ${i + 2}`),
    { saran_diri: cleanFeedback(r["Saran Diri"]), saran_program: cleanFeedback(r["Saran Program"]) },
  );
}
report.counts.sheet1ReferralNameMismatch = referralNameMismatch;
report.counts.sheet1Only = sheet1Only;
report.counts.dashboardOnly = dashboardOnly.map(({ r }) => ({ awardee: clean(r["Nama Awardee"]), type: clean(r.Kategori), included: INCLUDE_DASHBOARD_ONLY }));

// ---------- respons: periode Leadership Project ----------

const lpKey = (name, relation, list) => `${normName(name)}|${normName(relation)}|${list.join(",")}`;
const lpPool = new Map();
dashLeadpro.forEach((r, i) => {
  const key = lpKey(r["Nama Awardee"], r.Hubungan, parseScores(Q(22).map((q) => r[q]), 22, `dashboard leadpro baris ${i + 2}`));
  lpPool.set(key, [...(lpPool.get(key) ?? []), i]);
});
let leadproUnmatched = 0;
sheet2.forEach((row, i) => {
  const where = `Sheet2 baris ${i + 2}`;
  const rowScores = parseScores(row.slice(7, 29), 22, where);
  const relation = clean(row[6]);
  const a = awardeeByReferral.get(clean(row[1])) ?? findAwardeeByName(row[2], where);
  const type = typeByName.get(relation);
  if (!type || type.id < 6) throw new Error(`Hubungan leadpro tidak dikenal di ${where}: "${relation}"`);
  const candidates = lpPool.get(lpKey(row[2], relation, rowScores));
  const d = candidates?.length ? dashLeadpro[candidates.shift()] : null;
  if (!d) leadproUnmatched++;
  addResponse(
    { periodId: 2, awardeeId: a.id, typeId: type.id, name: clean(row[4]) || null, city: clean(row[5]) || null, relation, duration: null, submittedAt: clean(row[0]) || null, source: "import:sheet2" },
    rowScores,
    d
      ? { pesan: cleanFeedback(d.Pesan), kritik: cleanFeedback(d.Kritik), saran_keberlanjutan: cleanFeedback(d.Saran) }
      : { pesan: cleanFeedback(row[29]), kritik: cleanFeedback(row[30]), saran_keberlanjutan: cleanFeedback(row[31]) },
  );
});
report.counts.leadproUnmatched = leadproUnmatched;

// ---------- ringkasan ----------

const tally = {};
for (const r of responses) {
  const key = `${PERIODS.find((p) => p.id === r.periodId).slug} · ${RESPONDENT_TYPES.find((t) => t.id === r.typeId).name}`;
  tally[key] = (tally[key] ?? 0) + 1;
}
Object.assign(report.counts, {
  regions: regions.length, awardees: awardees.length, categories: categories.length, instruments: instruments.length,
  responses: responses.length, scores: scores.length, feedback: feedback.length, perPeriodType: tally,
});

// ---------- tulis SQL ----------

const out = [
  "-- Dihasilkan oleh scripts/import-ba15.mjs. Berisi data pribadi: jangan di-commit.",
  `DELETE FROM responses WHERE period_id IN (SELECT id FROM periods WHERE batch = ${sql(BATCH)});`,
  `DELETE FROM periods WHERE batch = ${sql(BATCH)};`,
  `DELETE FROM awardees WHERE batch = ${sql(BATCH)};`,
  ...regions.map((r) => `INSERT INTO regions (id, name) VALUES (${r.id}, ${sql(r.name)}) ON CONFLICT(id) DO UPDATE SET name = excluded.name;`),
  ...RESPONDENT_TYPES.map((t) => `INSERT INTO respondent_types (id, code, name, audience) VALUES (${t.id}, ${sql(t.code)}, ${sql(t.name)}, ${sql(t.audience)}) ON CONFLICT(id) DO UPDATE SET code = excluded.code, name = excluded.name, audience = excluded.audience;`),
  ...insertStatements("awardees", ["id", "region_id", "batch", "name", "campus", "referral_code", "photo_key", "leadpro_name", "leadpro_field", "leadpro_description"],
    awardees.map((a) => [a.id, a.regionId, BATCH, a.name, a.campus, a.referral, a.photoKey, a.leadproName, a.leadproField, a.leadproDescription])),
  ...insertStatements("periods", ["id", "slug", "name", "batch", "kind", "opens_at", "closes_at", "status"],
    PERIODS.map((p) => [p.id, p.slug, p.name, BATCH, p.kind, null, p.closesAt, "closed"])),
  ...insertStatements("period_respondent_types", ["period_id", "respondent_type_id", "target_rule", "target_min", "opens_at", "closes_at"],
    PERIOD_TYPES.map((x) => [x.period, x.type, x.rule, x.min, null, x.closesAt])),
  ...insertStatements("instrument_categories", ["id", "period_id", "name", "weight", "order_index"],
    categories.map((c) => [c.id, c.periodId, c.name, 1, c.order])),
  ...insertStatements("instruments", ["id", "period_id", "category_id", "code", "text_self", "text_public", "scale_max", "order_index"],
    instruments.map((x) => [x.id, x.periodId, x.categoryId, x.code, x.textSelf, x.textPublic, 4, x.order])),
  ...insertStatements("responses", ["id", "period_id", "awardee_id", "respondent_type_id", "respondent_name", "respondent_city", "relation", "known_duration", "submitted_at", "source"],
    responses.map((r) => [r.id, r.periodId, r.awardeeId, r.typeId, r.name, r.city, r.relation, r.duration, r.submittedAt, r.source])),
  ...insertStatements("response_scores", ["response_id", "instrument_id", "score"], scores),
  ...insertStatements("response_feedback", ["response_id", "field", "body"], feedback),
];

await mkdir(".import", { recursive: true });
await writeFile(".import/ba15.sql", out.join("\n") + "\n", "utf8");
await writeFile(".import/ba15-report.json", JSON.stringify(report, null, 2) + "\n", "utf8");

// Ringkasan ke terminal: hanya hitungan dan nama awardee, tanpa nama responden atau isi saran.
console.log(JSON.stringify({ sources: report.sources, counts: { ...report.counts, sheet1Only: report.counts.sheet1Only.length, dashboardOnly: report.counts.dashboardOnly.length } }, null, 2));
console.log("baris hanya di Sheet1:", report.counts.sheet1Only);
console.log("baris hanya di dashboard:", report.counts.dashboardOnly);
if (report.warnings.length) console.log("peringatan:", report.warnings);
console.log(`\nSQL: .import/ba15.sql (${out.length} pernyataan)`);
