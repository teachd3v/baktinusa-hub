import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPeriodDetail } from "@/lib/data/admin-periods";
import { CYCLE_LABEL } from "@/lib/data/periods";
import { formatWib } from "@/lib/format";
import { AddMeasurement, PeriodSchedule, StatusSwitch, MeasurementRow } from "../PeriodForms";

export const metadata: Metadata = { title: "Atur Siklus" };

const STATUS_NOTE = {
  draft: "Belum terlihat oleh siapa pun. Form dan dashboard belum menampilkan siklus ini.",
  open: "Form bisa diisi dan hasilnya muncul di dashboard.",
  closed: "Jawaban baru ditolak, hasil yang sudah masuk tetap terbaca.",
  archived: "Disimpan sebagai arsip, tidak muncul di daftar siklus berjalan.",
} as const;

export default async function PeriodDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const admin = await requireUser("admin");
  const { slug } = await params;
  const period = await getPeriodDetail(env.DB, admin, slug);
  if (!period) notFound();

  return (
    <>
      <div className="page-head">
        <Link href="/admin/periode" className="back-link">← Semua siklus</Link>
        <h1>{period.name}</h1>
        <p>
          {period.batch} · {CYCLE_LABEL[period.cycle]} · {period.measurements.length} jenis pengukuran ·{" "}
          {period.instruments} soal · {period.responses} jawaban masuk
        </p>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Status</h2>
          <p className="section-hint">{STATUS_NOTE[period.status]}</p>
          <StatusSwitch period={period} />
        </section>

        <section className="card">
          <h2 className="section-title">Jadwal siklus</h2>
          <PeriodSchedule period={period} />
          {period.closesAt && (
            <p className="section-hint" style={{ marginBottom: 0 }}>Tersimpan sebagai {formatWib(period.closesAt)}.</p>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Jenis pengukuran yang dijalankan</h2>
        <p className="section-hint">
          Jadwal per jenis menentukan kapan masing-masing bisa diisi. Yang paling cepat menutup yang dipakai — jadwal
          siklus tetap jadi batas luarnya.
        </p>
        {period.measurements.length === 0 ? (
          <p className="section-hint">Belum ada. Tambahkan di bawah — siklus tanpa jenis pengukuran tidak bisa dibuka.</p>
        ) : (
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {period.measurements.map((m) => (
              <MeasurementRow key={m.measurementId} periodId={period.id} type={m} />
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Tambah jenis pengukuran</h2>
        <AddMeasurement periodId={period.id} available={period.available} />
      </section>
    </>
  );
}
