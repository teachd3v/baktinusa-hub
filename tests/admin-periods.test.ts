// Konsol periode: pagar yang menjaga Admin dari langkah yang merusak data, plus jejak auditnya.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  addMeasurementToPeriod,
  createPeriod,
  deletePeriod,
  getPeriodDetail,
  listPeriodsForAdmin,
  removeMeasurementFromPeriod,
  setPeriodStatus,
  updatePeriod,
  updatePeriodDetails,
  updateMeasurementConfig,
} from "../lib/data/admin-periods.ts";
import { listAudit } from "../lib/data/audit.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { isoToWibInput, wibInputToIso } from "../lib/waktu.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

const detail = () => getPeriodDetail(db, admin, "uji");

describe("waktu WIB", () => {
  test("input WIB disimpan sebagai UTC, dan kembali utuh saat ditampilkan", () => {
    assert.deepEqual(wibInputToIso("2026-10-01T23:59"), { ok: true, iso: "2026-10-01T16:59:00.000Z" });
    assert.equal(isoToWibInput("2026-10-01T16:59:00.000Z"), "2026-10-01T23:59");
    assert.deepEqual(wibInputToIso(""), { ok: true, iso: null }); // kosong = tanpa batas
    assert.equal(wibInputToIso("1 Oktober 2026").ok, false);
    assert.equal(isoToWibInput(null), "");
  });
});

describe("hanya Admin", () => {
  test("peran lain ditolak di semua jalur ubah", async () => {
    await assert.rejects(getPeriodDetail(db, manwil, "uji"), ScopeError);
    await assert.rejects(setPeriodStatus(db, manwil, 1, "closed"), ScopeError);
    await assert.rejects(updatePeriod(db, manwil, 1, { name: "X", opensAt: null, closesAt: null }), ScopeError);
  });
});

describe("jadwal periode", () => {
  test("nama kosong dan urutan waktu terbalik ditolak", async () => {
    assert.equal((await updatePeriod(db, admin, 1, { name: "  ", opensAt: null, closesAt: null })).ok, false);
    const terbalik = await updatePeriod(db, admin, 1, {
      name: "Periode Uji",
      opensAt: "2026-10-10T00:00:00.000Z",
      closesAt: "2026-10-01T00:00:00.000Z",
    });
    assert.deepEqual(terbalik, { ok: false, message: "Waktu tutup harus setelah waktu buka." });
  });

  test("perubahan tersimpan dan tercatat di jejak audit", async () => {
    const saved = await updatePeriod(db, admin, 1, { name: "Pengukuran BA16", opensAt: null, closesAt: "2026-12-31T16:59:00.000Z" });
    assert.ok(saved.ok);
    const after = (await detail())!;
    assert.equal(after.name, "Pengukuran BA16");
    assert.equal(after.closesAt, "2026-12-31T16:59:00.000Z");

    const [entry] = await listAudit(db, admin);
    assert.equal(entry!.action, "siklus.ubah");
    assert.equal(entry!.actorName, "Admin");
    assert.match(entry!.summary, /Pengukuran BA16/);
  });
});

describe("status periode", () => {
  test("tidak bisa dibuka kalau belum ada pertanyaan", async () => {
    await db.prepare("DELETE FROM instruments").run();
    await db.prepare("UPDATE periods SET status = 'draft'").run();
    const hasil = await setPeriodStatus(db, admin, 1, "open");
    assert.deepEqual(hasil, { ok: false, message: "Jenis pengukuran yang dipilih belum punya satu pun soal, jadi belum bisa dibuka." });
  });

  test("periode yang sudah menerima jawaban tidak bisa dikembalikan ke draft", async () => {
    const hasil = await setPeriodStatus(db, admin, 1, "draft");
    assert.equal(hasil.ok, false);
    assert.match((hasil as { message: string }).message, /sudah menerima jawaban/);
    assert.equal((await detail())!.status, "open");
  });

  test("menutup periode boleh, dan status yang sama bukan error", async () => {
    assert.ok((await setPeriodStatus(db, admin, 1, "closed")).ok);
    assert.equal((await detail())!.status, "closed");
    assert.ok((await setPeriodStatus(db, admin, 1, "closed")).ok);
    // Status yang tidak berubah tidak perlu meninggalkan jejak.
    assert.equal((await listAudit(db, admin)).filter((e) => e.action === "siklus.status").length, 1);
  });
});

