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
| `SESSIONS` | KV `baktinusa-hub-sessions` | Belum dipakai — sesi pindah ke D1 sejak migrasi 0003 (lihat **Masuk & peran**). Yang tersisa hanya pemeriksaan `/api/health` |
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
wilayah, kampus, awardee, lima jenis pengukuran beserta kuesioner dan target minimalnya, dan dua siklus.

```bash
npm run seed:ba15
npx wrangler d1 execute baktinusa-hub-db --remote --file .seed/ba15.sql
```

Seed bersifat **upsert**: baris master diperbarui berdasarkan kuncinya, tidak ada yang dihapus, dan respons tidak disentuh.
Status serta tanggal siklus yang sudah ada juga tidak ditimpa. Yang *tidak* bisa dilakukan seed: menghapus pertanyaan atau
awardee yang sudah dibuang dari CSV.

- **Kuesioner** ada di `seed/kuesioner-ba15.csv`: 50 indikator asesmen dan 22 indikator Leadership Project. Kolom
  `kategori`-nya kini hanya catatan untuk pembaca manusia — sejak migrasi 0009 kategori tidak disimpan, dan soal menempel
  langsung ke jenis pengukurannya. Bug Q19 di dashboard lama (yang menghitung Q1–Q19 dan Q20–Q39) jadi tidak relevan:
  tidak ada lagi rentang nomor soal di mana pun, IPK adalah rata-rata seluruh soal dalam satu jenis.
- **Satu kuesioner jadi empat set soal.** Dulu satu baris soal membawa dua versi teks sekaligus, "Saya …" dan "Yang
  bersangkutan …", karena satu kuesioner dipakai bersama. Sekarang tiap jenis memegang soalnya sendiri, jadi seed menyalin
  50 soal asesmen ke SA, PA, MA, dan PU — SA mengambil versi "Saya …", sisanya versi "Yang bersangkutan …". Id soal
  dialokasikan per blok (`id jenis × 1000 + nomor soal`) supaya tidak bertabrakan walau kodenya sama-sama Q1.
- **Pemetaan tipe responden lama → jenis baru** ada di kepala `scripts/seed-ba15.mjs`: Asesmen Awal & Tengah lebur jadi
  satu **SA** yang dijalankan di dua siklus, lima tipe Leadership Project jadi satu **LA**. Jadwal siklusnya ada di satu
  tabel `SCHEDULE` di berkas yang sama — model lama tidak menyimpan siklus, jadi pembagian Awal/Tengah di sana adalah
  tafsir terdekat dan sengaja dibuat mudah diubah.
- **UA (Uji Akhir) tidak ikut di-seed**: BA15 tidak punya kuesionernya. Buat dari menu Pengukuran kalau memang dipakai.
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

- **IPK = rata-rata polos seluruh soal dalam satu jenis pengukuran**, skala 0–4. Predikatnya memakai ambang program BA15:
  Cumlaude ≥ 3.51, Sangat Memuaskan ≥ 2.76, Memuaskan ≥ 2.00, sisanya Perlu Peningkatan. Sampai migrasi 0009 rumusnya
  rata-rata berbobot antar sub pengukuran; angkanya bergeser kalau jumlah soal tiap sub tidak sama — catatan lengkapnya
  ada di berkas migrasi itu.
- **Skornya dinormalkan ke skala 0–4** sebelum dirata-ratakan (`score × 4 / scale_max`), karena ambang predikat di atas
  berasal dari rubrik berskala 4 sementara tiap soal boleh berskala 1–10. Untuk soal berskala 4 — bawaan dan yang dipakai
  BA15 — normalisasi ini tidak mengubah angka apa pun.
- **Jenis tanpa jawaban bernilai kosong, bukan nol**, supaya IPK tidak jatuh hanya karena satu sudut pandang belum mengisi.
- **Sudut pandang penilai dikenali dari `measurements.filled_by`**, tidak pernah dari kode jenisnya. Kode dikarang Admin dan
  sudah pernah berubah seluruhnya di migrasi 0008; `filled_by` adalah rute yang menentukan siapa boleh mengisi. Predikat 360°
  menggabungkan semua jenis ber-`filled_by` `public` — satu siklus boleh membuka lebih dari satu (mis. PU dan LA di Siklus Tengah).
