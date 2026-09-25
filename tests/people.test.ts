// Satu tempat setup orang: akun + data awardee. Yang diuji terutama pagarnya, karena di sinilah
// Admin bisa merusak data paling cepat.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { findUserForLogin } from "../lib/data/auth.ts";
import { verifyPassword } from "../lib/data/password.ts";
import { createPerson, deleteAccount, listPeople, updateAwardeeData, updatePerson, type PersonInput } from "../lib/data/people.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

const input = (over: Partial<PersonInput> = {}): PersonInput => ({
  role: "awardee",
  loginId: "BA00226",
  name: "Eka Wulandari",
  email: "eka@contoh.id",
  password: "BA2026",
  status: "active",
  regionId: 1,
  awardeeId: null,
  batch: "BA16",
  campus: "Universitas Padjadjaran",
  referralCode: "EKA12345",
  ...over,
});

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

describe("daftar orang", () => {
  test("akun dan awardee tanpa akun muncul di satu daftar", async () => {
    const orang = await listPeople(db, admin);
    const ayu = orang.find((p) => p.name === "Ayu")!;
    assert.deepEqual(
      { role: ayu.role, region: ayu.region, kode: ayu.referralCode, punyaAkun: ayu.userId !== null },
      { role: "awardee", region: "Bandung", kode: "AAAA0001", punyaAkun: true },
    );

    // Budi ada di tabel awardee tapi belum punya akun — tetap harus terlihat.
    const budi = orang.find((p) => p.name === "Budi")!;
    assert.deepEqual(
      { userId: budi.userId, role: budi.role, region: budi.region, kode: budi.referralCode },
      { userId: null, role: null, region: "Bandung", kode: "AAAA0002" },
    );
  });

  test("jumlah penilaian ikut terhitung, untuk memutuskan boleh tidaknya dihapus", async () => {
    const orang = await listPeople(db, admin);
    assert.equal(orang.find((p) => p.name === "Ayu")!.responses, 2); // dinilai 2 kali di fixture
    assert.equal(orang.find((p) => p.name === "Admin")!.responses, 0);
  });

  test("hanya Admin", async () => {
    await assert.rejects(listPeople(db, manwil), ScopeError);
    await assert.rejects(createPerson(db, manwil, input()), ScopeError);
  });
});

describe("membuat orang", () => {
  test("peran Awardee membuat data awardee sekaligus akunnya", async () => {
    const hasil = await createPerson(db, admin, input());
    assert.ok(hasil.ok);

    const orang = (await listPeople(db, admin)).find((p) => p.loginId === "BA00226")!;
    assert.deepEqual(
      { role: orang.role, region: orang.region, batch: orang.batch, kode: orang.referralCode, adaAwardee: orang.awardeeId !== null },
      { role: "awardee", region: "Bandung", batch: "BA16", kode: "EKA12345", adaAwardee: true },
    );

    // Dan ia benar-benar bisa masuk dengan kata sandi yang diberikan.
    const login = (await findUserForLogin(db, "ba00226"))!;
    assert.equal(await verifyPassword("BA2026", login.passwordHash), true);
  });

  test("bisa dihubungkan ke data awardee yang sudah ada, tanpa membuat data baru", async () => {
    const hasil = await createPerson(db, admin, input({ awardeeId: 2, name: "Budi", loginId: "BA00227", email: "budi@contoh.id" }));
    assert.ok(hasil.ok);
    const orang = await listPeople(db, admin);
    assert.equal(orang.filter((p) => p.name === "Budi").length, 1); // tidak jadi dua baris
    assert.equal(orang.find((p) => p.name === "Budi")!.referralCode, "AAAA0002"); // kode lamanya dipertahankan
  });

  test("Manwil wajib punya wilayah, Admin tidak perlu", async () => {
    assert.equal((await createPerson(db, admin, input({ role: "manwil", regionId: null, loginId: "MW001" }))).ok, false);
    assert.ok((await createPerson(db, admin, input({ role: "manwil", regionId: 2, loginId: "MW002", email: "mw2@contoh.id" }))).ok);
    assert.ok((await createPerson(db, admin, input({ role: "admin", regionId: null, loginId: "ADM002", email: "adm2@contoh.id" }))).ok);
  });

  test("bentrok ID, email, kode referal, dan awardee yang sudah berakun ditolak", async () => {
    assert.ok((await createPerson(db, admin, input())).ok);
    assert.match((await createPerson(db, admin, input({ email: "lain@contoh.id" })) as { message: string }).message, /ID masuk/);
    assert.match((await createPerson(db, admin, input({ loginId: "BA00999" })) as { message: string }).message, /Email/);
    assert.match(
      (await createPerson(db, admin, input({ loginId: "BA00998", email: "x@contoh.id" })) as { message: string }).message,
      /Kode referal/,
    );
    assert.match(
      (await createPerson(db, admin, input({ loginId: "BA00997", email: "y@contoh.id", awardeeId: 1 })) as { message: string }).message,
      /sudah punya akun/,
    );
  });

  test("isian wajib diperiksa sebelum apa pun ditulis", async () => {
    for (const rusak of [{ name: "  " }, { email: "bukan-email" }, { loginId: "BA 1" }, { password: "123" }, { referralCode: "abc" }]) {
      assert.equal((await createPerson(db, admin, input(rusak))).ok, false);
    }
    // Tidak ada awardee baru yang terlanjur dibuat dari percobaan yang gagal.
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM awardees").first<{ n: number }>())!.n, 4);
  });
});

