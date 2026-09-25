import { parseFormConfig, type FeedbackItem, type ScaleOption } from "./form-config.ts";
import { ScopeError, awardeeFilter, scopeFor, type Role, type SessionUser } from "./scope.ts";
import { receiptCode, validateFeedback, validateScores } from "./validation.ts";

// Penilaian berakun: asesmen mandiri (Awardee menilai diri), Peer (Awardee menilai rekan se-wilayah),
// dan Manwil (Manajer Wilayah menilai awardee binaannya). Admin tidak mengisi penilaian.

export type EvalKind = "self" | "peer" | "manwil";

const KIND_OF_TYPE: Record<string, EvalKind> = { self_initial: "self", self_mid: "self", peer: "peer", manwil: "manwil" };
const ROLE_OF_KIND: Record<EvalKind, Role> = { self: "awardee", peer: "awardee", manwil: "manwil" };
const TYPES_OF_KIND: Record<EvalKind, string[]> = { self: ["self_initial", "self_mid"], peer: ["peer"], manwil: ["manwil"] };

export const kindOfType = (typeCode: string): EvalKind | null => KIND_OF_TYPE[typeCode] ?? null;

export type EvalTarget = { id: number; name: string; campus: string | null; referralCode: string; region: string };
type TargetRow = { id: number; name: string; campus: string | null; referral_code: string; region: string; batch: string; region_id: number };
const toTarget = (r: TargetRow): EvalTarget => ({ id: r.id, name: r.name, campus: r.campus, referralCode: r.referral_code, region: r.region });

const SELECT_TARGET = `SELECT a.id, a.name, a.campus, a.referral_code, a.batch, a.region_id, r.name AS region
  FROM awardees a JOIN regions r ON r.id = a.region_id`;

// ---------- periode & jendela waktu ----------

type OpenType = {
  period_id: number;
  slug: string;
  period_name: string;
  measurement_id: number;
  form_config: string | null;
  type_id: number;
  type_code: string;
  type_name: string;
  p_opens: string | null;
  p_closes: string | null;
  t_opens: string | null;
  t_closes: string | null;
};

const inWindow = (opens: string | null, closes: string | null, now: number) =>
  (!opens || Date.parse(opens) <= now) && (!closes || now < Date.parse(closes));

const earliest = (...dates: (string | null)[]) =>
  dates.filter((d): d is string => d !== null).sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

async function openTypes(db: D1Database, codes: string[], batch: string): Promise<OpenType[]> {
  const { results } = await db
    .prepare(
      `SELECT p.id AS period_id, p.measurement_id, p.slug, p.name AS period_name, m.form_config, p.opens_at AS p_opens, p.closes_at AS p_closes,
              rt.id AS type_id, rt.code AS type_code, rt.name AS type_name, prt.opens_at AS t_opens, prt.closes_at AS t_closes
       FROM periods p
       JOIN measurements m ON m.id = p.measurement_id
       JOIN period_respondent_types prt ON prt.period_id = p.id
       JOIN respondent_types rt ON rt.id = prt.respondent_type_id
       WHERE p.status = 'open' AND p.batch = ? AND rt.code IN (SELECT value FROM json_each(?))
       ORDER BY p.id, rt.id`,
    )
    .bind(batch, JSON.stringify(codes))
    .all<OpenType>();
  const now = Date.now();
  return results.filter((t) => inWindow(t.p_opens, t.p_closes, now) && inWindow(t.t_opens, t.t_closes, now));
}

// ---------- sasaran penilaian ----------

async function ownAwardee(db: D1Database, user: SessionUser): Promise<TargetRow | null> {
  if (user.role !== "awardee" || user.awardeeId === null) return null;
  return db.prepare(`${SELECT_TARGET} WHERE a.id = ?`).bind(user.awardeeId).first<TargetRow>();
}

async function peerRows(db: D1Database, user: SessionUser): Promise<TargetRow[]> {
  const me = await ownAwardee(db, user);
  if (!me) throw new ScopeError("Hanya Awardee yang punya rekan se-wilayah");
  const { results } = await db
    .prepare(`${SELECT_TARGET} WHERE a.region_id = ? AND a.batch = ? AND a.id <> ? ORDER BY a.name`)
    .bind(me.region_id, me.batch, me.id)
    .all<TargetRow>();
  return results;
}

