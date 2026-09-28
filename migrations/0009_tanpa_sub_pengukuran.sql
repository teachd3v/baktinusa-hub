-- Sub pengukuran (instrument_categories) dibuang. Soal menempel langsung ke jenis pengukuran.
--
-- Akibatnya pada IPK: dulu rata-rata tiap sub dihitung lebih dulu, lalu dirata-ratakan berbobot
-- (lib/data/results.ts). Sekarang IPK adalah rata-rata polos semua soal dalam jenis itu. Angkanya beda
-- kalau jumlah soal tiap sub tidak sama — sub 2 soal bernilai 4 dan sub 8 soal bernilai 2 dulu
-- menghasilkan 3.00, sekarang 2.40. Ambang predikat tidak diubah, jadi sebarannya ikut bergeser.
--
-- instruments dibangun ulang, bukan di-ALTER: SQLite menolak DROP COLUMN pada kolom yang dipakai
-- foreign key maupun indeks. Urutannya anak → induk, seperti biasa, karena D1 menjalankan migrasi di
-- dalam transaksi dengan FK tetap ditegakkan.
--
-- Semua tabel di bawah sedang kosong di lokal maupun production. Kalau dijalankan di basis data yang
-- sudah berisi soal, seluruh soal dan skornya hilang.

DROP TABLE response_scores;
DROP TABLE instruments;
DROP TABLE instrument_categories;

CREATE TABLE instruments (
  id             INTEGER PRIMARY KEY,
  measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  code           TEXT    NOT NULL,                 -- 'Q1', 'Q2', … unik di dalam jenisnya
  statement      TEXT    NOT NULL,                 -- bunyi soalnya, ditulis sesuai pengisinya
  scale_max      INTEGER NOT NULL DEFAULT 4,
  order_index    INTEGER NOT NULL,
  UNIQUE (measurement_id, code)
);
CREATE INDEX idx_instruments_measurement ON instruments (measurement_id);

CREATE TABLE response_scores (
  response_id   INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  score         INTEGER NOT NULL CHECK (score >= 0),
  PRIMARY KEY (response_id, instrument_id)
) WITHOUT ROWID;
CREATE INDEX idx_response_scores_instrument ON response_scores (instrument_id);
