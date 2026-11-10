-- Profil awardee: data personal, akademik, dan branding aktivis yang diisi awardee sendiri (Admin bisa
-- mengedit semuanya). Satu baris per awardee; barisnya baru ada setelah awardee menyimpan pertama kali.
--
-- Kolom daftar (minat, keahlian, bahasa) disimpan sebagai JSON teks: hanya dibaca utuh, tidak pernah dicari.
-- Kelengkapan profil sengaja tidak disimpan; dihitung di kode dari kolom wajib, supaya tidak bisa basi.

CREATE TABLE awardee_profiles (
  awardee_id               INTEGER PRIMARY KEY REFERENCES awardees(id) ON DELETE CASCADE,
  -- A. Identitas dan kontak (internal)
  nickname                 TEXT,
  gender                   TEXT CHECK (gender IN ('L', 'P')),
  birth_place              TEXT,
  birth_date               TEXT,                 -- YYYY-MM-DD
  whatsapp                 TEXT,
  personal_email           TEXT,
  city                     TEXT,
  emergency_name           TEXT,
  emergency_phone          TEXT,
  -- B. Akademik
  faculty                  TEXT,
  study_program            TEXT,
  degree_level             TEXT CHECK (degree_level IN ('D3', 'D4', 'S1', 'S2', 'S3')),
  entry_year               INTEGER,
  expected_graduation_year INTEGER,
  student_id               TEXT,                 -- NIM
  -- D. Branding aktivis
  tagline                  TEXT,
  bio                      TEXT,
  interests                TEXT NOT NULL DEFAULT '[]',
  skills                   TEXT NOT NULL DEFAULT '[]',
  main_org                 TEXT,
  main_org_role            TEXT,
  languages                TEXT NOT NULL DEFAULT '[]',
  -- E. Kehadiran daring
  instagram                TEXT,
  linkedin                 TEXT,
  website                  TEXT,
  -- F. Cerita
  motivation               TEXT,
  impact                   TEXT,
  -- Pengelolaan
  consent_at               TEXT,                 -- kapan awardee menyetujui penggunaan datanya
  updated_at               TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_by               INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- IPK kuliah per semester. Namanya "gpa" supaya tidak tertukar dengan IPK hasil pengukuran di halaman Hasil.
CREATE TABLE awardee_semesters (
  id            INTEGER PRIMARY KEY,
  awardee_id    INTEGER NOT NULL REFERENCES awardees(id) ON DELETE CASCADE,
  semester      INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 20),
  academic_year TEXT    NOT NULL,                -- '2025/2026'
  gpa           REAL    NOT NULL CHECK (gpa BETWEEN 0 AND 4),
  updated_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (awardee_id, semester)
);

-- Dikunci: hanya Admin yang mengubahnya.
ALTER TABLE awardees ADD COLUMN status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'graduated', 'revoked'));
ALTER TABLE awardees ADD COLUMN joined_at TEXT;
