// Pengujian impor massal instrumen per jenis pengukuran.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { listAudit } from "../lib/data/audit.ts";
import {
  applyInstrumentImport,
  generateInstrumentTemplateCsv,
  getTemplateExamples,
  planInstrumentImport,
  type RawInstrumentRow,
} from "../lib/data/import-instruments.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

describe("hanya Admin", () => {
  test("peran lain ditolak", async () => {
    await assert.rejects(planInstrumentImport(db, manwil, 2, [{ Kode: "Q3", Pernyataan: "Soal baru", "Skala Maksimal": "4" }]), ScopeError);
    await assert.rejects(applyInstrumentImport(db, manwil, 2, []), ScopeError);
  });
});

describe("template kuesioner", () => {
  test("template CSV menghasilkan header dan contoh sesuai pengisi", () => {
    const csvSelf = generateInstrumentTemplateCsv({ id: 2, code: "SA", slug: "sa", name: "Self Assessment", filledBy: "self" });
    assert.match(csvSelf, /Kode;Pernyataan;Skala Maksimal/);
    assert.match(csvSelf, /Saya/);

    const csvPeer = generateInstrumentTemplateCsv({ id: 3, code: "PA", slug: "pa", name: "Peer Assessment", filledBy: "peer" });
    assert.match(csvPeer, /Yang bersangkutan/);
  });

  test("getTemplateExamples mengembalikan minimal 3 butir contoh", () => {
    assert.equal(getTemplateExamples("self").length, 3);
    assert.equal(getTemplateExamples("peer").length, 3);
    assert.equal(getTemplateExamples("public").length, 3);
  });
});

describe("rencana impor (plan)", () => {
  test("soal baru pada pengukuran yang belum berjawaban disetujui (buat)", async () => {
    // SA (id: 2) belum ada jawaban
    const plans = await planInstrumentImport(db, admin, 2, [
      { Kode: "Q3", Pernyataan: "Saya mampu memimpin", "Skala Maksimal": "4" },
      { Kode: "Q4", Pernyataan: "Saya terus belajar", "Skala Maksimal": "5" },
    ]);

    assert.equal(plans.length, 2);
    assert.equal(plans[0]!.action, "buat");
    assert.equal(plans[0]!.code, "Q3");
    assert.equal(plans[1]!.action, "buat");
    assert.equal(plans[1]!.scaleMax, 5);
  });

  test("soal yang sudah ada diperbarui (perbarui)", async () => {
    // SA (id: 2) sudah punya Q1 di fixture ("Saya jujur")
    const plans = await planInstrumentImport(db, admin, 2, [
      { Kode: "Q1", Pernyataan: "Saya selalu jujur dan amanah", "Skala Maksimal": "4" },
    ]);

    assert.equal(plans.length, 1);
    assert.equal(plans[0]!.action, "perbarui");
    assert.equal(plans[0]!.code, "Q1");
    assert.equal(plans[0]!.statement, "Saya selalu jujur dan amanah");
  });

  test("kode kembar dalam satu file ditolak", async () => {
    const plans = await planInstrumentImport(db, admin, 2, [
      { Kode: "Q3", Pernyataan: "Soal pertama", "Skala Maksimal": "4" },
      { Kode: "Q3", Pernyataan: "Soal kembar", "Skala Maksimal": "4" },
    ]);

    assert.equal(plans.length, 2);
    assert.equal(plans[0]!.action, "buat");
    assert.equal(plans[1]!.action, "tolak");
    assert.match(plans[1]!.reason, /bentrok dengan baris 2/);
  });

  test("baris dengan format tidak valid ditolak", async () => {
    const plans = await planInstrumentImport(db, admin, 2, [
      { Kode: "", Pernyataan: "Tanpa kode", "Skala Maksimal": "4" },
      { Kode: "Q3", Pernyataan: "", "Skala Maksimal": "4" },
      { Kode: "Q4", Pernyataan: "Skala salah", "Skala Maksimal": "99" },
    ]);

    assert.equal(plans.length, 3);
    assert.equal(plans[0]!.action, "tolak");
    assert.match(plans[0]!.reason, /Kode soal wajib diisi/);
    assert.equal(plans[1]!.action, "tolak");
    assert.match(plans[1]!.reason, /Pernyataan soal wajib diisi/);
    assert.equal(plans[2]!.action, "tolak");
    assert.match(plans[2]!.reason, /Skala maksimal.*tidak valid/);
  });

  test("pengukuran terkunci (sudah punya respons) menolak penambahan soal baru", async () => {
    // PU (id: 1) punya 5 respons di fixture
    const plans = await planInstrumentImport(db, admin, 1, [
      { Kode: "Q99", Pernyataan: "Soal baru yang dilarang", "Skala Maksimal": "4" },
    ]);

    assert.equal(plans.length, 1);
    assert.equal(plans[0]!.action, "tolak");
    assert.match(plans[0]!.reason, /sudah menghasilkan jawaban/);
  });

  test("pengukuran terkunci mengizinkan perbaikan teks soal yang sudah ada tetapi menolak ubah skala", async () => {
    // PU (id: 1) sudah punya Q1 di fixture
    const plans = await planInstrumentImport(db, admin, 1, [
      { Kode: "Q1", Pernyataan: "Yang bersangkutan sangat jujur", "Skala Maksimal": "4" },
      { Kode: "Q2", Pernyataan: "Yang bersangkutan disiplin", "Skala Maksimal": "5" },
    ]);

    assert.equal(plans[0]!.action, "perbarui");
    assert.equal(plans[1]!.action, "tolak"); // mengubah skala pada soal berjawaban ditolak
    assert.match(plans[1]!.reason, /Skala terkunci/);
  });
});

describe("menerapkan impor (apply)", () => {
  test("menulis soal baru dan memperbarui soal lama ke database serta mencatat audit", async () => {
    // SA (id: 2)
    const plans = await planInstrumentImport(db, admin, 2, [
      { Kode: "Q1", Pernyataan: "Saya selalu jujur dalam setiap keadaan", "Skala Maksimal": "4" },
      { Kode: "Q3", Pernyataan: "Saya menjaga komitmen organisasi", "Skala Maksimal": "4" },
    ]);

    const results = await applyInstrumentImport(db, admin, 2, plans);
    assert.equal(results.length, 2);
    assert.equal(results[0]!.ok, true);
    assert.equal(results[1]!.ok, true);

    // Cek hasil di database
    const q1 = await db.prepare("SELECT statement FROM instruments WHERE measurement_id = 2 AND code = 'Q1'").first<{ statement: string }>();
    assert.equal(q1?.statement, "Saya selalu jujur dalam setiap keadaan");

    const q3 = await db.prepare("SELECT statement, order_index FROM instruments WHERE measurement_id = 2 AND code = 'Q3'").first<{ statement: string; order_index: number }>();
    assert.equal(q3?.statement, "Saya menjaga komitmen organisasi");
    assert.equal(q3?.order_index, 3); // next order index setelah Q1 (1) dan Q2 (2)

    // Cek audit log
    const audits = await listAudit(db, admin);
    const importAudit = audits.find((a) => a.action === "soal.impor");
    assert.ok(importAudit);
    assert.match(importAudit.summary, /1 dibuat, 1 diperbarui/);
  });
});
