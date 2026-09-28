import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { cycleMatrix } from "@/lib/data/admin-periods";
import { CYCLE_LABEL, listPeriods } from "@/lib/data/periods";
import { formatWib } from "@/lib/format";
import { listMeasurements } from "@/lib/data/measurements";
import { CycleMatrix } from "./CycleMatrix";
import { NewPeriodForm } from "./PeriodForms";

export const metadata: Metadata = { title: "Siklus" };

const STATUS = {
  draft: { label: "draft", tone: "pill-muted" },
  open: { label: "dibuka", tone: "pill-ok" },
  closed: { label: "ditutup", tone: "pill-warn" },
  archived: { label: "diarsipkan", tone: "pill-muted" },
} as const;

export default async function PeriodsPage() {
  const admin = await requireUser("admin");
  const [periods, matrix] = await Promise.all([listPeriods(env.DB), cycleMatrix(env.DB, admin)]);

  return (
    <>
      <div className="page-head">
        <h1>Siklus penilaian</h1>
        <p>Tiap angkatan punya Siklus Awal, Tengah, dan Akhir. Satu siklus menjalankan beberapa jenis pengukuran sekaligus, masing-masing dengan jadwalnya sendiri.</p>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Siklus</th>
                <th scope="col">Angkatan</th>
                <th scope="col">Status</th>
                <th scope="col">Dibuka</th>
                <th scope="col">Ditutup</th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link href={`/admin/periode/${p.slug}`} style={{ fontWeight: 700 }}>{p.name}</Link>
                    <div className="section-hint" style={{ margin: 0 }}>{CYCLE_LABEL[p.cycle]}</div>
                  </td>
                  <td>{p.batch}</td>
                  <td><span className={`pill ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span></td>
                  <td>{p.opensAt ? formatWib(p.opensAt) : "—"}</td>
                  <td>{p.closesAt ? formatWib(p.closesAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {matrix.map((m) => (
        <section className="card" key={m.batch}>
          <div className="card-head">
            <h2 className="section-title">Peta {m.batch}</h2>
            <span className="section-hint" style={{ margin: 0 }}>Klik selnya untuk memasang atau melepas.</span>
          </div>
          <CycleMatrix matrix={m} />
        </section>
      ))}

      <section className="card">
        <h2 className="section-title">Buat siklus baru</h2>
        <p className="section-hint">
          Siklus adalah jadwal milik satu angkatan. Jenis pengukuran yang dijalankannya dipilih setelah ini. Siklus baru
          selalu lahir sebagai draft.
        </p>
        <NewPeriodForm />
      </section>
    </>
  );
}
