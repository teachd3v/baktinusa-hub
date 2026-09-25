// Membuka angkatan baru dari konsol: bikin periode, salin kuesioner, susun pertanyaan — tanpa menyentuh kode.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  addCategory,
  addInstrument,
  createPeriod,
  deleteCategory,
  deleteInstrument,
  getFormText,
  listInstruments,
  updateFormText,
  updateInstrument,
} from "../lib/data/admin-instruments.ts";
import { getPeriodDetail } from "../lib/data/admin-periods.ts";
import { listAudit } from "../lib/data/audit.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

const baru = (over: Partial<Parameters<typeof createPeriod>[2]> = {}) =>
  createPeriod(db, admin, { slug: "ba16-pengukuran", name: "BA16 · Pengukuran", batch: "BA16", kind: "assessment", ...over });

describe("membuat periode", () => {
  test("hanya Admin", async () => {
    await assert.rejects(createPeriod(db, manwil, { slug: "x", name: "X", batch: "BA16", kind: "assessment" }), ScopeError);
  });

  test("slug divalidasi dan tidak boleh bentrok", async () => {
    assert.equal((await baru({ slug: "BA16 Pengukuran" })).ok, false);
    assert.equal((await baru({ slug: "uji" })).ok, false); // sudah dipakai fixture
    assert.equal((await baru({ name: "  " })).ok, false);
    assert.equal((await baru({ batch: "" })).ok, false);
  });

  test("periode baru lahir sebagai draft tanpa tanggal", async () => {
    const hasil = await baru();
    assert.ok(hasil.ok);
    const detail = (await getPeriodDetail(db, admin, "ba16-pengukuran"))!;
    assert.deepEqual(
      { status: detail.status, opensAt: detail.opensAt, closesAt: detail.closesAt, instruments: detail.instruments, responses: detail.responses },
      { status: "draft", opensAt: null, closesAt: null, instruments: 0, responses: 0 },
    );
  });

  test("menyalin kerangka periode lama: kategori, soal, dan tipe penilai — tanpa jawaban", async () => {
    const hasil = await baru({ copyFromId: 1 });
    assert.ok(hasil.ok);
    const detail = (await getPeriodDetail(db, admin, "ba16-pengukuran"))!;
    assert.equal(detail.instruments, 2);
    assert.equal(detail.responses, 0);
    assert.deepEqual(detail.types.map((t) => t.code), ["self_initial", "peer", "manwil", "external"]);

    const categories = await listInstruments(db, admin, hasil.id);
    assert.deepEqual(categories.map((c) => c.name), ["Kategori Uji"]);
    // Soal salinan menunjuk kategori periode baru, bukan kategori periode lama.
    assert.deepEqual(categories[0]!.instruments.map((i) => `${i.code}:${i.answers}`), ["Q1:0", "Q2:0"]);

    const [entry] = await listAudit(db, admin);
    assert.match(entry!.summary, /dibuat dengan 2 pertanyaan salinan/);
  });
});

describe("menyusun kuesioner", () => {
  let periodId: number;
  beforeEach(async () => {
    const hasil = await baru();
    assert.ok(hasil.ok);
    periodId = hasil.id;
  });

  test("kategori bisa ditambah, dan hanya bisa dihapus saat kosong", async () => {
    assert.ok((await addCategory(db, admin, periodId, "Kematangan Diri")).ok);
    assert.equal((await addCategory(db, admin, periodId, "  ")).ok, false);
    const [kategori] = await listInstruments(db, admin, periodId);
    assert.equal(kategori!.name, "Kematangan Diri");

    assert.ok((await addInstrument(db, admin, periodId, kategori!.id, { code: "Q1", textPublic: "Yang bersangkutan jujur", textSelf: "Saya jujur", scaleMax: 4 })).ok);
    const terisi = await deleteCategory(db, admin, periodId, kategori!.id);
    assert.equal(terisi.ok, false);
    assert.match((terisi as { message: string }).message, /masih berisi 1 pertanyaan/);
  });

  test("kode soal unik per periode, dan isian divalidasi", async () => {
    await addCategory(db, admin, periodId, "Kategori");
    const [kategori] = await listInstruments(db, admin, periodId);
    const soal = { code: "Q1", textPublic: "Pernyataan", textSelf: null, scaleMax: 4 };
    assert.ok((await addInstrument(db, admin, periodId, kategori!.id, soal)).ok);
    assert.equal((await addInstrument(db, admin, periodId, kategori!.id, soal)).ok, false);
    assert.equal((await addInstrument(db, admin, periodId, kategori!.id, { ...soal, code: "Q2", textPublic: " " })).ok, false);
    assert.equal((await addInstrument(db, admin, periodId, kategori!.id, { ...soal, code: "Q2", scaleMax: 99 })).ok, false);
    // Kategori milik periode lain tidak bisa dipakai.
    assert.equal((await addInstrument(db, admin, periodId, 1, { ...soal, code: "Q3" })).ok, false);
  });
});

