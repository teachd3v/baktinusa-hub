-- Kampus jadi daftar pilihan milik wilayah, bukan lagi teks bebas di tiap awardee.
--
-- Sebelumnya awardees.campus TEXT diketik ulang tiap kali, jadi satu kampus bisa punya banyak ejaan
-- ("IPB", "Institut Pertanian Bogor", "ipb ") dan tidak pernah bisa dihitung sebagai satu.
--
-- Kampus menempel ke wilayah karena dropdown-nya di form Pengguna disaring oleh wilayah yang dipilih.
--
-- Kolom lamanya DIBUANG, bukan dipindahkan: kedua basis data (lokal dan production) sedang kosong saat
-- migrasi ini dibuat, jadi tidak ada teks kampus yang perlu diselamatkan. Kalau dijalankan di basis data
-- yang sudah berisi awardee, isi kolom campus akan hilang.

CREATE TABLE campuses (
  id         INTEGER PRIMARY KEY,
  region_id  INTEGER NOT NULL REFERENCES regions(id),
  name       TEXT    NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Kembar dijaga per wilayah dan tanpa peduli huruf besar-kecil: dua wilayah boleh sama-sama punya
-- "Universitas Terbuka", tapi satu wilayah tidak boleh punya "IPB" dan "ipb" sekaligus.
CREATE UNIQUE INDEX campuses_region_name ON campuses (region_id, lower(name));
CREATE INDEX campuses_region ON campuses (region_id);

ALTER TABLE awardees DROP COLUMN campus;
ALTER TABLE awardees ADD COLUMN campus_id INTEGER REFERENCES campuses(id);

CREATE INDEX awardees_campus ON awardees (campus_id);
