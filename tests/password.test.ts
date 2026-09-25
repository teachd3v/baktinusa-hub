// Kata sandi: penyimpanan yang tidak bisa dibalik, pencocokan yang tegas, dan pencarian akun saat masuk.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { findUserForLogin } from "../lib/data/auth.ts";
import { checkLoginId, checkPassword, hashPassword, normalizeLoginId, verifyPassword } from "../lib/data/password.ts";
import { setCredentials } from "../lib/data/users.ts";
import type { SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

describe("menyimpan kata sandi", () => {
  test("yang tersimpan bukan kata sandinya, dan dua akun bersandi sama tetap berbeda", async () => {
    const a = await hashPassword("BA2026");
    const b = await hashPassword("BA2026");
    assert.ok(!a.includes("BA2026"));
    assert.notEqual(a, b); // garam acak per akun
    assert.match(a, /^pbkdf2\$\d+\$[\w-]+\$[\w-]+$/);
  });

  test("hanya kata sandi yang benar yang diterima", async () => {
    const stored = await hashPassword("BA2026");
    assert.equal(await verifyPassword("BA2026", stored), true);
    assert.equal(await verifyPassword("ba2026", stored), false); // beda huruf besar-kecil
    assert.equal(await verifyPassword("BA2026 ", stored), false); // spasi di ujung dihitung
    assert.equal(await verifyPassword("", stored), false);
  });

  test("simpanan yang rusak atau kosong ditolak, bukan bikin galat", async () => {
    for (const rusak of [null, "", "bukan-format", "pbkdf2$abc$x$y", "pbkdf2$10$c2FsdA$aGFzaA"]) {
      assert.equal(await verifyPassword("BA2026", rusak), false);
    }
  });

  test("aturan panjang kata sandi dan bentuk ID", () => {
    assert.equal(checkPassword("BA2026123"), null);
    assert.equal(checkPassword("BA2026"), null); // pola kata sandi program
    assert.equal(checkPassword("pendk")?.ok, false);
    assert.equal(checkPassword("        ")?.ok, false);
    assert.equal(checkLoginId("BA00126"), null);
    assert.equal(checkLoginId("ba00126"), null); // diseragamkan jadi huruf besar
    assert.equal(checkLoginId("BA 001")?.ok, false);
    assert.equal(checkLoginId("BA-001")?.ok, false);
    assert.equal(normalizeLoginId(" ba00126 "), "BA00126");
  });
});

describe("masuk", () => {
  beforeEach(async () => {
    const hasil = await setCredentials(db, admin, 3, { loginId: "BA00126", password: "BA2026kuat" });
    assert.ok(hasil.ok);
  });

  test("ID ditemukan tanpa peduli huruf besar-kecil, dan kata sandinya cocok", async () => {
    const found = (await findUserForLogin(db, " ba00126 "))!;
    assert.equal(found.user.name, "Ayu");
    assert.equal(found.status, "active");
    assert.equal(await verifyPassword("BA2026kuat", found.passwordHash), true);
    assert.equal(await verifyPassword("BA2026salah", found.passwordHash), false);
  });

  test("ID yang tidak terdaftar tidak mengembalikan apa pun", async () => {
    assert.equal(await findUserForLogin(db, "TIDAKADA"), null);
  });

  test("akun nonaktif tetap terbaca statusnya, supaya penolakannya diseragamkan di pemanggil", async () => {
    await db.prepare("UPDATE users SET status = 'disabled' WHERE id = 3").run();
    const found = (await findUserForLogin(db, "BA00126"))!;
    assert.equal(found.status, "disabled");
  });

  test("akun tanpa kata sandi tidak bisa dimasuki", async () => {
    const found = (await findUserForLogin(db, "BA00126"))!;
    await db.prepare("UPDATE users SET password_hash = NULL WHERE id = 3").run();
    const kosong = (await findUserForLogin(db, "BA00126"))!;
    assert.ok(found.passwordHash);
    assert.equal(kosong.passwordHash, null);
    assert.equal(await verifyPassword("BA2026kuat", kosong.passwordHash), false);
  });
});

describe("Admin mengatur kredensial", () => {
  test("ID tidak boleh bentrok dan hanya Admin yang boleh", async () => {
    assert.ok((await setCredentials(db, admin, 2, { loginId: "MW00126", password: "sandikuat1" })).ok);
    const bentrok = await setCredentials(db, admin, 3, { loginId: "mw00126", password: "" });
    assert.equal(bentrok.ok, false);
    assert.match((bentrok as { message: string }).message, /sudah dipakai akun lain/);

    const manwil: SessionUser = { id: 2, name: "M", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };
    await assert.rejects(setCredentials(db, manwil, 3, { loginId: "BA00999", password: "sandikuat1" }));
  });

  test("mengganti kata sandi memutus sesi lama akun itu", async () => {
    await db.exec(`
      INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen_at)
      VALUES ('abc', 3, '2026-09-01T00:00:00.000Z', '2030-01-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z');
    `);
    assert.ok((await setCredentials(db, admin, 3, { loginId: "BA00126", password: "sandibaru123" })).ok);
    const sisa = await db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 3").first<{ n: number }>();
    assert.equal(sisa!.n, 0);
  });

  test("mengubah ID saja tidak menyentuh kata sandi maupun sesi", async () => {
    await setCredentials(db, admin, 3, { loginId: "BA00126", password: "sandiawal123" });
    const sebelum = (await findUserForLogin(db, "BA00126"))!.passwordHash;
    assert.ok((await setCredentials(db, admin, 3, { loginId: "BA00999", password: "" })).ok);
    const sesudah = (await findUserForLogin(db, "BA00999"))!.passwordHash;
    assert.equal(sesudah, sebelum);
    assert.equal(await verifyPassword("sandiawal123", sesudah), true);
  });
});
