// Analitik: yang diuji terutama perpaduan lingkup × saringan. Saringan adalah kotak isian yang bisa
// dikarang siapa pun lewat alamat, jadi ia tidak boleh pernah melebarkan apa yang terlihat.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  EMPTY_FILTER,
  analyticsDashboard,
  analyticsSummary,
  awardeeOptions,
  cycleFacts,
  listAnalyticsTypes,
  measurementAnalytics,
  regionOptions,
  resolveFilter,
} from "../lib/data/analytics.ts";
import { scopeFor, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwilBandung: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };
const ayu: SessionUser = { id: 3, name: "Ayu", email: "ayu@contoh.id", role: "awardee", regionId: null, awardeeId: 1 };

const filter = (over: Partial<typeof EMPTY_FILTER> = {}) => ({ ...EMPTY_FILTER, ...over });

let db: D1Database;

// Skor yang sama dengan results.test.ts, supaya dua berkas uji saling menguatkan:
// Ayu 3.00 (2 responden), Budi 4.00, Citra 0.50, Dedi 3.00 — semuanya pada jenis PU.
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
  await db.exec(`
    INSERT INTO response_scores (response_id, instrument_id, score) VALUES
      (1, 1, 4), (1, 2, 3),
      (2, 1, 3), (2, 2, 2),
      (3, 1, 4), (3, 2, 4),
      (4, 1, 1), (4, 2, 0),
      (5, 1, 3), (5, 2, 3);
    -- Awardee angkatan lain: tidak boleh ikut terhitung di siklus BA15.
    INSERT INTO awardees (id, region_id, batch, name, referral_code) VALUES (9, 1, 'BA16', 'Eka Angkatan Lain', 'EEEE0009');
  `);
});

describe("ringkasan analitik", () => {
  test("satu baris per jenis yang dijalankan siklus, lengkap dengan sebaran predikat", async () => {
    const ringkas = await analyticsSummary(db, scopeFor(admin), 1, EMPTY_FILTER);
    assert.deepEqual(ringkas.map((t) => t.code), ["PU", "SA", "PA", "MA"]);

    const pu = ringkas.find((t) => t.code === "PU")!;
    assert.deepEqual(
      { awardee: pu.awardees, dinilai: pu.scored, respons: pu.responses, ipk: pu.ipk },
      // Empat awardee BA15; Eka (BA16) tidak ikut walau se-wilayah dengan Ayu.
      { awardee: 4, dinilai: 4, respons: 5, ipk: 2.63 }, // (3.00 + 4.00 + 0.50 + 3.00) / 4
    );
    assert.deepEqual(
      pu.spread.map((p) => [p.predicate, p.count]),
      [["cumlaude", 1], ["sangat_memuaskan", 2], ["memuaskan", 0], ["perlu_peningkatan", 1], [null, 0]],
    );

    // Jenis yang belum punya jawaban tetap muncul — kosong itu sendiri sebuah jawaban.
    const sa = ringkas.find((t) => t.code === "SA")!;
    assert.deepEqual({ dinilai: sa.scored, ipk: sa.ipk, belum: sa.spread.at(-1)!.count }, { dinilai: 0, ipk: null, belum: 4 });
  });

  test("jumlah soal dan target tiap jenis ikut terbaca", async () => {
    const types = await listAnalyticsTypes(db, 1);
    const pu = types.find((t) => t.code === "PU")!;
    assert.deepEqual({ soal: pu.questionCount, aturan: pu.targetRule, target: pu.targetMin }, { soal: 2, aturan: "fixed", target: 20 });
    assert.equal(types.find((t) => t.code === "PA")!.targetRule, "region_peers");
  });
});

