// LeadPro: daftar berlingkup, saringan, tampilan di profil, dan pengeditan khusus Admin.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { listAudit } from "../lib/data/audit.ts";
import {
  fieldCounts,
  filterLeadpros,
  leadproOptions,
  listLeadpros,
  normalizeText,
  updateLeadpro,
  validateLeadpro,
} from "../lib/data/leadpro.ts";
import { getProfileView } from "../lib/data/profiles.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwilBandung: SessionUser = { id: 2, name: "Manwil Bandung", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };
const ayu: SessionUser = { id: 3, name: "Ayu", email: "ayu@contoh.id", role: "awardee", regionId: null, awardeeId: 1 };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
  // Ayu dan Budi (Bandung), Citra (Medan) punya proyek; Dedi (Makassar) belum.
  await db.exec(`
    UPDATE awardees SET leadpro_name = 'Ruang Baca', leadpro_field = 'Pendidikan', leadpro_description = 'Taman baca anak.' || char(13) || char(10) || 'Setiap pekan.' WHERE id = 1;
    UPDATE awardees SET leadpro_name = 'Bank Sampah', leadpro_field = 'Lingkungan', leadpro_description = 'Memilah sampah warga.' WHERE id = 2;
    UPDATE awardees SET leadpro_name = 'Klinik Desa', leadpro_field = 'Kesehatan', leadpro_description = 'Pemeriksaan gratis.' WHERE id = 3;
  `);
});

describe("daftar LeadPro", () => {
  test("Admin melihat semua wilayah, termasuk awardee yang belum punya proyek", async () => {
    const rows = await listLeadpros(db, admin);
    assert.equal(rows.length, 4);
    const dedi = rows.find((r) => r.awardeeId === 4)!;
    assert.equal(dedi.name, "");
    assert.equal(dedi.field, "");
  });

  test("Manwil hanya melihat wilayahnya", async () => {
    const rows = await listLeadpros(db, manwilBandung);
    assert.deepEqual(rows.map((r) => r.awardeeId).sort(), [1, 2]);
  });

  test("awardee ditolak", async () => {
    await assert.rejects(() => listLeadpros(db, ayu), ScopeError);
  });

  test("pemisah baris Windows dirapikan", async () => {
    const ayuRow = (await listLeadpros(db, admin)).find((r) => r.awardeeId === 1)!;
    assert.equal(ayuRow.description, "Taman baca anak.\nSetiap pekan.");
    assert.equal(normalizeText("a\r\n\r\n\r\n\r\nb  "), "a\n\nb");
  });
});

describe("saringan", () => {
  test("menurut bidang, wilayah, kampus, dan angkatan", async () => {
    const rows = await listLeadpros(db, admin);
    assert.deepEqual(filterLeadpros(rows, { field: "Kesehatan" }).map((r) => r.awardeeId), [3]);
    assert.deepEqual(filterLeadpros(rows, { regionId: 1 }).map((r) => r.awardeeId).sort(), [1, 2]);
    assert.deepEqual(filterLeadpros(rows, { campusId: 3 }).map((r) => r.awardeeId), [3]);
    assert.equal(filterLeadpros(rows, { batch: "BA15" }).length, 4);
    assert.equal(filterLeadpros(rows, { batch: "BA99" }).length, 0);
  });

  test("pencarian mencakup nama awardee, proyek, bidang, kampus, dan wilayah", async () => {
    const rows = await listLeadpros(db, admin);
    assert.deepEqual(filterLeadpros(rows, { q: "bank sampah" }).map((r) => r.awardeeId), [2]);
    assert.deepEqual(filterLeadpros(rows, { q: "CITRA" }).map((r) => r.awardeeId), [3]);
    assert.deepEqual(filterLeadpros(rows, { q: "usu" }).map((r) => r.awardeeId), [3]);
    assert.deepEqual(filterLeadpros(rows, { q: "makassar" }).map((r) => r.awardeeId), [4]);
  });

  test("beberapa saringan digabung (dan)", async () => {
    const rows = await listLeadpros(db, admin);
    assert.deepEqual(filterLeadpros(rows, { regionId: 1, field: "Lingkungan" }).map((r) => r.awardeeId), [2]);
    assert.equal(filterLeadpros(rows, { regionId: 2, field: "Lingkungan" }).length, 0);
  });

  test("pilihan saringan Manwil hanya wilayah dan kampusnya sendiri", async () => {
    const options = leadproOptions(await listLeadpros(db, manwilBandung));
    assert.deepEqual(options.regions.map((r) => r.name), ["Bandung"]);
    assert.deepEqual(options.campuses.map((c) => c.name), ["ITB"]);
    assert.deepEqual(options.fields, ["Lingkungan", "Pendidikan"]);
  });

  test("hitungan per bidang", async () => {
    const counts = fieldCounts(await listLeadpros(db, admin));
    assert.equal(counts.length, 3);
    assert.ok(counts.every((c) => c.count === 1));
  });
});

