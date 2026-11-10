// Profil awardee: validasi, kelengkapan, dan lingkup akses per peran.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { listAudit } from "../lib/data/audit.ts";
import {
  completeness,
  emptyProfile,
  getProfileView,
  listProfileStatus,
  saveProfile,
  setAwardeeStatus,
  validateProfile,
  type Profile,
} from "../lib/data/profiles.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwilBandung: SessionUser = { id: 2, name: "Manwil Bandung", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };
const ayu: SessionUser = { id: 3, name: "Ayu", email: "ayu@contoh.id", role: "awardee", regionId: null, awardeeId: 1 };
const citra: SessionUser = { id: 4, name: "Citra", email: "citra@contoh.id", role: "awardee", regionId: null, awardeeId: 3 };

const TODAY = new Date("2026-11-10T00:00:00Z");

// Profil lengkap yang valid; tiap tes mengubah satu bagian saja.
const full = (over: Partial<Profile> = {}): Profile => ({
  ...emptyProfile(),
  nickname: "Ayu",
  gender: "P",
  birthPlace: "Bandung",
  birthDate: "2005-03-14",
  whatsapp: "081234567890",
  personalEmail: "ayu@gmail.com",
  address: "Jl. Ganesha No. 10, Lebak Siliwangi, Bandung",
  emergencyName: "Ibu Ayu",
  emergencyPhone: "081300000000",
  faculty: "FTI",
  studyProgram: "Teknik Informatika",
  entryYear: "2024",
  expectedGraduationYear: "2028",
  tagline: "Mahasiswa TI, penggerak literasi digital desa",
  bio: "Aktif di komunitas literasi.",
  ...over,
});

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

describe("validasi profil", () => {
  test("profil kosong sah (boleh disimpan belum lengkap)", () => {
    assert.equal(validateProfile(emptyProfile(), TODAY).ok, true);
  });

  test("nomor WhatsApp dinormalkan ke +62", () => {
    const r = validateProfile(full({ whatsapp: "0812-3456-7890" }), TODAY);
    assert.ok(r.ok);
    assert.equal(r.value.whatsapp, "+6281234567890");
    assert.equal(validateProfile(full({ whatsapp: "abc" }), TODAY).ok, false);
  });

  test("tanggal lahir harus tanggal nyata dan masuk akal", () => {
    assert.equal(validateProfile(full({ birthDate: "2005-02-30" }), TODAY).ok, false);
    assert.equal(validateProfile(full({ birthDate: "2020-01-01" }), TODAY).ok, false);
    assert.equal(validateProfile(full({ birthDate: "14/03/2005" }), TODAY).ok, false);
  });

  test("email, jenis kelamin, dan tahun diperiksa", () => {
    assert.equal(validateProfile(full({ personalEmail: "bukan-email" }), TODAY).ok, false);
        assert.equal(validateProfile(full({ gender: "X" }), TODAY).ok, false);
    assert.equal(validateProfile(full({ entryYear: "2028", expectedGraduationYear: "2024" }), TODAY).ok, false);
  });

  test("Instagram, LinkedIn, dan tautan lain dinormalkan", () => {
    const r = validateProfile(
      full({ instagram: "https://instagram.com/ayu.baktinusa/", linkedin: "linkedin.com/in/ayu", website: "ayu.id/karya" }),
      TODAY,
    );
    assert.ok(r.ok);
    assert.equal(r.value.instagram, "ayu.baktinusa");
    assert.equal(r.value.linkedin, "https://linkedin.com/in/ayu");
    assert.equal(r.value.website, "https://ayu.id/karya");
    assert.equal(validateProfile(full({ linkedin: "https://contoh.com/in/ayu" }), TODAY).ok, false);
    assert.equal(validateProfile(full({ website: "javascript:alert(1)" }), TODAY).ok, false);
  });

  test("kontak darurat harus lengkap berdua (kosong berdua sah di simpan, tapi dihitung belum lengkap)", () => {
    assert.equal(validateProfile(full({ emergencyPhone: "" }), TODAY).ok, false);
    assert.equal(validateProfile(full({ emergencyName: "" }), TODAY).ok, false);
    assert.equal(validateProfile(full({ emergencyName: "", emergencyPhone: "" }), TODAY).ok, true);
  });

  test("batas panjang dan jumlah daftar", () => {
    assert.equal(validateProfile(full({ tagline: "x".repeat(101) }), TODAY).ok, false);
    assert.equal(validateProfile(full({ bio: "x".repeat(501) }), TODAY).ok, false);
    assert.equal(validateProfile(full({ skills: Array.from({ length: 11 }, (_, i) => `k${i}`) }), TODAY).ok, false);
    const r = validateProfile(full({ skills: ["Desain", "desain", " ", "Riset"] }), TODAY);
    assert.ok(r.ok);
    assert.deepEqual(r.value.skills, ["Desain", "Riset"]);
  });
});

