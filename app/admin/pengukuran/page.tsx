import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listMeasurements } from "@/lib/data/measurements";
import { AddButton } from "@/components/Modal";
import { NewMeasurementForm } from "./MeasurementForms";

export const metadata: Metadata = { title: "Pengukuran" };

const KIND_LABEL = { assessment: "Asesmen & 360°", leadpro: "Leadership Project" } as const;

export default async function MeasurementsPage() {
  const admin = await requireUser("admin");
  const measurements = await listMeasurements(env.DB, admin);

  return (
    <>
      <div className="page-head">
        <h1>Pengukuran</h1>
        <p>Pemilik kuesioner. Satu pengukuran dipakai ulang oleh periode-periode yang menjadwalkannya.</p>
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
                <th scope="col">Jenis</th>
                <th scope="col" className="num">Sub pengukuran</th>
                <th scope="col" className="num">Soal</th>
                <th scope="col" className="num">Dipakai periode</th>
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
                  <td>{KIND_LABEL[m.kind]}</td>
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
