// Hitungan hasil: rata-rata kategori, IPK, predikat, dan lingkup siapa boleh melihat angka siapa.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  awardeeDetail,
  ipkOf,
  predicateOf,
  predicateSpread,
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
  test("IPK = rata-rata berbobot kategori; kategori kosong tidak dihitung nol", () => {
    const cat = (id: number, average: number | null, weight = 1) => ({ id, name: `K${id}`, weight, orderIndex: id, average });
    assert.equal(ipkOf([cat(1, 4), cat(2, 2)]), 3);
    assert.equal(ipkOf([cat(1, 4), cat(2, 2, 3)]), 2.5);
    assert.equal(ipkOf([cat(1, 3), cat(2, null)]), 3);
    assert.equal(ipkOf([cat(1, null)]), null);
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
  test("rata-rata kategori dan IPK dihitung dari semua respons tipe itu", async () => {
    const results = await resultsForScope(db, scopeFor(admin), 1);
    const ayuResult = results.find((r) => r.name === "Ayu")!;
    const external = ayuResult.types.find((t) => t.code === "external")!;
    // Empat jawaban Ayu: 4, 3, 3, 2 → 3.00
    assert.equal(external.responses, 2);
    assert.equal(external.categories[0]!.average, 3);
    assert.equal(external.ipk, 3);
    assert.equal(external.predicate, "sangat_memuaskan");
  });

  test("tipe tanpa jawaban tetap muncul dengan IPK kosong, bukan nol", async () => {
    const [first] = await resultsForScope(db, scopeFor(admin), 1);
    const self = first!.types.find((t) => t.code === "self_initial")!;
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
    assert.deepEqual(detail.questions["external"]!.map((q) => `${q.code}:${q.average}`), ["Q1:3.5", "Q2:2.5"]);
    assert.equal(detail.questions["external"]![0]!.responses, 2);
    assert.deepEqual(detail.feedback.map((f) => f.field), ["saran_diri", "saran_program"]);
    assert.equal(detail.feedback[0]!.typeName, "Jejaring Eksternal");
  });
});

describe("ringkasan dashboard", () => {
  test("rata-rata wilayah memberi bobot sama tiap awardee, bukan tiap jawaban", async () => {
    const results = await resultsForScope(db, scopeFor(admin), 1);
    const regions = summarizeRegions(results, "external");
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
      predicateSpread(results, "external").map((p) => [p.predicate, p.count]),
      [["cumlaude", 1], ["sangat_memuaskan", 2], ["memuaskan", 0], ["perlu_peningkatan", 1], [null, 0]],
    );
    // Belum ada asesmen mandiri sama sekali: keempatnya masuk kolom "belum dinilai", bukan dianggap nol.
    assert.equal(predicateSpread(results, "self_initial").find((p) => p.predicate === null)!.count, 4);
  });
});
