-- Pengukuran dipisahkan dari periode.
--
-- Sebelum ini, satu periode memiliki kuesionernya sendiri, jadi tiap angkatan berarti satu salinan soal.
-- Sesudah ini: **pengukuran** memiliki sub pengukuran (kategori) dan soal, sementara **periode** tinggal
-- jadwal yang menunjuk pengukuran mana yang dijalankan untuk angkatan apa.
--
-- Id soal dipertahankan supaya `response_scores` yang sudah masuk tetap menunjuk soal yang sama.
--
-- Catatan cara kerja: `instruments` dirujuk `response_scores`, jadi tidak bisa langsung dibongkar.
-- `PRAGMA foreign_keys = OFF` tidak menolong karena SQLite mengabaikannya di dalam transaksi, dan
-- migrasi D1 selalu berjalan dalam transaksi. Jalan yang dipakai di sini: **bongkar dari anak ke induk,
-- pasang kembali dari induk ke anak** — saat sebuah tabel dibuang, tidak ada lagi baris yang merujuknya.

-- 1. Pengukuran, satu per periode yang sudah ada. Id-nya sengaja disamakan dengan id periode supaya
--    `period_id` lama pada soal langsung menjadi `measurement_id` yang benar.
CREATE TABLE measurements (
  id          INTEGER PRIMARY KEY,
  slug        TEXT    NOT NULL UNIQUE,
  name        TEXT    NOT NULL,
  kind        TEXT    NOT NULL CHECK (kind IN ('assessment', 'leadpro')),
  form_config TEXT,                               -- teks form publik, skala, dan pertanyaan non-skor
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO measurements (id, slug, name, kind, form_config)
  SELECT id, slug, name, kind, form_config FROM periods;

ALTER TABLE periods ADD COLUMN measurement_id INTEGER REFERENCES measurements(id);
UPDATE periods SET measurement_id = id;

-- 2. Salinan sementara tanpa foreign key, supaya isinya selamat saat tabel aslinya dibongkar.
CREATE TABLE _pindah_kategori AS SELECT * FROM instrument_categories;
CREATE TABLE _pindah_soal AS SELECT * FROM instruments;
CREATE TABLE _pindah_skor AS SELECT * FROM response_scores;

-- 3. Bongkar dari anak ke induk.
DROP TABLE response_scores;
DROP TABLE instruments;
DROP TABLE instrument_categories;

-- 4. Pasang kembali dari induk ke anak, dengan bentuk yang baru.
CREATE TABLE instrument_categories (
  id             INTEGER PRIMARY KEY,
  measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  weight         REAL    NOT NULL DEFAULT 1,
  order_index    INTEGER NOT NULL,
  UNIQUE (measurement_id, name)
);
INSERT INTO instrument_categories (id, measurement_id, name, weight, order_index)
  SELECT id, period_id, name, weight, order_index FROM _pindah_kategori;

CREATE TABLE instruments (
  id             INTEGER PRIMARY KEY,
  measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  category_id    INTEGER NOT NULL REFERENCES instrument_categories(id),
  code           TEXT    NOT NULL,                  -- 'Q19'
  text_self      TEXT,                              -- versi 'Saya ...' untuk asesmen mandiri
  text_public    TEXT    NOT NULL,                  -- versi 'Yang bersangkutan ...' untuk penilai
  scale_max      INTEGER NOT NULL DEFAULT 4,
  order_index    INTEGER NOT NULL,
  UNIQUE (measurement_id, code)
);
INSERT INTO instruments (id, measurement_id, category_id, code, text_self, text_public, scale_max, order_index)
  SELECT id, period_id, category_id, code, text_self, text_public, scale_max, order_index FROM _pindah_soal;
CREATE INDEX idx_instruments_category ON instruments(category_id);
CREATE INDEX idx_instruments_measurement ON instruments(measurement_id);

CREATE TABLE response_scores (
  response_id   INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  score         INTEGER NOT NULL CHECK (score >= 0),
  PRIMARY KEY (response_id, instrument_id)
) WITHOUT ROWID;
INSERT INTO response_scores (response_id, instrument_id, score)
  SELECT response_id, instrument_id, score FROM _pindah_skor;
CREATE INDEX idx_response_scores_instrument ON response_scores(instrument_id);

-- 5. Bersihkan salinan sementara, dan lepas teks form dari periode — sekarang tempatnya di pengukuran.
DROP TABLE _pindah_skor;
DROP TABLE _pindah_soal;
DROP TABLE _pindah_kategori;
ALTER TABLE periods DROP COLUMN form_config;