describe("kelengkapan", () => {
  test("profil kosong 0%, persetujuan ikut dihitung", () => {
    const c = completeness(emptyProfile(), null);
    assert.equal(c.percent, 0);
    assert.ok(c.missing.includes("Persetujuan penggunaan data"));
  });

  test("semua kolom wajib dan persetujuan terisi = 100%", () => {
    const c = completeness(full(), "2026-11-10T00:00:00Z");
    assert.equal(c.percent, 100);
    assert.deepEqual(c.missing, []);
  });

  test("kontak darurat dan alamat domisili wajib", () => {
    const c = completeness(full({ emergencyName: "", emergencyPhone: "", address: "" }), "x");
    assert.deepEqual(c.missing, ["Alamat domisili", "Nama kontak darurat", "Nomor kontak darurat"]);
    assert.ok(c.percent < 100);
  });

  test("kolom opsional tidak mempengaruhi", () => {
    assert.equal(completeness(full({ studentId: "", motivation: "" }), "x").percent, 100);
  });
});

describe("menyimpan profil", () => {
  test("awardee wajib mencentang persetujuan pada simpan pertama", async () => {
    const r = await saveProfile(db, ayu, 1, full(), false, TODAY);
    assert.equal(r.ok, false);
    assert.equal((await getProfileView(db, ayu, 1))!.meta.exists, false);
  });

  test("simpan dengan persetujuan, lalu ubah tanpa mencentang lagi", async () => {
    assert.deepEqual(await saveProfile(db, ayu, 1, full(), true, TODAY), { ok: true });
    const first = (await getProfileView(db, ayu, 1))!;
    assert.ok(first.meta.consentAt);
    assert.equal(first.completeness.percent, 100);
    assert.equal(first.profile.whatsapp, "+6281234567890");

    assert.deepEqual(await saveProfile(db, ayu, 1, full({ address: "Jl. Kosan No. 3, Cimahi" }), false, TODAY), { ok: true });
    const second = (await getProfileView(db, ayu, 1))!;
    assert.equal(second.profile.address, "Jl. Kosan No. 3, Cimahi");
    assert.equal(second.meta.consentAt, first.meta.consentAt);
  });

  test("daftar disimpan dan dibaca utuh", async () => {
    await saveProfile(db, ayu, 1, full({ interests: ["Pendidikan", "Teknologi"], languages: ["Inggris (aktif)"] }), true, TODAY);
    const v = (await getProfileView(db, ayu, 1))!;
    assert.deepEqual(v.profile.interests, ["Pendidikan", "Teknologi"]);
    assert.deepEqual(v.profile.languages, ["Inggris (aktif)"]);
  });

  test("awardee tidak bisa mengubah profil awardee lain", async () => {
    await assert.rejects(() => saveProfile(db, ayu, 3, full(), true, TODAY), ScopeError);
  });

  test("Manwil tidak bisa menulis", async () => {
    await assert.rejects(() => saveProfile(db, manwilBandung, 1, full(), true, TODAY), ScopeError);
  });

  test("Admin mengedit tanpa menyetujui atas nama awardee, dan jejaknya tanpa isi data pribadi", async () => {
    await saveProfile(db, ayu, 1, full(), true, TODAY);
    const consent = (await getProfileView(db, admin, 1))!.meta.consentAt;
    assert.deepEqual(await saveProfile(db, admin, 1, full({ address: "Jl. Rahasia No. 9, Garut", whatsapp: "081200000001" }), false, TODAY), { ok: true });
    const v = (await getProfileView(db, admin, 1))!;
    assert.equal(v.profile.address, "Jl. Rahasia No. 9, Garut");
    assert.equal(v.meta.consentAt, consent);

    const audit = await listAudit(db, admin);
    const row = audit.find((a) => a.action === "profile.update");
    assert.ok(row);
    assert.match(row.summary, /Alamat domisili/);
    assert.doesNotMatch(row.summary, /Garut|Rahasia|081200000001/);
  });

  test("Admin yang menyimpan profil kosong awardee tidak mengisi persetujuan", async () => {
    await saveProfile(db, admin, 2, full(), false, TODAY);
    assert.equal((await getProfileView(db, admin, 2))!.meta.consentAt, null);
  });
});

