import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { CollapseCard } from "@/components/CollapseCard";
import { MatrixTable, NoPeriod, PeriodTabs, PredicateSpread, RegionBars } from "@/components/results/Panels";
import { fmt } from "@/components/results/Pieces";
import { requireUser } from "@/lib/auth";
import { ipkAcross, predicateSpread, publicTypesOf, resultsForScope, summarizeRegions } from "@/lib/data/results";
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
  // Jenis publik siklus ini — yang dulu dicari dengan kode mati 'external'. Bisa lebih dari satu:
  // Siklus Tengah menjalankan PU dan LA berdampingan, jadi masing-masing dapat sebarannya sendiri.
  const publicTypes = publicTypesOf(results[0]?.types ?? []);

  return (
    <>
      <div className="page-head">
        <h1>Hasil wilayah {region?.region ?? ""}</h1>
        <p>{active.name}</p>
      </div>

      <PeriodTabs periods={periods} active={active.slug} basePath="/manwil/hasil" />

      <div className="grid-2">
        <CollapseCard title="Ringkasan wilayah" openMobile>
          <ul className="stat-list">
            <li><b>{results.length}</b> awardee</li>
            <li><b>{scored.length}</b> sudah dinilai</li>
            <li><b>{fmt(ipkAcross(results.flatMap((r) => r.types)))}</b> rata-rata IPK</li>
            <li><b>{region?.responses ?? 0}</b> respons masuk</li>
          </ul>
          <div style={{ marginTop: "1rem" }}>
            {publicTypes.length === 0 ? (
              <>
                <p className="label">Sebaran predikat penilaian 360°</p>
                <p className="section-hint" style={{ margin: 0 }}>Siklus ini belum menjalankan jenis pengukuran publik.</p>
              </>
            ) : (
              publicTypes.map((t) => (
                <div key={t.code} style={{ marginBottom: "1rem" }}>
                  <p className="label">Sebaran predikat {t.name}</p>
                  <PredicateSpread spread={predicateSpread(results, t.code)} />
                </div>
              ))
            )}
          </div>
        </CollapseCard>

        <CollapseCard title="Rata-rata IPK per tipe penilai">
          <RegionBars
            regions={types.map((t) => ({
              regionId: 0,
              region: t.name,
              awardees: results.filter((r) => (r.types.find((x) => x.code === t.code)?.responses ?? 0) > 0).length,
              responses: results.reduce((s, r) => s + (r.types.find((x) => x.code === t.code)?.responses ?? 0), 0),
              ipk: ipkAcross(results.flatMap((r) => r.types.filter((x) => x.code === t.code))),
            }))}
          />
        </CollapseCard>
      </div>

      <CollapseCard title="Awardee binaan" openMobile>
        <p className="section-hint hide-mobile">
          Klik nama untuk melihat rincian per soal dan masukan yang masuk.{" "}
          <a href={`/api/ekspor/matriks?periode=${active.slug}`}>Unduh matriks wilayah (CSV)</a>.
        </p>
        <MatrixTable results={results} typeCodes={types} hrefBase="/manwil/hasil" />
      </CollapseCard>
    </>
  );
}
