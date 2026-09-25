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

Tiga peran — Admin, Manajer Wilayah, Awardee — masuk tanpa kata sandi lewat **tautan sekali pakai**. Responden publik tidak punya akun.

- **Sesi** disimpan di D1 (tabel `sessions`), bukan KV: KV tidak menjamin tulisan langsung terbaca, sehingga sesi yang baru
  dibuat saat login bisa belum terlihat di request berikutnya. Cookie `bh_session` bersifat `HttpOnly; Secure; SameSite=Lax`.
  Database hanya menyimpan hash SHA-256 dari token sesi dan tautan masuk.
- **Gerbang akses** berlapis: `proxy.ts` mengarahkan `/admin`, `/manwil`, `/awardee` sesuai peran; setiap halaman dan server
  action memanggil `requireUser()` lagi; dan setiap query awardee/respons wajib lewat `scopeFor(user)` di `lib/data/`.
- **Tautan masuk** dipakai lewat tombol "Masuk" (POST), bukan saat tautan dibuka — pemindai tautan di layanan email sering
  membuka tautan lebih dulu dan akan menghanguskan token sekali pakai.
- **Pengiriman tautan** (`lib/login-delivery.ts`): lewat Cloudflare Email Service begitu binding `EMAIL` dan variabel
  `EMAIL_FROM` diisi (butuh domain pengirim terverifikasi). Sampai itu, Admin membuat tautan dari halaman **Pengguna** dan
  membagikannya sendiri (berlaku 3 hari). Di lokal, `LOGIN_LINK_TO_LOG=1` mencetak tautan ke log dev server.

**Admin pertama** — atau kalau semua Admin terkunci — dibuat dari terminal. Tautannya hanya tercetak di terminal itu:

```bash
npm run login-link -- nama@email.com --admin "Nama Lengkap"
```

Tambahkan `--local` untuk D1 lokal. Tanpa `--admin`, script hanya membuat tautan untuk akun yang sudah ada.

## Penilaian berakun

Asesmen mandiri (Asesmen Awal/Tengah), penilaian Peer, dan penilaian Manwil diisi dari akun, bukan dari tautan publik —
form publik hanya menawarkan hubungan eksternal. Awardee melihat tugasnya di `/awardee/nilai`, Manwil di `/manwil/nilai`;
keduanya memakai `components/SurveyForm.tsx` yang sama dengan form publik, varian `internal` (tanpa langkah profil dan Turnstile).

- **Siapa menilai siapa** ditentukan server di `lib/data/evaluations.ts`: asesmen mandiri hanya untuk diri sendiri, Peer untuk
  rekan satu wilayah dan angkatan, Manwil untuk awardee di wilayahnya. Sasaran di luar wewenang dijawab 404, sama seperti yang
  tidak ada. Izin diperiksa lagi saat `POST /api/evaluasi`.
- **Asesmen mandiri** memakai teks `text_self` ("Saya …") dan saran dari `form_config.self`.
- **Satu kali per pengisi**: `responses.submitted_by` diisi, dan indeks unik parsial menolak kiriman kedua — termasuk dari dua tab
  yang mengirim bersamaan.
- Tugas muncul hanya selama periodenya `open` dan jendela tipe penilainya (`period_respondent_types.opens_at/closes_at`) berjalan.

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
- **`/admin/jejak`** — setiap perubahan lewat konsol tercatat di `audit_log` beserta nama pelakunya. Jejak ditulis di
  `lib/data/*`, bukan di halaman, supaya tidak ada jalur ubah yang lolos tanpa tercatat. Tidak ada tombol hapus jejak.

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
Jadwal cron belum dipasang — itu Fase 6. Untuk menguji handler secara lokal, jalankan `npm run build && npm run start`
lalu buka `/cdn-cgi/handler/scheduled?cron=0+17+*+*+*`. Rute `/__scheduled` dari `--test-scheduled` **tidak** berfungsi di
project ini karena bundle vinext sudah prebuilt (`no_bundle: true`).

**D1 tidak mengizinkan semua fungsi SQLite** — misalnya `sqlite_version()` ditolak dengan `SQLITE_ERROR [code: 7500]`.

**Migrasi D1** ditaruh di `migrations/` dan diterapkan dengan `npx wrangler d1 migrations apply baktinusa-hub-db --remote`.
