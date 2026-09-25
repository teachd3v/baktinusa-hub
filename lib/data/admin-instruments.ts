// Membuat periode baru dan menyusun kuesionernya dari konsol — supaya membuka angkatan berikutnya
// tidak perlu menyentuh kode atau menjalankan script seed.

import { writeAudit } from "./audit.ts";
import type { Fail, Ok } from "./admin-periods.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh menyusun instrumen");
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type NewPeriod = { slug: string; name: string; batch: string; kind: "assessment" | "leadpro"; copyFromId?: number | null };

// Periode baru lahir sebagai draft tanpa tanggal: belum terlihat siapa pun sampai Admin membukanya.
export async function createPeriod(db: D1Database, actor: SessionUser, input: NewPeriod): Promise<({ id: number } & Ok) | Fail> {
  assertAdmin(actor);
  const slug = input.slug.trim().toLowerCase();
  const name = input.name.trim();
  const batch = input.batch.trim().toUpperCase();
  if (!SLUG_PATTERN.test(slug) || slug.length > 60) {
    return { ok: false, message: "Slug hanya boleh huruf kecil, angka, dan tanda hubung — misalnya ba16-pengukuran." };
  }
  if (!name || name.length > 120) return { ok: false, message: "Nama periode wajib diisi (maksimal 120 karakter)." };
  if (!batch || batch.length > 20) return { ok: false, message: "Angkatan wajib diisi, misalnya BA16." };

  const taken = await db.prepare("SELECT 1 AS ada FROM periods WHERE slug = ?").bind(slug).first<{ ada: number }>();
  if (taken) return { ok: false, message: `Slug "${slug}" sudah dipakai periode lain.` };

  const created = await db
    .prepare("INSERT INTO periods (slug, name, batch, kind, status) VALUES (?, ?, ?, ?, 'draft') RETURNING id")
    .bind(slug, name, batch, input.kind)
    .first<{ id: number }>();
  const id = created!.id;

  let copied = 0;
  if (input.copyFromId) {
    copied = await copyBlueprint(db, input.copyFromId, id);
  }

  await writeAudit(db, actor, {
    action: "periode.buat",
    entity: "period",
    entityId: id,
    summary: `Periode "${name}" (${batch}) dibuat${copied ? ` dengan ${copied} pertanyaan salinan` : ""}`,
    detail: { slug, kind: input.kind, copyFromId: input.copyFromId ?? null },
  });
  return { ok: true, id };
}

