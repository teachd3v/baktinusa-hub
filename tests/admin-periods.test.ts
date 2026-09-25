// Konsol periode: pagar yang menjaga Admin dari langkah yang merusak data, plus jejak auditnya.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  addTypeToPeriod,
  getPeriodDetail,
  removeTypeFromPeriod,
  setPeriodStatus,
  updatePeriod,
  updateTypeConfig,
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
    assert.equal(entry!.action, "periode.ubah");
    assert.equal(entry!.actorName, "Admin");
    assert.match(entry!.summary, /Pengukuran BA16/);
  });
});

describe("status periode", () => {
  test("tidak bisa dibuka kalau belum ada pertanyaan", async () => {
    await db.prepare("DELETE FROM instruments").run();
    await db.prepare("UPDATE periods SET status = 'draft'").run();
    const hasil = await setPeriodStatus(db, admin, 1, "open");
    assert.deepEqual(hasil, { ok: false, message: "Periode belum punya pertanyaan, jadi belum bisa dibuka." });
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
    assert.equal((await listAudit(db, admin)).filter((e) => e.action === "periode.status").length, 1);
  });
});

describe("tipe penilai dalam periode", () => {
  test("target 'fixed' wajib punya angka, aturan lain mengosongkannya", async () => {
    const kosong = await updateTypeConfig(db, admin, 1, 5, { targetRule: "fixed", targetMin: null, opensAt: null, closesAt: null });
    assert.deepEqual(kosong, { ok: false, message: "Isi target minimal responden (1–1000)." });

    assert.ok((await updateTypeConfig(db, admin, 1, 5, { targetRule: "fixed", targetMin: 25, opensAt: null, closesAt: null })).ok);
    assert.ok((await updateTypeConfig(db, admin, 1, 3, { targetRule: "region_peers", targetMin: 99, opensAt: null, closesAt: null })).ok);

    const types = (await detail())!.types;
    assert.equal(types.find((t) => t.code === "external")!.targetMin, 25);
    assert.equal(types.find((t) => t.code === "peer")!.targetMin, null);
  });

  test("jendela per tipe tersimpan, dan urutannya diperiksa", async () => {
    const terbalik = await updateTypeConfig(db, admin, 1, 1, {
      targetRule: "fixed",
      targetMin: 1,
      opensAt: "2026-11-01T00:00:00.000Z",
      closesAt: "2026-10-01T00:00:00.000Z",
    });
    assert.equal(terbalik.ok, false);

    assert.ok(
      (await updateTypeConfig(db, admin, 1, 1, {
        targetRule: "fixed",
        targetMin: 1,
        opensAt: "2026-10-01T00:00:00.000Z",
        closesAt: "2026-11-01T00:00:00.000Z",
      })).ok,
    );
    const awal = (await detail())!.types.find((t) => t.code === "self_initial")!;
    assert.equal(awal.opensAt, "2026-10-01T00:00:00.000Z");
  });

  test("tipe bisa ditambah, tapi yang sudah punya jawaban tidak bisa dilepas", async () => {
    await db.prepare("INSERT INTO respondent_types (id, code, name, audience) VALUES (9, 'lp_team', 'Tim Proyek', 'external')").run();
    assert.ok((await addTypeToPeriod(db, admin, 1, 9)).ok);
    assert.equal((await addTypeToPeriod(db, admin, 1, 9)).ok, false); // tidak dobel
    assert.ok((await detail())!.types.some((t) => t.code === "lp_team"));

    assert.ok((await removeTypeFromPeriod(db, admin, 1, 9)).ok);
    const dipakai = await removeTypeFromPeriod(db, admin, 1, 5); // jejaring eksternal punya 5 respons di fixture
    assert.equal(dipakai.ok, false);
    assert.match((dipakai as { message: string }).message, /5 jawaban/);
  });

  test("rincian periode menghitung pertanyaan, respons, dan tipe yang belum dipakai", async () => {
    const d = (await detail())!;
    assert.equal(d.instruments, 2);
    assert.equal(d.responses, 5);
    assert.deepEqual(d.types.map((t) => t.code), ["self_initial", "peer", "manwil", "external"]);
    assert.deepEqual(d.available, []);
  });
});
