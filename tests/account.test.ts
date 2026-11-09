import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { changeOwnPassword } from "../lib/data/account.ts";
import { createSession, getSessionUser } from "../lib/data/auth.ts";
import { hashPassword, verifyPassword } from "../lib/data/password.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
  await db.prepare("UPDATE users SET password_hash = ? WHERE id = 3").bind(await hashPassword("BA@2026!")).run();
});

const hashOf = async () => (await db.prepare("SELECT password_hash FROM users WHERE id = 3").first<{ password_hash: string }>())!.password_hash;

describe("ganti kata sandi sendiri", () => {
  test("berhasil kalau kata sandi lama benar", async () => {
    const result = await changeOwnPassword(db, 3, "BA@2026!", "SandiBaru9", undefined);
    assert.deepEqual(result, { ok: true });
    assert.equal(await verifyPassword("SandiBaru9", await hashOf()), true);
    assert.equal(await verifyPassword("BA@2026!", await hashOf()), false);
  });

  test("kata sandi lama salah ditolak dan tidak mengubah apa pun", async () => {
    const before = await hashOf();
    const result = await changeOwnPassword(db, 3, "salah", "SandiBaru9", undefined);
    assert.equal(result.ok, false);
    assert.equal(await hashOf(), before);
  });

  test("kata sandi baru yang terlalu pendek atau sama dengan yang lama ditolak", async () => {
    assert.equal((await changeOwnPassword(db, 3, "BA@2026!", "abc", undefined)).ok, false);
    assert.equal((await changeOwnPassword(db, 3, "BA@2026!", "BA@2026!", undefined)).ok, false);
  });

  test("sesi lain dicabut, sesi yang sedang dipakai tetap hidup", async () => {
    const dipakai = await createSession(db, 3);
    const lain = await createSession(db, 3);
    await changeOwnPassword(db, 3, "BA@2026!", "SandiBaru9", dipakai);
    assert.equal((await getSessionUser(db, dipakai))?.id, 3);
    assert.equal(await getSessionUser(db, lain), null);
  });

  test("akun nonaktif tidak bisa mengganti", async () => {
    await db.prepare("UPDATE users SET status = 'disabled' WHERE id = 3").run();
    assert.equal((await changeOwnPassword(db, 3, "BA@2026!", "SandiBaru9", undefined)).ok, false);
  });
});