// Menyalin kerangka periode lama: kategori, pertanyaan, konfigurasi form, dan daftar tipe penilai —
// tanpa tanggal dan tanpa satu pun jawaban.
async function copyBlueprint(db: D1Database, fromId: number, toId: number): Promise<number> {
  const [{ results: categories }, { results: instruments }, source] = await Promise.all([
    db.prepare("SELECT id, name, weight, order_index FROM instrument_categories WHERE period_id = ? ORDER BY order_index").bind(fromId).all<{ id: number; name: string; weight: number; order_index: number }>(),
    db.prepare("SELECT category_id, code, text_self, text_public, scale_max, order_index FROM instruments WHERE period_id = ? ORDER BY order_index").bind(fromId).all<{ category_id: number; code: string; text_self: string | null; text_public: string; scale_max: number; order_index: number }>(),
    db.prepare("SELECT form_config FROM periods WHERE id = ?").bind(fromId).first<{ form_config: string | null }>(),
  ]);

  const newCategoryId = new Map<number, number>();
  for (const c of categories) {
    const row = await db
      .prepare("INSERT INTO instrument_categories (period_id, name, weight, order_index) VALUES (?, ?, ?, ?) RETURNING id")
      .bind(toId, c.name, c.weight, c.order_index)
      .first<{ id: number }>();
    newCategoryId.set(c.id, row!.id);
  }

  const statements = instruments.map((i) =>
    db
      .prepare("INSERT INTO instruments (period_id, category_id, code, text_self, text_public, scale_max, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(toId, newCategoryId.get(i.category_id)!, i.code, i.text_self, i.text_public, i.scale_max, i.order_index),
  );
  if (source?.form_config) statements.push(db.prepare("UPDATE periods SET form_config = ? WHERE id = ?").bind(source.form_config, toId));
  statements.push(
    db
      .prepare(
        `INSERT INTO period_respondent_types (period_id, respondent_type_id, target_rule, target_min)
         SELECT ?, respondent_type_id, target_rule, target_min FROM period_respondent_types WHERE period_id = ?`,
      )
      .bind(toId, fromId),
  );
  if (statements.length > 0) await db.batch(statements);
  return instruments.length;
}

// ---------- kuesioner ----------

export type InstrumentRow = { id: number; code: string; textSelf: string | null; textPublic: string; scaleMax: number; orderIndex: number; answers: number };
export type CategoryRow = { id: number; name: string; weight: number; orderIndex: number; instruments: InstrumentRow[] };

export async function listInstruments(db: D1Database, actor: SessionUser, periodId: number): Promise<CategoryRow[]> {
  assertAdmin(actor);
  const [{ results: categories }, { results: instruments }] = await Promise.all([
    db.prepare("SELECT id, name, weight, order_index FROM instrument_categories WHERE period_id = ? ORDER BY order_index").bind(periodId).all<{ id: number; name: string; weight: number; order_index: number }>(),
    db
      .prepare(
        `SELECT i.id, i.category_id, i.code, i.text_self, i.text_public, i.scale_max, i.order_index,
            (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = i.id) AS answers
         FROM instruments i WHERE i.period_id = ? ORDER BY i.order_index`,
      )
      .bind(periodId)
      .all<{ id: number; category_id: number; code: string; text_self: string | null; text_public: string; scale_max: number; order_index: number; answers: number }>(),
  ]);

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    weight: c.weight,
    orderIndex: c.order_index,
    instruments: instruments
      .filter((i) => i.category_id === c.id)
      .map((i) => ({ id: i.id, code: i.code, textSelf: i.text_self, textPublic: i.text_public, scaleMax: i.scale_max, orderIndex: i.order_index, answers: i.answers })),
  }));
}

// Periode yang sudah menerima jawaban hanya boleh diperbaiki teksnya — menambah, menghapus, atau memindah
// pertanyaan akan mengubah arti data yang sudah terkumpul.
async function answersIn(db: D1Database, periodId: number): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM responses WHERE period_id = ?").bind(periodId).first<{ n: number }>();
  return row?.n ?? 0;
}

const LOCKED = "Periode ini sudah menerima jawaban, jadi susunan pertanyaannya tidak bisa diubah lagi. Perbaikan teks masih boleh.";

export async function addCategory(db: D1Database, actor: SessionUser, periodId: number, name: string): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (await answersIn(db, periodId)) return { ok: false, message: LOCKED };
  const clean = name.trim();
  if (!clean || clean.length > 120) return { ok: false, message: "Nama kategori wajib diisi (maksimal 120 karakter)." };

  const next = await db.prepare("SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM instrument_categories WHERE period_id = ?").bind(periodId).first<{ n: number }>();
  await db.prepare("INSERT INTO instrument_categories (period_id, name, order_index) VALUES (?, ?, ?)").bind(periodId, clean, next!.n).run();
  await writeAudit(db, actor, { action: "kategori.tambah", entity: "instrument_category", entityId: periodId, summary: `Kategori "${clean}" ditambahkan` });
  return { ok: true };
}

