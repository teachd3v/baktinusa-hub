import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listPeriods } from "@/lib/data/periods";
import { formatWib } from "@/lib/format";
import { listMeasurements } from "@/lib/data/measurements";
import { NewPeriodForm } from "./PeriodForms";

export const metadata: Metadata = { title: "Periode" };

const STATUS = {
  draft: { label: "draft", tone: "pill-muted" },
  open: { label: "dibuka", tone: "pill-ok" },
  closed: { label: "ditutup", tone: "pill-warn" },
  archived: { label: "diarsipkan", tone: "pill-muted" },
} as const;

export default async function PeriodsPage() {
  const admin = await requireUser("admin");
  const [periods, measurements] = await Promise.all([listPeriods(env.DB), listMeasurements(env.DB, admin)]);

  return (
    <>
      <div className="page-head">
        <h1>Periode penilaian</h1>
        <p>Buka, tutup, dan jadwalkan tiap tipe penilai. Semua batas waktu tinggal di sini, bukan di dalam kode.</p>
      </div>

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Periode</th>
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
                    <div className="section-hint" style={{ margin: 0 }}>{p.kind === "assessment" ? "Asesmen & 360°" : "Leadership Project"}</div>
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

      <section className="card">
        <h2 className="section-title">Buat periode baru</h2>
        <p className="section-hint">
          Periode adalah jadwal: pilih pengukuran yang dijalankan, angkatannya, lalu atur tanggalnya. Periode baru selalu lahir sebagai draft.
        </p>
        <NewPeriodForm measurements={measurements} />
      </section>
    </>
  );
}
