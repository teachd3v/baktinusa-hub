// Tugas terjadwal: buka/tutup periode tepat waktu, hitung yang respondennya kurang, dan cadangkan ke R2.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { backupToR2, closeDuePeriods, openDuePeriods, pruneBackups, runScheduled, shortfalls } from "../lib/data/cron.ts";
import { listAudit } from "../lib/data/audit.ts";
import type { SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };

// R2 tiruan: cukup put/list/delete, karena itu yang dipakai cadangan.
function fakeBucket() {
  const objects = new Map<string, string>();
  return {
    objects,
    put: async (key: string, body: string) => {
      objects.set(key, body);
    },
    list: async ({ prefix }: { prefix: string }) => ({
      objects: [...objects.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })),
    }),
    delete: async (key: string) => {
      objects.delete(key);
    },
  } as unknown as R2Bucket & { objects: Map<string, string> };
}

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

const statusOf = async (slug: string) =>
  (await db.prepare("SELECT status FROM periods WHERE slug = ?").bind(slug).first<{ status: string }>())!.status;

describe("membuka periode sesuai jadwal", () => {
  beforeEach(async () => {
    await db.prepare("UPDATE periods SET status = 'draft', opens_at = '2026-10-01T00:00:00.000Z', closes_at = '2026-12-01T00:00:00.000Z'").run();
  });

  test("dibuka hanya setelah waktunya tiba", async () => {
    assert.deepEqual(await openDuePeriods(db, "2026-09-30T23:00:00.000Z"), []);
    assert.equal(await statusOf("uji"), "draft");

    const dibuka = await openDuePeriods(db, "2026-10-01T00:00:00.000Z");
    assert.deepEqual(dibuka.map((p) => p.slug), ["uji"]);
    assert.equal(await statusOf("uji"), "open");

    // Jalan kedua tidak membuka apa pun lagi.
    assert.deepEqual(await openDuePeriods(db, "2026-10-02T00:00:00.000Z"), []);
  });

  test("periode tanpa pertanyaan tetap draft, sama seperti pagar di konsol", async () => {
    await db.prepare("DELETE FROM instruments").run();
    assert.deepEqual(await openDuePeriods(db, "2026-10-02T00:00:00.000Z"), []);
    assert.equal(await statusOf("uji"), "draft");
  });

  test("periode yang jadwal tutupnya sudah lewat tidak ikut dibuka", async () => {
    assert.deepEqual(await openDuePeriods(db, "2026-12-02T00:00:00.000Z"), []);
    assert.equal(await statusOf("uji"), "draft");
  });

  test("pembukaan otomatis tercatat atas nama sistem", async () => {
    await openDuePeriods(db, "2026-10-01T00:00:00.000Z");
    const [entry] = await listAudit(db, admin);
    assert.equal(entry!.actorName, "Sistem (terjadwal)");
    assert.match(entry!.summary, /dibuka otomatis/);
  });
});

describe("menutup periode sesuai jadwal", () => {
  test("ditutup saat deadline lewat, dan hanya sekali", async () => {
    await db.prepare("UPDATE periods SET closes_at = '2026-10-31T16:59:00.000Z' WHERE slug = 'uji'").run();
    assert.deepEqual(await closeDuePeriods(db, "2026-10-31T16:58:00.000Z"), []);

    const ditutup = await closeDuePeriods(db, "2026-10-31T17:00:00.000Z");
    assert.deepEqual(ditutup.map((p) => p.slug), ["uji"]);
    assert.equal(await statusOf("uji"), "closed");
    assert.deepEqual(await closeDuePeriods(db, "2026-11-01T00:00:00.000Z"), []);
  });

  test("periode tanpa tanggal tutup dibiarkan terbuka", async () => {
    assert.deepEqual(await closeDuePeriods(db, "2030-01-01T00:00:00.000Z"), []);
    assert.equal(await statusOf("uji"), "open");
  });
});

