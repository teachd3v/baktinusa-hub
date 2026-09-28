-- Jenis pengukuran & siklus.
--
-- measurements dan respondent_types LEBUR jadi satu. Kalau tiap jenis pengukuran punya kuesionernya
-- sendiri DAN menyatakan siapa pengisinya, maka keduanya adalah benda yang sama — tidak ada lagi dua
-- daftar yang harus dijodohkan. Sepuluh tipe responden lama menyusut jadi enam jenis: dua asesmen
-- mandiri (awal & tengah) lebur jadi satu SA yang dijalankan di siklus berbeda, dan lima tipe
-- Leadership Project lebur jadi satu LA — bedanya pindah ke isian hubungan di formnya (responses.relation).
--
-- kind (assessment|leadpro) dibuang: cuma label di layar, tidak pernah mengubah perilaku.
--
-- instruments.text_self dan text_public jadi satu kolom statement. Dulu dua versi teks diperlukan karena
-- satu kuesioner dipakai bersama ("Saya…" vs "Yang bersangkutan…"); sekarang tiap jenis menulis soalnya
-- sendiri, jadi versi kedua tidak ada gunanya.
--
-- periods berubah arti: dari "satu jadwal untuk satu kuesioner" jadi SIKLUS milik satu angkatan.
-- BA16 punya Awal, Tengah, Akhir — masing-masing hanya sekali, dijaga UNIQUE (batch, cycle). Satu siklus
-- menjalankan BEBERAPA jenis sekaligus, jadi periods.measurement_id hilang dan digantikan
-- period_measurements (dulu period_respondent_types), yang tetap membawa jendela waktu & target per jenis.
--
-- Semua tabel di bawah sedang kosong di lokal maupun production, jadi ini dibangun ulang bersih: tidak ada
-- baris yang dipindahkan, dan tidak perlu tarian bongkar-pasang FK seperti migrasi 0006. Urutan drop tetap
-- anak → induk, karena D1 menjalankan migrasi di dalam transaksi dan FK-nya tetap ditegakkan.
--
-- Kalau dijalankan di basis data yang sudah berisi penilaian, seluruh penilaiannya hilang.

DROP TABLE response_scores;
DROP TABLE response_feedback;
DROP TABLE responses;
DROP TABLE period_respondent_types;
DROP TABLE instruments;
DROP TABLE instrument_categories;
DROP TABLE respondent_types;
DROP TABLE periods;
DROP TABLE measurements;

-- ---------- jenis pengukuran ----------

CREATE TABLE measurements (
  id          INTEGER PRIMARY KEY,
  code        TEXT    NOT NULL UNIQUE,           -- 'SA', 'PA', 'MA', 'PU', 'LA', 'UA'
  slug        TEXT    NOT NULL UNIQUE,           -- dipakai di alamat form publik
  name        TEXT    NOT NULL,
  -- Yang menentukan rute: siapa yang boleh membuka formnya, dan lewat jalur mana.
  -- 'self'   diri sendiri          'peer'   rekan se-wilayah        'manwil' Manajer Wilayah binaannya
  -- 'public' tautan publik          'admin' Admin menilai awardee (mis. Uji Akhir)
  filled_by   TEXT    NOT NULL CHECK (filled_by IN ('self', 'peer', 'manwil', 'public', 'admin')),
  form_config TEXT,                              -- teks & pilihan skala form publik (JSON)
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- ---------- siklus ----------

CREATE TABLE periods (
  id        INTEGER PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  batch     TEXT NOT NULL,
  cycle     TEXT NOT NULL CHECK (cycle IN ('awal', 'tengah', 'akhir')),
  opens_at  TEXT,
  closes_at TEXT,
  status    TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'archived')),
  -- Satu angkatan hanya punya satu Siklus Awal, satu Tengah, satu Akhir.
  UNIQUE (batch, cycle)
);