describe("lingkup tetap berlaku di analitik", () => {
  test("Manwil hanya wilayahnya, Awardee hanya dirinya", async () => {
    const nasional = await analyticsSummary(db, scopeFor(admin), 1, EMPTY_FILTER);
    const bandung = await analyticsSummary(db, scopeFor(manwilBandung), 1, EMPTY_FILTER);
    const sendiri = await analyticsSummary(db, scopeFor(ayu), 1, EMPTY_FILTER);

    assert.equal(nasional.find((t) => t.code === "PU")!.awardees, 4);
    assert.equal(bandung.find((t) => t.code === "PU")!.awardees, 2); // Ayu & Budi
    assert.equal(sendiri.find((t) => t.code === "PU")!.awardees, 1); // Ayu saja
  });

  test("Manwil yang menyaring wilayah lain mendapat nol, bukan data wilayah itu", async () => {
    // Medan = wilayah 2, bukan miliknya. Saringan dipadukan dengan lingkup, jadi irisannya kosong.
    const dicoba = await analyticsSummary(db, scopeFor(manwilBandung), 1, filter({ regionId: 2 }));
    assert.equal(dicoba.find((t) => t.code === "PU")!.awardees, 0);

    const rinci = (await measurementAnalytics(db, scopeFor(manwilBandung), 1, "PU", filter({ regionId: 2 })))!;
    assert.deepEqual(rinci.rows, []);
    assert.equal(rinci.ipk, null);
  });

  test("pilihan wilayah di saringan ikut disaring lingkup", async () => {
    assert.deepEqual((await regionOptions(db, scopeFor(admin))).map((r) => r.name), ["Bandung", "Makassar", "Medan"]);
    assert.deepEqual((await regionOptions(db, scopeFor(manwilBandung))).map((r) => r.name), ["Bandung"]);
  });
});

describe("saringan bertingkat", () => {
  test("wilayah mempersempit hitungan, bukan sekadar menyembunyikan baris", async () => {
    const semua = (await measurementAnalytics(db, scopeFor(admin), 1, "PU", EMPTY_FILTER))!;
    const bandung = (await measurementAnalytics(db, scopeFor(admin), 1, "PU", filter({ regionId: 1 })))!;

    assert.equal(semua.ipk, 2.63);
    // Bandung saja: Ayu 3.00 & Budi 4.00 → 3.50, angka yang berbeda dari rata-rata nasional.
    assert.deepEqual({ awardee: bandung.awardees, ipk: bandung.ipk }, { awardee: 2, ipk: 3.5 });
    assert.deepEqual(bandung.regions.map((r) => r.region), ["Bandung"]);
  });

  test("satu awardee dipilih: angkanya tinggal miliknya sendiri", async () => {
    const citra = (await measurementAnalytics(db, scopeFor(admin), 1, "PU", filter({ awardeeId: 3 })))!;
    assert.deepEqual(citra.rows.map((r) => r.name), ["Citra"]);
    assert.deepEqual({ awardee: citra.awardees, ipk: citra.ipk }, { awardee: 1, ipk: 0.5 });
  });

  test("awardee di luar wilayah yang dipilih menghasilkan kosong, bukan diam-diam mengabaikan wilayahnya", async () => {
    // Citra ada di Medan; memaksakan wilayah Bandung lewat alamat tidak boleh menariknya keluar.
    const bentrok = (await measurementAnalytics(db, scopeFor(admin), 1, "PU", filter({ regionId: 1, awardeeId: 3 })))!;
    assert.deepEqual(bentrok.rows, []);
    assert.equal(bentrok.ipk, null);
  });

  test("pilihan awardee menyempit mengikuti wilayah yang sedang dipilih", async () => {
    // Tanpa wilayah: keempat awardee BA15 — Eka yang BA16 tidak ikut walau se-wilayah dengan Ayu.
    assert.deepEqual((await awardeeOptions(db, scopeFor(admin), 1, null)).map((a) => a.name), ["Ayu", "Budi", "Citra", "Dedi"]);
    assert.deepEqual((await awardeeOptions(db, scopeFor(admin), 1, 1)).map((a) => a.name), ["Ayu", "Budi"]);
  });

  test("pilihan awardee juga disaring lingkup, bukan hanya wilayah", async () => {
    assert.deepEqual((await awardeeOptions(db, scopeFor(manwilBandung), 1, null)).map((a) => a.name), ["Ayu", "Budi"]);
    assert.deepEqual((await awardeeOptions(db, scopeFor(ayu), 1, null)).map((a) => a.name), ["Ayu"]);
    // Manwil Bandung memaksakan wilayah Medan: daftarnya kosong, bukan berisi nama orang Medan.
    assert.deepEqual(await awardeeOptions(db, scopeFor(manwilBandung), 1, 2), []);
  });
});

