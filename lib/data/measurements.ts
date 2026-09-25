// Pengukuran: pemilik kuesioner. Satu pengukuran punya sub pengukuran (kategori) dan soal, lalu dipakai
// berulang oleh periode-periode yang menjadwalkannya — BA15, BA16, dan seterusnya.
//
// Pagar utamanya satu: begitu sebuah pengukuran sudah menghasilkan jawaban lewat periode mana pun,
// susunan soalnya dikunci. Menambah, menghapus, atau memindah soal setelah itu akan mengubah arti data
// yang sudah terkumpul. Perbaikan salah ketik tetap boleh.

import { writeAudit } from "./audit.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola pengukuran");
}

export type Fail = { ok: false; message: string };
export type Ok = { ok: true };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export type MeasurementKind = "assessment" | "leadpro";

export type MeasurementRow = {
  id: number;
  slug: string;
  name: string;
  kind: MeasurementKind;
  categories: number;
  instruments: number;
  periods: number;
  responses: number;
};

export type InstrumentRow = {
  id: number;
  code: string;
  textSelf: string | null;
  textPublic: string;
  scaleMax: number;
  orderIndex: number;
  answers: number;
};

export type CategoryRow = { id: number; name: string; weight: number; orderIndex: number; instruments: InstrumentRow[] };

export type MeasurementDetail = MeasurementRow & {
  locked: boolean;
  categoriesList: CategoryRow[];
  usedBy: { slug: string; name: string; batch: string; status: string; responses: number }[];
};

const COUNTS = `(SELECT COUNT(*) FROM instrument_categories c WHERE c.measurement_id = m.id) AS categories,
  (SELECT COUNT(*) FROM instruments i WHERE i.measurement_id = m.id) AS instruments,
  (SELECT COUNT(*) FROM periods p WHERE p.measurement_id = m.id) AS periods,
  (SELECT COUNT(*) FROM responses r JOIN periods p ON p.id = r.period_id WHERE p.measurement_id = m.id) AS responses`;

export async function listMeasurements(db: D1Database, actor: SessionUser): Promise<MeasurementRow[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(`SELECT m.id, m.slug, m.name, m.kind, ${COUNTS} FROM measurements m ORDER BY m.name`)
    .all<MeasurementRow>();
  return results;
}

export async function getMeasurement(db: D1Database, actor: SessionUser, slug: string): Promise<MeasurementDetail | null> {
  assertAdmin(actor);
  const row = await db
    .prepare(`SELECT m.id, m.slug, m.name, m.kind, ${COUNTS} FROM measurements m WHERE m.slug = ?`)
    .bind(slug.trim())
    .first<MeasurementRow>();
  if (!row) return null;

  const [{ results: categories }, { results: instruments }, { results: usedBy }] = await Promise.all([
    db.prepare("SELECT id, name, weight, order_index FROM instrument_categories WHERE measurement_id = ? ORDER BY order_index").bind(row.id).all<{ id: number; name: string; weight: number; order_index: number }>(),
    db
      .prepare(
        `SELECT i.id, i.category_id, i.code, i.text_self, i.text_public, i.scale_max, i.order_index,
            (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = i.id) AS answers
         FROM instruments i WHERE i.measurement_id = ? ORDER BY i.order_index`,
      )
      .bind(row.id)
      .all<{ id: number; category_id: number; code: string; text_self: string | null; text_public: string; scale_max: number; order_index: number; answers: number }>(),
    db
      .prepare(
        `SELECT p.slug, p.name, p.batch, p.status,
            (SELECT COUNT(*) FROM responses r WHERE r.period_id = p.id) AS responses
         FROM periods p WHERE p.measurement_id = ? ORDER BY p.batch DESC, p.id`,
      )
      .bind(row.id)
      .all<{ slug: string; name: string; batch: string; status: string; responses: number }>(),
  ]);

  return {
    ...row,
    locked: row.responses > 0,
    usedBy,
    categoriesList: categories.map((c) => ({
      id: c.id,
      name: c.name,
      weight: c.weight,
      orderIndex: c.order_index,
      instruments: instruments
        .filter((i) => i.category_id === c.id)
        .map((i) => ({ id: i.id, code: i.code, textSelf: i.text_self, textPublic: i.text_public, scaleMax: i.scale_max, orderIndex: i.order_index, answers: i.answers })),
    })),
  };
}

// ---------- pengukuran ----------

export type NewMeasurement = { slug: string; name: string; kind: MeasurementKind; copyFromId?: number | null };

