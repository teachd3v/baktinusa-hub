// Pengukuran: pemilik kuesioner yang dipakai ulang lintas angkatan.
// Pagar terpentingnya — susunan soal terkunci begitu ada jawaban lewat periode mana pun.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { createPeriod, getPeriodDetail } from "../lib/data/admin-periods.ts";
import { listAudit } from "../lib/data/audit.ts";
import {
  addCategory,
  addInstrument,
  createMeasurement,
  deleteCategory,
  deleteInstrument,
  deleteMeasurement,
  getFormText,
  getMeasurement,
  listAllInstruments,
  listCategoryOptions,
  listMeasurements,
  renameCategory,
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
  createMeasurement(db, admin, { slug: "pengukuran-baru", name: "Pengukuran Baru", kind: "assessment", ...over });

describe("hanya Admin", () => {
  test("peran lain ditolak", async () => {
    await assert.rejects(listMeasurements(db, manwil), ScopeError);
    await assert.rejects(createMeasurement(db, manwil, { slug: "x", name: "X", kind: "assessment" }), ScopeError);
    await assert.rejects(addCategory(db, manwil, 1, "X"), ScopeError);
  });
});

describe("daftar & rincian", () => {
  test("menghitung sub pengukuran, soal, periode pemakai, dan jawaban", async () => {
    const [m] = await listMeasurements(db, admin);
    // Fixture: 1 pengukuran, 1 kategori, 2 soal, dipakai 1 periode yang sudah punya 5 respons.
    assert.deepEqual(
      { kategori: m!.categories, soal: m!.instruments, periode: m!.periods, jawaban: m!.responses },
      { kategori: 1, soal: 2, periode: 1, jawaban: 5 },
    );

    const detail = (await getMeasurement(db, admin, "uji"))!;
    assert.equal(detail.locked, true); // sudah ada jawaban
    assert.deepEqual(detail.categoriesList.map((c) => c.instruments.map((i) => i.code)), [["Q1", "Q2"]]);
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
    // Soal salinan menunjuk kategori milik pengukuran baru, bukan kategori pengukuran asal.
    assert.notEqual(detail.categoriesList[0]!.id, 1);
    assert.deepEqual(detail.categoriesList[0]!.instruments.map((i) => `${i.code}:${i.answers}`), ["Q1:0", "Q2:0"]);
    assert.deepEqual(await getFormText(db, admin, hasil.id), { title: "Uji", subtitle: null });

    assert.match((await listAudit(db, admin))[0]!.summary, /dibuat dengan 2 soal salinan/);
  });
});

describe("periode memakai pengukuran", () => {
  test("periode baru menunjuk pengukuran, dan soalnya ikut terbaca dari sana", async () => {
    const pengukuran = await baru({ copyFromId: 1 });
    assert.ok(pengukuran.ok);
    const periode = await createPeriod(db, admin, { slug: "ba16-uji", name: "BA16 Uji", batch: "BA16", measurementId: pengukuran.id });
    assert.ok(periode.ok);

    const detail = (await getPeriodDetail(db, admin, "ba16-uji"))!;
    assert.deepEqual(
      { status: detail.status, soal: detail.instruments, respons: detail.responses, pengukuran: detail.measurementSlug },
      { status: "draft", soal: 2, respons: 0, pengukuran: "pengukuran-baru" },
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

describe("sub pengukuran & soal", () => {
  let id: number;
  beforeEach(async () => {
    const hasil = await baru();
    assert.ok(hasil.ok);
    id = hasil.id;
  });

  test("sub pengukuran ditambah, diganti nama, dan hanya bisa dihapus saat kosong", async () => {
    assert.ok((await addCategory(db, admin, id, "Kematangan Diri")).ok);
    assert.equal((await addCategory(db, admin, id, "kematangan diri")).ok, false); // kembar, beda kapital
    const kategori = (await getMeasurement(db, admin, "pengukuran-baru"))!.categoriesList[0]!;

    assert.ok((await renameCategory(db, admin, id, kategori.id, "Kematangan Pribadi")).ok);
    assert.ok((await addInstrument(db, admin, id, kategori.id, { code: "Q1", textPublic: "Yang bersangkutan jujur", textSelf: "Saya jujur", scaleMax: 4 })).ok);

    const terisi = await deleteCategory(db, admin, id, kategori.id);
    assert.match((terisi as { message: string }).message, /masih berisi 1 soal/);
  });

  test("kode soal unik per pengukuran, dan isian divalidasi", async () => {
    await addCategory(db, admin, id, "Kategori");
    const kategori = (await getMeasurement(db, admin, "pengukuran-baru"))!.categoriesList[0]!;
    const soal = { code: "Q1", textPublic: "Pernyataan", textSelf: null, scaleMax: 4 };
    assert.ok((await addInstrument(db, admin, id, kategori.id, soal)).ok);
    assert.equal((await addInstrument(db, admin, id, kategori.id, soal)).ok, false);
    assert.equal((await addInstrument(db, admin, id, kategori.id, { ...soal, code: "Q2", textPublic: " " })).ok, false);
    assert.equal((await addInstrument(db, admin, id, kategori.id, { ...soal, code: "Q2", scaleMax: 99 })).ok, false);
    // Kategori milik pengukuran lain tidak bisa dipakai.
    assert.equal((await addInstrument(db, admin, id, 1, { ...soal, code: "Q3" })).ok, false);
  });

  test("kode yang sama boleh dipakai di pengukuran berbeda", async () => {
    await addCategory(db, admin, id, "Kategori");
    const kategori = (await getMeasurement(db, admin, "pengukuran-baru"))!.categoriesList[0]!;
    // Q1 sudah ada di pengukuran fixture; di pengukuran lain seharusnya tidak bentrok.
    assert.ok((await addInstrument(db, admin, id, kategori.id, { code: "Q1", textPublic: "Pernyataan", textSelf: null, scaleMax: 4 })).ok);
  });
});

describe("pengukuran yang sudah menghasilkan jawaban", () => {
  test("susunan dikunci, tapi teks soal & nama sub pengukuran masih bisa dirapikan", async () => {
    const kunci = await addCategory(db, admin, 1, "Kategori Baru");
    assert.match((kunci as { message: string }).message, /tidak bisa diubah lagi/);

    await db.exec("INSERT INTO response_scores (response_id, instrument_id, score) VALUES (1, 1, 4)");
    const gantiKode = await updateInstrument(db, admin, 1, 1, { code: "Q99", textPublic: "Yang bersangkutan jujur", textSelf: null, scaleMax: 4 });
    assert.match((gantiKode as { message: string }).message, /kode dan skalanya tidak bisa diubah/);

    assert.ok((await updateInstrument(db, admin, 1, 1, { code: "Q1", textPublic: "Yang bersangkutan berlaku jujur", textSelf: "Saya berlaku jujur", scaleMax: 4 })).ok);
    assert.ok((await renameCategory(db, admin, 1, 1, "Kategori Uji Baru")).ok);

    const detail = (await getMeasurement(db, admin, "uji"))!;
    assert.equal(detail.categoriesList[0]!.name, "Kategori Uji Baru");
    assert.equal(detail.categoriesList[0]!.instruments[0]!.textPublic, "Yang bersangkutan berlaku jujur");

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
  test("tanpa saringan: semua soal, lengkap dengan asal pengukuran & sub pengukurannya", async () => {
    const semua = await listAllInstruments(db, admin);
    assert.deepEqual(semua.map((i) => `${i.measurementSlug}/${i.categoryName}/${i.code}`), ["uji/Kategori Uji/Q1", "uji/Kategori Uji/Q2"]);
    assert.equal(semua[0]!.locked, true); // pengukuran fixture sudah punya jawaban
  });

  test("bisa disaring per pengukuran, per sub pengukuran, dan dicari isinya", async () => {
    const lain = await baru({ copyFromId: 1 });
    assert.ok(lain.ok);
    assert.equal((await listAllInstruments(db, admin)).length, 4);
    assert.equal((await listAllInstruments(db, admin, { measurementId: lain.id })).length, 2);

    const kategoriLain = (await getMeasurement(db, admin, "pengukuran-baru"))!.categoriesList[0]!;
    assert.equal((await listAllInstruments(db, admin, { categoryId: kategoriLain.id })).length, 2);

    // Pencarian menjangkau kode, teks penilai, dan teks asesmen mandiri.
    assert.deepEqual((await listAllInstruments(db, admin, { search: "q2" })).map((i) => i.code), ["Q2", "Q2"]);
    assert.deepEqual((await listAllInstruments(db, admin, { search: "disiplin" })).map((i) => i.code), ["Q2", "Q2"]);
    assert.equal((await listAllInstruments(db, admin, { search: "tidak ada" })).length, 0);
  });

  test("soal pengukuran tanpa jawaban tidak ikut terkunci", async () => {
    const lain = await baru({ copyFromId: 1 });
    assert.ok(lain.ok);
    const soal = await listAllInstruments(db, admin, { measurementId: lain.id });
    assert.ok(soal.every((i) => i.locked === false && i.answers === 0));
  });

  test("pilihan sub pengukuran dikelompokkan per pengukuran", async () => {
    await baru({ copyFromId: 1 });
    const opsi = await listCategoryOptions(db, admin);
    assert.deepEqual(opsi.map((o) => `${o.measurementName}/${o.name}`), ["Pengukuran Baru/Kategori Uji", "Pengukuran Uji/Kategori Uji"]);
  });

  test("hanya Admin", async () => {
    await assert.rejects(listAllInstruments(db, manwil), ScopeError);
    await assert.rejects(listCategoryOptions(db, manwil), ScopeError);
  });
});
