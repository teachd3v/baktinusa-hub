-- Penyederhanaan profil awardee setelah ditinjau bersama pengelola program:
--  * IPK kuliah per semester dibuang. Awardee masuk di semester 7 dan pembinaan berakhir di semester 8, jadi
--    riwayat IPK tidak dipakai.
--  * Jenjang dibuang karena program hanya untuk S1.
--  * "Kota domisili" menjadi "Alamat domisili" (alamat tinggal, misalnya kos). Isi lama tetap terbawa.
DROP TABLE awardee_semesters;
ALTER TABLE awardee_profiles DROP COLUMN degree_level;
ALTER TABLE awardee_profiles RENAME COLUMN city TO address;
