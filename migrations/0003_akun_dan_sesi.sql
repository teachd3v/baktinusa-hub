-- Akun pengguna hub: Admin, Manajer Wilayah, dan Awardee. Responden publik tidak punya akun.
CREATE TABLE users (
  id            INTEGER PRIMARY KEY,
  email         TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT    NOT NULL,
  role          TEXT    NOT NULL CHECK (role IN ('admin', 'manwil', 'awardee')),
  region_id     INTEGER REFERENCES regions(id),          -- manwil: wilayah yang dipegang
  awardee_id    INTEGER UNIQUE REFERENCES awardees(id),  -- awardee: dirinya sendiri
  status        TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_login_at TEXT,
  CHECK ((role = 'manwil') = (region_id IS NOT NULL)),
  CHECK ((role = 'awardee') = (awardee_id IS NOT NULL))
);

-- Tautan masuk sekali pakai. Yang disimpan hanya hash SHA-256 dari token.
CREATE TABLE login_tokens (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL,
  expires_at TEXT    NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_login_tokens_user ON login_tokens(user_id);

-- Sesi disimpan di D1, bukan KV: KV tidak menjamin tulisan langsung terbaca, sehingga sesi yang baru
-- dibuat saat login bisa belum terlihat di request berikutnya.
CREATE TABLE sessions (
  token_hash   TEXT    PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TEXT    NOT NULL,
  expires_at   TEXT    NOT NULL,
  last_seen_at TEXT    NOT NULL
) WITHOUT ROWID;
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Pengisi respons berakun (asesmen mandiri, Peer, Manwil). NULL untuk responden publik.
ALTER TABLE responses ADD COLUMN submitted_by INTEGER REFERENCES users(id);
-- Satu orang hanya bisa mengisi satu kali per awardee, per tipe, per periode.
CREATE UNIQUE INDEX idx_responses_one_per_user
  ON responses(period_id, awardee_id, respondent_type_id, submitted_by)
  WHERE submitted_by IS NOT NULL;
