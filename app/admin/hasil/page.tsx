import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { MatrixTable, NoPeriod, PeriodTabs, PredicateSpread, RegionBars } from "@/components/results/Panels";
import { fmt } from "@/components/results/Pieces";
import { requireUser } from "@/lib/auth";
import { ipkAcross, predicateSpread, resultsForScope, summarizeRegions } from "@/lib/data/results";
import { scopeFor } from "@/lib/data/scope";
import { pickPeriod } from "@/lib/periode";

export const metadata: Metadata = { title: "Hasil Nasional" };

export default async function AdminResults({ searchParams }: { searchParams: Promise<{ periode?: string; cari?: string }> }) {
  const user = await requireUser("admin");
  const { periode, cari } = await searchParams;
  const { periods, active } = await pickPeriod(periode);
  if (!active) {
    return (
      <>
        <div className="page-head"><h1>Hasil nasional</h1></div>
        <NoPeriod />
      </>
    );
  }

  const results = await resultsForScope(env.DB, scopeFor(user), active.id);
  const types = results[0]?.types.map((t) => ({ code: t.code, name: t.name })) ?? [];
  const regions = summarizeRegions(results);
  const responses = results.reduce((s, r) => s + r.types.reduce((n, t) => n + t.responses, 0), 0);
  const scored = results.filter((r) => r.types.some((t) => t.ipk !== null));

  // Pencarian lewat form GET biasa: tidak butuh JavaScript, dan hasilnya bisa dibagikan sebagai tautan.
  const needle = (cari ?? "").trim().toLowerCase();
  const shown = needle
    ? results.filter((r) => [r.name, r.region, r.campus ?? ""].some((v) => v.toLowerCase().includes(needle)))
    : results;

  return (
    <>
      <div className="page-head">
        <h1>Hasil nasional</h1>
        <p>{active.name}</p>
      </div>

      <PeriodTabs periods={periods} active={active.slug} basePath="/admin/hasil" />

      <section className="card">
        <h2 className="section-title">Ringkasan</h2>
        <ul className="stat-list">
          <li><b>{results.length}</b> awardee</li>
          <li><b>{regions.length}</b> wilayah</li>
          <li><b>{scored.length}</b> sudah dinilai</li>
          <li><b>{responses}</b> respons masuk</li>
          <li><b>{fmt(ipkAcross(results.flatMap((r) => r.types)))}</b> rata-rata IPK</li>
        </ul>
      </section>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Rata-rata IPK per wilayah</h2>
          <p className="section-hint">Tiap awardee berbobot sama, jadi wilayah kecil tidak tenggelam.</p>
          <RegionBars regions={regions} />
        </section>

        <section className="card">
          <h2 className="section-title">Sebaran predikat</h2>
          {types.map((t) => (
            <div key={t.code} style={{ marginBottom: "1rem" }}>
              <p className="label">{t.name}</p>
              <PredicateSpread spread={predicateSpread(results, t.code)} />
            </div>
          ))}
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Matriks seluruh awardee</h2>
        <form method="get" className="copy-row" style={{ margin: "0 0 1rem" }}>
          <input type="hidden" name="periode" value={active.slug} />
          <input className="input" type="search" name="cari" defaultValue={cari ?? ""} placeholder="Cari nama, wilayah, atau kampus…" aria-label="Cari awardee" />
          <button type="submit" className="btn btn-small">Cari</button>
        </form>
        <p className="section-hint">
          Menampilkan {shown.length} dari {results.length} awardee. Klik nama untuk rinciannya.
        </p>
        <MatrixTable results={shown} typeCodes={types} hrefBase="/admin/hasil" />
      </section>
    </>
  );
}
