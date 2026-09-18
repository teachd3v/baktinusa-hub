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

export type OpenForm = {
  awardee: PublicAwardee;
  period: PublicPeriod;
  config: FormConfig;
  instruments: PublicInstrument[];
  // Kode tipe responden -> id, hanya tipe publik yang sedang dibuka di periode ini.
  openTypes: Map<string, number>;
};

export type FormLookup =
  | { status: "not_found" }
  | { status: "unavailable"; reason: "not_started" | "closed"; awardee: PublicAwardee; period: PublicPeriod; config: FormConfig }
  | { status: "open"; form: OpenForm };

// ---------- util ----------

const REFERRAL_PATTERN = /^[A-Z0-9]{4,16}$/;
export const normalizeReferral = (value: string) => decodeURIComponent(value).trim().toUpperCase();

const before = (iso: string | null, now: number) => iso !== null && now < Date.parse(iso);
const after = (iso: string | null, now: number) => iso !== null && now >= Date.parse(iso);

type PeriodRow = {
  id: number;
  slug: string;
  name: string;
  status: string;
  opens_at: string | null;
  closes_at: string | null;
  form_config: string | null;
};

type TypeRow = { period_id: number; id: number; code: string; opens_at: string | null; closes_at: string | null };

function periodState(period: PeriodRow, now: number): "open" | "not_started" | "closed" {
  if (period.status === "closed" || period.status === "archived" || after(period.closes_at, now)) return "closed";
  if (period.status !== "open" || before(period.opens_at, now)) return "not_started";
  return "open";
}

const typeIsOpen = (t: TypeRow, now: number) => !before(t.opens_at, now) && !after(t.closes_at, now);

// ---------- query ----------

export async function findAwardee(referral: string): Promise<(PublicAwardee & { batch: string; photoKey: string | null }) | null> {
  const code = normalizeReferral(referral);
  if (!REFERRAL_PATTERN.test(code)) return null;
  const row = await env.DB.prepare(
    `SELECT a.id, a.name, a.campus, a.referral_code, a.batch, a.photo_key, r.name AS region
     FROM awardees a JOIN regions r ON r.id = a.region_id
     WHERE a.referral_code = ?`,
  ).bind(code).first<{ id: number; name: string; campus: string | null; referral_code: string; batch: string; photo_key: string | null; region: string }>();
  if (!row) return null;
  return { id: row.id, name: row.name, campus: row.campus, region: row.region, referralCode: row.referral_code, batch: row.batch, photoKey: row.photo_key };
}

async function publicTypes(periodIds: number[]): Promise<TypeRow[]> {
  if (periodIds.length === 0) return [];
  const { results } = await env.DB.prepare(
    `SELECT prt.period_id, rt.id, rt.code, prt.opens_at, prt.closes_at
     FROM period_respondent_types prt JOIN respondent_types rt ON rt.id = prt.respondent_type_id
     WHERE rt.audience = 'external' AND prt.period_id IN (SELECT value FROM json_each(?))`,
  ).bind(JSON.stringify(periodIds)).all<TypeRow>();
  return results;
}

// Form publik yang sedang terbuka untuk awardee ini (bisa lebih dari satu periode sekaligus).
export async function listOpenForms(referral: string) {
  const awardee = await findAwardee(referral);
  if (!awardee) return null;
  const { results: periods } = await env.DB.prepare(
    "SELECT id, slug, name, status, opens_at, closes_at, form_config FROM periods WHERE batch = ? ORDER BY id",
  ).bind(awardee.batch).all<PeriodRow>();
  const now = Date.now();
  const types = await publicTypes(periods.map((p) => p.id));
  const forms = periods
    .filter((p) => p.form_config && periodState(p, now) === "open" && types.some((t) => t.period_id === p.id && typeIsOpen(t, now)))
    .map((p) => ({ slug: p.slug, name: p.name, title: (JSON.parse(p.form_config!) as FormConfig).title, closesAt: p.closes_at }));
  return { awardee, forms };
}

export async function getPublicForm(referral: string, slug: string): Promise<FormLookup> {
  const awardee = await findAwardee(referral);
  if (!awardee) return { status: "not_found" };
  const period = await env.DB.prepare(
    "SELECT id, slug, name, status, opens_at, closes_at, form_config FROM periods WHERE slug = ? AND batch = ?",
  ).bind(slug, awardee.batch).first<PeriodRow>();
  if (!period?.form_config) return { status: "not_found" };

  const config = JSON.parse(period.form_config) as FormConfig;
  const publicPeriod: PublicPeriod = { id: period.id, slug: period.slug, name: period.name, closesAt: period.closes_at };
  const publicAwardee: PublicAwardee = { id: awardee.id, name: awardee.name, campus: awardee.campus, region: awardee.region, referralCode: awardee.referralCode };

  const now = Date.now();
  const state = periodState(period, now);
  const types = (await publicTypes([period.id])).filter((t) => typeIsOpen(t, now));
  if (state !== "open" || types.length === 0) {
    return { status: "unavailable", reason: state === "open" ? "closed" : state, awardee: publicAwardee, period: publicPeriod, config };
  }

  const { results } = await env.DB.prepare(
    `SELECT i.id, i.code, i.text_public, i.scale_max, c.name AS category
     FROM instruments i JOIN instrument_categories c ON c.id = i.category_id
     WHERE i.period_id = ? ORDER BY c.order_index, i.order_index`,
  ).bind(period.id).all<{ id: number; code: string; text_public: string; scale_max: number; category: string }>();

  return {
    status: "open",
    form: {
      awardee: publicAwardee,
      period: publicPeriod,
      config,
      instruments: results.map((r) => ({ id: r.id, code: r.code, text: r.text_public, category: r.category, scaleMax: r.scale_max })),
      openTypes: new Map(types.map((t) => [t.code, t.id])),
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
  respondentTypeId: number;
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

  const option = Number.isInteger(input.relationIndex) ? form.config.relation.options[input.relationIndex as number] : undefined;
  const respondentTypeId = option ? form.openTypes.get(option.type) : undefined;
  if (!option || respondentTypeId === undefined) return { ok: false, message: "Pilih hubungan Anda dengan awardee." };
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

  return { ok: true, value: { respondentTypeId, name, city, relation, knownDuration, scores: scores.value, feedback: feedback.value } };
}

// ---------- simpan ----------

export async function saveResponse(form: OpenForm, value: ValidSubmission, fingerprint: string): Promise<string> {
  const publicId = crypto.randomUUID();
  const statements = [
    env.DB.prepare(
      `INSERT INTO responses (public_id, period_id, awardee_id, respondent_type_id, respondent_name, respondent_city,
                              relation, known_duration, submitted_at, source, fingerprint)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'app', ?)`,
    ).bind(publicId, form.period.id, form.awardee.id, value.respondentTypeId, value.name, value.city, value.relation, value.knownDuration, new Date().toISOString(), fingerprint),
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
