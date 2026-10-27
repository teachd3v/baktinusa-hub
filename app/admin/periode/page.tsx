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
        <p>
          Tiap angkatan punya Siklus Awal, Tengah, dan Akhir. Satu siklus menjalankan beberapa jenis pengukuran sekaligus,
          masing-masing dengan jadwal dan statusnya sendiri.
        </p>
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="section-title">Daftar siklus</h2>
          <AddButton
            label="Buat siklus"
            title="Buat siklus baru"
            hint="Siklus adalah jadwal milik satu angkatan. Jenis pengukuran yang dijalankannya ditentukan setelah ini."
          >
            <NewPeriodForm />
          </AddButton>
        </div>
        <p className="section-hint">
          {periods.length} siklus terdaftar. Klik <b>Ubah</b> untuk mengedit rincian data atau menghapus siklus yang belum
          memiliki respons.
        </p>

        <div className="table-wrap">
          <table className="table">
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
            <span className="section-hint" style={{ margin: 0 }}>Klik selnya untuk memasang atau melepas.</span>
          </div>
          <CycleMatrix matrix={m} />
        </section>
      ))}
    </>
  );
}