describe("periode yang sudah menerima jawaban", () => {
  test("susunan pertanyaan dikunci, teksnya masih bisa diperbaiki", async () => {
    // Periode 1 di fixture punya 5 respons.
    const kunci = await addCategory(db, admin, 1, "Kategori Baru");
    assert.equal(kunci.ok, false);
    assert.match((kunci as { message: string }).message, /tidak bisa diubah lagi/);

    // Q1 sudah punya jawaban; ganti kode ditolak, perbaikan teks diterima.
    await db.exec("INSERT INTO response_scores (response_id, instrument_id, score) VALUES (1, 1, 4)");
    const gantiKode = await updateInstrument(db, admin, 1, 1, { code: "Q99", textPublic: "Yang bersangkutan jujur", textSelf: "Saya jujur", scaleMax: 4 });
    assert.equal(gantiKode.ok, false);
    assert.ok(
      (await updateInstrument(db, admin, 1, 1, { code: "Q1", textPublic: "Yang bersangkutan berlaku jujur", textSelf: "Saya berlaku jujur", scaleMax: 4 })).ok,
    );
    const kategori = await listInstruments(db, admin, 1);
    assert.equal(kategori[0]!.instruments[0]!.textPublic, "Yang bersangkutan berlaku jujur");

    // Soal yang sudah dijawab tidak bisa dihapus; yang belum, boleh.
    const dijawab = await deleteInstrument(db, admin, 1, 1);
    assert.equal(dijawab.ok, false);
    assert.match((dijawab as { message: string }).message, /sudah dijawab 1 kali/);
    assert.ok((await deleteInstrument(db, admin, 1, 2)).ok);
  });
});

describe("teks form publik", () => {
  test("judul & subjudul bisa diubah tanpa merusak sisa konfigurasi", async () => {
    const hasil = await baru({ copyFromId: 1 });
    assert.ok(hasil.ok);
    // Salinan membawa teks angkatan lama; itulah yang harus bisa diperbaiki Admin.
    assert.deepEqual(await getFormText(db, admin, hasil.id), { title: "Uji", subtitle: null });

    assert.ok((await updateFormText(db, admin, hasil.id, { title: "Evaluasi Publik", subtitle: "Awardee BAKTI NUSA 16" })).ok);
    assert.deepEqual(await getFormText(db, admin, hasil.id), { title: "Evaluasi Publik", subtitle: "Awardee BAKTI NUSA 16" });

    const row = await db.prepare("SELECT form_config FROM periods WHERE id = ?").bind(hasil.id).first<{ form_config: string }>();
    const config = JSON.parse(row!.form_config);
    assert.equal(config.scale.length, 2); // skala & pertanyaan non-skor tetap utuh
    assert.equal(config.feedback[0].field, "saran_diri");

    assert.equal((await updateFormText(db, admin, hasil.id, { title: " ", subtitle: null })).ok, false);
  });

  test("periode tanpa konfigurasi form ditolak dengan jelas", async () => {
    const kosong = await baru({ slug: "ba16-kosong" });
    assert.ok(kosong.ok);
    const hasil = await updateFormText(db, admin, kosong.id, { title: "X", subtitle: null });
    assert.equal(hasil.ok, false);
    assert.match((hasil as { message: string }).message, /Salin dari periode lain/);
  });
});
