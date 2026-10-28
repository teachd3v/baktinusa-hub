import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { cycleMatrix, listPeriodsForAdmin } from "@/lib/data/admin-periods";
import { AddButton } from "@/components/Modal";
import { CycleMatrix } from "./CycleMatrix";
import { NewPeriodForm, PeriodRowForm } from "./PeriodForms";

export const metadata: Metadata = { title: "Siklus" };

export default async function PeriodsPage() {
  const admin = await requireUser("admin");
  const [periods, matrix] = await Promise.all([listPeriodsForAdmin(env.DB, admin), cycleMatrix(env.DB, admin)]);

  return (
    <>
      <div className="page-head">
        <h1>Siklus penilaian</h1>
      </div>

      <section className="card">
        <div className="card-head head-compact">
          <h2 className="section-title">Daftar siklus</h2>
          <AddButton
            label="Buat siklus"
            className="btn btn-small btn-inline add-button btn-icon-mobile"
            title="Buat siklus baru"
            hint="Siklus adalah jadwal milik satu angkatan. Jenis pengukuran yang dijalankannya ditentukan setelah ini."
          >
            <NewPeriodForm />
          </AddButton>
        </div>

        <div className="table-wrap">
          <table className="table" data-collapse="1,3">
            <thead>
              <tr>
                <th scope="col">Siklus</th>
                <th scope="col">Angkatan</th>
                <th scope="col">Status</th>
                <th scope="col" className="num">Pengukuran & Jawaban</th>
                <th scope="col">Dibuka (WIB)</th>
                <th scope="col">Ditutup (WIB)</th>
                <th scope="col"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <PeriodRowForm key={p.id} period={p} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {matrix.map((m) => (
        <section className="card" key={m.batch}>
          <div className="card-head">
            <h2 className="section-title">Peta {m.batch}</h2>
            <span className="section-hint hide-mobile" style={{ margin: 0 }}>Klik selnya untuk memasang atau melepas.</span>
          </div>
          <CycleMatrix matrix={m} />
        </section>
      ))}
    </>
  );
}
