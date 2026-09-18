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

`scripts/seed-ba15.mjs` **menghapus semua respons milik periode BA15** lalu mengisi ulang data masternya, jadi jangan dijalankan
ke production setelah periode mulai menerima isian.

- **Kuesioner** ada di `seed/kuesioner-ba15.csv`: 50 indikator asesmen dan 22 indikator Leadership Project, masing-masing dengan
  kategorinya. Batas asesmen mengikuti rubrik — Self-Maturity Q1–Q18, Competency Enrichment Q19–Q39, Bringing Inspiration Q40–Q50.
  Dashboard lama menghitung Q1–Q19 dan Q20–Q39, salah satu nomor; di D1 setiap pertanyaan memegang `category_id`-nya sendiri.
- **Daftar awardee** berisi data pribadi, jadi tidak ada di repo. Script membacanya dari CSV app `leadpro-survey` lama di folder
  induk; arahkan ke file lain lewat `BA15_AWARDEE_CSV`. Keluarannya, `.seed/`, di-gitignore — **jangan di-commit**, repo ini publik.
- **Foto awardee** ada di R2 dengan kunci `awardees/ba15/<kode-referal>.webp`.

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
