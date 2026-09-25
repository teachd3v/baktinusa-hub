// Impor massal: memeriksa dulu, menulis belakangan. Yang diuji terutama tahap "rencana", karena di situlah
// kesalahan berkas harus ketahuan sebelum satu baris pun masuk database.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { findUserForLogin } from "../lib/data/auth.ts";
import { applyPlan, planImport, type RawRow } from "../lib/data/import-people.ts";
import { verifyPassword } from "../lib/data/password.ts";
import { listPeople } from "../lib/data/people.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

const baris = (over: Partial<RawRow> = {}): RawRow => ({
  ID: "BA00301",
  Nama: "Orang Baru",
  Email: "baru@contoh.id",
  Peran: "Awardee",
  Wilayah: "Bandung",
  Angkatan: "BA16",
  "Kode Referal": "BARU0301",
  Kampus: "Universitas Uji",
  "Kata Sandi": "BA2026",
  Status: "aktif",
  ...over,
});

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

const rencana = (rows: RawRow[]) => planImport(db, admin, rows);
const alasan = async (row: RawRow) => (await rencana([row]))[0]!.reason;

describe("hanya Admin", () => {
  test("peran lain ditolak", async () => {
    await assert.rejects(planImport(db, manwil, [baris()]), ScopeError);
    await assert.rejects(applyPlan(db, manwil, []), ScopeError);
  });
});

describe("membaca berkas", () => {
  test("judul kolom tidak peka huruf besar-kecil dan spasi berlebih", async () => {
    const [plan] = await rencana([{ " id ": "BA00301", "NAMA": "Orang Baru", "e-mail": "x@contoh.id", "Peran": "awardee", "Wilayah": "bandung", "Angkatan": "BA16", "kode referal": "BARU0301", "Kata Sandi": "BA2026", "Status": "" }]);
    assert.equal(plan!.action, "buat");
    assert.equal(plan!.loginId, "BA00301");
  });

  test("baris kosong dari Excel dilewati, bukan jadi galat", async () => {
    const plans = await rencana([{ ID: "", Nama: "", Email: "", Peran: "" }, baris()]);
    assert.equal(plans.length, 1);
    assert.equal(plans[0]!.line, 3); // nomor barisnya tetap mengikuti berkas asli
  });

  test("peran dan status ditulis dengan gaya apa pun tetap dikenali", async () => {
    for (const peran of ["Admin", "manwil", "Manajer Wilayah", "AWARDEE"]) {
      const [plan] = await rencana([baris({ Peran: peran, ID: "X001", "Kode Referal": "XXXX0001", Email: "" })]);
      assert.notEqual(plan!.action, "tolak", `${peran}: ${plan!.reason}`);
    }
    const [nonaktif] = await rencana([baris({ Status: "Non-Aktif" })]);
    assert.equal(nonaktif!.input!.status, "disabled");
  });
});

describe("memeriksa sebelum menulis", () => {
  test("isian keliru ditolak dengan alasan yang bisa ditindaklanjuti", async () => {
    assert.match(await alasan(baris({ ID: "BA 1" })), /ID masuk/);
    assert.match(await alasan(baris({ Peran: "Ketua" })), /Peran "Ketua" tidak dikenal/);
    assert.match(await alasan(baris({ Status: "libur" })), /Status "libur" tidak dikenal/);
    assert.match(await alasan(baris({ Nama: "" })), /Nama wajib diisi/);
    assert.match(await alasan(baris({ Wilayah: "Wakanda" })), /belum ada. Tambahkan dulu di menu Wilayah/);
    assert.match(await alasan(baris({ Peran: "Manwil", Wilayah: "" })), /Manwil wajib punya wilayah/);
    assert.match(await alasan(baris({ "Kata Sandi": "" })), /wajib punya kata sandi/);
    assert.match(await alasan(baris({ "Kata Sandi": "123" })), /minimal 6 karakter/);
    assert.match(await alasan(baris({ "Kode Referal": "" })), /wajib punya kode referal/);
    assert.match(await alasan(baris({ Angkatan: "" })), /wajib punya angkatan/);
  });

  test("bentrok dengan data yang sudah ada ketahuan di tahap rencana", async () => {
    assert.match(await alasan(baris({ Email: "ayu@contoh.id" })), /sudah dipakai akun lain/);
    // Ayu sudah punya akun; kode referalnya tidak boleh dipakai membuat akun kedua.
    assert.match(await alasan(baris({ "Kode Referal": "AAAA0001" })), /sudah punya akun/);
  });

  test("bentrok antarbaris di dalam berkas juga ketahuan", async () => {
    const plans = await rencana([
      baris(),
      baris({ Email: "lain@contoh.id", "Kode Referal": "BARU0302" }), // ID kembar
      baris({ ID: "BA00302", "Kode Referal": "BARU0303" }), // email kembar
      baris({ ID: "BA00303", Email: "lain2@contoh.id" }), // kode referal kembar
    ]);
    assert.deepEqual(plans.map((p) => p.action), ["buat", "tolak", "tolak", "tolak"]);
    assert.match(plans[1]!.reason, /ID "BA00301" sudah dipakai di baris 2/);
    assert.match(plans[2]!.reason, /Email .* sudah dipakai di baris 2/);
    assert.match(plans[3]!.reason, /Kode referal "BARU0301" sudah dipakai di baris 2/);
  });

  test("tahap rencana benar-benar tidak menulis apa pun", async () => {
    const sebelum = (await listPeople(db, admin)).length;
    await rencana([baris(), baris({ ID: "BA00302", Email: "b@contoh.id", "Kode Referal": "BARU0302" })]);
    assert.equal((await listPeople(db, admin)).length, sebelum);
  });
});

