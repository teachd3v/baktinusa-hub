import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getFormText, getMeasurement } from "@/lib/data/measurements";
import { AddCategory, CategoryBlock, FormTextForm, MeasurementSettings } from "../MeasurementForms";

export const metadata: Metadata = { title: "Atur Pengukuran" };

export default async function MeasurementDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const admin = await requireUser("admin");
  const { slug } = await params;
  const measurement = await getMeasurement(env.DB, admin, slug);
  if (!measurement) notFound();
  const formText = await getFormText(env.DB, admin, measurement.id);

  return (
    <>
      <div className="page-head">
        <Link href="/admin/pengukuran" className="back-link">← Semua pengukuran</Link>
        <h1>{measurement.name}</h1>
        <p>
          {measurement.categories} sub pengukuran · {measurement.instruments} soal · dipakai {measurement.periods} periode
        </p>
      </div>

      {measurement.locked && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn)" }}>
          <h2 className="section-title">Susunan terkunci</h2>
          <p className="section-hint" style={{ margin: 0 }}>
            Pengukuran ini sudah menghasilkan {measurement.responses} jawaban. Sub pengukuran dan soal tidak bisa ditambah,
            dihapus, atau diganti kodenya — hanya teksnya yang masih bisa diperbaiki. Untuk susunan baru, buat pengukuran
            baru dan salin yang ini sebagai titik awal.
          </p>
        </div>
      )}

      {measurement.usedBy.length > 0 && (
        <section className="card">
          <h2 className="section-title">Dijadwalkan oleh</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Periode</th>
                  <th scope="col">Angkatan</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Jawaban</th>
                </tr>
              </thead>
              <tbody>
                {measurement.usedBy.map((p) => (
                  <tr key={p.slug}>
                    <td><Link href={`/admin/periode/${p.slug}`}>{p.name}</Link></td>
                    <td>{p.batch}</td>
                    <td>{p.status}</td>
                    <td className="num">{p.responses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h2 className="section-title">Sub pengukuran &amp; soal</h2>
        <p className="section-hint">
          Sub pengukuran adalah pengelompokan soal yang jadi dasar hitungan IPK — rata-rata tiap sub, lalu dirata-ratakan lagi.
          Soalnya sendiri dikelola di menu Instrumen.
        </p>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {measurement.categoriesList.map((c) => (
            <CategoryBlock key={c.id} measurementId={measurement.id} measurementSlug={measurement.slug} category={c} locked={measurement.locked} />
          ))}
        </div>
      </section>

      {!measurement.locked && (
        <section className="card">
          <h2 className="section-title">Tambah sub pengukuran</h2>
          <AddCategory measurementId={measurement.id} />
        </section>
      )}

      <section className="card">
        <h2 className="section-title">Pengaturan</h2>
        <MeasurementSettings measurement={measurement} />
      </section>

      {formText && (
        <section className="card">
          <h2 className="section-title">Teks form publik</h2>
          <p className="section-hint">Yang dilihat responden di bagian atas form penilaian.</p>
          <FormTextForm measurementId={measurement.id} text={formText} />
        </section>
      )}
    </>
  );
}
