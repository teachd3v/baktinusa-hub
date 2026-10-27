// Pengukuran: pemilik kuesioner yang dipakai ulang lintas angkatan.
// Pagar terpentingnya — susunan soal terkunci begitu ada jawaban lewat periode mana pun.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { addMeasurementToPeriod, createPeriod, getPeriodDetail } from "../lib/data/admin-periods.ts";
import { listAudit } from "../lib/data/audit.ts";
import {
  addInstrument,
  createMeasurement,
  deleteInstrument,
  deleteManyInstruments,
  deleteMeasurement,
  getFormText,
  getMeasurement,
  listAllInstruments,
  listMeasurements,
  renameMeasurement,
  updateFormText,
  updateInstrument,
} from "../lib/data/measurements.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

const baru = (over: Partial<Parameters<typeof createMeasurement>[2]> = {}) =>
  createMeasurement(db, admin, { code: "XX", slug: "pengukuran-baru", name: "Pengukuran Baru", filledBy: "public", ...over });

describe("hanya Admin", () => {
  test("peran lain ditolak", async () => {
    await assert.rejects(listMeasurements(db, manwil), ScopeError);
    await assert.rejects(createMeasurement(db, manwil, { code: "XX", slug: "x", name: "X", filledBy: "public" }), ScopeError);
    await assert.rejects(addInstrument(db, manwil, 1, { code: "Q9", statement: "X", scaleMax: 4 }), ScopeError);
  });
});

describe("daftar & rincian", () => {
  test("menghitung soal, siklus pemakai, dan jawaban", async () => {
    // Daftarnya urut kode, jadi yang dicari disebut kodenya — bukan yang pertama.
    const m = (await listMeasurements(db, admin)).find((x) => x.code === "PU");
    // Fixture: PU punya 1 kategori, 2 soal, dijalankan 1 siklus yang sudah punya 5 respons.
    assert.deepEqual(
      { soal: m!.instruments, siklus: m!.periods, jawaban: m!.responses },
      { soal: 2, siklus: 1, jawaban: 5 },
    );

    const detail = (await getMeasurement(db, admin, "uji"))!;
    assert.equal(detail.locked, true); // sudah ada jawaban
    assert.deepEqual(detail.instrumentsList.map((i) => i.code), ["Q1", "Q2"]);
    assert.deepEqual(detail.usedBy.map((p) => `${p.slug}:${p.responses}`), ["uji:5"]);
  });
});

describe("membuat pengukuran", () => {
  test("slug divalidasi dan tidak boleh bentrok", async () => {
    assert.equal((await baru({ slug: "Pengukuran Baru" })).ok, false);
    assert.equal((await baru({ slug: "uji" })).ok, false); // slug pengukuran fixture
    assert.equal((await baru({ name: "  " })).ok, false);
  });

  test("menyalin kuesioner pengukuran lain, tanpa membawa jawabannya", async () => {
    const hasil = await baru({ copyFromId: 1 });
    assert.ok(hasil.ok);

    const detail = (await getMeasurement(db, admin, "pengukuran-baru"))!;
    assert.equal(detail.instruments, 2);
    assert.equal(detail.responses, 0);
    assert.equal(detail.locked, false);
    // Soal salinan berdiri sendiri: jawaban pengukuran asal tidak ikut terbawa.
    assert.deepEqual(detail.instrumentsList.map((i) => `${i.code}:${i.answers}`), ["Q1:0", "Q2:0"]);
    assert.deepEqual(await getFormText(db, admin, hasil.id), { title: "Uji", subtitle: null });

    assert.match((await listAudit(db, admin))[0]!.summary, /dibuat dengan 2 soal salinan/);
  });
});

describe("siklus menjalankan jenis pengukuran", () => {
  test("siklus baru menjalankan jenis, dan soalnya ikut terbaca dari sana", async () => {
    const pengukuran = await baru({ copyFromId: 1 });
    assert.ok(pengukuran.ok);
    const periode = await createPeriod(db, admin, { batch: "BA16", cycle: "awal", slug: "ba16-uji", name: "BA16 Uji" });
    assert.ok(periode.ok);
    assert.ok((await addMeasurementToPeriod(db, admin, periode.id, pengukuran.id)).ok);

    const detail = (await getPeriodDetail(db, admin, "ba16-uji"))!;
    assert.deepEqual(
      { status: detail.status, soal: detail.instruments, respons: detail.responses, jenis: detail.measurements.map((m) => m.code) },
      { status: "draft", soal: 2, respons: 0, jenis: ["XX"] },
    );
  });

  test("pengukuran yang masih dijadwalkan periode tidak bisa dihapus", async () => {
    const hasil = await deleteMeasurement(db, admin, 1);
    assert.equal(hasil.ok, false);
    assert.match((hasil as { message: string }).message, /masih dipakai 1 periode/);
  });

  test("pengukuran tanpa periode boleh dihapus beserta soalnya", async () => {
    const pengukuran = await baru({ copyFromId: 1 });
    assert.ok(pengukuran.ok);
    assert.ok((await deleteMeasurement(db, admin, pengukuran.id)).ok);
    assert.equal(await getMeasurement(db, admin, "pengukuran-baru"), null);
    // Soal pengukuran asal tidak ikut terbawa.
    assert.equal((await getMeasurement(db, admin, "uji"))!.instruments, 2);
  });
});