-- Jenis mana yang dijalankan siklus ini, beserta jendela waktu dan target minimalnya.
-- target_rule 'region_peers' = semua awardee lain di wilayah yang sama.
CREATE TABLE period_measurements (
  period_id      INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  measurement_id INTEGER NOT NULL REFERENCES measurements(id),
  target_rule    TEXT    NOT NULL DEFAULT 'none' CHECK (target_rule IN ('none', 'fixed', 'region_peers')),
  target_min     INTEGER,
  opens_at       TEXT,
  closes_at      TEXT,
  PRIMARY KEY (period_id, measurement_id),
  CHECK ((target_rule = 'fixed') = (target_min IS NOT NULL))
);

-- ---------- kuesioner, milik jenis pengukuran ----------

CREATE TABLE instrument_categories (
  id             INTEGER PRIMARY KEY,
  measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  name           TEXT    NOT NULL,
  weight         REAL    NOT NULL DEFAULT 1,
  order_index    INTEGER NOT NULL,
  UNIQUE (measurement_id, name)
);

CREATE TABLE instruments (
  id             INTEGER PRIMARY KEY,
  measurement_id INTEGER NOT NULL REFERENCES measurements(id) ON DELETE CASCADE,
  category_id    INTEGER NOT NULL REFERENCES instrument_categories(id),
  code           TEXT    NOT NULL,                 -- 'Q1', 'Q2', … unik di dalam jenisnya
  statement      TEXT    NOT NULL,                 -- bunyi soalnya, ditulis sesuai pengisinya
  scale_max      INTEGER NOT NULL DEFAULT 4,
  order_index    INTEGER NOT NULL,
  UNIQUE (measurement_id, code)
);
CREATE INDEX idx_instruments_category ON instruments(category_id);
CREATE INDEX idx_instruments_measurement ON instruments(measurement_id);

-- ---------- penilaian yang masuk ----------

CREATE TABLE responses (
  id              INTEGER PRIMARY KEY,
  period_id       INTEGER NOT NULL REFERENCES periods(id),
  awardee_id      INTEGER NOT NULL REFERENCES awardees(id),
  measurement_id  INTEGER NOT NULL REFERENCES measurements(id),
  respondent_name TEXT,
  respondent_city TEXT,
  relation        TEXT,                            -- jawaban hubungan apa adanya, mis. 'Volunteer Leadership Project'
  known_duration  TEXT,                            -- '< 5 bulan' | '5 bulan - 1 tahun' | '> 1 tahun'
  submitted_at    TEXT,                            -- NULL untuk data impor yang tidak punya waktu kirim
  source          TEXT    NOT NULL,                -- 'app' | 'import:sheet1' | …
  fingerprint     TEXT,                            -- hash IP + user agent, untuk menandai kiriman ganda
  public_id       TEXT,
  submitted_by    INTEGER REFERENCES users(id),
  created_at      TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  -- Jenis ini harus memang dijalankan oleh siklus itu.
  FOREIGN KEY (period_id, measurement_id) REFERENCES period_measurements(period_id, measurement_id)
);
CREATE INDEX idx_responses_awardee ON responses(awardee_id, period_id);
CREATE INDEX idx_responses_period_measurement ON responses(period_id, measurement_id);
CREATE UNIQUE INDEX idx_responses_public_id ON responses(public_id);
CREATE INDEX idx_responses_fingerprint ON responses(fingerprint);
-- Satu pengisi berakun hanya boleh sekali per awardee per jenis per siklus.
CREATE UNIQUE INDEX idx_responses_one_per_user
  ON responses(period_id, awardee_id, measurement_id, submitted_by)
  WHERE submitted_by IS NOT NULL;

CREATE TABLE response_scores (
  response_id   INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  instrument_id INTEGER NOT NULL REFERENCES instruments(id),
  score         INTEGER NOT NULL CHECK (score >= 0),
  PRIMARY KEY (response_id, instrument_id)
) WITHOUT ROWID;
CREATE INDEX idx_response_scores_instrument ON response_scores(instrument_id);

CREATE TABLE response_feedback (
  response_id INTEGER NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  field       TEXT    NOT NULL CHECK (field IN ('saran_diri', 'saran_program', 'pesan', 'kritik', 'saran_keberlanjutan')),
  body        TEXT    NOT NULL,
  PRIMARY KEY (response_id, field)
) WITHOUT ROWID;
