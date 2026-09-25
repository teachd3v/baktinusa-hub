// Tugas terjadwal: membuka dan menutup periode tepat waktu, mencadangkan D1 ke R2, dan menghitung
// siapa yang respondennya belum penuh.
//
// Semua fungsi di sini menerima `now` dan binding-nya sebagai parameter — tidak ada yang membaca jam
// sistem atau `env` sendiri — supaya perilakunya bisa diuji tanpa menjalankan Worker.

import { writeAudit, SYSTEM_ACTOR } from "./audit.ts";
import { awardeeFilter } from "./scope.ts";

export type PeriodMove = { slug: string; name: string };

// Periode draft yang jadwal bukanya sudah lewat dibuka sendiri — dengan pagar yang sama seperti
// tombol di konsol: tanpa pertanyaan atau tanpa tipe penilai, ia dibiarkan draft.
export async function openDuePeriods(db: D1Database, now: string): Promise<PeriodMove[]> {
  const { results } = await db
    .prepare(
      `SELECT id, slug, name FROM periods p
       WHERE p.status = 'draft'
         AND p.opens_at IS NOT NULL AND p.opens_at <= ?1
         AND (p.closes_at IS NULL OR p.closes_at > ?1)
         AND (SELECT COUNT(*) FROM instruments WHERE period_id = p.id) > 0
         AND (SELECT COUNT(*) FROM period_respondent_types WHERE period_id = p.id) > 0
       ORDER BY p.id`,
    )
    .bind(now)
    .all<{ id: number; slug: string; name: string }>();

  for (const p of results) {
    await db.prepare("UPDATE periods SET status = 'open' WHERE id = ? AND status = 'draft'").bind(p.id).run();
    await writeAudit(db, SYSTEM_ACTOR, {
      action: "periode.status",
      entity: "period",
      entityId: p.id,
      summary: `Periode "${p.name}" dibuka otomatis sesuai jadwal`,
      detail: { before: "draft", after: "open", at: now },
    });
  }
  return results.map((p) => ({ slug: p.slug, name: p.name }));
}

// Deadline yang dulu ditulis tangan di enam berkas sekarang dijalankan platform.
export async function closeDuePeriods(db: D1Database, now: string): Promise<PeriodMove[]> {
  const { results } = await db
    .prepare("SELECT id, slug, name FROM periods WHERE status = 'open' AND closes_at IS NOT NULL AND closes_at <= ? ORDER BY id")
    .bind(now)
    .all<{ id: number; slug: string; name: string }>();

  for (const p of results) {
    await db.prepare("UPDATE periods SET status = 'closed' WHERE id = ? AND status = 'open'").bind(p.id).run();
    await writeAudit(db, SYSTEM_ACTOR, {
      action: "periode.status",
      entity: "period",
      entityId: p.id,
      summary: `Periode "${p.name}" ditutup otomatis sesuai jadwal`,
      detail: { before: "open", after: "closed", at: now },
    });
  }
  return results.map((p) => ({ slug: p.slug, name: p.name }));
}

// ---------- siapa yang respondennya belum penuh ----------

export type Shortfall = { typeCode: string; typeName: string; count: number; target: number };
export type AwardeeShortfall = {
  awardeeId: number;
  awardee: string;
  region: string;
  regionId: number;
  referralCode: string;
  missing: Shortfall[];
};

// Dipakai cron (untuk pengingat) dan halaman Admin. Hanya tipe dengan target yang dihitung:
// tipe tanpa target tidak pernah "kurang".
//
// Hanya awardee seangkatan dengan periodenya yang dihitung — form publik pun memilih periode lewat
// angkatan awardee, jadi awardee angkatan lain tidak mungkin "tertinggal" di periode ini.
export async function shortfalls(db: D1Database, periodId: number): Promise<AwardeeShortfall[]> {
  const f = awardeeFilter({ kind: "national" });
  const [{ results: awardees }, { results: types }, { results: counts }, { results: regionSizes }] = await Promise.all([
    db
      .prepare(
        `SELECT a.id, a.name, a.referral_code, a.region_id, g.name AS region
         FROM awardees a JOIN regions g ON g.id = a.region_id
         WHERE ${f.sql} AND a.batch = (SELECT batch FROM periods WHERE id = ?)
         ORDER BY g.name, a.name`,
      )
      .bind(...f.params, periodId)
      .all<{ id: number; name: string; referral_code: string; region_id: number; region: string }>(),
    db
      .prepare(
        `SELECT rt.id, rt.code, rt.name, prt.target_rule, prt.target_min
         FROM period_respondent_types prt JOIN respondent_types rt ON rt.id = prt.respondent_type_id
         WHERE prt.period_id = ? ORDER BY rt.id`,
      )
      .bind(periodId)
      .all<{ id: number; code: string; name: string; target_rule: string; target_min: number | null }>(),
    db
      .prepare("SELECT awardee_id, respondent_type_id, COUNT(*) AS n FROM responses WHERE period_id = ? GROUP BY awardee_id, respondent_type_id")
      .bind(periodId)
      .all<{ awardee_id: number; respondent_type_id: number; n: number }>(),
    db
      .prepare("SELECT region_id, COUNT(*) AS n FROM awardees WHERE batch = (SELECT batch FROM periods WHERE id = ?) GROUP BY region_id")
      .bind(periodId)
      .all<{ region_id: number; n: number }>(),
  ]);

  const sizeOf = new Map(regionSizes.map((r) => [r.region_id, r.n]));
  const countOf = new Map(counts.map((c) => [`${c.awardee_id}:${c.respondent_type_id}`, c.n]));

  return awardees
    .map((a) => ({
      awardeeId: a.id,
      awardee: a.name,
      region: a.region,
      regionId: a.region_id,
      referralCode: a.referral_code,
      missing: types
        .map((t) => {
          const target =
            t.target_rule === "fixed" ? (t.target_min ?? 0)
            : t.target_rule === "region_peers" ? Math.max(0, (sizeOf.get(a.region_id) ?? 1) - 1)
            : 0;
          const count = countOf.get(`${a.id}:${t.id}`) ?? 0;
          return { typeCode: t.code, typeName: t.name, count, target };
        })
        .filter((s) => s.target > 0 && s.count < s.target),
    }))
    .filter((a) => a.missing.length > 0);
}

