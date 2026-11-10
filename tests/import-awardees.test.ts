// Impor lengkap: akun + profil + LeadPro + status dalam satu berkas, dengan peringatan duplikat dan baris "tetap".
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { applyPlan, exportCurrentRows, planImport, TEMPLATE_HEADERS, type RawRow } from "../lib/data/import-people.ts";
import { getLeadpro } from "../lib/data/leadpro.ts";
import { getProfileView } from "../lib/data/profiles.ts";
import { ScopeError, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

const baris = (over: Partial<RawRow> = {}): RawRow => ({
  ID: "BA00301",
  Nama: "Orang Baru",
  Email: "baru@contoh.id",
  Peran: "Awardee",
  Wilayah: "Bandung",
  Angkatan: "BA16",
  "Kode Referal": "BARU0301",
  Kampus: "ITB",
  "Kata Sandi": "BA2026",
  Status: "aktif",
  "Nama Panggilan": "Baru",
  "Jenis Kelamin": "Perempuan",
  "Tempat Lahir": "Bandung",
  "Tanggal Lahir": "17/05/2004",
  WhatsApp: "81234567890",
  NIM: "N-001",
  Fakultas: "Teknik",
  "Nama LeadPro": "Taman Baca",
  "Bidang LeadPro": "pendidikan",
  "Deskripsi LeadPro": "Taman baca anak desa.",
  "Status Awardee": "Lulus",
  "Tanggal Bergabung": "2026-08-01",
  ...over,
});

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
  await db.exec("INSERT INTO leadpro_fields (id, name) VALUES (1, 'Pendidikan'), (2, 'Kesehatan');");
});

const rencana = (rows: RawRow[]) => planImport(db, admin, rows);
const awardeeIdOf = async (loginId: string) =>
  (await db.prepare("SELECT awardee_id FROM users WHERE login_id = ?").bind(loginId).first<{ awardee_id: number }>())!.awardee_id;

describe("satu baris, semua data", () => {
  test("akun, profil, LeadPro, dan status tertulis sekaligus; persetujuan tidak ikut", async () => {
    const plans = await rencana([baris()]);
    assert.equal(plans[0]!.action, "buat");
    assert.match(plans[0]!.reason, /profil: .*Nama panggilan/);
    assert.deepEqual(await applyPlan(db, admin, plans), [{ line: 2, ok: true, message: "Dibuat." }]);

    const id = await awardeeIdOf("BA00301");
    const view = (await getProfileView(db, admin, id))!;
    assert.equal(view.profile.nickname, "Baru");
    assert.equal(view.profile.gender, "P"); // "Perempuan" dibaca sebagai P
    assert.equal(view.profile.birthDate, "2004-05-17"); // 17/05/2004
    assert.equal(view.profile.whatsapp, "+6281234567890"); // nol di depan yang hilang dipulihkan
    assert.equal(view.awardee.status, "graduated");
    assert.equal(view.awardee.joinedAt, "2026-08-01");
    assert.equal(view.meta.consentAt, null); // persetujuan hanya bisa dari awardee sendiri
    assert.deepEqual(await getLeadpro(db, id), { name: "Taman Baca", field: "Pendidikan", description: "Taman baca anak desa." });
  });

  test("angka seri tanggal dari Excel dibaca sebagai tanggal", async () => {
    // 38124 = 17 Mei 2004 pada penanggalan Excel.
    const [plan] = await rencana([baris({ "Tanggal Lahir": "38124" })]);
    assert.equal(plan!.action, "buat");
    await applyPlan(db, admin, [plan!]);
    assert.equal((await getProfileView(db, admin, await awardeeIdOf("BA00301")))!.profile.birthDate, "2004-05-17");
  });

  test("kolom profil, LeadPro, dan program ditolak untuk Manwil dan Admin", async () => {
    const [plan] = await rencana([baris({ Peran: "Manwil", ID: "MW00301", "Kode Referal": "" })]);
    assert.equal(plan!.action, "tolak");
    assert.match(plan!.reason, /hanya untuk Awardee/);
  });

  test("isian profil yang tidak sah ditolak dengan alasannya", async () => {
    const [plan] = await rencana([baris({ "Email Pribadi": "bukan-email" })]);
    assert.equal(plan!.action, "tolak");
    assert.match(plan!.reason, /Email pribadi tidak valid/);
  });
});