export async function createMeasurement(db: D1Database, actor: SessionUser, input: NewMeasurement): Promise<({ id: number } & Ok) | Fail> {
  assertAdmin(actor);
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  if (!SLUG_PATTERN.test(slug) || slug.length > 60) {
    return { ok: false, message: "Slug hanya boleh huruf kecil, angka, dan tanda hubung — misalnya pengukuran-awardee." };
  }
  if (!name || name.length > 120) return { ok: false, message: "Nama pengukuran wajib diisi (maksimal 120 karakter)." };

  const taken = await db.prepare("SELECT 1 AS ada FROM measurements WHERE slug = ?").bind(slug).first<{ ada: number }>();
  if (taken) return { ok: false, message: `Slug "${slug}" sudah dipakai pengukuran lain.` };

  const source = input.copyFromId
    ? await db.prepare("SELECT form_config FROM measurements WHERE id = ?").bind(input.copyFromId).first<{ form_config: string | null }>()
    : null;

  const created = await db
    .prepare("INSERT INTO measurements (slug, name, kind, form_config) VALUES (?, ?, ?, ?) RETURNING id")
    .bind(slug, name, input.kind, source?.form_config ?? null)
    .first<{ id: number }>();
  const id = created!.id;

  let copied = 0;
  if (input.copyFromId) copied = await copyContents(db, input.copyFromId, id);

  await writeAudit(db, actor, {
    action: "pengukuran.buat",
    entity: "measurement",
    entityId: id,
    summary: `Pengukuran "${name}" dibuat${copied ? ` dengan ${copied} soal salinan` : ""}`,
  });
  return { ok: true, id };
}

