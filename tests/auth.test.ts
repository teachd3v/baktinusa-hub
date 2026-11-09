import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
  ADMIN_SESSION_TTL_MS,
  EMAIL_LINK_TTL_MS,
  SESSION_TTL_MS,
  consumeLoginToken,
  createLoginToken,
  createSession,
  deleteSession,
  getSessionUser,
  hashToken,
  peekLoginToken,
} from "../lib/data/auth.ts";
import { setUserStatus } from "../lib/data/users.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

const admin = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin" as const, regionId: null, awardeeId: null };

describe("tautan masuk", () => {
  test("hanya bisa dipakai sekali", async () => {
    const token = await createLoginToken(db, 3, EMAIL_LINK_TTL_MS);
    assert.equal((await consumeLoginToken(db, token))?.name, "Ayu");
    assert.equal(await consumeLoginToken(db, token), null);
  });

  test("melihat nama tidak memakai token", async () => {
    const token = await createLoginToken(db, 3, EMAIL_LINK_TTL_MS);
    assert.deepEqual(await peekLoginToken(db, token), { name: "Ayu" });
    assert.equal((await consumeLoginToken(db, token))?.id, 3);
  });

  test("token kedaluwarsa ditolak", async () => {
    const token = await createLoginToken(db, 3, -1000);
    assert.equal(await peekLoginToken(db, token), null);
    assert.equal(await consumeLoginToken(db, token), null);
  });

  test("akun nonaktif tidak bisa masuk", async () => {
    const token = await createLoginToken(db, 5, EMAIL_LINK_TTL_MS);
    assert.equal(await consumeLoginToken(db, token), null);
  });

  test("database hanya menyimpan hash, bukan token", async () => {
    const token = await createLoginToken(db, 3, EMAIL_LINK_TTL_MS);
    const stored = await db.prepare("SELECT token_hash FROM login_tokens").first<{ token_hash: string }>();
    assert.notEqual(stored!.token_hash, token);
    assert.equal(stored!.token_hash, await hashToken(token));
  });

});

describe("sesi", () => {
  test("sesi mengenali penggunanya, lalu hilang setelah keluar", async () => {
    const token = await createSession(db, 3);
    assert.equal((await getSessionUser(db, token))?.awardeeId, 1);
    await deleteSession(db, token);
    assert.equal(await getSessionUser(db, token), null);
  });

  test("token acak tidak diterima", async () => {
    assert.equal(await getSessionUser(db, "bukan-token"), null);
    assert.equal(await getSessionUser(db, undefined), null);
  });

  test("sesi kedaluwarsa ditolak dan dihapus", async () => {
    const token = await createSession(db, 3);
    await db.prepare("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    assert.equal(await getSessionUser(db, token), null);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM sessions").first<{ n: number }>())!.n, 0);
  });

  test("menonaktifkan akun langsung memutus sesinya", async () => {
    const token = await createSession(db, 3);
    await setUserStatus(db, admin, 3, "disabled");
    assert.equal(await getSessionUser(db, token), null);
  });
});

describe("sesi Admin", () => {
  test("sesi Admin berlaku 24 jam dan tidak diperpanjang saat dipakai", async () => {
    const token = await createSession(db, 1);
    const row = await db.prepare("SELECT created_at, expires_at FROM sessions").first<{ created_at: string; expires_at: string }>();
    assert.equal(Date.parse(row!.expires_at) - Date.parse(row!.created_at), ADMIN_SESSION_TTL_MS);

    const longAgo = new Date(Date.now() - 2 * 3_600_000).toISOString();
    await db.prepare("UPDATE sessions SET last_seen_at = ?").bind(longAgo).run();
    await getSessionUser(db, token);
    const after = await db.prepare("SELECT expires_at FROM sessions").first<{ expires_at: string }>();
    assert.equal(after!.expires_at, row!.expires_at);
  });

  test("sesi Admin lama yang berusia lebih dari 24 jam ditolak walau expires_at masih jauh", async () => {
    const token = await createSession(db, 1);
    const old = new Date(Date.now() - ADMIN_SESSION_TTL_MS - 1000).toISOString();
    await db.prepare("UPDATE sessions SET created_at = ?, expires_at = ?").bind(old, new Date(Date.now() + 10 * 86_400_000).toISOString()).run();
    assert.equal(await getSessionUser(db, token), null);
  });

  test("sesi Awardee tetap 14 hari", async () => {
    await createSession(db, 3);
    const row = await db.prepare("SELECT created_at, expires_at FROM sessions").first<{ created_at: string; expires_at: string }>();
    assert.equal(Date.parse(row!.expires_at) - Date.parse(row!.created_at), SESSION_TTL_MS);
  });
});
