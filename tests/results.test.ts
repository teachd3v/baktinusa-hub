// Hitungan hasil: IPK per jenis pengukuran, predikat, dan lingkup siapa boleh melihat angka siapa.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  awardeeDetail,
  ipkOf,
  predicateOf,
  predicateSpread,
  publicPredicateOf,
  publicTypesOf,
  resultsForScope,
  summarizeRegions,
} from "../lib/data/results.ts";
import { scopeFor, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwilBandung: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };
const ayu: SessionUser = { id: 3, name: "Ayu", email: "ayu@contoh.id", role: "awardee", regionId: null, awardeeId: 1 };

let db: D1Database;

// Fixture punya 2 soal di 1 kategori. Di sini kita isi skor nyata: respons eksternal untuk Ayu (id 1 & 2),
// masing-masing satu untuk Budi, Citra, Dedi.
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
    INSERT INTO response_feedback (response_id, field, body) VALUES
      (1, 'saran_diri', 'Pertahankan disiplinnya'),
      (2, 'saran_program', 'Perbanyak mentoring');
  `);
});

describe("rumus", () => {
  // Sejak migrasi 0009 IPK adalah rata-rata polos semua soal dalam satu jenis; sebelumnya rata-rata
  // berbobot antar sub pengukuran. Yang dijaga di sini tinggal pembulatan dan jenis tanpa jawaban.
  test("IPK dibulatkan dua angka; jenis tanpa jawaban tetap kosong, bukan nol", () => {
    assert.equal(ipkOf(3), 3);
    assert.equal(ipkOf(3.456), 3.46);
    assert.equal(ipkOf(null), null);
  });

  test("predikat memakai ambang program BA15", () => {
    assert.deepEqual(
      [4, 3.51, 3.5, 2.76, 2.75, 2, 1.99, 0].map(predicateOf),
      ["cumlaude", "cumlaude", "sangat_memuaskan", "sangat_memuaskan", "memuaskan", "memuaskan", "perlu_peningkatan", "perlu_peningkatan"],
    );
    assert.equal(predicateOf(null), null);
  });
});

describe("hasil per awardee", () => {
  test("IPK dihitung dari semua skor jenis itu, lintas respons", async () => {
    const results = await resultsForScope(db, scopeFor(admin), 1);
    const ayuResult = results.find((r) => r.name === "Ayu")!;
    const pu = ayuResult.types.find((t) => t.code === "PU")!;
    // Empat jawaban Ayu: 4, 3, 3, 2 → 3.00
    assert.equal(pu.responses, 2);
    assert.equal(pu.ipk, 3);
    assert.equal(pu.predicate, "sangat_memuaskan");
  });

  test("tipe tanpa jawaban tetap muncul dengan IPK kosong, bukan nol", async () => {
    const [first] = await resultsForScope(db, scopeFor(admin), 1);
    const self = first!.types.find((t) => t.code === "SA")!;
    assert.deepEqual({ responses: self.responses, ipk: self.ipk, predicate: self.predicate }, { responses: 0, ipk: null, predicate: null });
  });

  test("setiap awardee muncul walau belum ada satu pun jawaban", async () => {
    await db.prepare("DELETE FROM response_scores").run();
    const results = await resultsForScope(db, scopeFor(admin), 1);
    assert.equal(results.length, 4);
    assert.ok(results.every((r) => r.types.every((t) => t.ipk === null)));
  });
});

describe("lingkup", () => {
  test("Awardee hanya melihat dirinya, Manwil hanya wilayahnya, Admin semuanya", async () => {
    assert.deepEqual((await resultsForScope(db, scopeFor(ayu), 1)).map((r) => r.name), ["Ayu"]);
    assert.deepEqual((await resultsForScope(db, scopeFor(manwilBandung), 1)).map((r) => r.name), ["Ayu", "Budi"]);
    assert.equal((await resultsForScope(db, scopeFor(admin), 1)).length, 4);
  });

  test("rincian awardee di luar lingkup tidak bisa dibuka walau kodenya benar", async () => {
    assert.equal(await awardeeDetail(db, scopeFor(ayu), 1, "BBBB0003"), null);
    assert.equal(await awardeeDetail(db, scopeFor(manwilBandung), 1, "CCCC0004"), null);
    assert.ok(await awardeeDetail(db, scopeFor(manwilBandung), 1, "AAAA0002"));
  });

  test("rincian berisi nilai per soal dan saran, dikelompokkan per tipe penilai", async () => {
    const detail = (await awardeeDetail(db, scopeFor(ayu), 1, "aaaa0001"))!;
    assert.deepEqual(detail.questions["PU"]!.map((q) => `${q.code}:${q.average}`), ["Q1:3.5", "Q2:2.5"]);
    assert.equal(detail.questions["PU"]![0]!.responses, 2);
    assert.deepEqual(detail.feedback.map((f) => f.field), ["saran_diri", "saran_program"]);
    assert.equal(detail.feedback[0]!.typeName, "Pengukuran Uji");
  });
});

describe("ringkasan dashboard", () => {
  test("rata-rata wilayah memberi bobot sama tiap awardee, bukan tiap jawaban", async () => {
    const results = await resultsForScope(db, scopeFor(admin), 1);
    const regions = summarizeRegions(results, "PU");
    // Bandung: Ayu 3.00 (dari 2 responden) dan Budi 4.00 (1 responden) → 3.50, bukan 3.33.
    assert.deepEqual(
      regions.map((r) => [r.region, r.ipk, r.awardees]),
      [["Bandung", 3.5, 2], ["Makassar", 3, 1], ["Medan", 0.5, 1]],
    );
  });

  test("sebaran predikat menghitung semua awardee, termasuk yang belum dinilai", async () => {
    const results = await resultsForScope(db, scopeFor(admin), 1);
    // Ayu 3.00 & Dedi 3.00 sangat memuaskan, Budi 4.00 cumlaude, Citra 0.50 perlu peningkatan.
    assert.deepEqual(
      predicateSpread(results, "PU").map((p) => [p.predicate, p.count]),
      [["cumlaude", 1], ["sangat_memuaskan", 2], ["memuaskan", 0], ["perlu_peningkatan", 1], [null, 0]],
    );
    // Belum ada asesmen mandiri sama sekali: keempatnya masuk kolom "belum dinilai", bukan dianggap nol.
    // Kodenya 'SA' — kode asesmen mandiri yang sebenarnya. Dulu baris ini memakai 'self_initial', kode
    // yang dibuang migrasi 0008, jadi ia lulus karena tidak cocok apa pun, bukan karena datanya kosong.
    assert.equal(predicateSpread(results, "SA").find((p) => p.predicate === null)!.count, 4);
  });
});

describe("sudut pandang publik dikenali dari filled_by", () => {
  test("jenis publik dikumpulkan dari filled_by, bukan kode yang ditebak", async () => {
    const results = await resultsForScope(db, scopeFor(admin), 1);
    const types = results[0]!.types;
    // Fixture menjalankan PU (public), SA (self), PA (peer), MA (manwil).
    assert.deepEqual(publicTypesOf(types).map((t) => t.code), ["PU"]);

    // Inilah yang dulu bocor: dashboard mencari kode 'external' dan selalu dapat kosong.
    assert.equal(types.find((t) => t.code === "external"), undefined);

    // Tanpa jenis publik sama sekali: daftar kosong dan predikat null, bukan jenis lain yang kebetulan terambil.
    const tanpaPublik = types.filter((t) => t.audience !== "public");
    assert.deepEqual(publicTypesOf(tanpaPublik), []);
    assert.equal(publicPredicateOf(tanpaPublik), null);
  });

  test("predikat publik menggabungkan beberapa jenis publik dengan bobot sama", async () => {
    // Siklus nyata (BA16 Tengah) membuka PU dan LA berdampingan. LA dibuka di sini dengan satu respons
    // bernilai 4: predikat gabungan Ayu jadi rata-rata PU 3.00 dan LA 4.00 → 3.50, bukan salah satunya.
    await db.exec(`
      INSERT INTO measurements (id, code, slug, name, filled_by) VALUES (5, 'LA', 'la', 'Leadership Assessment', 'public');
      INSERT INTO period_measurements (period_id, measurement_id, target_rule, target_min) VALUES (1, 5, 'fixed', 1);
      INSERT INTO instruments (id, measurement_id, code, statement, order_index) VALUES (9, 5, 'Q1', 'Dampak nyata', 1);
      INSERT INTO responses (id, period_id, awardee_id, measurement_id, source) VALUES (10, 1, 1, 5, 'app');
      INSERT INTO response_scores (response_id, instrument_id, score) VALUES (10, 9, 4);
    `);
    const results = await resultsForScope(db, scopeFor(admin), 1);
    const ayuResult = results.find((r) => r.name === "Ayu")!;
    assert.deepEqual(publicTypesOf(ayuResult.types).map((t) => t.code), ["PU", "LA"]);
    // 3.50 jatuh tepat di bawah ambang cumlaude (3.51), jadi gabungannya "sangat memuaskan" —
    // bukan "cumlaude" yang akan keluar kalau hanya LA yang dibaca.
    assert.equal(publicPredicateOf(ayuResult.types), "sangat_memuaskan");
  });
});

describe("IPK dinormalkan ke skala 0–4", () => {
  test("soal berskala 8 dengan skor dua kali lipat memberi IPK yang sama", async () => {
    // Sebelum normalisasi, skor 6 & 4 pada skala 8 ikut dirata-ratakan apa adanya dan IPK Ayu
    // melonjak dari 3.00 ke 4.25 — di atas batas skalanya sendiri.
    await db.exec(`
      UPDATE instruments SET scale_max = 8 WHERE id = 2;
      UPDATE response_scores SET score = 6 WHERE response_id = 1 AND instrument_id = 2;
      UPDATE response_scores SET score = 4 WHERE response_id = 2 AND instrument_id = 2;
    `);
    const results = await resultsForScope(db, scopeFor(admin), 1);
    const ayuResult = results.find((r) => r.name === "Ayu")!;
    assert.equal(ayuResult.types.find((t) => t.code === "PU")!.ipk, 3);
    assert.equal(ayuResult.types.find((t) => t.code === "PU")!.predicate, "sangat_memuaskan");

    // Rincian per soal ikut dinormalkan, supaya batang 0–4 di layar tidak meluber.
    const detail = (await awardeeDetail(db, scopeFor(admin), 1, "AAAA0001"))!;
    const q2 = detail.questions["PU"]!.find((q) => q.code === "Q2")!;
    assert.equal(q2.average, 2.5); // (6/8 + 4/8) / 2 * 4
  });
});