describe("LeadPro", () => {
  test("bidang yang belum ada ditolak, dan daftar pilihannya disebutkan", async () => {
    const [plan] = await rencana([baris({ "Bidang LeadPro": "Astronomi" })]);
    assert.equal(plan!.action, "tolak");
    assert.match(plan!.reason, /belum ada.*Kesehatan, Pendidikan/);
  });

  test("nama bidang tidak peka huruf besar-kecil dan tersimpan dengan ejaan tabel acuan", async () => {
    await applyPlan(db, admin, await rencana([baris({ "Bidang LeadPro": "KESEHATAN" })]));
    assert.equal((await getLeadpro(db, await awardeeIdOf("BA00301")))!.field, "Kesehatan");
  });

  test("deskripsi tanpa nama proyek ditolak", async () => {
    const [plan] = await rencana([baris({ "Nama LeadPro": "", "Bidang LeadPro": "", "Deskripsi LeadPro": "Tanpa nama." })]);
    assert.equal(plan!.action, "tolak");
  });
});

describe("sel kosong = biarkan, [kosongkan] = hapus", () => {
  beforeEach(async () => {
    await applyPlan(db, admin, await rencana([baris()]));
  });

  test("kolom yang dikosongkan di berkas tidak menghapus data lama", async () => {
    const ulang = baris({ Fakultas: "Hukum", "Nama Panggilan": "", NIM: "", "Nama LeadPro": "", "Bidang LeadPro": "", "Deskripsi LeadPro": "", "Kata Sandi": "", Status: "", "Status Awardee": "", "Tanggal Bergabung": "" });
    const plans = await rencana([ulang]);
    assert.equal(plans[0]!.action, "perbarui");
    assert.deepEqual(await applyPlan(db, admin, plans), [{ line: 2, ok: true, message: "Diperbarui." }]);

    const id = await awardeeIdOf("BA00301");
    const view = (await getProfileView(db, admin, id))!;
    assert.equal(view.profile.faculty, "Hukum");
    assert.equal(view.profile.nickname, "Baru");
    assert.equal(view.profile.studentId, "N-001");
    assert.equal((await getLeadpro(db, id))!.name, "Taman Baca");
    assert.equal(view.awardee.status, "graduated");
  });

  test("[kosongkan] menghapus isian, dan nama LeadPro kosong menghapus proyeknya", async () => {
    const id = await awardeeIdOf("BA00301");
    await applyPlan(db, admin, await rencana([baris({ NIM: "[kosongkan]", "Nama LeadPro": "[kosongkan]", "Bidang LeadPro": "[kosongkan]", "Deskripsi LeadPro": "[kosongkan]" })]));
    assert.equal((await getProfileView(db, admin, id))!.profile.studentId, "");
    assert.equal(await getLeadpro(db, id), null);
  });

  test("status akun yang kosong tidak mengaktifkan kembali akun yang dinonaktifkan", async () => {
    await db.exec("UPDATE users SET status = 'disabled' WHERE login_id = 'BA00301'");
    const [plan] = await rencana([baris({ Status: "" })]);
    assert.equal(plan!.input!.status, "disabled");
  });
});

