// Kelola data awardee: menambah angkatan baru, memperbaiki data, dan pagar terhadap data yang sudah dipakai.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  createAwardee,
  deleteAwardee,
  listAwardeesForAdmin,
  suggestReferralCode,
  updateAwardee,
  type AwardeeInput,
} from "../lib/data/admin-awardees.ts";
import { listAudit } from "../lib/data/audit.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

const input = (over: Partial<AwardeeInput> = {}): AwardeeInput => ({
  name: "Eka Wulandari",
  batch: "BA16",
  regionId: 1,
  campus: "Universitas Padjadjaran",
  referralCode: "EKA12345",
  photoKey: null,
  leadproName: null,
  leadproField: null,
  leadproDescription: null,
  ...over,
});

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

describe("hanya Admin", () => {
  test("peran lain ditolak", async () => {
    await assert.rejects(listAwardeesForAdmin(db, manwil), ScopeError);
    await assert.rejects(createAwardee(db, manwil, input()), ScopeError);
  });
});

describe("menambah awardee", () => {
  test("data baru tersimpan dan tercatat", async () => {
    const hasil = await createAwardee(db, admin, input());
    assert.ok(hasil.ok);
    const baru = (await listAwardeesForAdmin(db, admin, "BA16"))[0]!;
    assert.deepEqual(
      { name: baru.name, batch: baru.batch, region: baru.region, kode: baru.referralCode, akun: baru.hasAccount, jawaban: baru.responses },
      { name: "Eka Wulandari", batch: "BA16", region: "Bandung", kode: "EKA12345", akun: false, jawaban: 0 },
    );
    assert.match((await listAudit(db, admin))[0]!.summary, /Eka Wulandari.*BA16, Bandung/);
  });

  test("isian divalidasi dan kode referal tidak boleh bentrok", async () => {
    assert.equal((await createAwardee(db, admin, input({ name: " " }))).ok, false);
    assert.equal((await createAwardee(db, admin, input({ batch: "" }))).ok, false);
    assert.equal((await createAwardee(db, admin, input({ referralCode: "abc" }))).ok, false); // terlalu pendek
    assert.equal((await createAwardee(db, admin, input({ referralCode: "AAAA 001" }))).ok, false); // ada spasi
    assert.equal((await createAwardee(db, admin, input({ regionId: 99 }))).ok, false); // wilayah tak dikenal
    const bentrok = await createAwardee(db, admin, input({ referralCode: "aaaa0001" })); // huruf kecil pun dianggap sama
    assert.equal(bentrok.ok, false);
    assert.match((bentrok as { message: string }).message, /sudah dipakai/);
  });

  test("kode referal saran selalu baru dan berformat benar", async () => {
    const kode = await suggestReferralCode(db, admin);
    assert.match(kode, /^[A-HJ-NP-Z2-9]{8}$/);
    assert.ok((await createAwardee(db, admin, input({ referralCode: kode }))).ok);
  });
});

describe("mengubah & menghapus", () => {
  test("kode referal bisa diganti selama belum dipakai awardee lain", async () => {
    assert.ok((await updateAwardee(db, admin, 1, input({ name: "Ayu Lestari", batch: "BA15", referralCode: "AYU99999" }))).ok);
    const ayu = (await listAwardeesForAdmin(db, admin)).find((a) => a.id === 1)!;
    assert.equal(ayu.referralCode, "AYU99999");
    assert.equal((await updateAwardee(db, admin, 1, input({ batch: "BA15", referralCode: "AAAA0002" }))).ok, false);
  });

  test("angkatan tidak bisa dipindah kalau sudah ada jawaban", async () => {
    const hasil = await updateAwardee(db, admin, 1, input({ batch: "BA16", referralCode: "AAAA0001" }));
    assert.equal(hasil.ok, false);
    assert.match((hasil as { message: string }).message, /angkatannya tidak bisa dipindah/);
  });

  test("awardee dengan jawaban atau akun tidak bisa dihapus", async () => {
    const adaJawaban = await deleteAwardee(db, admin, 1); // Ayu punya 2 respons di fixture
    assert.equal(adaJawaban.ok, false);
    assert.match((adaJawaban as { message: string }).message, /jawaban/);

    // Citra: punya akun, tapi juga punya respons — hapus responsnya dulu agar yang teruji adalah pagar akun.
    await db.prepare("DELETE FROM responses WHERE awardee_id = 3").run();
    const punyaAkun = await deleteAwardee(db, admin, 3);
    assert.equal(punyaAkun.ok, false);
    assert.match((punyaAkun as { message: string }).message, /terhubung ke akun/);

    const bersih = await createAwardee(db, admin, input());
    assert.ok(bersih.ok);
    assert.ok((await deleteAwardee(db, admin, bersih.id)).ok);
  });
});
