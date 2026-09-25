// Ekspor CSV: bentuk berkas, dan lingkup siapa boleh mengekspor data siapa.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { matrixCsv, rawCsv, toCsv } from "../lib/data/export.ts";
import { scopeFor, type SessionUser } from "../lib/data/scope.ts";
import { createTestDb, seedFixture } from "./helpers/d1.ts";

const admin: SessionUser = { id: 1, name: "Admin", email: "admin@contoh.id", role: "admin", regionId: null, awardeeId: null };
const manwil: SessionUser = { id: 2, name: "Manwil", email: "m@contoh.id", role: "manwil", regionId: 1, awardeeId: null };

let db: D1Database;
beforeEach(async () => {
  db = createTestDb();
  await seedFixture(db);
  await db.exec(`
    INSERT INTO response_scores (response_id, instrument_id, score) VALUES (1, 1, 4), (1, 2, 3), (3, 1, 2), (3, 2, 2);
    INSERT INTO response_feedback (response_id, field, body) VALUES (1, 'saran_diri', 'Bagus; teruskan');
    UPDATE responses SET respondent_name = 'Rina', respondent_city = 'Bandung', relation = 'Rekan kerja' WHERE id = 1;
  `);
});

const lines = (csv: string) => csv.replace(/^﻿/, "").trim().split("\r\n");

describe("bentuk CSV", () => {
  test("sel dengan pemisah, kutip, atau baris baru tetap utuh", () => {
    const csv = toCsv([["a", "b;c"], ['kata "kunci"', "dua\nbaris"], [null, 3]]);
    assert.equal(csv, '﻿a;"b;c"\r\n"kata ""kunci""";"dua\nbaris"\r\n;3\r\n');
  });
});

describe("matriks", () => {
  test("satu baris per awardee, dengan IPK dan jumlah responden tiap tipe", async () => {
    const rows = lines(await matrixCsv(db, scopeFor(admin), 1));
    assert.equal(rows.length, 5); // header + 4 awardee
    assert.match(rows[0]!, /^Nama;Wilayah;Kampus;Kode referal;/);
    assert.match(rows[0]!, /Jejaring Eksternal — IPK;Jejaring Eksternal — responden/);
    const ayu = rows.find((r) => r.startsWith("Ayu"))!;
    assert.match(ayu, /Ayu;Bandung;;AAAA0001;/); // kampus kosong tetap jadi sel kosong
    assert.match(ayu, /;3\.5;1;/); // IPK jejaring eksternal Ayu dari satu respons bernilai 4 & 3
  });

  test("Manwil hanya mengekspor wilayahnya", async () => {
    const rows = lines(await matrixCsv(db, scopeFor(manwil), 1));
    assert.deepEqual(rows.slice(1).map((r) => r.split(";")[0]), ["Ayu", "Budi"]);
  });
});

describe("data mentah", () => {
  test("satu baris per respons, satu kolom per pertanyaan, plus saran", async () => {
    const rows = lines(await rawCsv(db, scopeFor(admin), 1));
    assert.equal(rows.length, 6); // header + 5 respons fixture
    assert.match(rows[0]!, /ID respons;Awardee;Wilayah;Tipe penilai;Nama responden;Kota;Hubungan;Lama kenal;Waktu kirim;Sumber;Q1;Q2;saran_diri/);
    const terisi = rows.find((r) => r.includes("Rina"))!;
    assert.match(terisi, /^1;Ayu;Bandung;Jejaring Eksternal;Rina;Bandung;Rekan kerja;;;app;4;3;/);
    assert.ok(terisi.endsWith('"Bagus; teruskan"')); // saran dengan titik koma tetap satu sel
  });

  test("respons tanpa skor tetap muncul dengan sel kosong", async () => {
    const rows = lines(await rawCsv(db, scopeFor(admin), 1));
    const kosong = rows.filter((r) => r.endsWith(";;;"));
    assert.ok(kosong.length >= 1);
  });

  test("Manwil tidak bisa menarik data mentah wilayah lain", async () => {
    const rows = lines(await rawCsv(db, scopeFor(manwil), 1));
    assert.equal(rows.length, 4); // header + 3 respons milik Ayu & Budi
    assert.ok(!rows.some((r) => r.includes("Citra") || r.includes("Dedi")));
  });
});
