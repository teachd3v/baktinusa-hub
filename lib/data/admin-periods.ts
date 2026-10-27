// Konsol siklus: membuka, menutup, dan menjadwalkan tiap jenis pengukuran — semuanya data, bukan kode.
// Inilah yang menggantikan deadline yang dulu ditulis tangan di enam berkas.
//
// Satu siklus (BA16 Awal, BA16 Tengah, …) menjalankan beberapa jenis pengukuran sekaligus. Tiap jenis
// di dalamnya punya jendela waktunya sendiri, yang selalu dibatasi jendela siklusnya.

import { writeAudit } from "./audit.ts";
import { CYCLES, CYCLE_LABEL, isCycle, type Cycle, type PeriodItem } from "./periods.ts";
import { ScopeError, type SessionUser } from "./scope.ts";
import type { FilledBy } from "./measurements.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengelola siklus");
}

export type Fail = { ok: false; message: string };
export type Ok = { ok: true };

// Satu jenis pengukuran sebagaimana dijalankan oleh sebuah siklus.
export type PeriodMeasurementConfig = {
  measurementId: number;
  code: string;
  name: string;
  filledBy: FilledBy;
  instruments: number;
  targetRule: "none" | "fixed" | "region_peers";
  targetMin: number | null;
  opensAt: string | null;
  closesAt: string | null;
  responses: number;
};

export type PeriodDetail = PeriodItem & {
  instruments: number; // seluruh soal dari semua jenis yang dijalankan siklus ini
  responses: number;
  measurements: PeriodMeasurementConfig[];
  available: { id: number; code: string; name: string; filledBy: FilledBy; instruments: number }[];
};

const STATUSES = ["draft", "open", "closed", "archived"] as const;
export type PeriodStatus = (typeof STATUSES)[number];
export const isStatus = (v: unknown): v is PeriodStatus => STATUSES.includes(v as PeriodStatus);

