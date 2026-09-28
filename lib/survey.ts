import { env } from "cloudflare:workers";
import type { FeedbackField, FormConfig } from "./data/form-config.ts";
import { boundedText, receiptCode, validateFeedback, validateScores } from "./data/validation.ts";

// ---------- tipe ----------

export type { FeedbackField, FormConfig };

export type PublicAwardee = {
  id: number;
  name: string;
  campus: string | null;
  region: string;
  referralCode: string;
};

export type PublicInstrument = {
  id: number;
  code: string;
  text: string;
  category: string;
  scaleMax: number;
};

export type PublicPeriod = { id: number; slug: string; name: string; closesAt: string | null };

// Jenis pengukuran yang sedang dibuka. Alamat form publik memakai slug-nya, karena satu siklus bisa
// membuka beberapa jenis publik sekaligus (mis. PU dan LA di Siklus Tengah).
export type PublicMeasurement = { id: number; slug: string; name: string };

export type OpenForm = {
  awardee: PublicAwardee;
  period: PublicPeriod;
  measurement: PublicMeasurement;
  config: FormConfig;
  instruments: PublicInstrument[];
};

export type FormLookup =
  | { status: "not_found" }
  | { status: "unavailable"; reason: "not_started" | "closed"; awardee: PublicAwardee; period: PublicPeriod; measurement: PublicMeasurement; config: FormConfig }
  | { status: "open"; form: OpenForm };

// ---------- util ----------

const REFERRAL_PATTERN = /^[A-Z0-9]{4,16}$/;
export const normalizeReferral = (value: string) => decodeURIComponent(value).trim().toUpperCase();

const before = (iso: string | null, now: number) => iso !== null && now < Date.parse(iso);
const after = (iso: string | null, now: number) => iso !== null && now >= Date.parse(iso);

// Satu baris = satu jenis publik sebagaimana dijalankan satu siklus.
type FormRow = {
  period_id: number;
  period_slug: string;
  period_name: string;
  status: string;
  p_opens: string | null;
  p_closes: string | null;
  measurement_id: number;
  measurement_slug: string;
  measurement_name: string;
  form_config: string | null;
  m_opens: string | null;
  m_closes: string | null;
};

function periodState(row: FormRow, now: number): "open" | "not_started" | "closed" {
  if (row.status === "closed" || row.status === "archived" || after(row.p_closes, now)) return "closed";
  if (row.status !== "open" || before(row.p_opens, now)) return "not_started";
  return "open";
}

// Jendela jenis selalu di dalam jendela siklusnya: yang paling cepat menutup yang berlaku.
const windowOpen = (row: FormRow, now: number) => !before(row.m_opens, now) && !after(row.m_closes, now);

const FORM_ROWS = `SELECT p.id AS period_id, p.slug AS period_slug, p.name AS period_name, p.status,
      p.opens_at AS p_opens, p.closes_at AS p_closes,
      m.id AS measurement_id, m.slug AS measurement_slug, m.name AS measurement_name, m.form_config,
      pm.opens_at AS m_opens, pm.closes_at AS m_closes
   FROM periods p
   JOIN period_measurements pm ON pm.period_id = p.id
   JOIN measurements m ON m.id = pm.measurement_id
   WHERE m.filled_by = 'public' AND p.batch = ?`;

// ---------- query ----------

export async function findAwardee(referral: string): Promise<(PublicAwardee & { batch: string; photoKey: string | null }) | null> {
  const code = normalizeReferral(referral);
  if (!REFERRAL_PATTERN.test(code)) return null;
  const row = await env.DB.prepare(
    `SELECT a.id, a.name, c.name AS campus, a.referral_code, a.batch, a.photo_key, r.name AS region
     FROM awardees a JOIN regions r ON r.id = a.region_id
     LEFT JOIN campuses c ON c.id = a.campus_id
     WHERE a.referral_code = ?`,
  ).bind(code).first<{ id: number; name: string; campus: string | null; referral_code: string; batch: string; photo_key: string | null; region: string }>();
  if (!row) return null;
  return { id: row.id, name: row.name, campus: row.campus, region: row.region, referralCode: row.referral_code, batch: row.batch, photoKey: row.photo_key };
}

// Form publik yang sedang terbuka untuk awardee ini — bisa lebih dari satu jenis sekaligus.
export async function listOpenForms(referral: string) {
  const awardee = await findAwardee(referral);
  if (!awardee) return null;
  const { results } = await env.DB.prepare(`${FORM_ROWS} ORDER BY p.id, m.code`).bind(awardee.batch).all<FormRow>();
  const now = Date.now();
  const forms = results
    .filter((r) => r.form_config && periodState(r, now) === "open" && windowOpen(r, now))
    .map((r) => ({
      slug: r.measurement_slug,
      name: r.measurement_name,
      title: (JSON.parse(r.form_config!) as FormConfig).title,
      closesAt: r.m_closes ?? r.p_closes,
    }));
  return { awardee, forms };
}

