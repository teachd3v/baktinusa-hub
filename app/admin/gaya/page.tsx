import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Panduan Gaya" };

// Halaman hidup untuk design system: contohnya dirender dengan kelas yang sama persis seperti
// halaman sungguhan, jadi kalau token berubah, halaman ini ikut berubah — tidak bisa basi diam-diam.

const COLORS: { group: string; items: { token: string; note: string }[] }[] = [
  {
    group: "Inti",
    items: [
      { token: "--ink", note: "Teks utama" },
      { token: "--ink-muted", note: "Teks pendukung" },
      { token: "--ink-soft", note: "Placeholder, label tabel" },
      { token: "--surface", note: "Latar halaman" },
      { token: "--surface-sunken", note: "Bidang di dalam kartu" },
      { token: "--card", note: "Kartu" },
      { token: "--line", note: "Garis pemisah" },
    ],
  },
  {
    group: "Rail & aksi",
    items: [
      { token: "--rail", note: "Rail navigasi" },
      { token: "--rail-raised", note: "Bidang di dalam rail" },
      { token: "--primary", note: "Aksi utama" },
      { token: "--primary-hover", note: "Aksi utama saat disentuh" },
      { token: "--primary-ink", note: "Teks di atas latar merah muda" },
      { token: "--primary-soft", note: "Penanda aktif, sorotan" },
    ],
  },
  {
    group: "Pastel kategori",
    items: [
      { token: "--pastel-blush", note: "Kartu ke-2" },
      { token: "--pastel-peach", note: "Kartu ke-1" },
      { token: "--pastel-lilac", note: "Kartu ke-3" },
      { token: "--pastel-mint", note: "Kartu ke-4" },
      { token: "--pastel-sky", note: "Kartu ke-5" },
      { token: "--pastel-sand", note: "Netral" },
    ],
  },
  {
    group: "Grafik",
    items: [
      { token: "--chart-ok", note: "Cumlaude" },
      { token: "--chart-info", note: "Sangat memuaskan" },
      { token: "--chart-warn", note: "Memuaskan" },
      { token: "--chart-bad", note: "Perlu peningkatan" },
      { token: "--chart-none", note: "Belum dinilai" },
    ],
  },
  {
    group: "Status",
    items: [
      { token: "--ok", note: "Terpenuhi" },
      { token: "--warn", note: "Sebagian" },
      { token: "--bad", note: "Belum / gagal" },
      { token: "--info", note: "Keterangan" },
    ],
  },
];

const RADII = ["--radius-xl", "--radius-lg", "--radius-md", "--radius-sm"];

