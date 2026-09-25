import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { MatrixTable, NoPeriod, PeriodTabs, PredicateSpread, RegionBars } from "@/components/results/Panels";
import { fmt } from "@/components/results/Pieces";
import { requireUser } from "@/lib/auth";
import { ipkAcross, predicateSpread, resultsForScope, summarizeRegions } from "@/lib/data/results";
import { scopeFor } from "@/lib/data/scope";
import { pickPeriod } from "@/lib/periode";

export const metadata: Metadata = { title: "Hasil Wilayah" };

export default async function ManwilResults({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const user = await requireUser("manwil");
  const { periode } = await searchParams;
  const { periods, active } = await pickPeriod(periode);
  if (!active) {
    return (
      <>
        <div className="page-head"><h1>Hasil wilayah</h1></div>
        <NoPeriod />
      </>
    );
  }

  const results = await resultsForScope(env.DB, scopeFor(user), active.id);
  const types = results[0]?.types.map((t) => ({ code: t.code, name: t.name })) ?? [];
  const region = summarizeRegions(results)[0];
  const scored = results.filter((r) => r.types.some((t) => t.ipk !== null));

  return (
    <>
      <div className="page-head">
        <h1>Hasil wilayah {region?.region ?? ""}</h1>
        <p>{active.name}</p>
      </div>

      <PeriodTabs periods={periods} active={active.slug} basePath="/manwil/hasil" />

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Ringkasan wilayah</h2>
          <ul className="stat-list">
            <li><b>{results.length}</b> awardee</li>
            <li><b>{scored.length}</b> sudah dinilai</li>
            <li><b>{fmt(ipkAcross(results.flatMap((r) => r.types)))}</b> rata-rata IPK</li>
            <li><b>{region?.responses ?? 0}</b> respons masuk</li>
          </ul>
          <div style={{ marginTop: "1rem" }}>
            <p className="label">Sebaran predikat penilaian 360°</p>
            <PredicateSpread spread={predicateSpread(results, "external")} />
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">Rata-rata IPK per tipe penilai</h2>
          <RegionBars
            regions={types.map((t) => ({
              regionId: 0,
              region: t.name,
              awardees: results.filter((r) => (r.types.find((x) => x.code === t.code)?.responses ?? 0) > 0).length,
              responses: results.reduce((s, r) => s + (r.types.find((x) => x.code === t.code)?.responses ?? 0), 0),
              ipk: ipkAcross(results.flatMap((r) => r.types.filter((x) => x.code === t.code))),
            }))}
          />
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Awardee binaan</h2>
        <p className="section-hint">Klik nama untuk melihat rincian per kategori dan masukan yang masuk.</p>
        <MatrixTable results={results} typeCodes={types} hrefBase="/manwil/hasil" />
      </section>
    </>
  );
}