describe("kartu angka dashboard", () => {
  test("empat angka besar dihitung dari awardee, bukan dari jawaban", async () => {
    const { totals } = await analyticsDashboard(db, scopeFor(admin), 1, EMPTY_FILTER);
    assert.deepEqual(
      { awardee: totals.awardees, wilayah: totals.regions, responden: totals.responses, ipk: totals.ipk },
      // 4 awardee BA15 di 3 wilayah; 5 respons semuanya milik PU. IPK = rata-rata IPK tiap orang.
      { awardee: 4, wilayah: 3, responden: 5, ipk: 2.63 },
    );
  });

  test("memilih satu pengukuran membuat kartu angka bicara tentang jenis itu saja", async () => {
    const pu = await analyticsDashboard(db, scopeFor(admin), 1, filter({ code: "PU" }));
    assert.deepEqual(pu.types.map((t) => t.code), ["PU"]);
    assert.equal(pu.totals.responses, 5);

    // SA belum punya jawaban sama sekali: respons 0 dan IPK kosong, bukan nol.
    const sa = await analyticsDashboard(db, scopeFor(admin), 1, filter({ code: "SA" }));
    assert.deepEqual({ responden: sa.totals.responses, ipk: sa.totals.ipk, awardee: sa.totals.awardees }, { responden: 0, ipk: null, awardee: 4 });
  });

  test("kartu angka ikut menyempit oleh lingkup dan saringan", async () => {
    const manwil = await analyticsDashboard(db, scopeFor(manwilBandung), 1, EMPTY_FILTER);
    assert.deepEqual({ awardee: manwil.totals.awardees, wilayah: manwil.totals.regions }, { awardee: 2, wilayah: 1 });

    const satu = await analyticsDashboard(db, scopeFor(admin), 1, filter({ awardeeId: 1 }));
    assert.deepEqual({ awardee: satu.totals.awardees, wilayah: satu.totals.regions, ipk: satu.totals.ipk }, { awardee: 1, wilayah: 1, ipk: 3 });
  });
});

describe("rincian satu jenis", () => {
  test("rata-rata per soal dihitung lintas awardee dalam lingkup", async () => {
    const pu = (await measurementAnalytics(db, scopeFor(admin), 1, "PU", EMPTY_FILTER))!;
    assert.deepEqual(
      pu.questions.map((q) => [q.code, q.average, q.responses]),
      // Q1: (4+3+4+1+3)/5 = 3.00   Q2: (3+2+4+0+3)/5 = 2.40
      [["Q1", 3, 5], ["Q2", 2.4, 5]],
    );
  });

  test("awardee yang belum dinilai tetap muncul sebagai baris kosong", async () => {
    const sa = (await measurementAnalytics(db, scopeFor(admin), 1, "SA", EMPTY_FILTER))!;
    assert.equal(sa.rows.length, 4);
    assert.deepEqual([...new Set(sa.rows.map((r) => r.ipk))], [null]);
    assert.deepEqual([...new Set(sa.rows.map((r) => r.responses))], [0]);
  });

  test("rincian per wilayah memberi bobot sama tiap awardee", async () => {
    const pu = (await measurementAnalytics(db, scopeFor(admin), 1, "PU", EMPTY_FILTER))!;
    assert.deepEqual(
      pu.regions.map((r) => [r.region, r.awardees, r.ipk]),
      // Bandung: Ayu 3.00 (2 responden) & Budi 4.00 (1) → 3.50, bukan 3.33.
      [["Bandung", 2, 3.5], ["Makassar", 1, 3], ["Medan", 1, 0.5]],
    );
  });

  test("jenis yang tidak dijalankan siklus ini tidak ada", async () => {
    assert.equal(await measurementAnalytics(db, scopeFor(admin), 1, "TIDAKADA", EMPTY_FILTER), null);
  });
});

