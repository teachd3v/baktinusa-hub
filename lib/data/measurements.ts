// Jenis pengukuran: SA, PA, MA, PU, LA, UA. Tiap jenis punya kode, daftar soalnya sendiri, dan
// menyatakan siapa pengisinya — itu yang menentukan rutenya di aplikasi.
//
// Sebuah jenis dijalankan berulang oleh siklus-siklus yang menjadwalkannya: BA16 Awal, BA16 Tengah,
// dan seterusnya (lihat period_measurements).
//
// Pagar utamanya satu: begitu sebuah jenis sudah menghasilkan jawaban lewat siklus mana pun, susunan
// soalnya dikunci. Menambah, menghapus, atau memindah soal setelah itu akan mengubah arti data yang
// sudah terkumpul. Perbaikan salah ketik tetap boleh.

import { writeAudit } from "./audit.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola pengukuran");
}

export type Fail = { ok: false; message: string };
export type Ok = { ok: true };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CODE_PATTERN = /^[A-Z0-9]{2,8}$/;

// Siapa yang mengisi jenis ini. Bukan sekadar label: inilah yang dipakai untuk memutuskan siapa yang
// boleh membuka formnya dan lewat jalur mana.
export type FilledBy = "self" | "peer" | "manwil" | "public" | "admin";

export const FILLED_BY_LABEL: Record<FilledBy, string> = {
  self: "Diri sendiri",
  peer: "Rekan se-wilayah",
  manwil: "Manajer Wilayah",
  public: "Tautan publik",
  admin: "Admin",
};

export const isFilledBy = (v: string): v is FilledBy => v in FILLED_BY_LABEL;

// Enam jenis baku program. Admin memilih namanya; kode, slug, dan pengisinya ikut dari sini — bukan
// diketik ulang tiap kali, karena salah satu huruf saja sudah cukup untuk memutus rutenya.
//
// Daftar ini bukan pagar: createMeasurement tetap menerima jenis di luar daftar (lihat "Lainnya" di
// form), supaya program yang berubah tidak perlu menunggu rilis kode.
export const PRESET_MEASUREMENTS = [
  { code: "SA", name: "Self Assessment", slug: "self-assessment", filledBy: "self" },
  { code: "PA", name: "Peer Awardee Assessment", slug: "peer-awardee-assessment", filledBy: "peer" },
  { code: "MA", name: "Manajer Wilayah Assessment", slug: "manajer-wilayah-assessment", filledBy: "manwil" },
  { code: "PU", name: "Public Assessment", slug: "public-assessment", filledBy: "public" },
  { code: "LA", name: "Leadership Project Assessment", slug: "leadership-project-assessment", filledBy: "public" },
  { code: "UA", name: "Uji Akhir", slug: "uji-akhir", filledBy: "admin" },
] as const satisfies readonly { code: string; name: string; slug: string; filledBy: FilledBy }[];

export type PresetMeasurement = (typeof PRESET_MEASUREMENTS)[number];

export type FormText = { title: string; subtitle: string | null };

export type MeasurementRow = {
  id: number;
  code: string;
  slug: string;
  name: string;
  filledBy: FilledBy;
  formText: FormText;
  instruments: number;
  periods: number;
  responses: number;
};

export type InstrumentRow = {
  id: number;
  code: string;
  statement: string;
  scaleMax: number;
  orderIndex: number;
  answers: number;
};

export type MeasurementDetail = MeasurementRow & {
  locked: boolean;
  instrumentsList: InstrumentRow[];
  usedBy: { slug: string; name: string; batch: string; cycle: string; status: string; responses: number }[];
};

// responses sekarang menyimpan measurement_id sendiri, jadi hitungannya tidak perlu lewat periode lagi.
const COUNTS = `(SELECT COUNT(*) FROM instruments i WHERE i.measurement_id = m.id) AS instruments,
  (SELECT COUNT(*) FROM period_measurements pm WHERE pm.measurement_id = m.id) AS periods,
  (SELECT COUNT(*) FROM responses r WHERE r.measurement_id = m.id) AS responses`;

export async function listMeasurements(db: D1Database, actor: SessionUser): Promise<MeasurementRow[]> {
  assertAdmin(actor);
  // form_config ikut terbaca di sini supaya modal per baris di halaman Pengukuran tidak perlu
  // satu query sendiri untuk tiap jenis.
  const { results } = await db
    .prepare(`SELECT m.id, m.code, m.slug, m.name, m.filled_by AS filledBy, m.form_config, ${COUNTS} FROM measurements m ORDER BY m.code`)
    .all<Omit<MeasurementRow, "formText"> & { form_config: string | null }>();
  return results.map(({ form_config, ...row }) => ({ ...row, formText: parseFormText(form_config) }));
}