// Menyalin kategori dan soal dari pengukuran lain — titik awal yang lebih cepat daripada menyusun ulang.
async function copyContents(db: D1Database, fromId: number, toId: number): Promise<number> {
  const [{ results: categories }, { results: instruments }] = await Promise.all([
    db.prepare("SELECT id, name, weight, order_index FROM instrument_categories WHERE measurement_id = ? ORDER BY order_index").bind(fromId).all<{ id: number; name: string; weight: number; order_index: number }>(),
    db.prepare("SELECT category_id, code, text_self, text_public, scale_max, order_index FROM instruments WHERE measurement_id = ? ORDER BY order_index").bind(fromId).all<{ category_id: number; code: string; text_self: string | null; text_public: string; scale_max: number; order_index: number }>(),
  ]);

  const newId = new Map<number, number>();
  for (const c of categories) {
    const row = await db
      .prepare("INSERT INTO instrument_categories (measurement_id, name, weight, order_index) VALUES (?, ?, ?, ?) RETURNING id")
      .bind(toId, c.name, c.weight, c.order_index)
      .first<{ id: number }>();
    newId.set(c.id, row!.id);
  }

  if (instruments.length > 0) {
    await db.batch(
      instruments.map((i) =>
        db
          .prepare("INSERT INTO instruments (measurement_id, category_id, code, text_self, text_public, scale_max, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .bind(toId, newId.get(i.category_id)!, i.code, i.text_self, i.text_public, i.scale_max, i.order_index),
      ),
    );
  }
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

export type FormText = { title: string; subtitle: string | null };

export async function getFormText(db: D1Database, actor: SessionUser, measurementId: number): Promise<FormText | null> {
  assertAdmin(actor);
  const row = await db.prepare("SELECT form_config FROM measurements WHERE id = ?").bind(measurementId).first<{ form_config: string | null }>();
  if (!row) return null;
  const config = row.form_config ? (JSON.parse(row.form_config) as { title?: string; subtitle?: string }) : {};
  return { title: config.title ?? "", subtitle: config.subtitle ?? null };
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
    .prepare("SELECT COUNT(*) AS n FROM responses r JOIN periods p ON p.id = r.period_id WHERE p.measurement_id = ?")
    .bind(measurementId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function addCategory(db: D1Database, actor: SessionUser, measurementId: number, name: string): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (await answersOf(db, measurementId)) return { ok: false, message: LOCKED };
  const clean = name.trim();
  if (!clean || clean.length > 120) return { ok: false, message: "Nama sub pengukuran wajib diisi (maksimal 120 karakter)." };

  const taken = await db.prepare("SELECT 1 AS ada FROM instrument_categories WHERE measurement_id = ? AND lower(name) = lower(?)").bind(measurementId, clean).first<{ ada: number }>();
  if (taken) return { ok: false, message: `Sub pengukuran "${clean}" sudah ada.` };

  const next = await db.prepare("SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM instrument_categories WHERE measurement_id = ?").bind(measurementId).first<{ n: number }>();
  await db.prepare("INSERT INTO instrument_categories (measurement_id, name, order_index) VALUES (?, ?, ?)").bind(measurementId, clean, next!.n).run();
  await writeAudit(db, actor, { action: "subpengukuran.tambah", entity: "instrument_category", entityId: measurementId, summary: `Sub pengukuran "${clean}" ditambahkan` });
  return { ok: true };
}

export async function renameCategory(db: D1Database, actor: SessionUser, measurementId: number, categoryId: number, name: string): Promise<Ok | Fail> {
  assertAdmin(actor);
  const clean = name.trim();
  if (!clean || clean.length > 120) return { ok: false, message: "Nama sub pengukuran wajib diisi (maksimal 120 karakter)." };

  const before = await db.prepare("SELECT name FROM instrument_categories WHERE id = ? AND measurement_id = ?").bind(categoryId, measurementId).first<{ name: string }>();
  if (!before) return { ok: false, message: "Sub pengukuran tidak ditemukan." };
  if (before.name === clean) return { ok: true };

  const taken = await db.prepare("SELECT 1 AS ada FROM instrument_categories WHERE measurement_id = ? AND lower(name) = lower(?) AND id <> ?").bind(measurementId, clean, categoryId).first<{ ada: number }>();
  if (taken) return { ok: false, message: `Sub pengukuran "${clean}" sudah ada.` };

  // Mengganti nama aman walau sudah ada jawaban: nilai menempel ke id, bukan ke namanya.
  await db.prepare("UPDATE instrument_categories SET name = ? WHERE id = ?").bind(clean, categoryId).run();
  await writeAudit(db, actor, { action: "subpengukuran.ubah", entity: "instrument_category", entityId: categoryId, summary: `Sub pengukuran "${before.name}" diganti nama jadi "${clean}"` });
  return { ok: true };
}

export async function deleteCategory(db: D1Database, actor: SessionUser, measurementId: number, categoryId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (await answersOf(db, measurementId)) return { ok: false, message: LOCKED };
  const row = await db
    .prepare("SELECT c.name, (SELECT COUNT(*) FROM instruments i WHERE i.category_id = c.id) AS n FROM instrument_categories c WHERE c.id = ? AND c.measurement_id = ?")
    .bind(categoryId, measurementId)
    .first<{ name: string; n: number }>();
  if (!row) return { ok: false, message: "Sub pengukuran tidak ditemukan." };
  if (row.n > 0) return { ok: false, message: `"${row.name}" masih berisi ${row.n} soal.` };

  await db.prepare("DELETE FROM instrument_categories WHERE id = ?").bind(categoryId).run();
  await writeAudit(db, actor, { action: "subpengukuran.hapus", entity: "instrument_category", entityId: categoryId, summary: `Sub pengukuran "${row.name}" dihapus` });
  return { ok: true };
}

export type InstrumentInput = { code: string; textPublic: string; textSelf: string | null; scaleMax: number };

function validateInstrument(input: InstrumentInput): Fail | null {
  const code = input.code.trim();
  if (!code || code.length > 20) return { ok: false, message: "Kode soal wajib diisi (maksimal 20 karakter), misalnya Q1." };
  if (!input.textPublic.trim() || input.textPublic.length > 1000) return { ok: false, message: "Teks soal wajib diisi (maksimal 1000 karakter)." };
  if (!Number.isInteger(input.scaleMax) || input.scaleMax < 1 || input.scaleMax > 10) return { ok: false, message: "Skala maksimal harus antara 1 dan 10." };
  return null;
}

export async function addInstrument(db: D1Database, actor: SessionUser, measurementId: number, categoryId: number, input: InstrumentInput): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (await answersOf(db, measurementId)) return { ok: false, message: LOCKED };
  const invalid = validateInstrument(input);
  if (invalid) return invalid;

  const owns = await db.prepare("SELECT 1 AS ada FROM instrument_categories WHERE id = ? AND measurement_id = ?").bind(categoryId, measurementId).first<{ ada: number }>();
  if (!owns) return { ok: false, message: "Sub pengukuran itu bukan milik pengukuran ini." };
  const taken = await db.prepare("SELECT 1 AS ada FROM instruments WHERE measurement_id = ? AND code = ?").bind(measurementId, input.code.trim()).first<{ ada: number }>();
  if (taken) return { ok: false, message: `Kode "${input.code.trim()}" sudah dipakai di pengukuran ini.` };

  const next = await db.prepare("SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM instruments WHERE measurement_id = ?").bind(measurementId).first<{ n: number }>();
  await db
    .prepare("INSERT INTO instruments (measurement_id, category_id, code, text_self, text_public, scale_max, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(measurementId, categoryId, input.code.trim(), input.textSelf?.trim() || null, input.textPublic.trim(), input.scaleMax, next!.n)
    .run();
  await writeAudit(db, actor, { action: "soal.tambah", entity: "instrument", entityId: measurementId, summary: `Soal ${input.code.trim()} ditambahkan` });
  return { ok: true };
}

// Teks boleh diperbaiki kapan saja — salah ketik tidak mengubah arti jawaban. Kode dan skala ikut
// menentukan cara data dibaca, jadi itu yang dikunci begitu ada jawaban.
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
    .prepare("UPDATE instruments SET code = ?, text_public = ?, text_self = ?, scale_max = ? WHERE id = ?")
    .bind(code, input.textPublic.trim(), input.textSelf?.trim() || null, input.scaleMax, instrumentId)
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
