import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAllInstruments, listMeasurements } from "@/lib/data/measurements";
import { NewInstrumentForm } from "./InstrumentForms";
import { InstrumentImportPanel } from "./InstrumentImportPanel";
import { InstrumentsManager } from "./InstrumentsManager";

export const metadata: Metadata = { title: "Instrumen" };

export default async function InstrumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ pengukuran?: string; cari?: string }>;
}) {
  const admin = await requireUser("admin");
  const { pengukuran, cari } = await searchParams;
  const measurements = await listMeasurements(env.DB, admin);
  const active = measurements.find((m) => m.slug === pengukuran) ?? null;

  const instruments = await listAllInstruments(env.DB, admin, { measurementId: active?.id ?? null, search: cari });

  return (
    <>
      <div className="page-head">
        <h1>Instrumen</h1>
        <p>Semua soal dari seluruh pengukuran, dalam satu tempat.</p>
      </div>

      <section className="card">
        <div className="tabs">
          <Link href="/admin/instrumen" aria-current={!pengukuran ? "page" : undefined}>Semua pengukuran</Link>
          {measurements.map((m) => (
            <Link key={m.id} href={`/admin/instrumen?pengukuran=${m.slug}`} aria-current={pengukuran === m.slug ? "page" : undefined}>
              {m.name} ({m.instruments})
            </Link>
          ))}
        </div>

        <form method="get" className="copy-row" style={{ margin: "0 0 1rem" }}>
          {pengukuran && <input type="hidden" name="pengukuran" value={pengukuran} />}
          <input className="input" type="search" name="cari" defaultValue={cari ?? ""} placeholder="Cari kode atau isi soal…" aria-label="Cari soal" />
          <button type="submit" className="btn btn-muted btn-small">Cari</button>
        </form>

        <InstrumentsManager instruments={instruments} measurements={measurements} activeSlug={pengukuran} />
      </section>

      <section className="card">
        <h2 className="section-title">Impor massal soal</h2>
        <InstrumentImportPanel measurements={measurements} activeSlug={pengukuran} />
      </section>

      <section className="card">
        <h2 className="section-title">Tambah soal manual</h2>
        <p className="section-hint">
          Soal menempel ke satu jenis pengukuran, dan ikut terpakai oleh semua siklus yang menjalankannya.
        </p>
        <NewInstrumentForm measurements={measurements} />
      </section>
    </>
  );
}