function parseFormText(raw: string | null): FormText {
  const config = raw ? (JSON.parse(raw) as { title?: string; subtitle?: string }) : {};
  return { title: config.title ?? "", subtitle: config.subtitle ?? null };
}

export async function getMeasurement(db: D1Database, actor: SessionUser, slug: string): Promise<MeasurementDetail | null> {
  assertAdmin(actor);
  const row = await db
    .prepare(`SELECT m.id, m.code, m.slug, m.name, m.filled_by AS filledBy, ${COUNTS} FROM measurements m WHERE m.slug = ?`)
    .bind(slug.trim())
    .first<MeasurementRow>();
  if (!row) return null;

  const [{ results: instruments }, { results: usedBy }] = await Promise.all([
    db
      .prepare(
        `SELECT i.id, i.code, i.statement, i.scale_max, i.order_index,
            (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = i.id) AS answers
         FROM instruments i WHERE i.measurement_id = ? ORDER BY i.order_index`,
      )
      .bind(row.id)
      .all<{ id: number; code: string; statement: string; scale_max: number; order_index: number; answers: number }>(),
    db
      .prepare(
        `SELECT p.slug, p.name, p.batch, p.cycle, p.status,
            (SELECT COUNT(*) FROM responses r WHERE r.period_id = p.id AND r.measurement_id = pm.measurement_id) AS responses
         FROM period_measurements pm JOIN periods p ON p.id = pm.period_id
         WHERE pm.measurement_id = ? ORDER BY p.batch DESC, p.id`,
      )
      .bind(row.id)
      .all<{ slug: string; name: string; batch: string; cycle: string; status: string; responses: number }>(),
  ]);

  return {
    ...row,
    locked: row.responses > 0,
    usedBy,
    instrumentsList: instruments.map((i) => ({
      id: i.id,
      code: i.code,
      statement: i.statement,
      scaleMax: i.scale_max,
      orderIndex: i.order_index,
      answers: i.answers,
    })),
  };
}

// ---------- pengukuran ----------

export type NewMeasurement = { code: string; slug: string; name: string; filledBy: FilledBy; copyFromId?: number | null };

