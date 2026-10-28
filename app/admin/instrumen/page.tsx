import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { AddButton } from "@/components/Modal";
import { AutoSearch, ParamSelect } from "@/components/ListControls";
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
      </div>

      <section className="card">
        <div className="tabs tabs-desktop">
          <Link href="/admin/instrumen" aria-current={!pengukuran ? "page" : undefined}>Semua pengukuran</Link>
          {measurements.map((m) => (
            <Link key={m.id} href={`/admin/instrumen?pengukuran=${m.slug}`} aria-current={pengukuran === m.slug ? "page" : undefined}>
              {m.name} ({m.instruments})
            </Link>
          ))}
        </div>

        {/* Ponsel: chip diganti dropdown, dan tambah soal jadi ikon di sebelah kotak cari. */}
        <ParamSelect
          path="/admin/instrumen"
          param="pengukuran"
          value={pengukuran ?? ""}
          options={[["", "Semua pengukuran"], ...measurements.map((m): [string, string] => [m.slug, `${m.name} (${m.instruments})`])]}
          keep={{ cari: cari ?? "" }}
          label="Saring menurut pengukuran"
        />

        <div className="search-row">
          <AutoSearch path="/admin/instrumen" value={cari ?? ""} keep={{ pengukuran: pengukuran ?? "" }} placeholder="Cari kode atau isi soal…" label="Cari soal" />
          <AddButton label="Tambah soal" title="Tambah soal" className="btn btn-small btn-inline add-button btn-icon-mobile mobile-only">
            <NewInstrumentForm measurements={measurements} />
          </AddButton>
        </div>

        <InstrumentsManager instruments={instruments} measurements={measurements} activeSlug={pengukuran} />
      </section>

      <section className="card hide-mobile">
        <h2 className="section-title">Impor massal soal</h2>
        <InstrumentImportPanel measurements={measurements} activeSlug={pengukuran} />
      </section>

      <section className="card hide-mobile">
        <h2 className="section-title">Tambah soal manual</h2>
        <p className="section-hint">
          Soal menempel ke satu jenis pengukuran, dan ikut terpakai oleh semua siklus yang menjalankannya.
        </p>
        <NewInstrumentForm measurements={measurements} />
      </section>
    </>
  );
}