describe("lingkup baca", () => {
  beforeEach(async () => {
    await saveProfile(db, ayu, 1, full({ emergencyName: "Ibu", emergencyPhone: "081300000000" }), true, TODAY);
  });

  test("awardee hanya melihat dirinya", async () => {
    assert.ok(await getProfileView(db, ayu, 1));
    assert.equal(await getProfileView(db, ayu, 3), null);
  });

  test("Manwil melihat wilayahnya dan kontak darurat, tapi tanpa tanggal lahir", async () => {
    const v = (await getProfileView(db, manwilBandung, 1))!;
    assert.equal(v.profile.whatsapp, "+6281234567890");
    assert.equal(v.profile.birthDate, "");
    assert.equal(v.profile.emergencyName, "Ibu");
    assert.equal(v.profile.emergencyPhone, "+6281300000000");
    assert.equal(v.completeness.percent, 100);
  });

  test("Manwil tidak melihat wilayah lain", async () => {
    assert.equal(await getProfileView(db, manwilBandung, 3), null);
  });

  test("Admin melihat semuanya, termasuk kolom pribadi", async () => {
    const v = (await getProfileView(db, admin, 1))!;
    assert.equal(v.profile.birthDate, "2005-03-14");
    assert.equal(v.profile.emergencyName, "Ibu");
  });

  test("awardee tanpa profil tetap terbaca sebagai kosong", async () => {
    const v = (await getProfileView(db, citra, 3))!;
    assert.equal(v.meta.exists, false);
    assert.equal(v.completeness.percent, 0);
  });
});

describe("daftar kelengkapan", () => {
  test("Admin melihat semua awardee, Manwil hanya wilayahnya, awardee ditolak", async () => {
    await saveProfile(db, ayu, 1, full(), true, TODAY);
    const all = await listProfileStatus(db, admin);
    assert.equal(all.length, 4);
    assert.equal(all.find((r) => r.awardeeId === 1)!.percent, 100);
    assert.equal(all.find((r) => r.awardeeId === 3)!.percent, 0);

    const own = await listProfileStatus(db, manwilBandung);
    assert.deepEqual(own.map((r) => r.awardeeId).sort(), [1, 2]);
    await assert.rejects(() => listProfileStatus(db, ayu), ScopeError);
  });
});

describe("status awardee (dikunci)", () => {
  test("hanya Admin, dan tercatat di jejak", async () => {
    assert.deepEqual(await setAwardeeStatus(db, admin, 1, "graduated", "2024-08-01"), { ok: true });
    const v = (await getProfileView(db, admin, 1))!;
    assert.equal(v.awardee.status, "graduated");
    assert.equal(v.awardee.joinedAt, "2024-08-01");
    assert.ok((await listAudit(db, admin)).some((a) => a.action === "awardee.status"));
    await assert.rejects(() => setAwardeeStatus(db, ayu, 1, "revoked", ""), ScopeError);
    assert.equal((await setAwardeeStatus(db, admin, 1, "ngawur", "")).ok, false);
    assert.equal((await setAwardeeStatus(db, admin, 1, "active", "kemarin")).ok, false);
  });

  test("awardee tidak punya jalur menulis status lewat profil", async () => {
    await saveProfile(db, ayu, 1, full(), true, TODAY);
    assert.equal((await getProfileView(db, ayu, 1))!.awardee.status, "active");
  });
});
