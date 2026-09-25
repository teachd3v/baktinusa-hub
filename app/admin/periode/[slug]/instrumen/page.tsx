import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listInstruments } from "@/lib/data/admin-instruments";
import { getPeriodDetail } from "@/lib/data/admin-periods";
import { AddCategory, CategoryBlock } from "../../InstrumentForms";

export const metadata: Metadata = { title: "Kuesioner" };

export default async function InstrumentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const admin = await requireUser("admin");
  const { slug } = await params;
  const period = await getPeriodDetail(env.DB, admin, slug);
  if (!period) notFound();
  const categories = await listInstruments(env.DB, admin, period.id);

  // Setelah jawaban masuk, susunan pertanyaan dikunci: menambah atau menghapus soal akan mengubah arti
  // data yang sudah terkumpul. Perbaikan salah ketik tetap boleh.
  const locked = period.responses > 0;

  return (
    <>
      <div className="page-head">
        <Link href={`/admin/periode/${period.slug}`} className="back-link">← Atur periode</Link>
        <h1>Kuesioner</h1>
        <p>{period.name} · {period.instruments} pertanyaan dalam {categories.length} kategori</p>
      </div>

      {locked && (
        <div className="card" style={{ borderLeft: "4px solid var(--warn-border)" }}>
          <h2 className="section-title">Susunan terkunci</h2>
          <p className="section-hint" style={{ margin: 0 }}>
            Periode ini sudah menerima {period.responses} jawaban. Kategori dan pertanyaan tidak bisa ditambah, dihapus,
            atau diganti kodenya — hanya teksnya yang masih bisa diperbaiki. Untuk susunan baru, buat periode baru dan
            salin kuesioner ini sebagai titik awal.
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: "0.75rem" }}>
        {categories.map((c) => (
          <CategoryBlock key={c.id} periodId={period.id} category={c} locked={locked} />
        ))}
      </div>

      {!locked && (
        <section className="card">
          <h2 className="section-title">Tambah kategori</h2>
          <p className="section-hint">
            Kategori menentukan pengelompokan nilai di dashboard — IPK dihitung sebagai rata-rata antar kategori.
          </p>
          <AddCategory periodId={period.id} />
        </section>
      )}
    </>
  );
}
