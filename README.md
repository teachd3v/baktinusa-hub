# BAKTINUSA HUB

Portal pengukuran awardee BAKTI NUSA dengan tiga peran — Admin, Awardee, dan Manajer Wilayah.
Menggantikan tiga aplikasi terpisah di folder induk: `eval-public`, `leadpro-survey`, dan `visualisasi-data`.

Dibangun dengan [vinext](https://github.com/cloudflare/vinext) (Next.js App Router di atas Vite) dan dijalankan di Cloudflare Workers.

## Perintah

| Perintah | Fungsi |
|---|---|
| `npm run dev` | Server dev lokal dengan HMR. Binding D1/KV/R2 disimulasikan lokal |
| `npm run build` | Build produksi ke `dist/` |
| `npm run start` | Jalankan Worker hasil build secara lokal lewat Wrangler |
| `npm run deploy` | Build dan deploy ke Cloudflare |
| `npx wrangler types` | Perbarui `worker-configuration.d.ts` setiap kali `wrangler.jsonc` berubah |

## Deploy

Setiap push ke `main` di-build dan di-deploy otomatis oleh **Workers Builds**:

| Setting | Nilai |
|---|---|
| Build command | `npm run build` |
| Deploy command (`main`) | `npx wrangler deploy` |
| Version command (branch lain) | `npx wrangler versions upload` — hanya mengunggah versi preview, production tidak berubah |
| Node | 24 (default build image) |

`npx wrangler deploy` tidak perlu `--config`: plugin Vite menulis `.wrangler/deploy/config.json` saat build,
yang mengarahkan Wrangler ke `dist/server/wrangler.json`. `npm run deploy` dari laptop tetap bisa dipakai untuk deploy darurat.

## Binding

| Binding | Resource | Isi |
|---|---|---|
| `DB` | D1 `baktinusa-hub-db` (APAC) | Data relasional: awardee, periode, instrumen, respons |
| `SESSIONS` | KV `baktinusa-hub-sessions` | Token sesi login |
| `FILES` | R2 `baktinusa-hub-files` | Foto awardee dan berkas export |

Akses dari server component, route handler, atau server action:

```ts
import { env } from "cloudflare:workers";

const row = await env.DB.prepare("SELECT 1").first();
```

`GET /api/health` memeriksa ketiga binding dan membalas `503` kalau salah satunya gagal.

## Skema & data master

Skema ada di `migrations/`. Terapkan dengan `npm run db:migrate:local` atau `npm run db:migrate:remote`.

Hub dimulai **tanpa data transaksi**: tidak ada respons, skor, atau saran dari sistem lama. Yang di-seed hanya data master BA15 —
wilayah, awardee, tipe responden beserta target minimalnya, dan kuesioner. Kedua periode BA15 dibuat sebagai draft tanpa tanggal.

```bash
npm run seed:ba15
npx wrangler d1 execute baktinusa-hub-db --remote --file .seed/ba15.sql
```

Seed bersifat **upsert**: baris master diperbarui berdasarkan kuncinya, tidak ada yang dihapus, dan respons tidak disentuh.
Status serta tanggal periode yang sudah ada juga tidak ditimpa — aman dijalankan ulang ke production untuk memperbarui
kuesioner atau `form_config`. Yang *tidak* bisa dilakukan seed: menghapus pertanyaan atau awardee yang sudah dibuang dari CSV.

- **Kuesioner** ada di `seed/kuesioner-ba15.csv`: 50 indikator asesmen dan 22 indikator Leadership Project, masing-masing dengan
  kategorinya. Batas asesmen mengikuti rubrik — Self-Maturity Q1–Q18, Competency Enrichment Q19–Q39, Bringing Inspiration Q40–Q50.
  Dashboard lama menghitung Q1–Q19 dan Q20–Q39, salah satu nomor; di D1 setiap pertanyaan memegang `category_id`-nya sendiri.
- **Daftar awardee** berisi data pribadi, jadi tidak ada di repo. Script membacanya dari CSV app `leadpro-survey` lama di folder
  induk; arahkan ke file lain lewat `BA15_AWARDEE_CSV`. Keluarannya, `.seed/`, di-gitignore — **jangan di-commit**, repo ini publik.
- **Foto awardee** ada di R2 dengan kunci `awardees/ba15/<kode-referal>.webp`.

## Masuk & peran

Tiga peran — Admin, Manajer Wilayah, Awardee — masuk dengan **ID akun dan kata sandi** di `/masuk`. Halaman depan `/`
tidak punya isi sendiri: yang sudah masuk dilempar ke berandanya, sisanya ke halaman masuk. Responden publik tidak punya
akun dan tidak pernah lewat sini — mereka membuka `/s/<kode>` dari tautan yang dibagikan awardee.

- **Kata sandi tidak pernah disimpan apa adanya.** Yang tersimpan turunan PBKDF2-HMAC-SHA256 210.000 iterasi dengan garam
  acak per akun (`lib/data/password.ts`). Jumlah iterasi ikut ditulis di dalam string simpanannya, jadi kelak bisa
  dinaikkan tanpa membuat kata sandi lama tidak bisa dipakai. bcrypt/argon2 tidak dipakai karena butuh modul native yang
  tidak ada di runtime Workers.
- **ID tidak dipakai untuk menebak daftar akun**: ID salah, kata sandi salah, dan akun nonaktif dijawab dengan pesan yang
  sama persis. Tiap percobaan lewat Turnstile, lalu dibatasi laju **per perangkat dan per ID** — menebak satu akun dari
  banyak perangkat pun tetap tertahan.
- **Ganti kata sandi memutus sesi lama** akun itu, jadi kalau akunnya terlanjur dibajak, mengganti sandi benar-benar mengusir.
- **Sesi** disimpan di D1 (tabel `sessions`), bukan KV: KV tidak menjamin tulisan langsung terbaca, sehingga sesi yang baru
  dibuat saat login bisa belum terlihat di request berikutnya. Cookie `bh_session` bersifat `HttpOnly; Secure; SameSite=Lax`.
  Database hanya menyimpan hash SHA-256 dari token sesi.
- **Gerbang akses** berlapis: `proxy.ts` mengarahkan `/admin`, `/manwil`, `/awardee` sesuai peran; setiap halaman dan server
  action memanggil `requireUser()` lagi; dan setiap query awardee/respons wajib lewat `scopeFor(user)` di `lib/data/`.
- **Lupa kata sandi** ditangani Admin dari halaman **Pengguna**: tetapkan ID masuk dan kata sandi baru, lalu sampaikan lewat
  jalur pribadi. Tidak ada pengaturan ulang lewat email — hub tidak menyimpan cara memverifikasi pemilik email.

**Admin pertama** — atau kalau semua Admin terkunci — dibuat dari terminal lewat tautan sekali pakai. Ini jalur darurat yang
sengaja dipertahankan; tautannya hanya tercetak di terminal itu:

```bash
npm run login-link -- nama@email.com --admin "Nama Lengkap"
```

Tambahkan `--local` untuk D1 lokal. Setelah masuk, tetapkan ID dan kata sandinya dari halaman Pengguna.

### Akun uji coba (lokal saja)

```bash
npm run akun-dummy
```

Membuat `ADM001` (Admin), `BA00126` (Awardee Bogor), dan `MW00126` (Manwil Bogor) — semuanya berkata sandi `BA2026`.
Script-nya tidak punya mode `--remote`. **Kata sandi ini pendek dan dipakai bertiga; jangan pernah dibawa ke production.**

## Hasil & dashboard

Tiga peran melihat angka yang sama lewat lingkup yang berbeda: `/awardee/hasil` (dirinya), `/manwil/hasil` (wilayahnya,
plus rincian per awardee di `/manwil/hasil/<kode>`), dan `/admin/hasil` (nasional, dengan matriks seluruh awardee).

- **IPK = rata-rata berbobot dari rata-rata tiap kategori**, skala 0–4. Predikatnya memakai ambang program BA15:
  Cumlaude ≥ 3.51, Sangat Memuaskan ≥ 2.76, Memuaskan ≥ 2.00, sisanya Perlu Peningkatan.
- **Kategori dibaca dari `instruments.category_id`**, tidak pernah dari rentang nomor soal — ini yang membuat bug Q19
  di dashboard lama tidak bisa terulang. Kategori tanpa jawaban bernilai kosong, bukan nol, supaya IPK tidak jatuh
  hanya karena satu tipe penilai belum mengisi.
- **Dihitung langsung dari `response_scores` saat halaman dibuka**, bukan dari tabel agregat. Cetak biru merencanakan
  `score_snapshots` + cron; dengan ±54.000 baris skor (55 awardee × 50 soal × ±20 responden) satu `GROUP BY` masih di
  bawah setengah detik, jadi tabel agregat ditunda sampai ada bukti ia dibutuhkan — angka yang selalu segar lebih murah
  daripada cache yang bisa basi.
- **Saran kualitatif tampil tanpa nama pengisi**, hanya tipe penilai dan hubungannya. Refleksi dari asesmen mandiri
  dipisahkan dari masukan orang lain; saran untuk program hanya terlihat oleh pengelola.
- Grafiknya dirender di server sebagai elemen biasa — tidak ada library chart dan tidak ada JavaScript di sisi klien.

### Data contoh untuk mencoba dashboard

```bash
npm run demo-data            # isi D1 lokal dengan respons palsu
npm run demo-data -- --reset # hapus lagi
```

`scripts/demo-data.mjs` sengaja tidak punya mode `--remote`, dan semua barisnya ditandai `source = 'demo'`.

## Konsol Admin

- **`/admin/periode`** — daftar periode; **`/admin/periode/<slug>`** mengatur satu periode: nama, jadwal, status, serta
  jadwal dan target tiap tipe penilai. Deadline yang dulu ditulis tangan di enam berkas kini hanya ada di sini.
- **Jadwal per tipe** menentukan kapan masing-masing penilai bisa mengisi. Yang paling cepat menutup yang berlaku —
  jadwal periode tetap batas luarnya. Inilah cara memisahkan Asesmen Awal dan Asesmen Tengah agar tidak muncul bersamaan.
- **Waktu diketik dalam WIB, disimpan sebagai UTC** (`lib/waktu.ts`), jadi zona waktu laptop pengelola tidak ikut menentukan.
- **Pagar yang ditegakkan di lapisan data**, bukan hanya di tampilan: periode tanpa pertanyaan tidak bisa dibuka; periode
  yang sudah menerima jawaban tidak bisa dikembalikan ke draft (tutup saja — hasilnya tetap terbaca); tipe penilai yang
  sudah punya jawaban tidak bisa dilepas; target "jumlah tetap" wajib punya angka.
- **`/admin/periode/<slug>/instrumen`** — kategori dan pertanyaan periode itu. Setelah jawaban masuk susunannya dikunci
  (menambah/menghapus soal mengubah arti data yang sudah terkumpul); perbaikan salah ketik tetap boleh, kode dan skala tidak.
- **`/admin/awardee`** — tambah dan perbaiki data awardee, termasuk kode referal (dengan saran kode acak yang dipastikan
  belum terpakai). Awardee yang sudah punya jawaban tidak bisa dipindah angkatannya atau dihapus.
- **Membuka angkatan baru tanpa menyentuh kode**: buat periode (boleh menyalin kategori, pertanyaan, dan tipe penilai dari
  periode lama), rapikan teks form publik, atur jadwal dan target, tambahkan awardee-nya, lalu buka periodenya.
- **`/admin/respons`** — data mentah yang masuk dengan penanda kiriman kembar (sidik jari perangkat yang sama untuk
  awardee & tipe yang sama). Ditandai, bukan dihapus otomatis — satu keluarga bisa mengisi dari satu ponsel. Menghapus
  respons butuh konfirmasi dua langkah dan mencatat isinya ke jejak audit.
- **Ekspor CSV** lewat `/api/ekspor/matriks?periode=<slug>` (agregat, boleh diunduh Manwil untuk wilayahnya) dan
  `/api/ekspor/mentah?periode=<slug>` (satu baris per pengisi, memuat identitas responden — **hanya Admin**). Pemisahnya
  titik koma dan berkasnya ber-BOM supaya Excel berbahasa Indonesia membacanya langsung benar.
- **PDF belum ada sebagai berkas**; halaman hasil punya gaya cetak, jadi "Cetak → Simpan sebagai PDF" di browser
  menghasilkan rapor yang rapi tanpa kerangka aplikasi.
- **`/admin/jejak`** — setiap perubahan lewat konsol tercatat di `audit_log` beserta nama pelakunya. Jejak ditulis di
  `lib/data/*`, bukan di halaman, supaya tidak ada jalur ubah yang lolos tanpa tercatat. Tidak ada tombol hapus jejak.

## Otomasi (Cron Triggers)

Dua jadwal di `wrangler.jsonc`, satu handler di `worker/index.ts`, logikanya di `lib/data/cron.ts`:

- **`*/15 * * * *`** — periode draft yang jadwal bukanya sudah lewat **dibuka sendiri** (dengan pagar yang sama seperti
  tombol di konsol: tanpa pertanyaan atau tipe penilai, ia dibiarkan draft), dan periode yang deadline-nya lewat **ditutup**.
  Deadline yang dulu ditulis tangan di enam berkas sekarang dijalankan platform.
- **`10 17 * * *`** (00.10 WIB) — **cadangan D1 ke R2** sebagai NDJSON di `backup/<tanggal>.ndjson`, lalu cadangan
  lebih tua dari 30 hari dibuang. `sessions` dan `login_tokens` sengaja tidak ikut: isinya kredensial berumur pendek.
  Tabel besar dibaca bertahap 5.000 baris supaya tidak melewati batas ukuran balasan D1.

Setiap tindakan otomatis tercatat di jejak audit atas nama **Sistem (terjadwal)**, jadi status periode yang berubah
sendiri tetap bisa ditelusuri. Kegagalan satu jalan ditangkap dan dicatat, tidak menghentikan jadwal berikutnya.

**Pengingat** ada di `/admin/pengingat`: siapa yang respondennya belum penuh, dikelompokkan per wilayah, lengkap dengan
pesan siap salin untuk Manwil. Pengiriman otomatis lewat email menunggu domain pengirim BAKTI NUSA — sampai itu,
halaman ini yang dipakai dan pengirimannya manual lewat WhatsApp.

Menguji lokal: `npm run build`, lalu `npx wrangler dev --config dist/server/wrangler.json` dan buka
`/cdn-cgi/handler/scheduled?cron=*/15+*+*+*+*`. Catatan: worker hasil build memakai state D1 lokalnya sendiri di
`dist/server/.wrangler/` — `--persist-to` diabaikan karena config-nya ada di folder itu.

## Design system

Satu berkas token, `app/globals.css`, jadi sumber tunggal warna, tipografi, sudut, dan bayangan. Aturan mainnya:
**halaman dan komponen tidak menulis warna sendiri** — semuanya memanggil token. Contoh hidupnya ada di `/admin/gaya`,
dirender memakai kelas yang sama persis seperti halaman sungguhan, jadi panduan itu tidak bisa basi diam-diam.

- **Bahasa rupa**: latar terang lapang, kartu putih bersudut besar, rail navigasi navy, dan kartu pastel sebagai penanda
  kategori. Merah BAKTI NUSA dipertahankan untuk aksi dan penanda aktif — bukan lagi sebagai latar halaman.
- **Rail navigasi** (`.shell-bar`) berisi ikon SVG inline dari `components/NavIcon.tsx`; ikonnya dipilih dari label menu,
  jadi menambah menu tidak perlu menyentuh dua berkas. Di layar ≤900px rail berubah jadi dua baris: merek & akun di atas,
  menu yang bisa digeser mendatar di bawahnya.
- **Pastel berputar otomatis**: `.score-grid > .score-card:nth-child(5n + …)` memberi warna bergantian, jadi halaman tidak
  perlu menentukan warna per kartu.
- **Warna grafik** punya tokennya sendiri (`--chart-*`), lebih pekat dari token status karena dipakai dalam potongan kecil.
- Status tidak pernah disampaikan lewat warna saja — selalu ada kata di sebelahnya.

## Impor massal pengguna

Di menu **Pengguna** ada panel impor: unduh template (CSV atau .xlsx), isi di Excel, lalu unggah kembali.

- **Dua langkah, selalu.** Berkas diperiksa dulu dan hasilnya ditampilkan per baris — akan dibuat, akan diperbarui,
  atau ditolak beserta alasannya. Tidak ada yang tersimpan sampai tombol terapkan ditekan.
- **Kolom:** ID · Nama · Email · Peran · Wilayah · Angkatan · Kode Referal · Kampus · Kata Sandi · Status. Judul kolom
  tidak peka huruf besar-kecil, dan peran boleh ditulis "Manwil" maupun "Manajer Wilayah".
- **Kode referal yang sudah ada berarti "buatkan akunnya"** — barisnya menempel ke data awardee itu, bukan membuat data
  kedua. Inilah cara membuatkan akun untuk 55 awardee yang sudah ada sekaligus.
- **ID yang sudah ada berarti perbarui.** Kata sandi kosong pada baris itu berarti kata sandinya tidak diganti.
- Bentrok antarbaris di dalam berkas (ID, email, atau kode referal kembar) ikut ketahuan di tahap pemeriksaan.
- **Berkas dibaca di browser**, jadi pustaka Excel (SheetJS) tidak ikut terbawa ke Worker — ia hanya jadi potongan klien
  yang dimuat saat dipakai. Worker tetap 0,19 MB. Barisnya dikirim sebagai JSON dan **divalidasi ulang di server**
  lewat fungsi yang sama dengan form satuan; rencana dari browser tidak pernah dipercaya begitu saja.
- Penulisannya dipecah per 20 baris dengan indikator kemajuan, karena mengacak kata sandi butuh ±100 ms per baris.

## Pengukuran, sub pengukuran, dan periode

Sejak migrasi 0006, kuesioner tidak lagi menempel ke periode:

```
Pengukuran (mis. "BA15 · Pengukuran Awardee")
└── Sub pengukuran = kategori soal, dasar hitungan IPK
    └── Soal (teks "Saya …" & "Yang bersangkutan …", skala)

Periode = jadwal: pilih pengukuran + angkatan + tanggal + target tiap tipe penilai
```

- **Satu set soal dipakai ulang** lintas angkatan. Menjadwalkan BA17 tinggal membuat periode yang menunjuk
  pengukuran yang sama — tidak ada penyalinan soal, jadi tidak ada salinan yang perlahan berbeda isi.
- **Susunan soal terkunci begitu pengukuran itu menghasilkan jawaban** lewat periode mana pun. Teks soal dan nama
  sub pengukuran tetap bisa dirapikan (nilai menempel ke id, bukan ke teksnya); kode dan skala tidak.
- **Pengukuran yang masih dijadwalkan periode tidak bisa dihapus.**
- **Menu Instrumen** (`/admin/instrumen`) mengelola soal dari semua pengukuran dalam satu daftar, dengan saringan per
  pengukuran dan per sub pengukuran serta pencarian ke kode maupun isi soal. Halaman Pengukuran mengurus sub
  pengukurannya saja lalu menautkan ke sini — supaya soal tidak punya dua tempat sunting yang bisa berbeda isi.

### Catatan migrasi 0006

`instruments` dirujuk `response_scores`, jadi tabelnya tidak bisa langsung dibongkar. `PRAGMA foreign_keys = OFF`
**tidak menolong** — SQLite mengabaikannya di dalam transaksi, dan migrasi D1 selalu berjalan dalam transaksi;
`PRAGMA defer_foreign_keys` juga tidak cukup, karena pelanggaran yang tercatat saat DROP tidak dihapus oleh RENAME.
Yang dipakai: **bongkar dari anak ke induk, pasang kembali dari induk ke anak** — saat sebuah tabel dibuang, tidak ada
lagi baris yang merujuknya. Id soal dipertahankan supaya `response_scores` lama tetap menunjuk soal yang sama.

## Uji

```bash
npm test
```

Menjalankan `lib/data/*` di atas `node:sqlite` dengan migrasi yang sama persis seperti production. Uji membuktikan di lapisan
query bahwa awardee hanya bisa menarik datanya sendiri, Manwil hanya wilayahnya, tautan masuk hanya berlaku sekali, dan
penilaian berakun hanya bisa diisi oleh yang berhak sekali saja, dan hitungan IPK per kategori sesuai rubrik.

## Hal yang perlu diketahui

**Akun Cloudflare dikunci di `wrangler.jsonc`.** Environment user di laptop pengembang punya
`CLOUDFLARE_ACCOUNT_ID` yang menunjuk ke akun lain. `account_id` di config menang atas env var itu
untuk `deploy`, `d1`, dan `kv` — tapi **tidak** untuk `wrangler r2 ...`. Untuk perintah R2, set akunnya per perintah:

```bash
CLOUDFLARE_ACCOUNT_ID=6dea7431212db790894cca82864822c0 npx wrangler r2 bucket list
```

**Handler `scheduled()` ada di `worker/index.ts`**, membungkus entry vinext supaya Cron Triggers hidup di Worker yang sama.
Jadwalnya ada di bagian **Otomasi** di atas. Rute `/__scheduled` dari `--test-scheduled` **tidak** berfungsi di project
ini karena bundle vinext sudah prebuilt (`no_bundle: true`); pakai `/cdn-cgi/handler/scheduled?cron=...`.

**D1 tidak mengizinkan semua fungsi SQLite** — misalnya `sqlite_version()` ditolak dengan `SQLITE_ERROR [code: 7500]`.

**Migrasi D1** ditaruh di `migrations/` dan diterapkan dengan `npx wrangler d1 migrations apply baktinusa-hub-db --remote`.