// ---------- cadangan harian ----------

// Tabel yang dicadangkan. `sessions` dan `login_tokens` sengaja tidak ikut: isinya kredensial berumur
// pendek, dan memulihkannya justru berbahaya.
const BACKUP_TABLES = [
  "regions",
  "awardees",
  "periods",
  "instrument_categories",
  "instruments",
  "respondent_types",
  "period_respondent_types",
  "responses",
  "response_scores",
  "response_feedback",
  "users",
  "audit_log",
] as const;

export type BackupResult = { key: string; rows: number; bytes: number };

// Dibaca bertahap: satu SELECT * atas puluhan ribu baris skor bisa melewati batas ukuran balasan D1.
const PAGE = 5000;

export async function backupToR2(db: D1Database, bucket: R2Bucket, now: string): Promise<BackupResult> {
  const lines: string[] = [];
  let rows = 0;

  for (const table of BACKUP_TABLES) {
    for (let offset = 0; ; offset += PAGE) {
      const { results } = await db.prepare(`SELECT * FROM ${table} LIMIT ? OFFSET ?`).bind(PAGE, offset).all<Record<string, unknown>>();
      for (const row of results) {
        lines.push(JSON.stringify({ table, row }));
        rows += 1;
      }
      if (results.length < PAGE) break;
    }
  }

  // NDJSON: satu baris per record, jadi berkas besar bisa dibaca sepotong-sepotong saat pemulihan.
  const body = `${lines.join("\n")}\n`;
  const key = `backup/${now.slice(0, 10)}.ndjson`;
  await bucket.put(key, body, {
    httpMetadata: { contentType: "application/x-ndjson" },
    customMetadata: { rows: String(rows), takenAt: now },
  });
  return { key, rows, bytes: body.length };
}

// Cadangan lama dibuang supaya R2 tidak tumbuh tanpa batas; 30 hari cukup untuk menyadari kesalahan.
export async function pruneBackups(bucket: R2Bucket, now: string, keepDays = 30): Promise<string[]> {
  const cutoff = new Date(new Date(now).getTime() - keepDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const listed = await bucket.list({ prefix: "backup/" });
  const stale = listed.objects.map((o) => o.key).filter((key) => (key.slice("backup/".length, "backup/".length + 10) || "") < cutoff);
  for (const key of stale) await bucket.delete(key);
  return stale;
}

// ---------- satu kali jalan ----------

export type CronReport = {
  opened: PeriodMove[];
  closed: PeriodMove[];
  behind: number;
  backup: BackupResult | null;
  pruned: string[];
};

export async function runScheduled(
  db: D1Database,
  bucket: R2Bucket | undefined,
  now: string,
  options: { backup: boolean },
): Promise<CronReport> {
  const opened = await openDuePeriods(db, now);
  const closed = await closeDuePeriods(db, now);

  // Hitung yang tertinggal di semua periode yang sedang berjalan — bahan pengingat.
  const { results: running } = await db.prepare("SELECT id FROM periods WHERE status = 'open'").all<{ id: number }>();
  let behind = 0;
  for (const p of running) behind += (await shortfalls(db, p.id)).length;

  let backup: BackupResult | null = null;
  let pruned: string[] = [];
  if (options.backup && bucket) {
    backup = await backupToR2(db, bucket, now);
    pruned = await pruneBackups(bucket, now);
  }

  if (opened.length || closed.length || backup) {
    await writeAudit(db, SYSTEM_ACTOR, {
      action: "cron.jalan",
      entity: "system",
      summary:
        `Terjadwal: ${opened.length} periode dibuka, ${closed.length} ditutup, ${behind} awardee belum penuh` +
        (backup ? `, cadangan ${backup.rows} baris` : ""),
      detail: { opened, closed, behind, backup, pruned, at: now },
    });
  }

  return { opened, closed, behind, backup, pruned };
}