- **Dihitung langsung dari `response_scores` saat halaman dibuka**, bukan dari tabel agregat. Cetak biru merencanakan
  `score_snapshots` + cron; dengan ±54.000 baris skor (55 awardee × 50 soal × ±20 responden) satu `GROUP BY` masih di
  bawah setengah detik, jadi tabel agregat ditunda sampai ada bukti ia dibutuhkan — angka yang selalu segar lebih murah
  daripada cache yang bisa basi.
- **Saran kualitatif tampil tanpa nama pengisi**, hanya tipe penilai dan hubungannya. Refleksi dari asesmen mandiri
  dipisahkan dari masukan orang lain; saran untuk program hanya terlihat oleh pengelola.
- Grafiknya dirender di server sebagai elemen biasa atau SVG — tidak ada library chart. Satu-satunya JavaScript klien di
  area ini adalah `CascadingFilters` di Analitik (mengirim form otomatis saat dropdown berubah); tanpa JS, tombol Terapkan
  mengerjakan hal yang sama.

### Analitik

`/admin/analitik` dan `/manwil/analitik` — dashboard yang membaca satu siklus dari sisi **jenis pengukuran**. Hasil
menjawab "bagaimana awardee ini?"; Analitik menjawab "bagaimana pengukuran ini berjalan?", mis. soal mana yang paling lemah
se-wilayah (rata-rata per soal lintas awardee, yang tidak bisa dibaca dari halaman Hasil).

- **Susunan**: keterangan siklus (angkatan, status, jadwal WIB, jumlah respons, kiriman terakhir, jenis yang dijalankan),
  empat kartu angka (Total Awardee · Wilayah · Responden · Rata-rata IPK), saringan, lalu grafik.
- **Saringan bertingkat**: Siklus → Pengukuran → Wilayah → Awardee. Form GET biasa, jadi hasilnya alamat yang bisa
  dibagikan. JavaScript hanya mengirim formnya otomatis saat dropdown berubah; tombol Terapkan tetap ada untuk jalur tanpa JS.
- **Angka dihitung ulang**, bukan baris disembunyikan: kartu angka, sebaran predikat, dan rata-rata per soal semuanya
  mengikuti saringan. Keterangan siklus sengaja **tidak** — ia selalu menggambarkan siklus utuh dalam lingkup pembacanya.
- **Saringan dicocokkan dengan pilihan dropdown** (`resolveFilter`): jenis yang tidak dijalankan siklus itu, wilayah di luar
  lingkup, atau awardee yang bukan penghuni wilayah terpilih dibuang, supaya angka tidak pernah bicara tentang nilai yang
  tidak bisa ditampilkan dropdown. Mengganti siklus mengosongkan pilihan awardee; jenis dan wilayah dibawa serta.
- **Lingkup tetap berlaku**: saringan dipadukan dengan `scopeFor()`, tidak pernah menggantikannya. Hanya awardee seangkatan
  dengan siklusnya yang dihitung.
- Halaman `/analitik/<kode>` membedah satu jenis (semua soal berurutan, tabel awardee). Kalau jenisnya tidak dijalankan di
  siklus yang dipilih, ia menampilkan penjelasan dengan jalan keluar, bukan 404.

### Data contoh untuk mencoba dashboard

```bash
npm run demo-data                       # isi SEMUA siklus dengan respons palsu
npm run demo-data -- --siklus=ba15-awal # hanya satu siklus
npm run demo-data -- --buka-siklus      # siklus yang diisi dan masih draft ikut dibuka
npm run demo-data -- --sql              # hanya tulis .seed/demo.sql
npm run demo-data -- --reset            # hapus respons demo saja
```

`scripts/demo-data.mjs` sengaja tidak punya mode `--remote`, dan semua barisnya ditandai `source = 'demo'` — itu juga
penanda yang dipakai `--reset`, jadi respons sungguhan tidak pernah ikut terhapus.

