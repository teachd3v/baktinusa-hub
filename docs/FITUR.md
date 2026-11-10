# Catatan fitur BAKTINUSA HUB

Satu tempat untuk tiga hal: apa yang sudah ada, apa yang direncanakan, dan apa yang berubah. Perbarui berkas ini
setiap kali ada fitur yang selesai, berubah, atau baru direncanakan.

## Cara memakai catatan ini

- Fitur baru yang masih ide masuk ke **Rencana pengembangan** dengan status `Ide`.
- Setelah dibahas detailnya jadi `Dirancang`, saat dikerjakan `Dikerjakan`, setelah di-deploy pindah ke **Fitur yang sudah ada**
  dan satu baris masuk ke **Riwayat perubahan**.
- Hal yang disepakati tidak dikerjakan ditulis di **Keputusan** supaya tidak dibahas ulang.

---

## Fitur yang sudah ada

### Awardee
- Beranda: sapaan dengan nama panggilan (dari profil; nama lengkap kalau belum diisi), banner kelengkapan profil, tautan penilaian pribadi (`/s/<kode>`), perkembangan penilaian per siklus.
- Penilaian: mengisi penilaian peer dan evaluasi yang ditugaskan (lihat "Form penilaian" di bawah).
- Hasil: hasil pengukuran diri sendiri per siklus.
- Profil Saya: lihat bagian Profil awardee.

### Manajer Wilayah (Manwil)
- Beranda, Penilaian, Hasil, dan Analitik untuk wilayahnya (satu Manwil memegang satu wilayah).
- Profil Awardee: daftar kelengkapan dan profil baca-saja awardee di wilayahnya.

### Admin
- Pengguna (akun awardee, Manwil, Admin; impor dari Excel; hapus massal), Wilayah dan kampus.
- Pengukuran (jenis), Instrumen (soal; impor), Siklus (jadwal buka dan tutup per jenis).
- Analitik, Hasil, Respons (data mentah dengan penanda kiriman kembar), Pengingat, Jejak perubahan, Panduan gaya.
- Profil Awardee: daftar kelengkapan, edit profil, status program.

### Publik
- Evaluasi publik tanpa login lewat tautan awardee: `/s/<kode>/<jenis pengukuran>`, dilindungi Turnstile dan batas laju. Memakai form penilaian yang sama (lihat di bawah).

### Form penilaian (semua jenis pengukuran)
Satu komponen (`SurveyForm`) dipakai penilaian publik, mandiri, Peer, dan Manwil.
- **Bar kemajuan persen** menempel di atas saat digulir: langkah dan nama bagian di kiri, persen di kanan. Persen dihitung dari jawaban wajib yang terisi (semua soal, kolom saran wajib, dan profil responden di form publik), jadi naik tiap satu soal dijawab. Di ponsel menempel tepat di bawah bilah judul.
- **Emoji skala** abu-abu dan pudar selama belum dipilih; yang dipilih berwarna penuh di atas latar kuning.
- Draf jawaban tersimpan di perangkat dan ikut terhitung di persen saat halaman dibuka lagi.

### Profil awardee
- **Profil Saya** (`/awardee/profil`): identitas, akademik, branding aktivis, sosial media, cerita, dan persetujuan data. Bar kelengkapan menempel di atas dan dihitung langsung saat mengetik; banner kelengkapan di Beranda. Nama panggilan dipakai untuk sapaan di Beranda.
- **Admin** (`/admin/profil`): daftar kelengkapan, edit semua kolom, status program dan tanggal bergabung; suntingan tercatat di Jejak perubahan.
- **Manwil** (`/manwil/profil`): baca saja untuk wilayahnya, tanpa tanggal lahir (kontak darurat terlihat).

