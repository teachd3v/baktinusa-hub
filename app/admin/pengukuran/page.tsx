import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { FILLED_BY_LABEL, listMeasurements } from "@/lib/data/measurements";
import { AddButton, ModalButton } from "@/components/Modal";
import { MeasurementSettings, NewMeasurementForm } from "./MeasurementForms";

export const metadata: Metadata = { title: "Pengukuran" };

export default async function MeasurementsPage() {
  const admin = await requireUser("admin");
  const measurements = await listMeasurements(env.DB, admin);

  return (
    <>
      <div className="page-head">
        <h1>Pengukuran</h1>
      </div>

      <section className="card">
        <div className="card-head head-compact">
          <h2 className="section-title">Daftar pengukuran</h2>
          <AddButton
            label="Buat pengukuran"
            className="btn btn-small btn-inline add-button btn-icon-mobile"
            title="Buat pengukuran"
            hint="Untuk jenis penilaian baru. Kuesionernya bisa dimulai dari nol atau menyalin pengukuran yang sudah ada."
          >
            <NewMeasurementForm measurements={measurements} />
          </AddButton>
        </div>

        {measurements.length === 0 ? (
          <p className="section-hint">Belum ada jenis pengukuran. Buat dulu lewat tombol di atas.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" data-collapse="1">
              <thead>
                <tr>
                  <th scope="col">Pengukuran</th>
                  <th scope="col">Kode</th>
                  <th scope="col">Diisi oleh</th>
                  <th scope="col" className="num">Soal</th>
                  <th scope="col" className="num">Dipakai siklus</th>
                  <th scope="col" className="num">Jawaban</th>
                  <th scope="col"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {measurements.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <b>{m.name}</b>
                      <div className="section-hint hide-mobile" style={{ margin: 0 }}>
                        <code style={{ fontSize: "0.72rem" }}>{m.slug}</code>
                      </div>
                    </td>
                    <td><code style={{ fontSize: "0.78rem" }}>{m.code}</code></td>
                    <td>{FILLED_BY_LABEL[m.filledBy]}</td>
                    <td className="num">
                      <Link href={`/admin/instrumen?pengukuran=${m.slug}`}>{m.instruments}</Link>
                    </td>
                    <td className="num">{m.periods}</td>
                    <td className="num">
                      {m.responses > 0 ? <span className="pill pill-info">{m.responses}</span> : <span className="section-hint">belum ada</span>}
                    </td>
                    <td>
                      <ModalButton
                        label="Edit"
                        className="btn-link"
                        title={`Edit ${m.name}`}
                        hint={`Diisi ${FILLED_BY_LABEL[m.filledBy].toLowerCase()}. Soalnya dikelola di menu Instrumen.`}
                      >
                        <MeasurementSettings measurement={m} />
                      </ModalButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