Ia membaca **peta siklus × jenis apa adanya dari database** (yang diatur Admin di konsol), lalu mengarang respons sesuai `filled_by` masing-masing: jenis
`public` dapat banyak responden anonim, `self`/`peer`/`manwil`/`admin` dapat respons berakun dengan `submitted_by` sungguhan
kalau akunnya sudah ada. Isian sarannya mengikuti `form_config` tiap jenis, jadi LA mengisi pesan/kritik/saran keberlanjutan
dan bukan saran pengembangan diri. Tiap awardee diberi tingkat dasar dan laju perubahan sendiri (sebagian kecil sengaja
turun), sehingga nilainya bergerak Awal → Tengah → Akhir dan filter siklus di Analitik punya sesuatu untuk diperlihatkan.
Profilnya diturunkan dari id awardee, jadi sama walau yang dijalankan hanya satu siklus.

**Siklus yang masih `draft` tidak tampil** di halaman Hasil maupun Analitik. Script tidak mengubah status kecuali diminta
lewat `--buka-siklus`, dan hanya draft → open — yang juga akan dikerjakan penjadwal begitu jadwal bukanya tiba. Catatan:
siklus yang sudah punya jawaban tidak bisa dikembalikan ke draft dari konsol; jalankan `--reset` dulu kalau mau.

Untuk mencobanya tanpa menyentuh D1 lokal yang sedang dipakai, `--persist-to=<dir>` mengarahkan keduanya ke state D1 lain.

## Konsol Admin

- **`/admin/periode`** — daftar siklus; **`/admin/periode/<slug>`** mengatur satu siklus: nama, jadwal, status, serta
  jadwal dan target tiap jenis pengukuran yang dijalankannya. Deadline yang dulu ditulis tangan di enam berkas kini hanya ada di sini.
- **Jadwal per jenis** menentukan kapan masing-masing penilai bisa mengisi. Yang paling cepat menutup yang berlaku —
  jadwal siklus tetap batas luarnya. Inilah cara membuat beberapa jenis dalam satu siklus tidak muncul bersamaan.
- **Waktu diketik dalam WIB, disimpan sebagai UTC** (`lib/waktu.ts`), jadi zona waktu laptop pengelola tidak ikut menentukan.
- **Pagar yang ditegakkan di lapisan data**, bukan hanya di tampilan: siklus tanpa pertanyaan tidak bisa dibuka; siklus
  yang sudah menerima jawaban tidak bisa dikembalikan ke draft (tutup saja — hasilnya tetap terbaca); jenis pengukuran yang
  sudah punya jawaban tidak bisa dilepas; target "jumlah tetap" wajib punya angka.
- **`/admin/pengukuran`** — daftar jenis pengukuran; **`/admin/pengukuran/<slug>`** mengatur satu jenis beserta soalnya.
  Setelah jawaban masuk susunannya dikunci (menambah/menghapus soal mengubah arti data yang sudah terkumpul); perbaikan
  salah ketik tetap boleh, kode dan skala tidak.
- **`/admin/pengguna`** — akun dan data awardee dalam satu daftar, termasuk kode referal. Awardee yang sudah punya jawaban
  tidak bisa dipindah angkatannya atau dihapus, dan kampus hanya boleh dipilih dari wilayahnya sendiri — kedua pagar itu
  berlaku lewat form akun maupun form data awardee.
- **Membuka angkatan baru tanpa menyentuh kode**: buat siklusnya (Awal/Tengah/Akhir), pilih jenis pengukuran mana yang
  dijalankan — soalnya dipakai ulang, tidak disalin — rapikan teks form publik, atur jadwal dan target, tambahkan
  awardee-nya, lalu buka siklusnya.
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

## Jenis pengukuran dan siklus

Sejak migrasi 0006 kuesioner tidak lagi menempel ke periode; migrasi 0008 melebur jenis pengukuran dengan tipe responden,
dan migrasi 0009 membuang sub pengukuran. Bentuknya sekarang:

```
Jenis pengukuran (SA · PA · MA · PU · LA · UA)
├── filled_by = siapa yang mengisi: self · peer · manwil · public · admin
└── Soal (satu teks pernyataan, skala) — langsung di bawah jenisnya, tanpa kategori

Siklus = jadwal milik satu angkatan: Awal · Tengah · Akhir
└── period_measurements: jenis mana saja yang dijalankan, dengan jadwal & target masing-masing
```