describe("mengubah orang", () => {
  test("nama & wilayah ikut berubah di data awardee-nya", async () => {
    const hasil = await updatePerson(db, admin, 3, {
      ...input({ name: "Ayu Lestari", loginId: "BA00126", email: "ayu@contoh.id", regionId: 2, batch: "BA15", referralCode: "AAAA0001", password: "" }),
    });
    assert.ok(hasil.ok, "message" in hasil ? hasil.message : "");
    const ayu = (await listPeople(db, admin)).find((p) => p.userId === 3)!;
    assert.deepEqual({ nama: ayu.name, wilayah: ayu.region }, { nama: "Ayu Lestari", wilayah: "Medan" });
  });

  test("peran tidak bisa ditukar, dan Admin tidak bisa mematikan dirinya sendiri", async () => {
    const tukar = await updatePerson(db, admin, 3, input({ role: "manwil", regionId: 1, loginId: "BA00126", email: "ayu@contoh.id", password: "" }));
    assert.match((tukar as { message: string }).message, /Peran akun tidak bisa diubah/);

    const bunuhDiri = await updatePerson(db, admin, 1, input({ role: "admin", status: "disabled", loginId: "ADM001", email: "admin@contoh.id", password: "", regionId: null }));
    assert.match((bunuhDiri as { message: string }).message, /akun sendiri/);
  });

  test("kata sandi kosong berarti tidak diganti; kalau diganti, sesi lama diputus", async () => {
    await updatePerson(db, admin, 3, input({ loginId: "BA00126", email: "ayu@contoh.id", password: "sandiawal1", referralCode: "AAAA0001", batch: "BA15" }));
    const awal = (await findUserForLogin(db, "BA00126"))!.passwordHash;

    await db.exec("INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at) VALUES ('t', 3, '2026-01-01T00:00:00Z', '2030-01-01T00:00:00Z', '2026-01-01T00:00:00Z')");
    await updatePerson(db, admin, 3, input({ loginId: "BA00126", email: "ayu@contoh.id", password: "", referralCode: "AAAA0001", batch: "BA15" }));
    assert.equal((await findUserForLogin(db, "BA00126"))!.passwordHash, awal);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 3").first<{ n: number }>())!.n, 1);

    await updatePerson(db, admin, 3, input({ loginId: "BA00126", email: "ayu@contoh.id", password: "sandibaru1", referralCode: "AAAA0001", batch: "BA15" }));
    assert.notEqual((await findUserForLogin(db, "BA00126"))!.passwordHash, awal);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 3").first<{ n: number }>())!.n, 0);
  });
});

describe("menghapus akun", () => {
  test("data awardee-nya ditinggalkan, jadi penilaian yang masuk tetap utuh", async () => {
    assert.ok((await deleteAccount(db, admin, 3)).ok);
    const orang = await listPeople(db, admin);
    const ayu = orang.find((p) => p.name === "Ayu")!;
    assert.equal(ayu.userId, null); // akunnya hilang
    assert.equal(ayu.responses, 2); // penilaiannya tetap
  });

  test("akun yang sudah pernah mengirim penilaian tidak bisa dihapus", async () => {
    await db.prepare("UPDATE responses SET submitted_by = 3 WHERE id = 1").run();
    const hasil = await deleteAccount(db, admin, 3);
    assert.equal(hasil.ok, false);
    assert.match((hasil as { message: string }).message, /Nonaktifkan saja/);
  });

  test("Admin tidak bisa menghapus akunnya sendiri", async () => {
    assert.equal((await deleteAccount(db, admin, 1)).ok, false);
  });
});

describe("data awardee tanpa akun", () => {
  test("kolom lain — foto R2 dan data Leadpro — tidak ikut terhapus saat nama diubah", async () => {
    await db.prepare("UPDATE awardees SET photo_key = 'awardees/ba15/AAAA0002.webp', leadpro_name = 'Kelas Inspirasi' WHERE id = 2").run();
    assert.ok(
      (await updateAwardeeData(db, admin, 2, { name: "Budi Santoso", regionId: 1, batch: "BA15", campus: "ITB", referralCode: "AAAA0002" })).ok,
    );
    const row = await db.prepare("SELECT name, photo_key, leadpro_name FROM awardees WHERE id = 2").first<{ name: string; photo_key: string; leadpro_name: string }>();
    assert.deepEqual(row, { name: "Budi Santoso", photo_key: "awardees/ba15/AAAA0002.webp", leadpro_name: "Kelas Inspirasi" });
  });

  test("angkatan tidak bisa dipindah kalau sudah dinilai, dan kode referal tidak boleh bentrok", async () => {
    const pindah = await updateAwardeeData(db, admin, 1, { name: "Ayu", regionId: 1, batch: "BA16", campus: "", referralCode: "AAAA0001" });
    assert.match((pindah as { message: string }).message, /tidak bisa dipindah/);

    const bentrok = await updateAwardeeData(db, admin, 2, { name: "Budi", regionId: 1, batch: "BA15", campus: "", referralCode: "AAAA0001" });
    assert.match((bentrok as { message: string }).message, /sudah dipakai awardee lain/);
  });
});