export async function getPeriodDetail(db: D1Database, actor: SessionUser, slug: string): Promise<PeriodDetail | null> {
  assertAdmin(actor);
  const period = await db
    .prepare("SELECT id, slug, name, batch, cycle, status, opens_at, closes_at FROM periods WHERE slug = ?")
    .bind(slug.trim())
    .first<{ id: number; slug: string; name: string; batch: string; cycle: Cycle; status: PeriodStatus; opens_at: string | null; closes_at: string | null }>();
  if (!period) return null;

  const [{ results: measurements }, { results: available }, counts] = await Promise.all([
    db
      .prepare(
        `SELECT m.id, m.code, m.name, m.filled_by, pm.target_rule, pm.target_min, pm.opens_at, pm.closes_at,
            (SELECT COUNT(*) FROM instruments i WHERE i.measurement_id = m.id) AS instruments,
            (SELECT COUNT(*) FROM responses r WHERE r.period_id = pm.period_id AND r.measurement_id = m.id) AS responses
         FROM period_measurements pm JOIN measurements m ON m.id = pm.measurement_id
         WHERE pm.period_id = ? ORDER BY m.code`,
      )
      .bind(period.id)
      .all<{ id: number; code: string; name: string; filled_by: FilledBy; target_rule: PeriodMeasurementConfig["targetRule"]; target_min: number | null; opens_at: string | null; closes_at: string | null; instruments: number; responses: number }>(),
    db
      .prepare(
        `SELECT m.id, m.code, m.name, m.filled_by,
            (SELECT COUNT(*) FROM instruments i WHERE i.measurement_id = m.id) AS instruments
         FROM measurements m
         WHERE m.id NOT IN (SELECT measurement_id FROM period_measurements WHERE period_id = ?) ORDER BY m.code`,
      )
      .bind(period.id)
      .all<{ id: number; code: string; name: string; filled_by: FilledBy; instruments: number }>(),
    db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM instruments i JOIN period_measurements pm ON pm.measurement_id = i.measurement_id
                  WHERE pm.period_id = ?1) AS instruments,
                (SELECT COUNT(*) FROM responses WHERE period_id = ?1) AS responses`,
      )
      .bind(period.id)
      .first<{ instruments: number; responses: number }>(),
  ]);

  return {
    id: period.id,
    slug: period.slug,
    name: period.name,
    batch: period.batch,
    cycle: period.cycle,
    status: period.status,
    opensAt: period.opens_at,
    closesAt: period.closes_at,
    instruments: counts?.instruments ?? 0,
    responses: counts?.responses ?? 0,
    measurements: measurements.map((m) => ({
      measurementId: m.id,
      code: m.code,
      name: m.name,
      filledBy: m.filled_by,
      instruments: m.instruments,
      targetRule: m.target_rule,
      targetMin: m.target_min,
      opensAt: m.opens_at,
      closesAt: m.closes_at,
      responses: m.responses,
    })),
    available: available.map((m) => ({ id: m.id, code: m.code, name: m.name, filledBy: m.filled_by, instruments: m.instruments })),
  };
}

const orderOk = (opens: string | null, closes: string | null) => !(opens && closes && opens >= closes);

// ---------- jadwal siklus ----------

export async function updatePeriod(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  input: { name: string; opensAt: string | null; closesAt: string | null },
): Promise<Ok | Fail> {
  assertAdmin(actor);
  const name = input.name.trim();
  if (!name || name.length > 120) return { ok: false, message: "Nama siklus wajib diisi (maksimal 120 karakter)." };
  if (!orderOk(input.opensAt, input.closesAt)) return { ok: false, message: "Waktu tutup harus setelah waktu buka." };

  const before = await db
    .prepare("SELECT name, opens_at, closes_at FROM periods WHERE id = ?")
    .bind(periodId)
    .first<{ name: string; opens_at: string | null; closes_at: string | null }>();
  if (!before) return { ok: false, message: "Siklus tidak ditemukan." };

  await db
    .prepare("UPDATE periods SET name = ?, opens_at = ?, closes_at = ? WHERE id = ?")
    .bind(name, input.opensAt, input.closesAt, periodId)
    .run();
  await writeAudit(db, actor, {
    action: "siklus.ubah",
    entity: "period",
    entityId: periodId,
    summary: `Jadwal & nama siklus "${name}" diperbarui`,
    detail: { before, after: { name, opens_at: input.opensAt, closes_at: input.closesAt } },
  });
  return { ok: true };
}

export async function setPeriodStatus(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  status: PeriodStatus,
): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(
      `SELECT p.name, p.status,
          (SELECT COUNT(*) FROM period_measurements pm WHERE pm.period_id = p.id) AS measurements,
          (SELECT COUNT(*) FROM instruments i JOIN period_measurements pm ON pm.measurement_id = i.measurement_id
             WHERE pm.period_id = p.id) AS instruments,
          (SELECT COUNT(*) FROM responses WHERE period_id = p.id) AS responses
       FROM periods p WHERE p.id = ?`,
    )
    .bind(periodId)
    .first<{ name: string; status: PeriodStatus; measurements: number; instruments: number; responses: number }>();
  if (!row) return { ok: false, message: "Siklus tidak ditemukan." };
  if (row.status === status) return { ok: true };

  // Siklus kosong yang dibuka akan menampilkan form tanpa pertanyaan kepada responden.
  if (status === "open" && row.measurements === 0) return { ok: false, message: "Tentukan dulu jenis pengukuran yang dijalankan siklus ini." };
  if (status === "open" && row.instruments === 0) return { ok: false, message: "Jenis pengukuran yang dipilih belum punya satu pun soal, jadi belum bisa dibuka." };
  // Draft menyembunyikan siklus dari dashboard; jawaban yang sudah masuk akan ikut hilang dari pandangan.
  if (status === "draft" && row.responses > 0) {
    return { ok: false, message: "Siklus ini sudah menerima jawaban, jadi tidak bisa dikembalikan ke draft. Tutup saja." };
  }

  await db.prepare("UPDATE periods SET status = ? WHERE id = ?").bind(status, periodId).run();
  await writeAudit(db, actor, {
    action: "siklus.status",
    entity: "period",
    entityId: periodId,
    summary: `Siklus "${row.name}": ${row.status} → ${status}`,
    detail: { before: row.status, after: status, responses: row.responses },
  });
  return { ok: true };
}

// ---------- jenis pengukuran di dalam siklus ----------

export async function updateMeasurementConfig(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  measurementId: number,
  input: { targetRule: PeriodMeasurementConfig["targetRule"]; targetMin: number | null; opensAt: string | null; closesAt: string | null },
): Promise<Ok | Fail> {
  assertAdmin(actor);
  if (!orderOk(input.opensAt, input.closesAt)) return { ok: false, message: "Waktu tutup harus setelah waktu buka." };
  // Skema mewajibkan target_min ada tepat saat aturannya 'fixed'.
  const targetMin = input.targetRule === "fixed" ? input.targetMin : null;
  if (input.targetRule === "fixed" && (!targetMin || targetMin < 1 || targetMin > 1000)) {
    return { ok: false, message: "Isi target minimal responden (1–1000)." };
  }

  const before = await db
    .prepare(
      `SELECT m.name, pm.target_rule, pm.target_min, pm.opens_at, pm.closes_at
       FROM period_measurements pm JOIN measurements m ON m.id = pm.measurement_id
       WHERE pm.period_id = ? AND pm.measurement_id = ?`,
    )
    .bind(periodId, measurementId)
    .first<{ name: string; target_rule: string; target_min: number | null; opens_at: string | null; closes_at: string | null }>();
  if (!before) return { ok: false, message: "Jenis pengukuran itu tidak dijalankan oleh siklus ini." };

  await db
    .prepare(
      `UPDATE period_measurements SET target_rule = ?, target_min = ?, opens_at = ?, closes_at = ?
       WHERE period_id = ? AND measurement_id = ?`,
    )
    .bind(input.targetRule, targetMin, input.opensAt, input.closesAt, periodId, measurementId)
    .run();
  await writeAudit(db, actor, {
    action: "siklus.jenis-jadwal",
    entity: "period_measurement",
    entityId: measurementId,
    summary: `${before.name}: jadwal & target diperbarui`,
    detail: { periodId, before, after: { ...input, target_min: targetMin } },
  });
  return { ok: true };
}

export async function addMeasurementToPeriod(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  measurementId: number,
): Promise<Ok | Fail> {
  assertAdmin(actor);
  const measurement = await db
    .prepare("SELECT code, name FROM measurements WHERE id = ?")
    .bind(measurementId)
    .first<{ code: string; name: string }>();
  if (!measurement) return { ok: false, message: "Jenis pengukuran tidak dikenal." };

  const exists = await db
    .prepare("SELECT 1 AS ada FROM period_measurements WHERE period_id = ? AND measurement_id = ?")
    .bind(periodId, measurementId)
    .first<{ ada: number }>();
  if (exists) return { ok: false, message: "Jenis itu sudah dijalankan siklus ini." };

  await db
    .prepare("INSERT INTO period_measurements (period_id, measurement_id, target_rule) VALUES (?, ?, 'none')")
    .bind(periodId, measurementId)
    .run();
  await writeAudit(db, actor, {
    action: "siklus.jenis-tambah",
    entity: "period_measurement",
    entityId: measurementId,
    summary: `Jenis "${measurement.name}" (${measurement.code}) ditambahkan ke siklus`,
    detail: { periodId },
  });
  return { ok: true };
}

export async function removeMeasurementFromPeriod(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  measurementId: number,
): Promise<Ok | Fail> {
  assertAdmin(actor);
  const row = await db
    .prepare(
      `SELECT m.name, (SELECT COUNT(*) FROM responses r WHERE r.period_id = ? AND r.measurement_id = m.id) AS responses
       FROM measurements m WHERE m.id = ?`,
    )
    .bind(periodId, measurementId)
    .first<{ name: string; responses: number }>();
  if (!row) return { ok: false, message: "Jenis pengukuran tidak dikenal." };
  // Melepasnya akan memutus jawaban yang sudah masuk lewat jenis itu.
  if (row.responses > 0) return { ok: false, message: `"${row.name}" sudah punya ${row.responses} jawaban, jadi tidak bisa dilepas.` };

  await db
    .prepare("DELETE FROM period_measurements WHERE period_id = ? AND measurement_id = ?")
    .bind(periodId, measurementId)
    .run();
  await writeAudit(db, actor, {
    action: "siklus.jenis-hapus",
    entity: "period_measurement",
    entityId: measurementId,
    summary: `Jenis "${row.name}" dilepas dari siklus`,
    detail: { periodId },
  });
  return { ok: true };
}

// ---------- membuat siklus ----------

export type NewPeriod = { batch: string; cycle: Cycle; slug?: string; name?: string };

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Siklus adalah jadwal milik satu angkatan. Jenis pengukuran yang dijalankannya ditentukan setelah ini,
// dan kuesionernya tidak disalin ke sini — itu milik jenisnya, dipakai ulang oleh tiap siklus.
export async function createPeriod(db: D1Database, actor: SessionUser, input: NewPeriod): Promise<({ id: number } & Ok) | Fail> {
  assertAdmin(actor);
  const batch = input.batch.trim().toUpperCase();
  if (!batch || batch.length > 20) return { ok: false, message: "Angkatan wajib diisi, misalnya BA16." };
  if (!isCycle(input.cycle)) return { ok: false, message: "Pilih siklusnya: Awal, Tengah, atau Akhir." };

  // Nama dan slug boleh dikosongkan — bentuk bakunya sudah cukup untuk hampir semua kasus.
  const name = (input.name ?? "").trim() || `${batch} · ${CYCLE_LABEL[input.cycle]}`;
  const slug = ((input.slug ?? "").trim() || `${batch}-${input.cycle}`).toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.length > 60) {
    return { ok: false, message: "Slug hanya boleh huruf kecil, angka, dan tanda hubung — misalnya ba16-tengah." };
  }
  if (name.length > 120) return { ok: false, message: "Nama siklus maksimal 120 karakter." };

  const kembar = await db
    .prepare("SELECT 1 AS ada FROM periods WHERE batch = ? AND cycle = ?")
    .bind(batch, input.cycle)
    .first<{ ada: number }>();
  if (kembar) return { ok: false, message: `${batch} sudah punya ${CYCLE_LABEL[input.cycle]}.` };

  const taken = await db.prepare("SELECT 1 AS ada FROM periods WHERE slug = ?").bind(slug).first<{ ada: number }>();
  if (taken) return { ok: false, message: `Slug "${slug}" sudah dipakai siklus lain.` };

  const created = await db
    .prepare("INSERT INTO periods (slug, name, batch, cycle, status) VALUES (?, ?, ?, ?, 'draft') RETURNING id")
    .bind(slug, name, batch, input.cycle)
    .first<{ id: number }>();

  await writeAudit(db, actor, {
    action: "siklus.buat",
    entity: "period",
    entityId: created!.id,
    summary: `${CYCLE_LABEL[input.cycle]} untuk ${batch} dibuat`,
  });
  return { ok: true, id: created!.id };
}

// ---------- daftar siklus lengkap untuk Admin ----------

export type PeriodAdminRow = PeriodItem & {
  measurementsCount: number;
  instrumentsCount: number;
  responsesCount: number;
};

export async function listPeriodsForAdmin(db: D1Database, actor: SessionUser): Promise<PeriodAdminRow[]> {
  assertAdmin(actor);
  const { results } = await db
    .prepare(
      `SELECT p.id, p.slug, p.name, p.batch, p.cycle, p.status, p.opens_at AS opensAt, p.closes_at AS closesAt,
          (SELECT COUNT(*) FROM period_measurements pm WHERE pm.period_id = p.id) AS measurementsCount,
          (SELECT COUNT(*) FROM instruments i JOIN period_measurements pm ON pm.measurement_id = i.measurement_id
           WHERE pm.period_id = p.id) AS instrumentsCount,
          (SELECT COUNT(*) FROM responses r WHERE r.period_id = p.id) AS responsesCount
       FROM periods p
       ORDER BY p.batch DESC, CASE p.cycle WHEN 'awal' THEN 0 WHEN 'tengah' THEN 1 ELSE 2 END`,
    )
    .all<PeriodAdminRow>();
  return results;
}

// ---------- update lengkap & hapus siklus ----------

export type UpdatePeriodInput = {
  name: string;
  batch: string;
  cycle: Cycle;
  slug: string;
  status: PeriodStatus;
  opensAt: string | null;
  closesAt: string | null;
};

export async function updatePeriodDetails(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
  input: UpdatePeriodInput,
): Promise<Ok | Fail> {
  assertAdmin(actor);

  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.batch, p.cycle, p.slug, p.status, p.opens_at, p.closes_at,
          (SELECT COUNT(*) FROM period_measurements pm WHERE pm.period_id = p.id) AS measurements,
          (SELECT COUNT(*) FROM instruments i JOIN period_measurements pm ON pm.measurement_id = i.measurement_id
             WHERE pm.period_id = p.id) AS instruments,
          (SELECT COUNT(*) FROM responses r WHERE r.period_id = p.id) AS responses
       FROM periods p WHERE p.id = ?`,
    )
    .bind(periodId)
    .first<{
      id: number;
      name: string;
      batch: string;
      cycle: Cycle;
      slug: string;
      status: PeriodStatus;
      opens_at: string | null;
      closes_at: string | null;
      measurements: number;
      instruments: number;
      responses: number;
    }>();

  if (!row) return { ok: false, message: "Siklus tidak ditemukan." };

  const name = input.name.trim();
  if (!name || name.length > 120) return { ok: false, message: "Nama siklus wajib diisi (maksimal 120 karakter)." };

  const batch = input.batch.trim().toUpperCase();
  if (!batch || batch.length > 20) return { ok: false, message: "Angkatan wajib diisi, misalnya BA16." };

  if (!isCycle(input.cycle)) return { ok: false, message: "Pilih siklusnya: Awal, Tengah, atau Akhir." };

  const slug = input.slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(slug) || slug.length > 60) {
    return { ok: false, message: "Slug hanya boleh huruf kecil, angka, dan tanda hubung." };
  }

  if (!isStatus(input.status)) return { ok: false, message: "Status siklus tidak dikenal." };
  if (!orderOk(input.opensAt, input.closesAt)) return { ok: false, message: "Waktu tutup harus setelah waktu buka." };

  // Guard: jika sudah ada respons, angkatan & siklus dikunci
  if (row.responses > 0 && (batch !== row.batch || input.cycle !== row.cycle)) {
    return {
      ok: false,
      message: `Siklus ini sudah memiliki ${row.responses} respons jawaban. Angkatan dan siklus terkunci demi integritas data.`,
    };
  }

  // Guard: status
  if (input.status === "open" && row.measurements === 0) {
    return { ok: false, message: "Tentukan dulu jenis pengukuran yang dijalankan siklus ini sebelum membukanya." };
  }
  if (input.status === "open" && row.instruments === 0) {
    return { ok: false, message: "Jenis pengukuran yang dipilih belum punya satu pun soal, jadi belum bisa dibuka." };
  }
  if (input.status === "draft" && row.responses > 0) {
    return { ok: false, message: "Siklus ini sudah menerima jawaban, jadi tidak bisa dikembalikan ke draft. Tutup saja." };
  }

  // Cek bentrok (batch, cycle)
  if (batch !== row.batch || input.cycle !== row.cycle) {
    const kembar = await db
      .prepare("SELECT 1 AS ada FROM periods WHERE batch = ? AND cycle = ? AND id <> ?")
      .bind(batch, input.cycle, periodId)
      .first<{ ada: number }>();
    if (kembar) return { ok: false, message: `${batch} sudah punya ${CYCLE_LABEL[input.cycle]}.` };
  }

  // Cek bentrok slug
  if (slug !== row.slug) {
    const taken = await db
      .prepare("SELECT 1 AS ada FROM periods WHERE slug = ? AND id <> ?")
      .bind(slug, periodId)
      .first<{ ada: number }>();
    if (taken) return { ok: false, message: `Slug "${slug}" sudah dipakai siklus lain.` };
  }

  await db
    .prepare("UPDATE periods SET name = ?, batch = ?, cycle = ?, slug = ?, status = ?, opens_at = ?, closes_at = ? WHERE id = ?")
    .bind(name, batch, input.cycle, slug, input.status, input.opensAt, input.closesAt, periodId)
    .run();

  await writeAudit(db, actor, {
    action: "siklus.ubah",
    entity: "period",
    entityId: periodId,
    summary: `Data siklus "${name}" (${batch} · ${CYCLE_LABEL[input.cycle]}) diperbarui`,
  });

  return { ok: true };
}