- **Satu siklus menjalankan beberapa jenis sekaligus.** Siklus Tengah BA16 membuka SA, PA, MA, PU, dan LA berdampingan.
  Satu angkatan hanya punya satu Awal, satu Tengah, satu Akhir — dijaga `UNIQUE (batch, cycle)`.
- **`filled_by` yang menentukan rute**, bukan kode. Jenis buatan Admin langsung bisa dibuka oleh peran yang sesuai tanpa
  menyentuh kode program; dulu ada peta kode di `lib/data/evaluations.ts` yang membuat jenis baru tidak bisa dibuka siapa pun.
- **Satu set soal dipakai ulang** lintas angkatan. Menjadwalkan BA17 tinggal membuat siklus yang menunjuk jenis yang sama —
  tidak ada penyalinan soal, jadi tidak ada salinan yang perlahan berbeda isi.
- **Susunan soal terkunci begitu jenis itu menghasilkan jawaban** lewat siklus mana pun. Teks soal tetap bisa dirapikan
  (nilai menempel ke id, bukan ke teksnya); kode dan skala tidak.
- **Jenis yang masih dijadwalkan siklus tidak bisa dihapus.**
- **Menu Instrumen** (`/admin/instrumen`) mengelola soal dari semua jenis dalam satu daftar, dengan saringan per jenis
  serta pencarian ke kode maupun isi soal. Halaman Pengukuran menautkan ke sini — supaya soal tidak punya dua tempat
  sunting yang bisa berbeda isi.

### Catatan migrasi 0006

`instruments` dirujuk `response_scores`, jadi tabelnya tidak bisa langsung dibongkar. `PRAGMA foreign_keys = OFF`
**tidak menolong** — SQLite mengabaikannya di dalam transaksi, dan migrasi D1 selalu berjalan dalam transaksi;
`PRAGMA defer_foreign_keys` juga tidak cukup, karena pelanggaran yang tercatat saat DROP tidak dihapus oleh RENAME.
Yang dipakai: **bongkar dari anak ke induk, pasang kembali dari induk ke anak** — saat sebuah tabel dibuang, tidak ada
lagi baris yang merujuknya. Id soal dipertahankan supaya `response_scores` lama tetap menunjuk soal yang sama.

### Catatan migrasi 0008 & 0009

Keduanya **membangun ulang bersih, bukan memindahkan baris**: seluruh tabel yang disentuh sedang kosong di lokal maupun
production saat migrasi itu ditulis. Dijalankan di basis data yang sudah berisi penilaian, seluruh penilaiannya hilang —
peringatan itu ada di kepala masing-masing berkas migrasi.

Yang dibuang dan tidak ada lagi di mana pun: tabel `respondent_types`, `period_respondent_types` (jadi `period_measurements`),
dan `instrument_categories`; kolom `periods.kind`, `periods.measurement_id`, `measurements.kind`, serta
`instruments.text_self`/`text_public` (lebur jadi satu `statement`). Sepuluh tipe responden lama menyusut jadi enam jenis:
dua asesmen mandiri lebur jadi satu **SA** yang dijalankan di siklus berbeda, dan lima tipe Leadership Project jadi satu
**LA** — bedanya pindah ke isian hubungan pada formnya (`responses.relation`).

## Uji

```bash
npm test
```

Menjalankan `lib/data/*` di atas `node:sqlite` dengan migrasi yang sama persis seperti production. Uji membuktikan di lapisan
query bahwa awardee hanya bisa menarik datanya sendiri, Manwil hanya wilayahnya, tautan masuk hanya berlaku sekali,
penilaian berakun hanya bisa diisi oleh yang berhak sekali saja, dan IPK beserta predikatnya sesuai rubrik — termasuk
normalisasi skala dan penggabungan beberapa jenis publik jadi satu predikat 360°.

Ekspor CSV juga diuji di sini: sel yang diawali tanda formula (`=` `+` `-` `@`) harus keluar sebagai teks, karena kolom
identitas dan saran diisi responden publik tanpa akun dan berkasnya dibuka Admin di Excel.

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
