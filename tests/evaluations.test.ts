// Siapa boleh menilai siapa: asesmen mandiri, Peer se-wilayah, dan Manwil untuk binaannya.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { listPeerTargets, listTasks, resolveInternalForm, saveInternalResponse } from "../lib/data/evaluations.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwilBandung: SessionUser = { id: 2, name: "Manwil Bandung", email: "manwil.bandung@contoh.id", role: "manwil", regionId: 1, awardeeId: null };
const ayu: SessionUser = { id: 3, name: "Ayu", email: "ayu@contoh.id", role: "awardee", regionId: null, awardeeId: 1 };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
});

const resolve = (user: SessionUser, type: string, kode: string) => resolveInternalForm(db, user, "uji", type, kode);
const reason = async (user: SessionUser, type: string, kode: string) => {
  const r = await resolve(user, type, kode);
  return r.ok ? "ok" : r.reason;
};

describe("daftar tugas", () => {
  test("Awardee: asesmen mandiri + menilai rekan se-wilayah saja", async () => {
    const tasks = await listTasks(db, ayu);
    assert.deepEqual(
      tasks.map((t) => `${t.kind}:${t.target.name}`),
      ["self:Ayu", "peer:Budi"],
    );
  });

  test("Manwil: menilai semua awardee binaannya", async () => {
    assert.deepEqual((await listTasks(db, manwilBandung)).map((t) => `${t.kind}:${t.target.name}`), ["manwil:Ayu", "manwil:Budi"]);
  });

  test("Admin tidak mengisi penilaian", async () => {
    assert.deepEqual(await listTasks(db, admin), []);
  });

  test("rekan hanya se-wilayah, tanpa dirinya sendiri; hanya untuk Awardee", async () => {
    assert.deepEqual((await listPeerTargets(db, ayu)).map((t) => t.name), ["Budi"]);
    await assert.rejects(listPeerTargets(db, manwilBandung), ScopeError);
  });
});

describe("siapa boleh membuka form apa", () => {
  test("asesmen mandiri: hanya untuk dirinya, memakai teks versi 'Saya'", async () => {
    const r = await resolve(ayu, "self_initial", "AAAA0001");
    assert.ok(r.ok);
    assert.deepEqual(r.form.instruments.map((i) => i.text), ["Saya jujur", "Saya disiplin"]);
    assert.equal(r.form.feedback[0]!.label, "Refleksi");
    assert.equal(await reason(ayu, "self_initial", "AAAA0002"), "forbidden");
  });

  test("Peer: rekan se-wilayah boleh, diri sendiri & wilayah lain tidak", async () => {
    const r = await resolve(ayu, "peer", "AAAA0002");
    assert.ok(r.ok);
    assert.equal(r.form.instruments[0]!.text, "Yang bersangkutan jujur");
    assert.equal(await reason(ayu, "peer", "AAAA0001"), "forbidden");
    assert.equal(await reason(ayu, "peer", "BBBB0003"), "forbidden");
  });

  test("Manwil: binaan boleh, wilayah lain tidak; peran lain tidak bisa memakai form Manwil", async () => {
    assert.equal(await reason(manwilBandung, "manwil", "AAAA0001"), "ok");
    assert.equal(await reason(manwilBandung, "manwil", "BBBB0003"), "forbidden");
    assert.equal(await reason(ayu, "manwil", "AAAA0002"), "forbidden");
    assert.equal(await reason(manwilBandung, "peer", "AAAA0001"), "forbidden");
    assert.equal(await reason(admin, "manwil", "AAAA0001"), "forbidden");
  });

  test("tipe publik tidak bisa dipakai lewat jalur berakun", async () => {
    assert.equal(await reason(ayu, "external", "AAAA0002"), "not_found");
  });

  test("jendela tipe yang sudah lewat → ditutup", async () => {
    await db.prepare("UPDATE period_respondent_types SET closes_at = '2000-01-01T00:00:00.000Z' WHERE respondent_type_id = 3").run();
    assert.equal(await reason(ayu, "peer", "AAAA0002"), "closed");
    assert.equal(await reason(ayu, "self_initial", "AAAA0001"), "ok");
  });

  test("periode draft → ditutup, dan tidak muncul di daftar tugas", async () => {
    await db.prepare("UPDATE periods SET status = 'draft'").run();
    assert.equal(await reason(ayu, "self_initial", "AAAA0001"), "closed");
    assert.deepEqual(await listTasks(db, ayu), []);
  });
});

describe("mengirim penilaian", () => {
  test("tersimpan dengan pengisinya, lalu tidak bisa diisi dua kali", async () => {
    const r = await resolve(ayu, "peer", "AAAA0002");
    assert.ok(r.ok);
    const saved = await saveInternalResponse(db, ayu, r.form, { scores: { Q1: 4, Q2: 3 }, feedback: { saran_diri: "Terus semangat" } });
    assert.ok(saved.ok);
    assert.match(saved.receipt, /^[0-9A-F]{8}$/);

    const row = await db.prepare("SELECT id, awardee_id, respondent_type_id, submitted_by, relation FROM responses WHERE submitted_by IS NOT NULL").first<{ id: number }>();
    assert.deepEqual({ ...row, id: undefined }, { id: undefined, awardee_id: 2, respondent_type_id: 3, submitted_by: 3, relation: "Peer Awardee" });
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM response_scores WHERE response_id = ?").bind(row!.id).first<{ n: number }>())!.n, 2);

    assert.equal(await reason(ayu, "peer", "AAAA0002"), "submitted");
    // Dua tab yang mengirim bersamaan: indeks unik menolak yang kedua.
    const again = await saveInternalResponse(db, ayu, r.form, { scores: { Q1: 4, Q2: 3 }, feedback: {} });
    assert.deepEqual(again, { ok: false, status: 409, message: "Anda sudah mengisi penilaian ini." });

    const task = (await listTasks(db, ayu)).find((t) => t.kind === "peer");
    assert.equal(task!.submitted, true);
  });

  test("skor tidak lengkap & saran wajib ditolak", async () => {
    const r = await resolve(ayu, "self_initial", "AAAA0001");
    assert.ok(r.ok);
    assert.equal((await saveInternalResponse(db, ayu, r.form, { scores: { Q1: 4 }, feedback: { saran_diri: "x" } })).ok, false);
    assert.equal((await saveInternalResponse(db, ayu, r.form, { scores: { Q1: 4, Q2: 9 }, feedback: { saran_diri: "x" } })).ok, false);
    const noReflection = await saveInternalResponse(db, ayu, r.form, { scores: { Q1: 4, Q2: 4 }, feedback: {} });
    assert.deepEqual(noReflection, { ok: false, status: 422, message: "Refleksi wajib diisi." });
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM responses").first<{ n: number }>())!.n, 5); // hanya respons fixture
  });
});