describe("soal", () => {
  let id: number;
  beforeEach(async () => {
    const hasil = await baru();
    assert.ok(hasil.ok);
    id = hasil.id;
  });

  test("kode soal unik per jenis, dan isian divalidasi", async () => {
    const soal = { code: "Q1", statement: "Pernyataan", scaleMax: 4 };
    assert.ok((await addInstrument(db, admin, id, soal)).ok);
    assert.equal((await addInstrument(db, admin, id, soal)).ok, false); // kode kembar
    assert.equal((await addInstrument(db, admin, id, { ...soal, code: "Q2", statement: " " })).ok, false);
    assert.equal((await addInstrument(db, admin, id, { ...soal, code: "Q2", scaleMax: 99 })).ok, false);
    assert.equal((await addInstrument(db, admin, 999, { ...soal, code: "Q3" })).ok, false); // jenis tak dikenal
  });

  test("kode yang sama boleh dipakai di jenis berbeda", async () => {
    // Q1 sudah ada di jenis fixture; di jenis lain seharusnya tidak bentrok.
    assert.ok((await addInstrument(db, admin, id, { code: "Q1", statement: "Pernyataan", scaleMax: 4 })).ok);
  });

  test("urutannya mengikuti urutan penambahan", async () => {
    await addInstrument(db, admin, id, { code: "Q1", statement: "Satu", scaleMax: 4 });
    await addInstrument(db, admin, id, { code: "Q2", statement: "Dua", scaleMax: 4 });
    const detail = (await getMeasurement(db, admin, "pengukuran-baru"))!;
    assert.deepEqual(detail.instrumentsList.map((i) => i.code), ["Q1", "Q2"]);
  });
});

describe("pengukuran yang sudah menghasilkan jawaban", () => {
  test("susunan dikunci, tapi teks soalnya masih bisa dirapikan", async () => {
    const kunci = await addInstrument(db, admin, 1, { code: "Q9", statement: "Soal baru", scaleMax: 4 });
    assert.match((kunci as { message: string }).message, /tidak bisa ditambah lagi/);

    await db.exec("INSERT INTO response_scores (response_id, instrument_id, score) VALUES (1, 1, 4)");
    const gantiKode = await updateInstrument(db, admin, 1, 1, { code: "Q99", statement: "Yang bersangkutan jujur", scaleMax: 4 });
    assert.match((gantiKode as { message: string }).message, /kode dan skalanya tidak bisa diubah/);

    assert.ok((await updateInstrument(db, admin, 1, 1, { code: "Q1", statement: "Yang bersangkutan berlaku jujur", scaleMax: 4 })).ok);

    const detail = (await getMeasurement(db, admin, "uji"))!;
    assert.equal(detail.instrumentsList[0]!.statement, "Yang bersangkutan berlaku jujur");

    // Soal yang sudah dijawab tidak bisa dihapus.
    assert.match((await deleteInstrument(db, admin, 1, 1) as { message: string }).message, /sudah dijawab 1 kali/);
  });
});

describe("teks form publik", () => {
  test("judul & subjudul bisa diubah tanpa merusak sisa konfigurasi", async () => {
    assert.ok((await updateFormText(db, admin, 1, { title: "Evaluasi Publik", subtitle: "Awardee BAKTI NUSA 16" })).ok);
    assert.deepEqual(await getFormText(db, admin, 1), { title: "Evaluasi Publik", subtitle: "Awardee BAKTI NUSA 16" });

    const row = await db.prepare("SELECT form_config FROM measurements WHERE id = 1").first<{ form_config: string }>();
    const config = JSON.parse(row!.form_config);
    assert.equal(config.scale.length, 2);
    assert.equal(config.feedback[0].field, "saran_diri");

    assert.equal((await updateFormText(db, admin, 1, { title: " ", subtitle: null })).ok, false);
  });

  test("pengukuran tanpa konfigurasi form ditolak dengan jelas", async () => {
    const kosong = await baru();
    assert.ok(kosong.ok);
    assert.match((await updateFormText(db, admin, kosong.id, { title: "X", subtitle: null }) as { message: string }).message, /Salin dari pengukuran lain/);
  });
});

