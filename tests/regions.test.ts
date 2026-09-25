// Wilayah: CRUD dan pagarnya. Yang paling penting di sini adalah larangan menghapus wilayah terpakai,
// karena itu yang bisa memutus lingkup data Manwil.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { listAudit } from "../lib/data/audit.ts";
import { createRegion, deleteRegion, listRegionsForAdmin, renameRegion } from "../lib/data/regions.ts";
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
  test("peran lain ditolak di semua jalur", async () => {
    await assert.rejects(listRegionsForAdmin(db, manwil), ScopeError);
    await assert.rejects(createRegion(db, manwil, "Solo"), ScopeError);
    await assert.rejects(renameRegion(db, manwil, 1, "Solo"), ScopeError);
    await assert.rejects(deleteRegion(db, manwil, 1), ScopeError);
  });
});

describe("daftar wilayah", () => {
  test("menghitung siapa yang memakainya, supaya Admin tahu sebelum menghapus", async () => {
    const wilayah = await listRegionsForAdmin(db, admin);
    const bandung = wilayah.find((w) => w.name === "Bandung")!;
    // Fixture: Ayu & Budi di Bandung, satu akun Manwil Bandung, dan 3 respons untuk keduanya.
    assert.deepEqual(
      { awardee: bandung.awardees, manwil: bandung.manwils, respons: bandung.responses },
      { awardee: 2, manwil: 1, respons: 3 },
    );
    assert.deepEqual(wilayah.map((w) => w.name), ["Bandung", "Makassar", "Medan"]); // urut abjad
  });
});

describe("menambah & mengganti nama", () => {
  test("nama kosong ditolak dan nama kembar dicegah tanpa peduli huruf besar-kecil", async () => {
    assert.equal((await createRegion(db, admin, "   ")).ok, false);
    assert.equal((await createRegion(db, admin, "bandung")).ok, false);
    assert.ok((await createRegion(db, admin, "Bogor")).ok);
    assert.equal((await renameRegion(db, admin, 1, "MEDAN")).ok, false);
  });

  test("mengganti nama tidak memutus hubungan awardee maupun Manwil", async () => {
    assert.ok((await renameRegion(db, admin, 1, "Bandung Raya")).ok);
    const wilayah = (await listRegionsForAdmin(db, admin)).find((w) => w.id === 1)!;
    assert.deepEqual({ nama: wilayah.name, awardee: wilayah.awardees, manwil: wilayah.manwils }, { nama: "Bandung Raya", awardee: 2, manwil: 1 });

    const [jejak] = await listAudit(db, admin);
    assert.match(jejak!.summary, /"Bandung" diganti nama jadi "Bandung Raya"/);
  });

  test("nama yang sama persis bukan error, hanya tidak melakukan apa-apa", async () => {
    assert.ok((await renameRegion(db, admin, 1, "Bandung")).ok);
    assert.equal((await listAudit(db, admin)).length, 0);
  });
});

describe("menghapus", () => {
  test("wilayah yang masih dipakai ditolak, dengan alasan yang menyebut pemakainya", async () => {
    const hasil = await deleteRegion(db, admin, 1);
    assert.equal(hasil.ok, false);
    assert.match((hasil as { message: string }).message, /2 awardee dan 1 akun Manwil/);

    // Wilayah tanpa Manwil tetap tertahan kalau masih ada awardee-nya.
    const makassar = await deleteRegion(db, admin, 3);
    assert.match((makassar as { message: string }).message, /1 awardee/);
  });

  test("wilayah kosong bisa dihapus dan tercatat di jejak", async () => {
    const baru = await createRegion(db, admin, "Bogor");
    assert.ok(baru.ok);
    assert.ok((await deleteRegion(db, admin, baru.id)).ok);
    assert.ok(!(await listRegionsForAdmin(db, admin)).some((w) => w.name === "Bogor"));
    assert.equal((await listAudit(db, admin))[0]!.action, "wilayah.hapus");
  });

  test("wilayah yang tidak ada dijawab jelas, bukan diam-diam berhasil", async () => {
    assert.deepEqual(await deleteRegion(db, admin, 999), { ok: false, message: "Wilayah tidak ditemukan." });
    assert.deepEqual(await renameRegion(db, admin, 999, "X"), { ok: false, message: "Wilayah tidak ditemukan." });
  });
});