describe("kode referal yang sudah ada = buatkan akunnya", () => {
  test("baris dengan kode awardee lama menempel ke datanya, tidak membuat data kedua", async () => {
    // Budi (AAAA0002) ada di fixture tanpa akun.
    const [plan] = await rencana([baris({ ID: "BA00002", Nama: "Budi", Email: "budi@contoh.id", "Kode Referal": "AAAA0002", Wilayah: "Bandung" })]);
    assert.equal(plan!.action, "buat");
    assert.match(plan!.reason, /data awardee yang sudah ada/);
    assert.equal(plan!.input!.awardeeId, 2);

    await applyPlan(db, admin, [plan!]);
    const orang = await listPeople(db, admin);
    assert.equal(orang.filter((p) => p.name === "Budi").length, 1);
    assert.equal(orang.find((p) => p.name === "Budi")!.referralCode, "AAAA0002");
  });
});

describe("menerapkan", () => {
  test("baris baru dibuat dan akunnya langsung bisa dipakai masuk", async () => {
    const plans = await rencana([baris()]);
    const hasil = await applyPlan(db, admin, plans);
    assert.deepEqual(hasil, [{ line: 2, ok: true, message: "Dibuat." }]);

    const login = (await findUserForLogin(db, "BA00301"))!;
    assert.equal(await verifyPassword("BA2026", login.passwordHash), true);
  });

  test("ID yang sudah ada diperbarui, dan kata sandi kosong berarti tidak diganti", async () => {
    await applyPlan(db, admin, await rencana([baris()]));
    const awal = (await findUserForLogin(db, "BA00301"))!.passwordHash;

    const plans = await rencana([baris({ Nama: "Orang Diperbarui", "Kata Sandi": "" })]);
    assert.equal(plans[0]!.action, "perbarui");
    assert.match(plans[0]!.reason, /kata sandi tetap/);

    assert.deepEqual(await applyPlan(db, admin, plans), [{ line: 2, ok: true, message: "Diperbarui." }]);
    assert.equal((await findUserForLogin(db, "BA00301"))!.passwordHash, awal);
    assert.equal((await listPeople(db, admin)).find((p) => p.loginId === "BA00301")!.name, "Orang Diperbarui");
  });

  test("baris yang ditolak tidak ikut ditulis, baris lain tetap jalan", async () => {
    const plans = await rencana([baris({ Peran: "Ketua" }), baris({ ID: "BA00302", Email: "b2@contoh.id", "Kode Referal": "BARU0302" })]);
    const hasil = await applyPlan(db, admin, plans);
    assert.equal(hasil[0]!.ok, false);
    assert.equal(hasil[1]!.ok, true);
    assert.equal((await listPeople(db, admin)).filter((p) => p.loginId?.startsWith("BA003")).length, 1);
  });

  test("peran akun yang sudah ada tidak bisa ditukar lewat impor", async () => {
    // Ayu (id 3) berperan awardee di fixture; coba impor sebagai Manwil.
    await applyPlan(db, admin, await rencana([baris({ ID: "AYU001", Nama: "Ayu", Email: "ayu2@contoh.id", "Kode Referal": "AYU00001" })]));
    const plans = await rencana([baris({ ID: "AYU001", Peran: "Manwil", Email: "ayu2@contoh.id", Wilayah: "Bandung" })]);
    assert.equal(plans[0]!.action, "tolak");
    assert.match(plans[0]!.reason, /peran tidak bisa diubah lewat impor/);
  });
});