describe("siapa yang respondennya belum penuh", () => {
  test("hanya tipe bertarget yang dihitung, dan yang sudah penuh tidak muncul", async () => {
    const kurang = await shortfalls(db, 1);
    const ayu = kurang.find((k) => k.awardee === "Ayu")!;
    // Fixture: target eksternal 20 dengan 2 masuk; asesmen awal target 1, belum ada; peer = rekan se-wilayah (1).
    assert.deepEqual(
      ayu.missing.map((m) => `${m.typeCode}:${m.count}/${m.target}`).sort(),
      ["external:2/20", "manwil:0/1", "peer:0/1", "self_initial:0/1"],
    );

    // Penuhi asesmen awal Ayu, lalu tipe itu hilang dari daftar kurang.
    await db.prepare("INSERT INTO responses (period_id, awardee_id, respondent_type_id, source) VALUES (1, 1, 1, 'app')").run();
    const lagi = (await shortfalls(db, 1)).find((k) => k.awardee === "Ayu")!;
    assert.ok(!lagi.missing.some((m) => m.typeCode === "self_initial"));
  });

  test("awardee angkatan lain tidak dihitung tertinggal di periode ini", async () => {
    await db
      .prepare("INSERT INTO awardees (id, region_id, batch, name, referral_code) VALUES (9, 1, 'BA16', 'Angkatan Baru', 'BARU0001')")
      .run();
    const kurang = await shortfalls(db, 1); // periode fixture berangkatan BA15
    assert.ok(!kurang.some((k) => k.awardee === "Angkatan Baru"));

    // Ia juga tidak menaikkan target Peer awardee BA15 se-wilayahnya.
    const ayu = kurang.find((k) => k.awardee === "Ayu")!;
    assert.equal(ayu.missing.find((m) => m.typeCode === "peer")!.target, 1);
  });

  test("awardee yang semua targetnya penuh tidak ikut terdaftar", async () => {
    await db.prepare("UPDATE period_respondent_types SET target_rule = 'none', target_min = NULL").run();
    assert.deepEqual(await shortfalls(db, 1), []);
  });
});

describe("cadangan ke R2", () => {
  test("berisi seluruh tabel data, satu baris NDJSON per record", async () => {
    const bucket = fakeBucket();
    const hasil = await backupToR2(db, bucket, "2026-10-01T17:05:00.000Z");
    assert.equal(hasil.key, "backup/2026-10-01.ndjson");

    const isi = bucket.objects.get(hasil.key)!.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(isi.length, hasil.rows);
    const tabel = new Set(isi.map((r) => r.table));
    assert.ok(tabel.has("awardees") && tabel.has("responses") && tabel.has("users"));
    // Kredensial tidak ikut dicadangkan.
    assert.ok(!tabel.has("sessions") && !tabel.has("login_tokens"));
    assert.equal(isi.filter((r) => r.table === "awardees").length, 4);
  });

  test("tabel besar tetap lengkap walau dibaca bertahap", async () => {
    // Lebih dari satu halaman (5000) supaya paging benar-benar terpakai.
    const values = Array.from({ length: 5200 }, (_, i) => `(${i + 100}, 1, 1, 5, 'app')`).join(",");
    await db.exec(`INSERT INTO responses (id, period_id, awardee_id, respondent_type_id, source) VALUES ${values}`);

    const bucket = fakeBucket();
    const hasil = await backupToR2(db, bucket, "2026-10-01T00:00:00.000Z");
    const isi = bucket.objects.get(hasil.key)!.trim().split("\n").map((l) => JSON.parse(l));
    assert.equal(isi.filter((r) => r.table === "responses").length, 5205); // 5200 + 5 dari fixture
  });

  test("cadangan lebih tua dari 30 hari dibuang", async () => {
    const bucket = fakeBucket();
    await bucket.put("backup/2026-08-01.ndjson", "lama");
    await bucket.put("backup/2026-09-25.ndjson", "baru");
    const dibuang = await pruneBackups(bucket, "2026-10-01T00:00:00.000Z");
    assert.deepEqual(dibuang, ["backup/2026-08-01.ndjson"]);
    assert.deepEqual([...bucket.objects.keys()], ["backup/2026-09-25.ndjson"]);
  });
});

describe("satu kali jalan", () => {
  test("membuka, menutup, mencadangkan, lalu meninggalkan satu ringkasan di jejak", async () => {
    await db.prepare("UPDATE periods SET closes_at = '2026-10-01T00:00:00.000Z' WHERE slug = 'uji'").run();
    const bucket = fakeBucket();
    const laporan = await runScheduled(db, bucket, "2026-10-02T00:00:00.000Z", { backup: true });

    assert.deepEqual(laporan.closed.map((p) => p.slug), ["uji"]);
    assert.equal(laporan.opened.length, 0);
    assert.ok(laporan.backup!.rows > 0);

    const jejak = await listAudit(db, admin);
    const ringkasan = jejak.find((e) => e.action === "cron.jalan")!;
    assert.match(ringkasan.summary, /1 ditutup/);
    assert.equal(ringkasan.actorName, "Sistem (terjadwal)");
  });

  test("tanpa bucket, tugas lain tetap jalan", async () => {
    const laporan = await runScheduled(db, undefined, "2026-10-02T00:00:00.000Z", { backup: true });
    assert.equal(laporan.backup, null);
    assert.equal(typeof laporan.behind, "number");
  });
});
