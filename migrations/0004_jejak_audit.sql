-- Jejak perubahan yang dilakukan Admin lewat konsol: siapa mengubah apa, kapan, dan dari apa jadi apa.
--
-- `actor_name` sengaja disalin, bukan hanya `user_id`: nama akun bisa berubah atau akunnya dinonaktifkan,
-- sementara jejak harus tetap terbaca seperti saat kejadian.
CREATE TABLE audit_log (
  id         INTEGER PRIMARY KEY,
  at         TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  user_id    INTEGER REFERENCES users(id),
  actor_name TEXT    NOT NULL,
  action     TEXT    NOT NULL,             -- 'periode.ubah', 'periode.status', 'tipe.jadwal', ...
  entity     TEXT    NOT NULL,             -- 'period' | 'period_respondent_type' | 'user' | ...
  entity_id  INTEGER,
  summary    TEXT    NOT NULL,             -- ringkasan sekali baca, mis. "Status: draft → open"
  detail     TEXT                          -- JSON opsional untuk nilai sebelum/sesudah
);
CREATE INDEX idx_audit_at ON audit_log(at DESC);
CREATE INDEX idx_audit_entity ON audit_log(entity, entity_id);