describe("tampil di profil", () => {
  test("awardee melihat LeadPro miliknya, dengan baris rapi", async () => {
    const view = (await getProfileView(db, ayu, 1))!;
    assert.deepEqual(view.leadpro, { name: "Ruang Baca", field: "Pendidikan", description: "Taman baca anak.\nSetiap pekan." });
  });

  test("awardee tanpa proyek: null", async () => {
    assert.equal((await getProfileView(db, admin, 4))!.leadpro, null);
  });

  test("Manwil dan Admin melihatnya di profil awardee dalam lingkup", async () => {
    assert.equal((await getProfileView(db, manwilBandung, 2))!.leadpro?.name, "Bank Sampah");
    assert.equal(await getProfileView(db, manwilBandung, 3), null);
  });
});

describe("mengubah LeadPro", () => {
  const input = { name: "Ruang Baca Desa", field: "Literasi", description: "Diperluas ke dua desa." };

  test("validasi", () => {
    assert.ok(validateLeadpro(input).ok);
    assert.equal(validateLeadpro({ ...input, name: "x".repeat(121) }).ok, false);
    assert.equal(validateLeadpro({ ...input, field: "x".repeat(41) }).ok, false);
    assert.equal(validateLeadpro({ ...input, description: "x".repeat(2001) }).ok, false);
    assert.equal(validateLeadpro({ name: "", field: "Pendidikan", description: "" }).ok, false);
    assert.ok(validateLeadpro({ name: "", field: "", description: "" }).ok);
  });

  test("Admin berhasil mengubah, tercatat tanpa isinya", async () => {
    assert.deepEqual(await updateLeadpro(db, admin, 1, input), { ok: true });
    const view = (await getProfileView(db, admin, 1))!;
    assert.equal(view.leadpro?.name, "Ruang Baca Desa");
    assert.equal(view.leadpro?.field, "Literasi");

    const row = (await listAudit(db, admin)).find((a) => a.action === "leadpro.update");
    assert.ok(row);
    assert.match(row.summary, /Nama proyek.*Bidang.*Deskripsi/);
    assert.doesNotMatch(row.summary, /Desa|Literasi/);
  });

  test("tanpa perubahan tidak menambah jejak", async () => {
    await updateLeadpro(db, admin, 2, { name: "Bank Sampah", field: "Lingkungan", description: "Memilah sampah warga." });
    assert.equal((await listAudit(db, admin)).filter((a) => a.action === "leadpro.update").length, 0);
  });

  test("mengosongkan nama menghapus proyek", async () => {
    await updateLeadpro(db, admin, 1, { name: "", field: "", description: "" });
    assert.equal((await getProfileView(db, admin, 1))!.leadpro, null);
  });

  test("awardee dan Manwil tidak boleh mengubah", async () => {
    await assert.rejects(() => updateLeadpro(db, ayu, 1, input), ScopeError);
    await assert.rejects(() => updateLeadpro(db, manwilBandung, 1, input), ScopeError);
  });

  test("awardee yang tidak ada ditolak dengan pesan", async () => {
    assert.equal((await updateLeadpro(db, admin, 999, input)).ok, false);
  });
});