describe("baris yang tidak berubah", () => {
  test("mengunggah ulang data yang sama menghasilkan 'tetap' dan tidak menulis apa pun", async () => {
    await applyPlan(db, admin, await rencana([baris()]));
    const audit = async () => (await db.prepare("SELECT COUNT(*) AS n FROM audit_log").first<{ n: number }>())!.n;
    const sebelum = await audit();

    const plans = await rencana([baris({ "Kata Sandi": "" })]);
    assert.equal(plans[0]!.action, "tetap");
    assert.deepEqual(await applyPlan(db, admin, plans), [{ line: 2, ok: true, message: "Tidak berubah." }]);
    assert.equal(await audit(), sebelum);
  });

  test("unduh data saat ini lalu unggah lagi = tidak ada yang berubah", async () => {
    await applyPlan(db, admin, await rencana([baris()]));
    const rows = await exportCurrentRows(db, admin);
    const target = rows.filter((r) => r.ID === "BA00301");
    assert.equal(target.length, 1);
    assert.equal(target[0]!["Kata Sandi"], ""); // kata sandi tidak pernah ikut
    for (const header of TEMPLATE_HEADERS) assert.ok(header in target[0]!);

    const [plan] = await rencana(target);
    assert.equal(plan!.action, "tetap");
  });

  test("mengubah satu isian pada data hasil unduhan hanya mengubah isian itu", async () => {
    await applyPlan(db, admin, await rencana([baris()]));
    const [row] = (await exportCurrentRows(db, admin)).filter((r) => r.ID === "BA00301");
    const [plan] = await rencana([{ ...row!, Tagline: "Tagline baru" }]);
    assert.equal(plan!.action, "perbarui");
    assert.equal(plan!.accountChanged, false);
    assert.match(plan!.reason, /profil: Tagline/);
  });
});

describe("peringatan duplikat", () => {
  test("NIM yang sama dengan awardee lain hanya jadi peringatan, bukan penolakan", async () => {
    await applyPlan(db, admin, await rencana([baris()]));
    const [plan] = await rencana([baris({ ID: "BA00302", Email: "dua@contoh.id", "Kode Referal": "BARU0302", Nama: "Orang Lain" })]);
    assert.equal(plan!.action, "buat");
    assert.ok(plan!.warnings.some((w) => /NIM sama dengan milik Orang Baru/.test(w)));
  });

  test("nilai kembar di dalam berkas yang sama ditunjuk ke nomor barisnya", async () => {
    const plans = await rencana([baris(), baris({ ID: "BA00302", Email: "dua@contoh.id", "Kode Referal": "BARU0302" })]);
    assert.deepEqual(plans.map((p) => p.action), ["buat", "buat"]);
    assert.ok(plans[1]!.warnings.some((w) => /NIM sama dengan baris 2/.test(w)));
    assert.ok(plans[1]!.warnings.some((w) => /Nama sama dengan baris 2/.test(w)));
    assert.ok(plans[1]!.warnings.some((w) => /Nomor WhatsApp sama dengan baris 2/.test(w)));
    assert.equal(plans[0]!.warnings.length, 0);
  });

  test("nama yang sama dengan awardee yang sudah ada diperingatkan", async () => {
    const [plan] = await rencana([baris({ Nama: "ayu", ID: "BA00303", Email: "ayu3@contoh.id", "Kode Referal": "BARU0303" })]);
    assert.equal(plan!.action, "buat");
    assert.ok(plan!.warnings.some((w) => /Nama sama dengan awardee lain/.test(w)));
  });

  test("ID ganda tetap ditolak keras", async () => {
    const plans = await rencana([baris(), baris({ Email: "dua@contoh.id", "Kode Referal": "BARU0302" })]);
    assert.equal(plans[1]!.action, "tolak");
    assert.match(plans[1]!.reason, /sudah dipakai di baris 2/);
  });
});

describe("hanya Admin", () => {
  test("mengunduh data saat ini ditolak untuk peran lain dan dicatat untuk Admin", async () => {
    await assert.rejects(exportCurrentRows(db, manwil), ScopeError);
    await exportCurrentRows(db, admin);
    const log = await db.prepare("SELECT COUNT(*) AS n FROM audit_log WHERE action = 'impor.unduh-data'").first<{ n: number }>();
    assert.equal(log!.n, 1);
  });
});