// slug di alamat menunjuk JENIS pengukuran, bukan siklus: siklusnya ditentukan dari angkatan awardee.
export async function getPublicForm(referral: string, slug: string): Promise<FormLookup> {
  const awardee = await findAwardee(referral);
  if (!awardee) return { status: "not_found" };
  const row = await env.DB.prepare(`${FORM_ROWS} AND m.slug = ? ORDER BY p.id DESC`)
    .bind(awardee.batch, slug)
    .first<FormRow>();
  if (!row?.form_config) return { status: "not_found" };

  const config = JSON.parse(row.form_config) as FormConfig;
  const publicPeriod: PublicPeriod = { id: row.period_id, slug: row.period_slug, name: row.period_name, closesAt: row.m_closes ?? row.p_closes };
  const measurement: PublicMeasurement = { id: row.measurement_id, slug: row.measurement_slug, name: row.measurement_name };
  const publicAwardee: PublicAwardee = { id: awardee.id, name: awardee.name, campus: awardee.campus, region: awardee.region, referralCode: awardee.referralCode };

  const now = Date.now();
  const state = periodState(row, now);
  if (state !== "open" || !windowOpen(row, now)) {
    return { status: "unavailable", reason: state === "open" ? "closed" : state, awardee: publicAwardee, period: publicPeriod, measurement, config };
  }

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.code, i.statement, i.scale_max, m.name AS category
     FROM instruments i JOIN measurements m ON m.id = i.measurement_id
     WHERE i.measurement_id = ? ORDER BY i.order_index`,
  ).bind(row.measurement_id).all<{ id: number; code: string; statement: string; scale_max: number; category: string }>();

  return {
    status: "open",
    form: {
      awardee: publicAwardee,
      period: publicPeriod,
      measurement,
      config,
      instruments: results.map((r) => ({ id: r.id, code: r.code, text: r.statement, category: r.category, scaleMax: r.scale_max })),
    },
  };
}

// ---------- validasi kiriman ----------

export type Submission = {
  name: string;
  city: string;
  relationIndex: number;
  relationDetail?: string;
  knownDuration?: string;
  scores: Record<string, number>;
  feedback: Partial<Record<FeedbackField, string>>;
};

export type ValidSubmission = {
  name: string;
  city: string;
  relation: string;
  knownDuration: string | null;
  scores: [instrumentId: number, score: number][];
  feedback: [field: FeedbackField, body: string][];
};

const text = boundedText;

export function validateSubmission(form: OpenForm, input: Partial<Submission>): { ok: true; value: ValidSubmission } | { ok: false; message: string } {
  const name = text(input.name, 120);
  const city = text(input.city, 120);
  if (!name) return { ok: false, message: `${form.config.identity.name} wajib diisi.` };
  if (!city) return { ok: false, message: `${form.config.identity.city} wajib diisi.` };
  if (name.length > 120 || city.length > 120) return { ok: false, message: "Nama dan kota maksimal 120 karakter." };

  // Hubungan sekarang hanya dicatat, tidak lagi memilih tipe responden: jenisnya sudah ditentukan oleh
  // form yang dibuka. Itu yang membuat lima tipe Leadership Project bisa lebur jadi satu LA.
  const option = Number.isInteger(input.relationIndex) ? form.config.relation.options[input.relationIndex as number] : undefined;
  if (!option) return { ok: false, message: "Pilih hubungan Anda dengan awardee." };
  let relation = option.label;
  if (option.detail) {
    const detail = text(input.relationDetail, 200);
    if (!detail) return { ok: false, message: "Sebutkan hubungan Anda dengan awardee." };
    if (detail.length > 200) return { ok: false, message: "Keterangan hubungan maksimal 200 karakter." };
    relation = `${option.label}: ${detail}`;
  }

  let knownDuration: string | null = null;
  if (form.config.knownDuration) {
    knownDuration = typeof input.knownDuration === "string" && form.config.knownDuration.options.includes(input.knownDuration) ? input.knownDuration : null;
    if (!knownDuration) return { ok: false, message: "Pilih berapa lama Anda mengenal awardee." };
  }

  const scores = validateScores(form.instruments, input.scores);
  if (!scores.ok) return scores;
  const feedback = validateFeedback(form.config.feedback, input.feedback);
  if (!feedback.ok) return feedback;

  return { ok: true, value: { name, city, relation, knownDuration, scores: scores.value, feedback: feedback.value } };
}

// ---------- simpan ----------

export async function saveResponse(form: OpenForm, value: ValidSubmission, fingerprint: string): Promise<string> {
  const publicId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      `INSERT INTO responses (public_id, period_id, awardee_id, measurement_id, respondent_name, respondent_city,
                              relation, known_duration, submitted_at, source, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'app', ?)`,
    ).bind(publicId, form.period.id, form.awardee.id, form.measurement.id, value.name, value.city, value.relation, value.knownDuration, new Date().toISOString(), fingerprint),
    // Skor & saran ditulis lewat json_each supaya tetap satu parameter — D1 membatasi 100 parameter per query.
    env.DB.prepare(
      `INSERT INTO response_scores (response_id, instrument_id, score)
       SELECT r.id, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]')
       FROM responses r, json_each(?) j WHERE r.public_id = ?`,
    ).bind(JSON.stringify(value.scores), publicId),
  ];
  if (value.feedback.length > 0) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO response_feedback (response_id, field, body)
         SELECT r.id, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]')
         FROM responses r, json_each(?) j WHERE r.public_id = ?`,
      ).bind(JSON.stringify(value.feedback), publicId),
    );
  }
  await env.DB.batch(statements);
  return publicId;
}

export { receiptCode };
