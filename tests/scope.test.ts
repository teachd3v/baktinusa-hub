// Syarat selesai Fase 3: awardee yang login hanya bisa menarik datanya sendiri — dibuktikan di lapisan query.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { getAwardee, listAwardees, listResponses, progressForScope } from "../lib/data/awardees.ts";
import { ScopeError, awardeeFilter, scopeFor, type SessionUser } from "../lib/data/scope.ts";
import { createUser, listUsers, setUserStatus } from "../lib/data/users.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwilBandung: SessionUser = { id: 2, name: "Manwil Bandung", email: "manwil.bandung@contoh.id", role: "manwil", regionId: 1, awardeeId: null };
const ayu: SessionUser = { id: 3, name: "Ayu", email: "ayu@contoh.id", role: "awardee", regionId: null, awardeeId: 1 };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

describe("scopeFor", () => {
  test("setiap peran mendapat lingkup yang tepat", () => {
    assert.deepEqual(scopeFor(admin), { kind: "national" });
    assert.deepEqual(scopeFor(manwilBandung), { kind: "region", regionId: 1 });
    assert.deepEqual(scopeFor(ayu), { kind: "self", awardeeId: 1 });
  });

  test("akun yang datanya tidak konsisten ditolak, bukan diberi lingkup lebar", () => {
    assert.throws(() => scopeFor({ ...ayu, awardeeId: null }), ScopeError);
    assert.throws(() => scopeFor({ ...manwilBandung, regionId: null }), ScopeError);
    assert.throws(() => scopeFor({ ...ayu, role: "superuser" as never }), ScopeError);
  });

  test("nilai lingkup selalu lewat parameter, tidak pernah disisipkan ke SQL", () => {
    const f = awardeeFilter({ kind: "self", awardeeId: 1 });
    assert.equal(f.sql, "a.id = ?");
    assert.deepEqual(f.params, [1]);
  });
});

describe("awardee hanya melihat dirinya sendiri", () => {
  test("daftar awardee hanya berisi dirinya", async () => {
    const rows = await listAwardees(db, scopeFor(ayu));
    assert.deepEqual(rows.map((r) => r.name), ["Ayu"]);
  });

  test("tidak bisa membuka awardee lain, bahkan yang se-wilayah", async () => {
    assert.equal(await getAwardee(db, scopeFor(ayu), "AAAA0002"), null); // Budi, sama-sama Bandung
    assert.equal(await getAwardee(db, scopeFor(ayu), "BBBB0003"), null); // Citra, Medan
    assert.equal((await getAwardee(db, scopeFor(ayu), "aaaa0001"))?.name, "Ayu");
  });

  test("hanya menarik respons untuk dirinya", async () => {
    const rows = await listResponses(db, scopeFor(ayu));
    assert.deepEqual(rows.map((r) => r.id), [1, 2]);
    assert.ok(rows.every((r) => r.awardeeId === 1));
  });

  test("pantauan target hanya untuk dirinya, dengan target yang benar", async () => {
    const progress = await progressForScope(db, scopeFor(ayu), 1);
    assert.equal(progress.length, 1);
    const byCode = Object.fromEntries(progress[0]!.types.map((t) => [t.code, t]));
    assert.equal(byCode.external!.count, 2);
    assert.equal(byCode.external!.target, 20);
    assert.equal(byCode.peer!.target, 1); // Bandung punya 2 awardee → 1 rekan
  });
});

describe("Manwil hanya melihat wilayahnya", () => {
  test("daftar & respons terbatas pada Bandung", async () => {
    assert.deepEqual((await listAwardees(db, scopeFor(manwilBandung))).map((r) => r.name), ["Ayu", "Budi"]);
    assert.deepEqual((await listResponses(db, scopeFor(manwilBandung))).map((r) => r.id), [1, 2, 3]);
    assert.equal(await getAwardee(db, scopeFor(manwilBandung), "BBBB0003"), null);
  });
});

describe("Admin melihat semua", () => {
  test("seluruh awardee dan respons", async () => {
    assert.equal((await listAwardees(db, scopeFor(admin))).length, 4);
    assert.equal((await listResponses(db, scopeFor(admin))).length, 5);
  });
});

describe("manajemen akun hanya untuk Admin", () => {
  test("Manwil dan Awardee ditolak", async () => {
    await assert.rejects(listUsers(db, manwilBandung), ScopeError);
    await assert.rejects(listUsers(db, ayu), ScopeError);
    await assert.rejects(createUser(db, ayu, { email: "x@contoh.id", name: "X", role: "admin", loginId: "ADM900", password: "rahasia123" }), ScopeError);
    await assert.rejects(setUserStatus(db, manwilBandung, 3, "disabled"), ScopeError);
  });

  test("validasi akun baru", async () => {
    assert.deepEqual(await createUser(db, admin, { email: "AYU@contoh.id", name: "Dobel", role: "admin", loginId: "ADM901", password: "rahasia123" }), { ok: false, message: "Email ini sudah terdaftar." });
    assert.deepEqual(await createUser(db, admin, { email: "lain@contoh.id", name: "Ayu 2", role: "awardee", awardeeId: 1, loginId: "BA900", password: "rahasia123" }), { ok: false, message: "Awardee ini sudah punya akun." });
    assert.equal((await createUser(db, admin, { email: "mw@contoh.id", name: "MW", role: "manwil", loginId: "MW900", password: "rahasia123" })).ok, false);
    const created = await createUser(db, admin, { email: "Budi@Contoh.id ", name: "Budi", role: "awardee", awardeeId: 2, loginId: "ba00902", password: "rahasia123" });
    assert.equal(created.ok, true);
  });

  test("Admin tidak bisa menonaktifkan dirinya sendiri", async () => {
    await assert.rejects(setUserStatus(db, admin, 1, "disabled"), ScopeError);
  });
});