export async function deleteCategory(db: D1Database, actor: SessionUser, periodId: number, categoryId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (await answersIn(db, periodId)) return { ok: false, message: LOCKED };
  const row = await db
    .prepare("SELECT c.name, (SELECT COUNT(*) FROM instruments i WHERE i.category_id = c.id) AS n FROM instrument_categories c WHERE c.id = ? AND c.period_id = ?")
    .bind(categoryId, periodId)
    .first<{ name: string; n: number }>();
  if (!row) return { ok: false, message: "Kategori tidak ditemukan." };
  if (row.n > 0) return { ok: false, message: `Kategori "${row.name}" masih berisi ${row.n} pertanyaan.` };

  await db.prepare("DELETE FROM instrument_categories WHERE id = ?").bind(categoryId).run();
  await writeAudit(db, actor, { action: "kategori.hapus", entity: "instrument_category", entityId: categoryId, summary: `Kategori "${row.name}" dihapus` });
  return { ok: true };
}

export type InstrumentInput = { code: string; textPublic: string; textSelf: string | null; scaleMax: number };

export async function addInstrument(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  categoryId: number,
  input: InstrumentInput,
): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (await answersIn(db, periodId)) return { ok: false, message: LOCKED };
  const invalid = validateInstrument(input);
  if (invalid) return invalid;

  const owns = await db.prepare("SELECT 1 AS ada FROM instrument_categories WHERE id = ? AND period_id = ?").bind(categoryId, periodId).first<{ ada: number }>();
  if (!owns) return { ok: false, message: "Kategori tidak ada di periode ini." };
  const taken = await db.prepare("SELECT 1 AS ada FROM instruments WHERE period_id = ? AND code = ?").bind(periodId, input.code.trim()).first<{ ada: number }>();
  if (taken) return { ok: false, message: `Kode "${input.code.trim()}" sudah dipakai di periode ini.` };

  const next = await db.prepare("SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM instruments WHERE period_id = ?").bind(periodId).first<{ n: number }>();
  await db
    .prepare("INSERT INTO instruments (period_id, category_id, code, text_self, text_public, scale_max, order_index) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(periodId, categoryId, input.code.trim(), input.textSelf?.trim() || null, input.textPublic.trim(), input.scaleMax, next!.n)
    .run();
  await writeAudit(db, actor, { action: "soal.tambah", entity: "instrument", entityId: periodId, summary: `Pertanyaan ${input.code.trim()} ditambahkan` });
  return { ok: true };
}

// Perbaikan teks tetap boleh walau jawaban sudah masuk: mengoreksi salah ketik tidak mengubah arti jawaban,
// sedangkan kode, kategori, dan skala ikut menentukan cara data dibaca — itu yang dikunci.
export async function updateInstrument(db: D1Database, actor: SessionUser, periodId: number, instrumentId: number, input: InstrumentInput): Promise<Ok | Fail> {
  assertAdmin(actor);
  const before = await db
    .prepare("SELECT code, text_public, text_self, scale_max, (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = instruments.id) AS answers FROM instruments WHERE id = ? AND period_id = ?")
    .bind(instrumentId, periodId)
    .first<{ code: string; text_public: string; text_self: string | null; scale_max: number; answers: number }>();
  if (!before) return { ok: false, message: "Pertanyaan tidak ditemukan." };
  const invalid = validateInstrument(input);
  if (invalid) return invalid;

  const code = input.code.trim();
  if (before.answers > 0 && (code !== before.code || input.scaleMax !== before.scale_max)) {
    return { ok: false, message: "Pertanyaan ini sudah dijawab, jadi kode dan skalanya tidak bisa diubah. Teksnya masih boleh diperbaiki." };
  }
  if (code !== before.code) {
    const taken = await db.prepare("SELECT 1 AS ada FROM instruments WHERE period_id = ? AND code = ? AND id <> ?").bind(periodId, code, instrumentId).first<{ ada: number }>();
    if (taken) return { ok: false, message: `Kode "${code}" sudah dipakai di periode ini.` };
  }

  await db
    .prepare("UPDATE instruments SET code = ?, text_public = ?, text_self = ?, scale_max = ? WHERE id = ?")
    .bind(code, input.textPublic.trim(), input.textSelf?.trim() || null, input.scaleMax, instrumentId)
    .run();
  await writeAudit(db, actor, {
    action: "soal.ubah",
    entity: "instrument",
    entityId: instrumentId,
    summary: `Pertanyaan ${code} diperbarui`,
    detail: { before: { code: before.code, text_public: before.text_public }, after: { code, text_public: input.textPublic.trim() } },
  });
  return { ok: true };
}