// Satu-satunya izin Awardee membaca awardee lain: nama & kampus rekan se-wilayah, supaya bisa menilai mereka.
// Tidak membuka respons atau skor siapa pun.
export async function listPeerTargets(db: D1Database, user: SessionUser): Promise<EvalTarget[]> {
  return (await peerRows(db, user)).map(toTarget);
}

async function manwilRows(db: D1Database, user: SessionUser): Promise<TargetRow[]> {
  const f = awardeeFilter(scopeFor(user));
  const { results } = await db.prepare(`${SELECT_TARGET} WHERE ${f.sql} ORDER BY a.name`).bind(...f.params).all<TargetRow>();
  return results;
}

async function submittedKeys(db: D1Database, userId: number): Promise<Set<string>> {
  const { results } = await db
    .prepare("SELECT period_id, respondent_type_id, awardee_id FROM responses WHERE submitted_by = ?")
    .bind(userId)
    .all<{ period_id: number; respondent_type_id: number; awardee_id: number }>();
  return new Set(results.map((r) => `${r.period_id}:${r.respondent_type_id}:${r.awardee_id}`));
}

// ---------- daftar tugas ----------

export type EvalTask = {
  kind: EvalKind;
  period: { slug: string; name: string; closesAt: string | null };
  type: { code: string; name: string };
  target: EvalTarget;
  submitted: boolean;
};

export async function listTasks(db: D1Database, user: SessionUser): Promise<EvalTask[]> {
  let pairs: { type: OpenType; target: TargetRow }[] = [];

  if (user.role === "awardee") {
    const me = await ownAwardee(db, user);
    if (!me) return [];
    const [selfTypes, peerTypes] = await Promise.all([openTypes(db, TYPES_OF_KIND.self, me.batch), openTypes(db, TYPES_OF_KIND.peer, me.batch)]);
    const mates = peerTypes.length ? await peerRows(db, user) : [];
    pairs = [
      ...selfTypes.map((type) => ({ type, target: me })),
      ...peerTypes.flatMap((type) => mates.map((target) => ({ type, target }))),
    ];
  } else if (user.role === "manwil") {
    const rows = await manwilRows(db, user);
    for (const batch of new Set(rows.map((r) => r.batch))) {
      const types = await openTypes(db, TYPES_OF_KIND.manwil, batch);
      pairs.push(...types.flatMap((type) => rows.filter((r) => r.batch === batch).map((target) => ({ type, target }))));
    }
  } else {
    return [];
  }

  const done = await submittedKeys(db, user.id);
  return pairs.map(({ type, target }) => ({
    kind: KIND_OF_TYPE[type.type_code]!,
    period: { slug: type.slug, name: type.period_name, closesAt: earliest(type.p_closes, type.t_closes) },
    type: { code: type.type_code, name: type.type_name },
    target: toTarget(target),
    submitted: done.has(`${type.period_id}:${type.type_id}:${target.id}`),
  }));
}

// ---------- form ----------

export type InternalForm = {
  kind: EvalKind;
  title: string;
  period: { id: number; slug: string; name: string; closesAt: string | null };
  type: { id: number; code: string; name: string };
  target: EvalTarget;
  instruments: { id: number; code: string; text: string; category: string; scaleMax: number }[];
  feedback: FeedbackItem[];
  scale: ScaleOption[];
};

export type ResolveFailure = "not_found" | "forbidden" | "closed" | "submitted";

const TITLES: Record<EvalKind, string> = { self: "Asesmen Mandiri", peer: "Penilaian Rekan Se-wilayah", manwil: "Penilaian Manajer Wilayah" };