### Akun dan platform
- Masuk dengan ID dan kata sandi. Sesi Admin 24 jam (tidak diperpanjang), Awardee dan Manwil 14 hari.
- Halaman **Akun** (`/akun`): ganti kata sandi sendiri, tombol pasang aplikasi.
- **PWA** full online: bisa dipasang di layar utama, tanpa service worker.
- Tampilan ponsel seperti aplikasi: tab bawah, kartu lipat, tabel jadi kartu.
- Foto awardee dari `public/images/<wilayah>/<nama>.webp` (400 px, fokus wajah). Kalau tidak ada, tampil inisial.
- Domain: `baktinusa.hrteach.site`.

---

## Rencana pengembangan

Semuanya masih perlu dibahas lebih rinci. Urutan di bawah mengikuti ketergantungan data, bukan prioritas yang sudah diputuskan.

| # | Fitur | Untuk | Status |
|---|---|---|---|
| 1 | Profile Saya | Awardee, Admin, Manwil | Selesai, sudah di-deploy |
| 2 | Portofolio | Awardee | Ide |
| 3 | Export CV (PDF) | Awardee | Ide |
| 4 | Uji Akhir dan transkrip nilai | Admin, Awardee | Ide |

### 1. Profile Saya (Awardee) — status: selesai, sudah di-deploy
Database personal awardee sekaligus data yang terikat program, dan bahan branding aktivis untuk CV.
Awardee mengisi sendiri, Admin bisa melihat dan mengedit semua kolom.

**Yang sudah ada di sistem:** nama, angkatan, wilayah, kampus, foto (`public/images`), kode referal, LeadPro (nama, bidang, deskripsi), email akun.

**Kolom (awardee yang mengisi)** — W = wajib, O = opsional:

| Kelompok | Kolom |
|---|---|
| A. Identitas dan kontak (internal) | nama panggilan W, jenis kelamin W, tempat dan tanggal lahir W, no. WhatsApp W, email pribadi W, alamat domisili W (alamat tinggal, misalnya kos), kontak darurat (nama, nomor) W |
| B. Akademik | fakultas W, program studi W, tahun masuk W, perkiraan lulus W, NIM O |
| D. Branding aktivis | tagline maks. 100 karakter W, bio maks. 500 karakter W, bidang minat/fokus advokasi (daftar plus bebas) O, keahlian maks. 10 tag O, organisasi utama dan jabatan O, bahasa dan tingkat O |
| E. Sosial Media | Instagram, LinkedIn, satu tautan bebas (semua O) |
| F. Cerita | motivasi bergabung O, dampak yang ingin dicapai O (maks. 500 karakter) |

**Diisi Admin, awardee hanya melihat (dikunci):** status awardee (aktif, lulus, dicabut), tanggal bergabung.

**Sengaja tidak dikumpulkan:** data ekonomi keluarga, KTP/KK, jenjang (program hanya S1), IPK kuliah per semester (awardee masuk di semester 7, pembinaan berakhir di semester 8), riwayat prestasi dan organisasi lengkap (itu Portofolio).

**Tabel (migrasi `0010`, disesuaikan `0011`):**
- `awardee_profiles`: satu baris per awardee (`awardee_id` PRIMARY KEY, FK `awardees`), seluruh kolom A, B, D, E, F (alamat domisili di kolom `address`); kolom daftar (minat, keahlian, bahasa) disimpan sebagai JSON teks; `consent_at`, `updated_at`, `updated_by`.
- `awardees`: tambah `status` (`active`/`graduated`/`revoked`) dan `joined_at`.
- Kelengkapan (persen dan daftar kolom wajib yang kosong) **dihitung di kode**, tidak disimpan, supaya tidak bisa basi.

**Halaman:**
- Awardee: `/awardee/profil`, form per kelompok dengan satu tombol simpan (boleh disimpan belum lengkap). Persetujuan penggunaan data (satu centang, `consent_at` tersimpan) muncul saat pengisian pertama.
- Beranda awardee: banner dan persen kelengkapan sampai kolom wajib terisi. **Tidak** memblokir akses ke penilaian.
- Admin: halaman profil per awardee (edit semua kolom, tiap suntingan masuk Jejak perubahan), plus daftar awardee yang profilnya belum lengkap; pengingat lewat fitur Pengingat yang ada.
- Manwil: lihat saja untuk wilayahnya, **tanpa** tanggal lahir. Kontak darurat terlihat, supaya Manwil bisa menghubungi saat darurat.

