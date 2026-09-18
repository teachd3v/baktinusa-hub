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

## Skema & impor data BA15

Skema ada di `migrations/`. Terapkan dengan `npm run db:migrate:local` atau `npm run db:migrate:remote`.

Data BA15 diimpor sekali dari sistem lama lewat `scripts/import-ba15.mjs`, lalu dibuktikan dengan `scripts/verify-ba15.mjs`.
Keduanya membaca konfigurasi dari `.env.import` (di-gitignore) dan menulis keluaran ke `.import/` (juga di-gitignore)
karena isinya data pribadi awardee dan penilai. **Jangan pernah meng-commit kedua lokasi itu** — repo ini publik.

| Variabel di `.env.import` | Isi |
|---|---|
| `BA15_GOOGLE_KEY_FILE` | Path file JSON service account yang bisa membaca spreadsheet responden |
| `BA15_SPREADSHEET_ID` | ID spreadsheet responden (Sheet1 = evaluasi publik, Sheet2 = Leadpro) |
| `BA15_CSV_ASSESSMENT`, `BA15_CSV_LEADPRO`, `BA15_CSV_INSTRUMEN_ASSESSMENT`, `BA15_CSV_INSTRUMEN_LEADPRO` | URL CSV sheet dashboard lama |
| `BA15_AWARDEE_CSV`, `BA15_RUBRIK_ASSESSMENT`, `BA15_RUBRIK_LEADPRO` | Path CSV daftar awardee dan rubrik dari app survey lama |
| `BA15_OLD_DATALOADER` | Path `dataLoader.js` dashboard lama, dipakai sebagai pembanding |
| `BA15_INCLUDE_DASHBOARD_ONLY` | `1` untuk ikut mengimpor baris yang hanya ada di sheet dashboard |

```bash
npm run import:ba15
npx wrangler d1 execute baktinusa-hub-db --remote --file .import/ba15.sql
npx wrangler d1 export baktinusa-hub-db --remote --output .import/d1-remote.sql
npm run verify:ba15 -- .import/d1-remote.sql
```

Script impor idempoten untuk data BA15: menghapus lalu mengisi ulang periode dan awardee angkatan itu saja.

**Aturan rekonsiliasi.** Skor, kategori responden, awardee, dan saran diambil dari sheet dashboard lama, karena itu versi yang
sudah dibersihkan tim. Waktu kirim, nama dan kota penilai, jawaban hubungan, dan lama kenal diambil dari Sheet1/Sheet2, karena
dashboard tidak menyimpannya. Baris dipasangkan lewat nama awardee (tanpa apostrof) ditambah deret skornya. Asesmen Awal dan Tengah
hanya ada di dashboard, sehingga tidak punya waktu kirim.

**Verifikasi** menjalankan `dataLoader.js` lama apa adanya, lalu menghitung angka yang sama dari D1 dengan batas kategori lama —
hasilnya harus identik kecuali untuk baris yang sumbernya memang berbeda. Setelah itu dampak batas kategori yang benar dilaporkan
terpisah. Batas lama di `dataLoader.js` (Self-Maturity Q1–Q19, Competency Enrichment Q20–Q39) salah satu nomor; rubrik menetapkan
Q1–Q18 dan Q19–Q39. Di D1 setiap pertanyaan memegang `category_id`-nya sendiri, jadi kesalahan jenis ini tidak bisa terulang.

Foto awardee ada di R2 dengan kunci `awardees/ba15/<kode-referal>.webp`.

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
