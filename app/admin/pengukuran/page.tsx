import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMeasurements } from "@/lib/data/measurements";
import { AddButton } from "@/components/Modal";
import { NewMeasurementForm } from "./MeasurementForms";

export const metadata: Metadata = { title: "Pengukuran" };

import { FILLED_BY_LABEL } from "@/lib/data/measurements";

export default async function MeasurementsPage() {
  const admin = await requireUser("admin");
  const measurements = await listMeasurements(env.DB, admin);

  return (
    <>
      <div className="page-head">
        <h1>Pengukuran</h1>
        <p>Jenis pengukuran: SA, PA, MA, dan seterusnya. Tiap jenis punya kodenya sendiri, kuesionernya sendiri, dan menyatakan siapa pengisinya — itu yang menentukan siapa bisa membuka formnya.</p>
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="section-title">Daftar pengukuran</h2>
          <AddButton
            label="Buat pengukuran"
            title="Buat pengukuran"
            hint="Untuk jenis penilaian baru. Kuesionernya bisa dimulai dari nol atau menyalin pengukuran yang sudah ada."
          >
            <NewMeasurementForm measurements={measurements} />
          </AddButton>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Pengukuran</th>
                <th scope="col">Kode</th>
                <th scope="col">Diisi oleh</th>
                <th scope="col" className="num">Sub pengukuran</th>
                <th scope="col" className="num">Soal</th>
                <th scope="col" className="num">Dipakai siklus</th>
                <th scope="col" className="num">Jawaban</th>
              </tr>
            </thead>
            <tbody>
              {measurements.map((m) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/admin/pengukuran/${m.slug}`} style={{ fontWeight: 700 }}>{m.name}</Link>
                    <div className="section-hint" style={{ margin: 0 }}><code style={{ fontSize: "0.72rem" }}>{m.slug}</code></div>
                  </td>
                  <td><code style={{ fontSize: "0.78rem" }}>{m.code}</code></td>
                  <td>{FILLED_BY_LABEL[m.filledBy]}</td>
                  <td className="num">{m.categories}</td>
                  <td className="num">{m.instruments}</td>
                  <td className="num">{m.periods}</td>
                  <td className="num">
                    {m.responses > 0 ? <span className="pill pill-info">{m.responses}</span> : <span className="section-hint">belum ada</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

    </>
  );
}
