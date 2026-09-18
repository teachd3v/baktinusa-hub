-- Form publik: pertanyaan non-skor (identitas, hubungan, lama kenal, saran) disimpan sebagai
-- konfigurasi JSON per periode, supaya dua survey lama cukup menjadi dua baris di periods.
ALTER TABLE periods ADD COLUMN form_config TEXT;

-- Kode kuitansi yang ditunjukkan ke responden, sekaligus kunci untuk menulis skor & saran
-- dalam satu batch tanpa bergantung pada last_insert_rowid().
ALTER TABLE responses ADD COLUMN public_id TEXT;
CREATE UNIQUE INDEX idx_responses_public_id ON responses(public_id);

-- Untuk meninjau kiriman ganda dari perangkat yang sama.
CREATE INDEX idx_responses_fingerprint ON responses(fingerprint);