**Keputusan sementara (dari pembahasan):** Manwil boleh melihat profil wilayahnya dengan pembatasan di atas; persetujuan data wajib; kontak darurat wajib (terlihat awardee, Admin, dan Manwil wilayahnya); kolom wajib hanya yang bertanda W; foto tetap dikelola Admin dulu (unggah sendiri ditunda).

**Yang dikerjakan:** migrasi `0010_profil_awardee.sql`, lapisan data `lib/data/profiles.ts` (26 tes), halaman `/awardee/profil` dengan banner kelengkapan di Beranda, `/admin/profil` (daftar dan edit, status program, tercatat di Jejak perubahan), `/manwil/profil` (baca saja). Isian form tidak dikosongkan saat validasi gagal. Batas laju 5 per menit per akun.

**Penyesuaian setelah ditinjau pengelola (migrasi `0011`):** IPK per semester dan jenjang dibuang (awardee masuk semester 7, pembinaan sampai semester 8, program hanya S1); kota domisili jadi alamat domisili (kolom `city` diganti nama jadi `address`); kontak darurat wajib; bagian "Kehadiran daring" diganti "Sosial Media"; bar kelengkapan menempel dan dihitung langsung. Kontak darurat dibuka untuk Manwil wilayahnya (tanggal lahir tetap tersembunyi). Nama panggilan dipakai sebagai sapaan di Beranda awardee.

### 2. Portofolio (Awardee)
Jejak dokumentasi karya, prestasi, organisasi, dan lainnya.
- Awardee menambah, mengubah, dan menghapus entri sendiri.
- Kemungkinan butuh unggah berkas atau tautan (R2 sudah ada).

### 3. Export CV (Awardee)
Dokumen PDF CV yang profesional.
- Isi: data profil, portofolio, dan hasil pengukuran **semua siklus dan semua pengukuran**.
- Bergantung pada fitur 1 dan 2. Data pengukuran sudah ada.

### 4. Uji Akhir dan transkrip nilai
Uji akhir diinput Admin. Hasilnya menjadi dokumen transkrip nilai awardee.
- Data **kualitatif dan kuantitatif**: presensi pembinaan, hasil pengukuran, dan data lain.
- Presensi pembinaan belum ada di sistem, jadi perlu dibuat atau diimpor.
- Transkrip kemungkinan ikut masuk ke CV (fitur 3).

### Pertanyaan terbuka (untuk pembahasan berikutnya)
- Retensi data profil: berapa lama disimpan setelah awardee lulus atau dicabut? (Persetujuan penggunaan data sudah ada; aturan retensi belum.)
- Portofolio: jenis entri apa saja, boleh unggah berkas atau hanya tautan, dan perlu verifikasi Admin?
- CV: satu templat atau beberapa, bahasa Indonesia saja atau juga Inggris, dibuat di server atau di browser?
- Uji Akhir: komponen dan bobot nilai, rumus gabungannya, skala nilai, dan siapa yang mengesahkan transkrip?
- Presensi pembinaan: dari mana datanya (input Admin, impor, atau pindai)?

---

## Backlog kecil

- Halaman Akun belum punya foto profil atau ubah email. Foto awardee masih dikelola Admin (unggah sendiri ditunda).
- Nama panggilan baru dipakai di sapaan Beranda awardee; "Masuk sebagai ..." dan halaman Akun masih nama lengkap.
- Daftar Profil Awardee (Admin dan Manwil) belum bisa difilter atau diurutkan menurut kelengkapan.
- Domain `m.baktinusa.id` ditunda: DNS `baktinusa.id` ada di Hostinger dan dipakai situs WordPress. Memasangnya di Workers
  mengharuskan zone-nya ada di Cloudflare. Detail ada di Keputusan.