export async function deletePeriod(
  db: D1Database,
  actor: SessionUser,
  periodId: number,
): Promise<Ok | Fail> {
  assertAdmin(actor);

  const row = await db
    .prepare(
      `SELECT p.id, p.name, p.batch, p.cycle,
          (SELECT COUNT(*) FROM responses r WHERE r.period_id = p.id) AS responses
       FROM periods p WHERE p.id = ?`,
    )
    .bind(periodId)
    .first<{ id: number; name: string; batch: string; cycle: Cycle; responses: number }>();

  if (!row) return { ok: false, message: "Siklus tidak ditemukan." };
  if (row.responses > 0) {
    return {
      ok: false,
      message: `Siklus "${row.name}" sudah memiliki ${row.responses} respons jawaban, jadi tidak bisa dihapus.`,
    };
  }

  await db.prepare("DELETE FROM period_measurements WHERE period_id = ?").bind(periodId).run();
  await db.prepare("DELETE FROM periods WHERE id = ?").bind(periodId).run();

  await writeAudit(db, actor, {
    action: "siklus.hapus",
    entity: "period",
    entityId: periodId,
    summary: `Siklus "${row.name}" (${row.batch} · ${CYCLE_LABEL[row.cycle]}) dihapus`,
  });

  return { ok: true };
}

