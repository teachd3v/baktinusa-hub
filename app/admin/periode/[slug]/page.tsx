import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPeriodDetail } from "@/lib/data/admin-periods";
import { formatWib } from "@/lib/format";
import { AddType, PeriodSchedule, StatusSwitch, TypeRow } from "../PeriodForms";

export const metadata: Metadata = { title: "Atur Periode" };

const STATUS_NOTE = {
  draft: "Belum terlihat oleh siapa pun. Form dan dashboard belum menampilkan periode ini.",
  open: "Form bisa diisi dan hasilnya muncul di dashboard.",
  closed: "Jawaban baru ditolak, hasil yang sudah masuk tetap terbaca.",
  archived: "Disimpan sebagai arsip, tidak muncul di daftar periode berjalan.",
} as const;

export default async function PeriodDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const admin = await requireUser("admin");
  const { slug } = await params;
  const period = await getPeriodDetail(env.DB, admin, slug);
  if (!period) notFound();

  return (
    <>
      <div className="page-head">
        <Link href="/admin/periode" className="back-link">← Semua periode</Link>
        <h1>{period.name}</h1>
        <p>
          {period.batch} · {period.instruments} pertanyaan · {period.responses} jawaban masuk
        </p>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Status</h2>
          <p className="section-hint">{STATUS_NOTE[period.status]}</p>
          <StatusSwitch period={period} />
        </section>

        <section className="card">
          <h2 className="section-title">Jadwal periode</h2>
          <PeriodSchedule period={period} />
          {period.closesAt && (
            <p className="section-hint" style={{ marginBottom: 0 }}>Tersimpan sebagai {formatWib(period.closesAt)}.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Tipe penilai</h2>
        <p className="section-hint">
          Jadwal per tipe menentukan kapan masing-masing bisa mengisi. Yang paling cepat menutup yang dipakai — jadwal
          periode tetap jadi batas luarnya.
        </p>
        <div style={{ display: "grid", gap: "0.75rem" }}>
          {period.types.map((t) => (
            <TypeRow key={t.typeId} periodId={period.id} type={t} />
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Tambah tipe penilai</h2>
        <AddType periodId={period.id} available={period.available} />
      </section>
    </>
  );
}
