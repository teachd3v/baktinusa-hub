-- Masuk dengan ID + kata sandi, menggantikan tautan sekali pakai lewat email sebagai jalur utama.
--
-- Kolom lama `email` dibiarkan: masih dipakai sebagai kontak akun dan oleh tautan masuk darurat yang
-- dibuat Admin. Yang berubah hanya cara sehari-hari orang masuk.
ALTER TABLE users ADD COLUMN login_id TEXT;
ALTER TABLE users ADD COLUMN password_hash TEXT;          -- pbkdf2$<iterasi>$<garam>$<turunan>
ALTER TABLE users ADD COLUMN password_updated_at TEXT;

-- Indeks parsial: akun lama yang belum punya ID masuk tidak saling bentrok di NULL.
CREATE UNIQUE INDEX idx_users_login_id ON users(login_id) WHERE login_id IS NOT NULL;
