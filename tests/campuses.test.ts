// Kampus: daftar pilihan milik wilayah. Yang dijaga di sini adalah hubungannya dengan wilayah —
// kampus yang dipakai awardee tidak boleh hilang, dan kampus wilayah lain tidak boleh bisa dipilih.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  createCampus,
  deleteCampus,
  listCampusOptions,
  listCampusesForAdmin,
  renameCampus,
} from "../lib/data/campuses.ts";
import { createPerson } from "../lib/data/people.ts";
import { createRegion, deleteRegion } from "../lib/data/regions.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

// Fixture: Bandung(1) punya ITB(1) & Unpad(2), Medan(2) punya USU(3), Makassar(3) belum punya kampus.
// Ayu memakai ITB, Citra memakai USU.
let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

describe("hanya Admin", () => {
  test("peran lain ditolak di semua jalur ubah", async () => {
    await assert.rejects(listCampusesForAdmin(db, manwil), ScopeError);
    await assert.rejects(createCampus(db, manwil, 1, "Telkom University"), ScopeError);
    await assert.rejects(renameCampus(db, manwil, 1, "Telkom University"), ScopeError);
    await assert.rejects(deleteCampus(db, manwil, 1), ScopeError);
  });

  test("tapi daftar pilihannya boleh dibaca tanpa peran Admin — dipakai dropdown form", async () => {
    const pilihan = await listCampusOptions(db);
    assert.deepEqual(
      pilihan.map((c) => [c.name, c.regionId]),
      [["ITB", 1], ["USU", 2], ["Unpad", 1]],
    );
  });
});

describe("menambah", () => {
  test("kembar dijaga per wilayah, bukan global", async () => {
    // "USU" sudah ada di Medan, tapi Bandung belum punya — jadi boleh.
    assert.ok((await createCampus(db, admin, 1, "USU")).ok);

    // Di wilayah yang sama, beda huruf besar-kecil tetap dianggap kembar.
    const kembar = await createCampus(db, admin, 1, "itb");
    assert.deepEqual(kembar, { ok: false, message: '"itb" sudah ada di wilayah Bandung.' });
  });

  test("wilayah yang tidak ada ditolak, nama kosong juga", async () => {
    assert.deepEqual(await createCampus(db, admin, 99, "Kampus Hantu"), { ok: false, message: "Wilayah tidak ditemukan." });
    assert.match((await createCampus(db, admin, 1, "   ") as { message: string }).message, /wajib diisi/);
  });
});

describe("mengganti nama", () => {
  test("boleh walau sedang dipakai — justru itu gunanya, merapikan ejaan sekali saja", async () => {
    assert.ok((await renameCampus(db, admin, 1, "Institut Teknologi Bandung")).ok);

    const daftar = await listCampusesForAdmin(db, admin);
    const itb = daftar.find((c) => c.id === 1)!;
    assert.deepEqual({ nama: itb.name, awardee: itb.awardees }, { nama: "Institut Teknologi Bandung", awardee: 1 });
  });

  test("tidak boleh bentrok dengan kampus lain di wilayah yang sama", async () => {
    const bentrok = await renameCampus(db, admin, 1, "Unpad");
    assert.deepEqual(bentrok, { ok: false, message: '"Unpad" sudah ada di wilayah ini.' });
  });
});

describe("menghapus", () => {
  test("kampus yang masih dipakai awardee ditahan", async () => {
    const hasil = await deleteCampus(db, admin, 1); // ITB dipakai Ayu
    assert.deepEqual(hasil, {
      ok: false,
      message: '"ITB" masih dipakai 1 awardee. Pindahkan kampus mereka dulu lewat menu Pengguna.',
    });
  });

  test("yang belum dipakai boleh hilang", async () => {
    assert.ok((await deleteCampus(db, admin, 2)).ok); // Unpad
    assert.deepEqual((await listCampusOptions(db)).map((c) => c.name), ["ITB", "USU"]);
  });
});

describe("hubungannya dengan wilayah", () => {
  test("menghapus wilayah kosong ikut membawa kampusnya — tidak ada yang tertinggal menggantung", async () => {
    // Ketiga wilayah fixture sudah punya awardee, jadi yang diuji wilayah baru yang masih kosong.
    const solo = await createRegion(db, admin, "Solo");
    assert.ok(solo.ok);
    await createCampus(db, admin, (solo as { id: number }).id, "Universitas Sebelas Maret");
    assert.ok((await deleteRegion(db, admin, (solo as { id: number }).id)).ok);

    assert.deepEqual((await listCampusOptions(db)).map((c) => c.name), ["ITB", "USU", "Unpad"]);
  });

  test("kampus wilayah lain tidak bisa dipasang ke awardee, walau kiriman formnya dikarang", async () => {
    const hasil = await createPerson(db, admin, {
      role: "awardee",
      loginId: "BA00399",
      name: "Orang Baru",
      email: "baru@contoh.id",
      password: "BA2026",
      status: "active",
      regionId: 1, // Bandung
      awardeeId: null,
      batch: "BA16",
      campusId: 3, // USU, milik Medan
      referralCode: "BARU0399",
    });
    assert.deepEqual(hasil, { ok: false, message: 'Kampus "USU" milik wilayah Medan, bukan wilayah yang dipilih.' });

    // Tidak ada yang tertulis sebagian: akunnya pun tidak jadi dibuat.
    const akun = await db.prepare("SELECT 1 AS ada FROM users WHERE login_id = 'BA00399'").first<{ ada: number }>();
    assert.equal(akun, null);
  });
});