export async function createMeasurement(db: D1Database, actor: SessionUser, input: NewMeasurement): Promise<({ id: number } & Ok) | Fail> {
  assertAdmin(actor);
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const code = input.code.trim().toUpperCase();
  if (!CODE_PATTERN.test(code)) return { ok: false, message: "Kode harus 2–8 karakter, hanya huruf besar dan angka — misalnya SA." };
  if (!SLUG_PATTERN.test(slug) || slug.length > 60) {
    return { ok: false, message: "Slug hanya boleh huruf kecil, angka, dan tanda hubung — misalnya self-assessment." };
  }
  if (!name || name.length > 120) return { ok: false, message: "Nama jenis pengukuran wajib diisi (maksimal 120 karakter)." };

  const bentrok = await db
    .prepare("SELECT code, slug FROM measurements WHERE code = ? OR slug = ?")
    .bind(code, slug)
    .first<{ code: string; slug: string }>();
  if (bentrok) {
    return bentrok.code === code
      ? { ok: false, message: `Kode "${code}" sudah dipakai jenis pengukuran lain.` }
      : { ok: false, message: `Slug "${slug}" sudah dipakai jenis pengukuran lain.` };
  }

  const source = input.copyFromId
    ? await db.prepare("SELECT form_config FROM measurements WHERE id = ?").bind(input.copyFromId).first<{ form_config: string | null }>()
    : null;

  const created = await db
    .prepare("INSERT INTO measurements (code, slug, name, filled_by, form_config) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(code, slug, name, input.filledBy, source?.form_config ?? null)
    .first<{ id: number }>();
  const id = created!.id;

  let copied = 0;
  if (input.copyFromId) copied = await copyContents(db, input.copyFromId, id);

  await writeAudit(db, actor, {
    action: "pengukuran.buat",
    entity: "measurement",
    entityId: id,
    summary: `Jenis pengukuran "${name}" (${code}) dibuat${copied ? ` dengan ${copied} soal salinan` : ""}`,
  });
  return { ok: true, id };
}

// Menyalin kategori dan soal dari pengukuran lain — titik awal yang lebih cepat daripada menyusun ulang.
async function copyContents(db: D1Database, fromId: number, toId: number): Promise<number> {
  const { results: instruments } = await db
    .prepare("SELECT code, statement, scale_max, order_index FROM instruments WHERE measurement_id = ? ORDER BY order_index")
    .bind(fromId)
    .all<{ code: string; statement: string; scale_max: number; order_index: number }>();
  if (instruments.length === 0) return 0;

  await db.batch(
    instruments.map((i) =>
      db
        .prepare("INSERT INTO instruments (measurement_id, code, statement, scale_max, order_index) VALUES (?, ?, ?, ?, ?)")
        .bind(toId, i.code, i.statement, i.scale_max, i.order_index),
    ),
  );
  return instruments.length;
}

export async function renameMeasurement(db: D1Database, actor: SessionUser, id: number, name: string): Promise<Ok | Fail> {
  assertAdmin(actor);
  const clean = name.trim();
  if (!clean || clean.length > 120) return { ok: false, message: "Nama pengukuran wajib diisi (maksimal 120 karakter)." };

  const before = await db.prepare("SELECT name FROM measurements WHERE id = ?").bind(id).first<{ name: string }>();
  if (!before) return { ok: false, message: "Pengukuran tidak ditemukan." };
  if (before.name === clean) return { ok: true };

  await db.prepare("UPDATE measurements SET name = ? WHERE id = ?").bind(clean, id).run();
  await writeAudit(db, actor, {
    action: "pengukuran.ubah",
    entity: "measurement",
    entityId: id,
    summary: `Pengukuran "${before.name}" diganti nama jadi "${clean}"`,
  });
  return { ok: true };
}

// Pengukuran yang masih dijadwalkan periode tidak bisa dihapus: periodenya akan kehilangan kuesionernya.
export async function deleteMeasurement(db: D1Database, actor: SessionUser, id: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(`SELECT m.name, ${COUNTS} FROM measurements m WHERE m.id = ?`)
    .bind(id)
    .first<{ name: string; periods: number; instruments: number; responses: number }>();
  if (!row) return { ok: false, message: "Pengukuran tidak ditemukan." };
  if (row.periods > 0) {
    return { ok: false, message: `"${row.name}" masih dipakai ${row.periods} periode. Lepas dari periodenya dulu.` };
  }

  // Kategori & soal ikut terhapus lewat ON DELETE CASCADE; karena tanpa periode, tidak ada jawaban yang hilang.
  await db.prepare("DELETE FROM measurements WHERE id = ?").bind(id).run();
  await writeAudit(db, actor, {
    action: "pengukuran.hapus",
    entity: "measurement",
    entityId: id,
    summary: `Pengukuran "${row.name}" dihapus beserta ${row.instruments} soalnya`,
  });
  return { ok: true };
}

// ---------- teks form publik ----------

export async function getFormText(db: D1Database, actor: SessionUser, measurementId: number): Promise<FormText | null> {
  assertAdmin(actor);
  const row = await db.prepare("SELECT form_config FROM measurements WHERE id = ?").bind(measurementId).first<{ form_config: string | null }>();
  if (!row) return null;
  return parseFormText(row.form_config);
}

export async function updateFormText(db: D1Database, actor: SessionUser, measurementId: number, input: FormText): Promise<Ok | Fail> {
  assertAdmin(actor);
  const title = input.title.trim();
  const subtitle = input.subtitle?.trim() || null;
  if (!title || title.length > 120) return { ok: false, message: "Judul form wajib diisi (maksimal 120 karakter)." };
  if (subtitle && subtitle.length > 200) return { ok: false, message: "Subjudul maksimal 200 karakter." };

  const row = await db.prepare("SELECT form_config FROM measurements WHERE id = ?").bind(measurementId).first<{ form_config: string | null }>();
  if (!row) return { ok: false, message: "Pengukuran tidak ditemukan." };
  if (!row.form_config) return { ok: false, message: "Pengukuran ini belum punya konfigurasi form. Salin dari pengukuran lain dulu." };

  const config = JSON.parse(row.form_config) as Record<string, unknown>;
  config.title = title;
  if (subtitle) config.subtitle = subtitle;
  else delete config.subtitle;

  await db.prepare("UPDATE measurements SET form_config = ? WHERE id = ?").bind(JSON.stringify(config), measurementId).run();
  await writeAudit(db, actor, {
    action: "pengukuran.teks",
    entity: "measurement",
    entityId: measurementId,
    summary: `Teks form publik diubah jadi "${title}"`,
  });
  return { ok: true };
}

// ---------- sub pengukuran (kategori) & soal ----------

const LOCKED = "Pengukuran ini sudah menghasilkan jawaban, jadi susunan soalnya tidak bisa diubah lagi. Perbaikan teks masih boleh.";

async function answersOf(db: D1Database, measurementId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM responses r WHERE r.measurement_id = ?")
    .bind(measurementId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export type InstrumentInput = { code: string; statement: string; scaleMax: number };

function validateInstrument(input: InstrumentInput): Fail | null {
  const code = input.code.trim();
  if (!code || code.length > 20) return { ok: false, message: "Kode soal wajib diisi (maksimal 20 karakter), misalnya Q1." };
  if (!input.statement.trim() || input.statement.length > 1000) return { ok: false, message: "Teks soal wajib diisi (maksimal 1000 karakter)." };
  if (!Number.isInteger(input.scaleMax) || input.scaleMax < 1 || input.scaleMax > 10) return { ok: false, message: "Skala maksimal harus antara 1 dan 10." };
  return null;
}

export async function addInstrument(db: D1Database, actor: SessionUser, measurementId: number, input: InstrumentInput): Promise<Ok | Fail> {
  assertAdmin(actor);
  const invalid = validateInstrument(input);
  if (invalid) return invalid;
  if (await answersOf(db, measurementId)) return { ok: false, message: "Jenis ini sudah punya jawaban, jadi soalnya tidak bisa ditambah lagi." };

  const jenis = await db.prepare("SELECT 1 AS ada FROM measurements WHERE id = ?").bind(measurementId).first<{ ada: number }>();
  if (!jenis) return { ok: false, message: "Jenis pengukuran tidak ditemukan." };

  const taken = await db
    .prepare("SELECT 1 AS ada FROM instruments WHERE measurement_id = ? AND code = ?")
    .bind(measurementId, input.code.trim())
    .first<{ ada: number }>();
  if (taken) return { ok: false, message: `Kode "${input.code.trim()}" sudah dipakai soal lain di jenis ini.` };

  const next = await db
    .prepare("SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM instruments WHERE measurement_id = ?")
    .bind(measurementId)
    .first<{ n: number }>();
  await db
    .prepare("INSERT INTO instruments (measurement_id, code, statement, scale_max, order_index) VALUES (?, ?, ?, ?, ?)")
    .bind(measurementId, input.code.trim(), input.statement.trim(), input.scaleMax, next!.n)
    .run();
  await writeAudit(db, actor, {
    action: "soal.tambah",
    entity: "instrument",
    entityId: measurementId,
    summary: `Soal "${input.code.trim()}" ditambahkan`,
  });
  return { ok: true };
}

export async function updateInstrument(db: D1Database, actor: SessionUser, measurementId: number, instrumentId: number, input: InstrumentInput): Promise<Ok | Fail> {
  assertAdmin(actor);
  const before = await db
    .prepare("SELECT code, scale_max, (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = instruments.id) AS answers FROM instruments WHERE id = ? AND measurement_id = ?")
    .bind(instrumentId, measurementId)
    .first<{ code: string; scale_max: number; answers: number }>();
  if (!before) return { ok: false, message: "Soal tidak ditemukan." };
  const invalid = validateInstrument(input);
  if (invalid) return invalid;

  const code = input.code.trim();
  if (before.answers > 0 && (code !== before.code || input.scaleMax !== before.scale_max)) {
    return { ok: false, message: "Soal ini sudah dijawab, jadi kode dan skalanya tidak bisa diubah. Teksnya masih boleh diperbaiki." };
  }
  if (code !== before.code) {
    const taken = await db.prepare("SELECT 1 AS ada FROM instruments WHERE measurement_id = ? AND code = ? AND id <> ?").bind(measurementId, code, instrumentId).first<{ ada: number }>();
    if (taken) return { ok: false, message: `Kode "${code}" sudah dipakai di pengukuran ini.` };
  }

  await db
    .prepare("UPDATE instruments SET code = ?, statement = ?, scale_max = ? WHERE id = ?")
    .bind(code, input.statement.trim(), input.scaleMax, instrumentId)
    .run();
  await writeAudit(db, actor, { action: "soal.ubah", entity: "instrument", entityId: instrumentId, summary: `Soal ${code} diperbarui` });
  return { ok: true };
}

export async function deleteInstrument(db: D1Database, actor: SessionUser, measurementId: number, instrumentId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare("SELECT code, (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = instruments.id) AS answers FROM instruments WHERE id = ? AND measurement_id = ?")
    .bind(instrumentId, measurementId)
    .first<{ code: string; answers: number }>();
  if (!row) return { ok: false, message: "Soal tidak ditemukan." };
  if (row.answers > 0) return { ok: false, message: `Soal ${row.code} sudah dijawab ${row.answers} kali, jadi tidak bisa dihapus.` };

  await db.prepare("DELETE FROM instruments WHERE id = ?").bind(instrumentId).run();
  await writeAudit(db, actor, { action: "soal.hapus", entity: "instrument", entityId: instrumentId, summary: `Soal ${row.code} dihapus` });
  return { ok: true };
}

export type DeleteInstrumentOutcome = {
  id: number;
  code: string;
  ok: boolean;
  message: string;
};

// Menghapus banyak soal sekaligus dengan tetap menegakkan guard:
// soal yang sudah pernah dijawab responden tidak bisa dihapus.
export async function deleteManyInstruments(
  db: D1Database,
  actor: SessionUser,
  instrumentIds: number[],
): Promise<DeleteInstrumentOutcome[]> {
  assertAdmin(actor);
  if (instrumentIds.length > 200) {
    throw new ScopeError("Maksimal 200 butir soal sekaligus.");
  }

  const outcomes: DeleteInstrumentOutcome[] = [];
  for (const id of instrumentIds) {
    const row = await db
      .prepare(
        `SELECT i.id, i.code, i.measurement_id,
            (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = i.id) AS answers
         FROM instruments i WHERE i.id = ?`,
      )
      .bind(id)
      .first<{ id: number; code: string; measurement_id: number; answers: number }>();

    if (!row) {
      outcomes.push({ id, code: "", ok: false, message: "Soal tidak ditemukan." });
      continue;
    }
    if (row.answers > 0) {
      outcomes.push({
        id,
        code: row.code,
        ok: false,
        message: `Soal ${row.code} sudah dijawab ${row.answers} kali, tidak bisa dihapus.`,
      });
      continue;
    }

    await db.prepare("DELETE FROM instruments WHERE id = ?").bind(id).run();
    outcomes.push({ id, code: row.code, ok: true, message: "Dihapus." });
  }

  const berhasil = outcomes.filter((o) => o.ok).length;
  if (berhasil > 0) {
    await writeAudit(db, actor, {
      action: "soal.hapus-massal",
      entity: "instrument",
      summary: `Hapus massal: ${berhasil} dari ${instrumentIds.length} butir soal dihapus`,
      detail: outcomes.filter((o) => !o.ok).map((o) => `${o.code}: ${o.message}`),
    });
  }

  return outcomes;
}

// ---------- soal lintas pengukuran ----------

export type InstrumentListRow = InstrumentRow & {
  measurementId: number;
  measurementName: string;
  measurementSlug: string;
  locked: boolean;
};

export type InstrumentFilter = { measurementId?: number | null; search?: string };

// Satu daftar berisi soal dari semua pengukuran, untuk halaman Instrumen. `locked` dihitung per pengukuran:
// begitu sebuah pengukuran menghasilkan jawaban, susunannya dikunci — tapi teks soalnya tetap bisa dirapikan.
export async function listAllInstruments(db: D1Database, actor: SessionUser, filter: InstrumentFilter = {}): Promise<InstrumentListRow[]> {
  assertAdmin(actor);
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (filter.measurementId) {
    where.push("i.measurement_id = ?");
    params.push(filter.measurementId);
  }
  const search = filter.search?.trim().toLowerCase();
  if (search) {
    const like = `%${search}%`;
    where.push("(lower(i.code) LIKE ? OR lower(i.statement) LIKE ?)");
    params.push(like, like);
  }

  const { results } = await db
    .prepare(
      `SELECT i.id, i.code, i.statement, i.scale_max, i.order_index,
          i.measurement_id, m.name AS measurement_name, m.slug AS measurement_slug,
          (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = i.id) AS answers,
          (SELECT COUNT(*) FROM responses r WHERE r.measurement_id = m.id) AS measurement_answers
       FROM instruments i
       JOIN measurements m ON m.id = i.measurement_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY m.code, i.order_index`,
    )
    .bind(...params)
    .all<{
      id: number; code: string; statement: string; scale_max: number; order_index: number;
      measurement_id: number; measurement_name: string; measurement_slug: string;
      answers: number; measurement_answers: number;
    }>();

  return results.map((r) => ({
    id: r.id,
    code: r.code,
    statement: r.statement,
    scaleMax: r.scale_max,
    orderIndex: r.order_index,
    answers: r.answers,
    measurementId: r.measurement_id,
    measurementName: r.measurement_name,
    measurementSlug: r.measurement_slug,
    locked: r.measurement_answers > 0,
  }));
}

// Pilihan sub pengukuran untuk form tambah soal, dikelompokkan per pengukuran.
