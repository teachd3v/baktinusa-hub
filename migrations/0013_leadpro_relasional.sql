-- LeadPro jadi data relasional: bidang punya tabel acuan, proyek punya tabelnya sendiri (satu per awardee).
-- Kolom lama di awardees SENGAJA belum dihapus di sini: kode lama masih membacanya selama deploy berjalan.
-- Penghapusannya ada di migrasi 0014, diterapkan setelah kode baru aktif.

CREATE TABLE leadpro_fields (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);

CREATE TABLE leadpros (
  awardee_id  INTEGER PRIMARY KEY REFERENCES awardees(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  field_id    INTEGER REFERENCES leadpro_fields(id),
  description TEXT,
  updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_leadpros_field ON leadpros(field_id);

INSERT OR IGNORE INTO leadpro_fields (name)
SELECT DISTINCT trim(leadpro_field) FROM awardees WHERE trim(COALESCE(leadpro_field, '')) <> '';

INSERT INTO leadpros (awardee_id, name, field_id, description)
SELECT a.id,
       trim(a.leadpro_name),
       (SELECT f.id FROM leadpro_fields f WHERE f.name = trim(a.leadpro_field)),
       NULLIF(trim(COALESCE(a.leadpro_description, '')), '')
FROM awardees a
WHERE trim(COALESCE(a.leadpro_name, '')) <> '';
