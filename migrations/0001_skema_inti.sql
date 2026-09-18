-- Skema inti: wilayah, awardee, periode, instrumen, dan respons.
-- Tabel pengguna & sesi menyusul di Fase 3, snapshot skor di Fase 4, audit log di Fase 5.
-- Semua waktu disimpan sebagai teks ISO 8601 UTC.

CREATE TABLE regions (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE awardees (
  id                  INTEGER PRIMARY KEY,
  region_id           INTEGER NOT NULL REFERENCES regions(id),
  batch               TEXT    NOT NULL,          -- 'BA15'
  name                TEXT    NOT NULL,
  campus              TEXT,
  referral_code       TEXT    NOT NULL UNIQUE,
  photo_key           TEXT,                      -- kunci objek di R2 (binding FILES)
  leadpro_name        TEXT,
  leadpro_field       TEXT,
  leadpro_description TEXT,
  created_at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_awardees_region ON awardees(region_id);
CREATE INDEX idx_awardees_batch ON awardees(batch);

-- Satu periode = satu set instrumen yang diisi dalam satu rentang waktu.
CREATE TABLE periods (
  id        INTEGER PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,                -- 'ba15-pengukuran'
  name      TEXT NOT NULL,
  batch     TEXT NOT NULL,
  kind      TEXT NOT NULL CHECK (kind IN ('assessment', 'leadpro')),
  opens_at  TEXT,
  closes_at TEXT,
  status    TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed', 'archived'))
);

-- Kategori adalah data, bukan rentang nomor di kode: tiap pertanyaan memegang category_id-nya sendiri.
CREATE TABLE instrument_categories (
  id          INTEGER PRIMARY KEY,
  period_id   INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  name        TEXT    NOT NULL,
  weight      REAL    NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL,
  UNIQUE (period_id, name)
);

CREATE TABLE instruments (
  id          INTEGER PRIMARY KEY,
  period_id   INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES instrument_categories(id),
  code        TEXT    NOT NULL,                  -- 'Q19'
  text_self   TEXT,                              -- versi 'Saya ...' untuk asesmen mandiri
  text_public TEXT    NOT NULL,                  -- versi 'Yang bersangkutan ...' untuk penilai
  scale_max   INTEGER NOT NULL DEFAULT 4,
  order_index INTEGER NOT NULL,
  UNIQUE (period_id, code)
);
CREATE INDEX idx_instruments_category ON instruments(category_id);

-- Siapa yang mengisi. Berlaku lintas angkatan.
CREATE TABLE respondent_types (
  id       INTEGER PRIMARY KEY,
  code     TEXT NOT NULL UNIQUE,                 -- 'self_initial', 'peer', 'external', 'lp_team', ...
  name     TEXT NOT NULL,                        -- 'Asesmen Awal', 'Peer Awardee', ...
  audience TEXT NOT NULL CHECK (audience IN ('self', 'internal', 'external'))
);

-- Tipe responden yang dibuka pada sebuah periode, beserta jendela waktu dan target minimalnya.
-- target_rule 'region_peers' = semua awardee lain di wilayah yang sama.
CREATE TABLE period_respondent_types (
  period_id          INTEGER NOT NULL REFERENCES periods(id) ON DELETE CASCADE,
  respondent_type_id INTEGER NOT NULL REFERENCES respondent_types(id),
  target_rule        TEXT    NOT NULL DEFAULT 'none' CHECK (target_rule IN ('none', 'fixed', 'region_peers')),
  target_min         INTEGER,
  opens_at           TEXT,
  closes_at          TEXT,
  PRIMARY KEY (period_id, respondent_type_id),
  CHECK ((target_rule = 'fixed') = (target_min IS NOT NULL))
);

CREATE TABLE responses (
  id                 INTEGER PRIMARY KEY,
  period_id          INTEGER NOT NULL REFERENCES periods(id),
  awardee_id         INTEGER NOT NULL REFERENCES awardees(id),
  respondent_type_id INTEGER NOT NULL REFERENCES respondent_types(id),
  respondent_name    TEXT,
  respondent_city    TEXT,
  relation           TEXT,                       -- jawaban hubungan apa adanya, mis. 'Lainnya: Kakak tingkat'
  known_duration     TEXT,                       -- '< 5 bulan' | '5 bulan - 1 tahun' | '> 1 tahun'
  submitted_at       TEXT,                       -- NULL untuk data impor yang tidak punya waktu kirim
  source             TEXT    NOT NULL,           -- 'app' | 'import:sheet1' | 'import:sheet2' | 'import:dashboard'
  fingerprint        TEXT,                       -- hash IP + user agent, untuk menandai kiriman ganda
  created_at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (period_id, respondent_type_id) REFERENCES period_respondent_types(period_id, respondent_type_id)
);
CREATE INDEX idx_responses_awardee ON responses(awardee_id, period_id);
CREATE INDEX idx_responses_period_type ON responses(period_id, respondent_type_id);

-- Satu baris per jawaban, bukan 50 kolom Q1..Q50.
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