describe("jenis pengukuran dalam siklus", () => {
  test("target 'fixed' wajib punya angka, aturan lain mengosongkannya", async () => {
    const kosong = await updateMeasurementConfig(db, admin, 1, 1, { targetRule: "fixed", targetMin: null, opensAt: null, closesAt: null });
    assert.deepEqual(kosong, { ok: false, message: "Isi target minimal responden (1–1000)." });

    assert.ok((await updateMeasurementConfig(db, admin, 1, 1, { targetRule: "fixed", targetMin: 25, opensAt: null, closesAt: null })).ok);
    assert.ok((await updateMeasurementConfig(db, admin, 1, 3, { targetRule: "region_peers", targetMin: 99, opensAt: null, closesAt: null })).ok);

    const jenis = (await detail())!.measurements;
    assert.equal(jenis.find((m) => m.code === "PU")!.targetMin, 25);
    assert.equal(jenis.find((m) => m.code === "PA")!.targetMin, null);
  });

  test("jendela per tipe tersimpan, dan urutannya diperiksa", async () => {
    const terbalik = await updateMeasurementConfig(db, admin, 1, 2, {
      targetRule: "fixed",
      targetMin: 1,
      opensAt: "2026-11-01T00:00:00.000Z",
      closesAt: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(terbalik.ok, false);

    assert.ok(
      (await updateMeasurementConfig(db, admin, 1, 2, {
        targetRule: "fixed",
        targetMin: 1,
        opensAt: "2026-10-01T00:00:00.000Z",
        closesAt: "2026-11-01T00:00:00.000Z",
      })).ok,
    );
    const awal = (await detail())!.measurements.find((m) => m.code === "SA")!;
    assert.equal(awal.opensAt, "2026-10-01T00:00:00.000Z");
  });

  test("jenis bisa ditambah, tapi yang sudah punya jawaban tidak bisa dilepas", async () => {
    await db.prepare("INSERT INTO measurements (id, code, slug, name, filled_by) VALUES (9, 'LA', 'la', 'Leadership Project', 'public')").run();
    assert.ok((await addMeasurementToPeriod(db, admin, 1, 9)).ok);
    assert.equal((await addMeasurementToPeriod(db, admin, 1, 9)).ok, false); // tidak dobel
    assert.ok((await detail())!.measurements.some((m) => m.code === "LA"));

    assert.ok((await removeMeasurementFromPeriod(db, admin, 1, 9)).ok);
    const dipakai = await removeMeasurementFromPeriod(db, admin, 1, 1); // PU punya 5 respons di fixture
    assert.equal(dipakai.ok, false);
    assert.match((dipakai as { message: string }).message, /5 jawaban/);
  });

  test("rincian siklus menghitung soal, respons, dan jenis yang belum dipakai", async () => {
    const d = (await detail())!;
    assert.equal(d.instruments, 8); // empat jenis, dua soal masing-masing
    assert.equal(d.responses, 5);
    assert.deepEqual(d.measurements.map((m) => m.code), ["MA", "PA", "PU", "SA"]);
    assert.deepEqual(d.available, []);
  });
});

describe("CRUD siklus penilaian", () => {
  test("listPeriodsForAdmin menghitung pengukuran dan respons per siklus", async () => {
    const list = await listPeriodsForAdmin(db, admin);
    assert.ok(list.length >= 1);
    const p1 = list.find((p) => p.id === 1);
    assert.ok(p1);
    assert.equal(p1.measurementsCount, 4);
    assert.equal(p1.responsesCount, 5);
  });

  test("membuat siklus baru lalu menghapusnya jika belum ada respons", async () => {
    const created = await createPeriod(db, admin, {
      batch: "BA16",
      cycle: "awal",
      name: "BA16 Siklus Awal",
      slug: "ba16-awal",
    });
    assert.ok(created.ok);
    const newId = (created as { id: number }).id;

    // Menghapus siklus yang baru dibuat (0 respons)
    const del = await deletePeriod(db, admin, newId);
    assert.ok(del.ok);

    const sisa = await db.prepare("SELECT 1 FROM periods WHERE id = ?").bind(newId).first();
    assert.equal(sisa, null);

    const audits = await listAudit(db, admin);
    const audit = audits.find((a) => a.action === "siklus.hapus");
    assert.ok(audit);
    assert.match(audit.summary, /BA16 Siklus Awal/);
  });

  test("siklus yang sudah memiliki respons ditolak untuk dihapus", async () => {
    // Siklus 1 punya 5 respons di fixture
    const del = await deletePeriod(db, admin, 1);
    assert.equal(del.ok, false);
    assert.match((del as { message: string }).message, /sudah memiliki 5 respons jawaban/);

    const tetapAda = await db.prepare("SELECT 1 FROM periods WHERE id = 1").first();
    assert.ok(tetapAda);
  });

  test("updatePeriodDetails memperbarui rincian dan menegakkan guard integritas", async () => {
    // Buat siklus kosong tanpa respons
    const created = await createPeriod(db, admin, {
      batch: "BA16",
      cycle: "akhir",
      name: "BA16 Siklus Akhir",
      slug: "ba16-akhir",
    });
    assert.ok(created.ok);
    const id = (created as { id: number }).id;

    // Update seluruh data (karena responses == 0, angkatan & cycle bebas diubah)
    const upd = await updatePeriodDetails(db, admin, id, {
      name: "BA16 Siklus Evaluasi Akhir",
      batch: "BA16",
      cycle: "tengah",
      slug: "ba16-tengah-baru",
      status: "draft",
      opensAt: "2026-11-01T00:00:00.000Z",
      closesAt: "2026-11-30T23:59:00.000Z",
    });
    assert.ok(upd.ok);

    const updated = await db.prepare("SELECT name, slug, cycle FROM periods WHERE id = ?").bind(id).first<{ name: string; slug: string; cycle: string }>();
    assert.equal(updated?.name, "BA16 Siklus Evaluasi Akhir");
    assert.equal(updated?.slug, "ba16-tengah-baru");
    assert.equal(updated?.cycle, "tengah");

    // Sekarang coba update siklus 1 (yang punya 5 respons): mengubah batch atau cycle ditolak!
    const updLocked = await updatePeriodDetails(db, admin, 1, {
      name: "Ganti Nama",
      batch: "BA99",
      cycle: "awal",
      slug: "uji",
      status: "closed",
      opensAt: null,
      closesAt: null,
    });
    assert.equal(updLocked.ok, false);
    assert.match((updLocked as { message: string }).message, /Angkatan dan siklus terkunci/);
  });
});