describe("mengganti nama pengukuran", () => {
  test("nama berubah, isinya tidak tersentuh", async () => {
    assert.ok((await renameMeasurement(db, admin, 1, "Pengukuran Awardee 360°")).ok);
    const detail = (await getMeasurement(db, admin, "uji"))!;
    assert.deepEqual({ nama: detail.name, soal: detail.instruments }, { nama: "Pengukuran Awardee 360°", soal: 2 });
    assert.equal((await renameMeasurement(db, admin, 1, "  ")).ok, false);
  });
});

describe("daftar soal lintas pengukuran", () => {
  test("tanpa saringan: semua soal, lengkap dengan asal jenisnya", async () => {
    const semua = await listAllInstruments(db, admin);
    // Urut kode jenis: MA, PA, PU, SA.
    assert.deepEqual(semua.map((i) => `${i.measurementSlug}/${i.code}`), [
      "ma/Q1", "ma/Q2",
      "pa/Q1", "pa/Q2",
      "uji/Q1", "uji/Q2",
      "sa/Q1", "sa/Q2",
    ]);
    // Hanya PU yang sudah punya jawaban, jadi hanya soalnya yang terkunci.
    assert.equal(semua.find((i) => i.measurementSlug === "uji")!.locked, true);
    assert.equal(semua.find((i) => i.measurementSlug === "sa")!.locked, false);
  });

  test("bisa disaring per jenis dan dicari isinya", async () => {
    const lain = await baru({ copyFromId: 1 });
    assert.ok(lain.ok);
    assert.equal((await listAllInstruments(db, admin)).length, 10); // 4 jenis fixture + salinan baru, 2 soal masing-masing
    assert.equal((await listAllInstruments(db, admin, { measurementId: lain.id })).length, 2);

    // Pencarian menjangkau kode dan bunyi soalnya.
    assert.equal((await listAllInstruments(db, admin, { search: "q2" })).length, 5);
    assert.equal((await listAllInstruments(db, admin, { search: "disiplin" })).length, 5);
    assert.equal((await listAllInstruments(db, admin, { search: "tidak ada" })).length, 0);
  });

  test("soal pengukuran tanpa jawaban tidak ikut terkunci", async () => {
    const lain = await baru({ copyFromId: 1 });
    assert.ok(lain.ok);
    const soal = await listAllInstruments(db, admin, { measurementId: lain.id });
    assert.ok(soal.every((i) => i.locked === false && i.answers === 0));
  });

  test("hanya Admin", async () => {
    await assert.rejects(listAllInstruments(db, manwil), ScopeError);
  });
});

describe("hapus massal soal", () => {
  test("hanya Admin yang boleh", async () => {
    await assert.rejects(deleteManyInstruments(db, manwil, [3, 4]), ScopeError);
  });

  test("berhasil menghapus beberapa soal tanpa jawaban dan mencatat audit", async () => {
    // Soal 3 & 4 milik SA (belum ada jawaban di fixture)
    const outcomes = await deleteManyInstruments(db, admin, [3, 4]);
    assert.equal(outcomes.length, 2);
    assert.equal(outcomes[0]!.ok, true);
    assert.equal(outcomes[1]!.ok, true);

    const sisa = await db.prepare("SELECT COUNT(*) AS n FROM instruments WHERE id IN (3, 4)").first<{ n: number }>();
    assert.equal(sisa?.n, 0);

    const audits = await listAudit(db, admin);
    const audit = audits.find((a) => a.action === "soal.hapus-massal");
    assert.ok(audit);
    assert.match(audit.summary, /2 dari 2 butir soal dihapus/);
  });

  test("soal yang sudah memiliki jawaban ditolak untuk dihapus", async () => {
    // Tambah skor jawaban ke soal 1
    await db.exec("INSERT INTO response_scores (response_id, instrument_id, score) VALUES (1, 1, 4)");

    const outcomes = await deleteManyInstruments(db, admin, [1, 5]); // Soal 1 punya skor, soal 5 (PA Q1) tidak
    assert.equal(outcomes[0]!.ok, false);
    assert.match(outcomes[0]!.message, /sudah dijawab 1 kali/);
    assert.equal(outcomes[1]!.ok, true);

    // Pastikan soal 1 tidak terhapus
    const q1 = await db.prepare("SELECT 1 FROM instruments WHERE id = 1").first();
    assert.ok(q1);
    // Soal 5 terhapus
    const q5 = await db.prepare("SELECT 1 FROM instruments WHERE id = 5").first();
    assert.equal(q5, null);
  });
});