export default async function StyleGuidePage() {
  await requireUser("admin");

  return (
    <>
      <div className="page-head">
        <h1>Panduan gaya</h1>
        <p>Token dan komponen yang dipakai seluruh portal. Semuanya hidup di satu berkas: app/globals.css.</p>
      </div>

      <section className="card">
        <h2 className="section-title">Warna</h2>
        <p className="section-hint">
          Halaman dan komponen tidak menulis warna sendiri — semuanya memanggil token di bawah ini.
        </p>
        {COLORS.map((group) => (
          <div key={group.group} style={{ marginBottom: "1.25rem" }}>
            <p className="label">{group.group}</p>
            <div className="score-grid">
              {group.items.map((c) => (
                <div key={c.token} style={{ borderRadius: "var(--radius-md)", overflow: "hidden", background: "var(--surface-sunken)" }}>
                  <div style={{ height: "3rem", background: `var(${c.token})`, borderBottom: "1px solid var(--line)" }} />
                  <div style={{ padding: "0.6rem 0.75rem" }}>
                    <code style={{ fontSize: "0.72rem", fontWeight: 700 }}>{c.token}</code>
                    <div className="section-hint" style={{ margin: 0 }}>{c.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Tipografi</h2>
          <p className="section-hint">Satu keluarga huruf, dibedakan oleh ukuran dan ketebalan.</p>
          <h1 style={{ margin: "0 0 0.25rem" }}>Judul halaman</h1>
          <p className="section-hint">--text-2xl · 800</p>
          <h2 className="section-title">Judul bagian</h2>
          <p className="section-hint">--text-lg · 700</p>
          <p style={{ margin: "0 0 0.25rem" }}>Teks isi yang dibaca responden dan pengelola.</p>
          <p className="section-hint" style={{ marginBottom: 0 }}>Teks pendukung · --text-sm · warna --ink-muted</p>
        </section>

        <section className="card">
          <h2 className="section-title">Sudut & bayangan</h2>
          <p className="section-hint">Kartu memakai --radius-lg, rail --radius-xl, isian --radius-md.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem" }}>
            {RADII.map((r) => (
              <div
                key={r}
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "6rem",
                  height: "4.5rem",
                  background: "var(--card)",
                  borderRadius: `var(${r})`,
                  boxShadow: "var(--shadow-card)",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                }}
              >
                {r.replace("--radius-", "")}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Tombol</h2>
          <p className="section-hint">Merah hanya untuk aksi utama; sisanya diam supaya yang penting menonjol.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <button type="button" className="btn btn-inline">Aksi utama</button>
            <button type="button" className="btn btn-muted btn-inline">Aksi kedua</button>
            <button type="button" className="btn btn-small btn-inline">Kecil</button>
            <button type="button" className="btn btn-inline" disabled>Nonaktif</button>
            <button type="button" className="btn-link">Tautan aksi</button>
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">Status</h2>
          <p className="section-hint">Warna selalu berpasangan dengan kata — tidak pernah warna saja.</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            <span className="pill pill-ok">terpenuhi</span>
            <span className="pill pill-info">sangat memuaskan</span>
            <span className="pill pill-warn">sebagian</span>
            <span className="pill pill-bad">belum ada</span>
            <span className="pill pill-muted">belum dinilai</span>
          </div>
          <p className="label" style={{ marginTop: "1rem" }}>Lencana</p>
          <div className="badges" style={{ marginTop: 0 }}>
            <span className="badge">📍 Medan</span>
            <span className="badge">🎓 Universitas Sumatera Utara</span>
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Kartu skor</h2>
        <p className="section-hint">Warna pastel berputar otomatis mengikuti urutan, jadi tidak perlu ditentukan tiap halaman.</p>
        <div className="score-grid">
          {["Asesmen Awal", "Asesmen Tengah", "Peer Awardee", "Manajer Wilayah", "Jejaring Eksternal"].map((name, i) => (
            <div key={name} className="score-card">
              <span className="score-label">{name}</span>
              <b className="score-value">{(3.1 + i * 0.12).toFixed(2)}</b>
              <span className="pill pill-info">Sangat Memuaskan</span>
              <span className="score-note">{(i + 1) * 3} responden</span>
            </div>
          ))}
        </div>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Isian</h2>
          <div className="field">
            <label className="label" htmlFor="contoh-teks">Label isian</label>
            <input id="contoh-teks" className="input" placeholder="Tulis di sini…" />
          </div>
          <div className="field">
            <label className="label" htmlFor="contoh-pilih">Pilihan</label>
            <select id="contoh-pilih" className="select" defaultValue="">
              <option value="">Pilih salah satu…</option>
              <option value="a">Pilihan A</option>
            </select>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="contoh-salah">Isian bermasalah</label>
            <input id="contoh-salah" className="input" defaultValue="nilai keliru" aria-invalid="true" />
            <p className="form-error">Pesan galat muncul tepat di bawah isiannya.</p>
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">Batang & sebaran</h2>
          <div className="bar-rows">
            {[["Medan", 3.44], ["Padang", 3.47], ["Makassar", 2.54]].map(([label, value]) => (
              <div key={String(label)} className="bar-row">
                <span className="bar-label">{label}<small>4 awardee</small></span>
                <span className="bar" aria-hidden="true">
                  <span className="bar-fill bar-accent" style={{ width: `${(Number(value) / 4) * 100}%` }} />
                </span>
                <b className="bar-value">{Number(value).toFixed(2)}</b>
              </div>
            ))}
          </div>
          <p className="label" style={{ marginTop: "1rem" }}>Sebaran</p>
          <div className="spread" role="img" aria-label="Contoh sebaran predikat">
            <span style={{ width: "25%", background: "var(--chart-ok)" }} />
            <span style={{ width: "40%", background: "var(--chart-info)" }} />
            <span style={{ width: "25%", background: "var(--chart-warn)" }} />
            <span style={{ width: "10%", background: "var(--chart-bad)" }} />
          </div>
        </section>
      </div>
    </>
  );
}