export async function resolveInternalForm(
  db: D1Database,
  user: SessionUser,
  periodSlug: string,
  typeCode: string,
  targetReferral: string,
): Promise<{ ok: true; form: InternalForm } | { ok: false; reason: ResolveFailure }> {
  const kind = kindOfType(typeCode);
  if (!kind) return { ok: false, reason: "not_found" };
  if (user.role !== ROLE_OF_KIND[kind]) return { ok: false, reason: "forbidden" };

  // Sasaran harus sesuai jenis penilaian dan lingkup pengisinya.
  const referral = targetReferral.trim().toUpperCase();
  const candidates =
    kind === "self" ? [await ownAwardee(db, user)].filter((r): r is TargetRow => r !== null)
    : kind === "peer" ? await peerRows(db, user)
    : await manwilRows(db, user);
  const target = candidates.find((r) => r.referral_code === referral);
  if (!target) return { ok: false, reason: "forbidden" };

  const open = (await openTypes(db, [typeCode], target.batch)).find((t) => t.slug === periodSlug);
  if (!open) return { ok: false, reason: "closed" };

  const already = await db
    .prepare("SELECT 1 AS x FROM responses WHERE period_id = ? AND respondent_type_id = ? AND awardee_id = ? AND submitted_by = ?")
    .bind(open.period_id, open.type_id, target.id, user.id)
    .first<{ x: number }>();
  if (already) return { ok: false, reason: "submitted" };

  const config = parseFormConfig(open.form_config);
  if (!config) return { ok: false, reason: "not_found" };
  const { results } = await db
    .prepare(
      `SELECT i.id, i.code, ${kind === "self" ? "COALESCE(i.text_self, i.text_public)" : "i.text_public"} AS text, i.scale_max, c.name AS category
       FROM instruments i JOIN instrument_categories c ON c.id = i.category_id
       WHERE i.measurement_id = ? ORDER BY c.order_index, i.order_index`,
    )
    .bind(open.measurement_id)
    .all<{ id: number; code: string; text: string; scale_max: number; category: string }>();

  return {
    ok: true,
    form: {
      kind,
      title: kind === "self" ? `${config.self?.title ?? TITLES.self} · ${open.type_name}` : TITLES[kind],
      period: { id: open.period_id, slug: open.slug, name: open.period_name, closesAt: earliest(open.p_closes, open.t_closes) },
      type: { id: open.type_id, code: open.type_code, name: open.type_name },
      target: toTarget(target),
      instruments: results.map((r) => ({ id: r.id, code: r.code, text: r.text, category: r.category, scaleMax: r.scale_max })),
      feedback: kind === "self" ? config.self?.feedback ?? config.feedback : config.feedback,
      scale: config.scale,
    },
  };
}

// ---------- simpan ----------

export async function saveInternalResponse(
  db: D1Database,
  user: SessionUser,
  form: InternalForm,
  input: { scores?: unknown; feedback?: unknown },
): Promise<{ ok: true; receipt: string } | { ok: false; status: number; message: string }> {
  const scores = validateScores(form.instruments, input.scores);
  if (!scores.ok) return { ok: false, status: 422, message: scores.message };
  const feedback = validateFeedback(form.feedback, input.feedback);
  if (!feedback.ok) return { ok: false, status: 422, message: feedback.message };

  const publicId = crypto.randomUUID();
  const statements = [
    db
      .prepare(
        `INSERT INTO responses (public_id, period_id, awardee_id, respondent_type_id, respondent_name, relation, submitted_at, source, submitted_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'app', ?)`,
      )
      .bind(publicId, form.period.id, form.target.id, form.type.id, user.name, form.type.name, new Date().toISOString(), user.id),
    db
      .prepare(
        `INSERT INTO response_scores (response_id, instrument_id, score)
         SELECT r.id, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]')
         FROM responses r, json_each(?) j WHERE r.public_id = ?`,
      )
      .bind(JSON.stringify(scores.value), publicId),
  ];
  if (feedback.value.length > 0) {
    statements.push(
      db
        .prepare(
          `INSERT INTO response_feedback (response_id, field, body)
           SELECT r.id, json_extract(j.value, '$[0]'), json_extract(j.value, '$[1]')
           FROM responses r, json_each(?) j WHERE r.public_id = ?`,
        )
        .bind(JSON.stringify(feedback.value), publicId),
    );
  }

  try {
    await db.batch(statements);
  } catch (error) {
    // Indeks unik satu-orang-satu-penilaian: dua tab yang mengirim bersamaan tetap hanya menghasilkan satu respons.
    if (String(error).includes("UNIQUE constraint failed")) return { ok: false, status: 409, message: "Anda sudah mengisi penilaian ini." };
    throw error;
  }
  return { ok: true, receipt: receiptCode(publicId) };
}