describe("keterangan siklus", () => {
  test("gambaran siklus utuh: awardee seangkatan, jumlah respons, dan kiriman terakhir", async () => {
    await db.exec(`
      UPDATE responses SET submitted_at = '2026-10-20T03:00:00.000Z' WHERE id = 1;
      UPDATE responses SET submitted_at = '2026-10-22T09:30:00.000Z' WHERE id = 3;
    `);
    const facts = await cycleFacts(db, scopeFor(admin), 1);
    // Eka (BA16) se-wilayah dengan Ayu tetap tidak dihitung: ia bukan bagian dari siklus BA15.
    assert.deepEqual(facts, { awardees: 4, responses: 5, lastAt: "2026-10-22T09:30:00.000Z" });
  });

  test("ikut lingkup pembacanya, dan kiriman yang belum bertanggal tidak membuat galat", async () => {
    // Fixture dasar tanpa submitted_at sama sekali: lastAt kosong, bukan "null" teks atau galat.
    assert.deepEqual(await cycleFacts(db, scopeFor(manwilBandung), 1), { awardees: 2, responses: 3, lastAt: null });
    assert.deepEqual(await cycleFacts(db, scopeFor(ayu), 1), { awardees: 1, responses: 2, lastAt: null });
  });
});

describe("saringan dicocokkan dengan pilihan yang tersedia", () => {
  test("nilai yang ada di dropdown dipertahankan apa adanya", async () => {
    const r = await resolveFilter(db, scopeFor(admin), 1, filter({ code: "PU", regionId: 1, awardeeId: 2 }));
    assert.deepEqual(r.filter, { code: "PU", regionId: 1, awardeeId: 2 });
    assert.deepEqual(r.awardees.map((a) => a.name), ["Ayu", "Budi"]);
  });

  test("jenis yang tidak dijalankan siklus ini dibuang", async () => {
    assert.equal((await resolveFilter(db, scopeFor(admin), 1, filter({ code: "TIDAKADA" }))).filter.code, null);
  });

  test("wilayah di luar lingkup dibuang, jadi Manwil tidak melihat dropdown kosong yang menyesatkan", async () => {
    const r = await resolveFilter(db, scopeFor(manwilBandung), 1, filter({ regionId: 2 }));
    assert.equal(r.filter.regionId, null);
    // Daftar awardee ikut kembali ke seluruh lingkupnya, bukan daftar wilayah yang ditolak tadi.
    assert.deepEqual(r.awardees.map((a) => a.name), ["Ayu", "Budi"]);
  });

  test("awardee yang bukan penghuni wilayah terpilih, atau dari angkatan lain, dibuang", async () => {
    // Citra (id 3) ada di Medan, bukan Bandung.
    assert.equal((await resolveFilter(db, scopeFor(admin), 1, filter({ regionId: 1, awardeeId: 3 }))).filter.awardeeId, null);
    // Eka (id 9) BA16: tidak ada di siklus BA15 walau wilayahnya cocok.
    assert.equal((await resolveFilter(db, scopeFor(admin), 1, filter({ regionId: 1, awardeeId: 9 }))).filter.awardeeId, null);
    // Awardee tidak boleh menarik awardee lain lewat alamat.
    assert.equal((await resolveFilter(db, scopeFor(ayu), 1, filter({ awardeeId: 2 }))).filter.awardeeId, null);
  });
});