// ---------- peta jenis × siklus ----------

export type MatrixCell = {
  cycle: Cycle;
  periodId: number | null; // null = siklus itu belum dibuat untuk angkatan ini
  on: boolean;
  responses: number;
};

export type MatrixRow = { measurementId: number; code: string; name: string; filledBy: FilledBy; instruments: number; cells: MatrixCell[] };

export type CycleMatrix = {
  batch: string;
  periods: { cycle: Cycle; id: number; slug: string; status: PeriodStatus }[];
  rows: MatrixRow[];
};

// Satu tabel per angkatan: baris = jenis pengukuran, kolom = Awal/Tengah/Akhir. Inilah bentuk yang
// paling cepat menjawab "Siklus Tengah isinya apa saja" — daftar siklus saja tidak menjawab itu.
export async function cycleMatrix(db: D1Database, actor: SessionUser): Promise<CycleMatrix[]> {
  assertAdmin(actor);
  const [{ results: periods }, { results: measurements }, { results: pairs }] = await Promise.all([
    db
      .prepare("SELECT id, slug, batch, cycle, status FROM periods ORDER BY batch DESC")
      .all<{ id: number; slug: string; batch: string; cycle: Cycle; status: PeriodStatus }>(),
    db
      .prepare(
        `SELECT m.id, m.code, m.name, m.filled_by,
            (SELECT COUNT(*) FROM instruments i WHERE i.measurement_id = m.id) AS instruments
         FROM measurements m ORDER BY m.code`,
      )
      .all<{ id: number; code: string; name: string; filled_by: FilledBy; instruments: number }>(),
    db
      .prepare(
        `SELECT pm.period_id, pm.measurement_id,
            (SELECT COUNT(*) FROM responses r WHERE r.period_id = pm.period_id AND r.measurement_id = pm.measurement_id) AS responses
         FROM period_measurements pm`,
      )
      .all<{ period_id: number; measurement_id: number; responses: number }>(),
  ]);

  const batches = [...new Set(periods.map((p) => p.batch))];
  return batches.map((batch) => {
    const mine = periods.filter((p) => p.batch === batch);
    return {
      batch,
      periods: mine.map((p) => ({ cycle: p.cycle, id: p.id, slug: p.slug, status: p.status })),
      rows: measurements.map((m) => ({
        measurementId: m.id,
        code: m.code,
        name: m.name,
        filledBy: m.filled_by,
        instruments: m.instruments,
        cells: CYCLES.map((cycle) => {
          const period = mine.find((p) => p.cycle === cycle) ?? null;
          const pair = period ? pairs.find((x) => x.period_id === period.id && x.measurement_id === m.id) : undefined;
          return { cycle, periodId: period?.id ?? null, on: Boolean(pair), responses: pair?.responses ?? 0 };
        }),
      })),
    };
  });
}