export async function deleteInstrument(db: D1Database, actor: SessionUser, periodId: number, instrumentId: number): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare("SELECT code, (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = instruments.id) AS answers FROM instruments WHERE id = ? AND period_id = ?")
    .bind(instrumentId, periodId)
    .first<{ code: string; answers: number }>();
  if (!row) return { ok: false, message: "Pertanyaan tidak ditemukan." };
  if (row.answers > 0) return { ok: false, message: `Pertanyaan ${row.code} sudah dijawab ${row.answers} kali, jadi tidak bisa dihapus.` };

  await db.prepare("DELETE FROM instruments WHERE id = ?").bind(instrumentId).run();
  await writeAudit(db, actor, { action: "soal.hapus", entity: "instrument", entityId: instrumentId, summary: `Pertanyaan ${row.code} dihapus` });
  return { ok: true };
}

function validateInstrument(input: InstrumentInput): Fail | null {
  const code = input.code.trim();
  if (!code || code.length > 20) return { ok: false, message: "Kode pertanyaan wajib diisi (maksimal 20 karakter), misalnya Q1." };
  if (!input.textPublic.trim() || input.textPublic.length > 1000) return { ok: false, message: "Teks pertanyaan wajib diisi (maksimal 1000 karakter)." };
  if (!Number.isInteger(input.scaleMax) || input.scaleMax < 1 || input.scaleMax > 10) return { ok: false, message: "Skala maksimal harus antara 1 dan 10." };
  return null;
}

// ---------- teks form publik ----------

export type FormText = { title: string; subtitle: string | null };

export async function getFormText(db: D1Database, actor: SessionUser, periodId: number): Promise<FormText | null> {
  assertAdmin(actor);
  const row = await db.prepare("SELECT form_config FROM periods WHERE id = ?").bind(periodId).first<{ form_config: string | null }>();
  if (!row) return null;
  const config = row.form_config ? (JSON.parse(row.form_config) as { title?: string; subtitle?: string }) : {};
  return { title: config.title ?? "", subtitle: config.subtitle ?? null };
}

// Judul dan subjudul form publik ikut tersalin saat periode dibuat dari periode lama — tanpa ini,
// form angkatan baru akan menyapa responden dengan nama angkatan sebelumnya.
export async function updateFormText(db: D1Database, actor: SessionUser, periodId: number, input: FormText): Promise<Ok | Fail> {
  assertAdmin(actor);
  const title = input.title.trim();
  const subtitle = input.subtitle?.trim() || null;
  if (!title || title.length > 120) return { ok: false, message: "Judul form wajib diisi (maksimal 120 karakter)." };
  if (subtitle && subtitle.length > 200) return { ok: false, message: "Subjudul maksimal 200 karakter." };

  const row = await db.prepare("SELECT form_config FROM periods WHERE id = ?").bind(periodId).first<{ form_config: string | null }>();
  if (!row) return { ok: false, message: "Periode tidak ditemukan." };
  if (!row.form_config) return { ok: false, message: "Periode ini belum punya konfigurasi form. Salin dari periode lain dulu." };

  const config = JSON.parse(row.form_config) as Record<string, unknown>;
  const before = { title: config.title, subtitle: config.subtitle };
  config.title = title;
  if (subtitle) config.subtitle = subtitle;
  else delete config.subtitle;

  await db.prepare("UPDATE periods SET form_config = ? WHERE id = ?").bind(JSON.stringify(config), periodId).run();
  await writeAudit(db, actor, {
    action: "form.teks",
    entity: "period",
    entityId: periodId,
    summary: `Teks form publik diubah jadi "${title}"`,
    detail: { before, after: { title, subtitle } },
  });
  return { ok: true };
}