- Binding `FILES` (R2) dan `IMAGES` masih terpasang walau rute `/foto` sudah dihapus. Lepas kalau sudah dipastikan tak dipakai.
- Kata sandi awal awardee dan Manwil di production adalah `BA@2026!`. Awardee diharapkan menggantinya sendiri.

## Keputusan

- **PWA full online, tanpa service worker.** Data akun tidak boleh tersimpan di cache perangkat. Fase offline dan notifikasi push
  tidak dikerjakan.
- **Sesi Admin 24 jam** sejak masuk dan tidak diperpanjang saat dipakai.
- **Hash kata sandi PBKDF2 maksimal 100.000 putaran.** Workers menolak lebih dari itu.
- **Foto awardee disajikan dari `public/images`** (400 px), bukan dari R2.
- **Profil awardee dibuat ringkas:** tanpa jenjang (program hanya S1) dan tanpa IPK per semester (awardee masuk semester 7, pembinaan sampai semester 8). Data ekonomi keluarga dan KTP/KK tidak dikumpulkan.
- **Kontak darurat wajib dan terlihat Manwil wilayahnya**; tanggal lahir hanya terlihat awardee dan Admin.
- **Profil tidak memblokir penilaian.** Kelengkapan hanya penanda (bar dan banner).
- **Persen di form penilaian dihitung dari jawaban wajib yang terisi**, bukan dari langkah yang dilewati.
- **Domain tetap `baktinusa.hrteach.site`** untuk sekarang. Pindah ke `m.baktinusa.id` menunggu keputusan soal DNS Hostinger.

---

## Riwayat perubahan

Terbaru di atas. Satu baris per perubahan yang terlihat pengguna.

| Tanggal | Perubahan |
|---|---|
| 2026-11-10 | Form penilaian: emoji skala abu-abu selama belum dipilih, yang dipilih berwarna dengan latar kuning |
| 2026-11-10 | Form penilaian (semua jenis pengukuran): bar kemajuan persen yang menempel di atas, dihitung dari jawaban wajib yang terisi |
| 2026-11-10 | Perbaikan: Beranda awardee menyapa dengan nama panggilan dari profil (sebelumnya masih nama lengkap) |
| 2026-11-10 | Kontak darurat awardee kini terlihat oleh Manwil wilayahnya |
| 2026-11-10 | Profil: IPK per semester dan jenjang dibuang, alamat domisili, kontak darurat wajib, Sosial Media, bar kelengkapan menempel (migrasi 0011) |
| 2026-11-10 | Profile Saya: profil awardee, tampilan Admin dan Manwil (migrasi 0010) |
| 2026-11-09 | Foto awardee di-crop fokus wajah dan setengah badan, 400 px |
| 2026-11-09 | Tombol Pasang aplikasi di lembar akun ponsel; berubah jadi centang hijau "Aplikasi terinstal" saat terpasang |
| 2026-11-09 | Perbaikan: kiriman evaluasi publik gagal "Survei atau awardee tidak ditemukan" (slug yang dikirim form salah) |
| 2026-11-09 | Halaman Akun dengan ganti kata sandi sendiri; sesi lain keluar otomatis setelah kata sandi diganti |
| 2026-11-09 | Sesi Admin dibatasi 24 jam |
| 2026-11-09 | PWA: bisa dipasang di layar utama |
| 2026-11-09 | Kata sandi default awardee dan Manwil menjadi `BA@2026!`; akun Manwil untuk 13 wilayah |
| 2026-10-28 | Tampilan ponsel seperti aplikasi untuk Admin, Awardee, dan Manwil |
| 2026-10-27 | Restyle UI dengan sistem desain Hallmark; analitik dan impor instrumen |
| 2026-09-28 | Model jenis pengukuran dan siklus; kampus jadi daftar milik wilayah |
