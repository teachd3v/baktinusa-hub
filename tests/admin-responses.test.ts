// Moderasi respons: menandai kiriman kembar, dan menghapus yang benar-benar ganda.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { deleteResponse, listResponsesForAdmin } from "../lib/data/admin-responses.ts";
import { listAudit } from "../lib/data/audit.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
  await db.exec(`
    INSERT INTO response_scores (response_id, instrument_id, score) VALUES (1, 1, 4), (1, 2, 3), (2, 1, 3), (2, 2, 3);
    INSERT INTO response_feedback (response_id, field, body) VALUES (1, 'saran_diri', 'Semangat');
    UPDATE responses SET fingerprint = 'abc' WHERE id IN (1, 2);
    UPDATE responses SET fingerprint = 'lain' WHERE id = 3;
  `);
});

describe("hanya Admin", () => {
  test("peran lain ditolak", async () => {
    await assert.rejects(listResponsesForAdmin(db, manwil, 1), ScopeError);
    await assert.rejects(deleteResponse(db, manwil, 1), ScopeError);
  });
});

describe("menandai kiriman kembar", () => {
  test("kiriman kedua dari sidik jari yang sama ditandai, yang pertama tidak", async () => {
    const rows = await listResponsesForAdmin(db, admin, 1);
    const byId = new Map(rows.map((r) => [r.id, r]));
    assert.equal(byId.get(1)!.duplicateOf, null); // yang pertama dianggap asli
    assert.equal(byId.get(2)!.duplicateOf, 1);
    assert.equal(byId.get(3)!.duplicateOf, null); // sidik jari berbeda
    assert.equal(byId.get(4)!.duplicateOf, null); // tanpa sidik jari sama sekali
  });

  test("sidik jari sama tapi awardee berbeda bukan kembar", async () => {
    await db.prepare("UPDATE responses SET fingerprint = 'abc' WHERE id = 4").run(); // awardee lain
    const rows = await listResponsesForAdmin(db, admin, 1);
    assert.equal(rows.find((r) => r.id === 4)!.duplicateOf, null);
  });
});

describe("menghapus respons", () => {
  test("skor & saran ikut terhapus, dan jejaknya menyimpan isinya", async () => {
    assert.ok((await deleteResponse(db, admin, 1)).ok);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM responses WHERE id = 1").first<{ n: number }>())!.n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM response_scores WHERE response_id = 1").first<{ n: number }>())!.n, 0);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM response_feedback WHERE response_id = 1").first<{ n: number }>())!.n, 0);

    const [entry] = await listAudit(db, admin);
    assert.equal(entry!.action, "respons.hapus");
    assert.match(entry!.summary, /Respons #1 untuk "Ayu".*beserta 2 skornya/);

    // Respons lain tidak ikut terbawa.
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM responses").first<{ n: number }>())!.n, 4);
    assert.deepEqual(await deleteResponse(db, admin, 1), { ok: false, message: "Respons tidak ditemukan." });
  });
});
