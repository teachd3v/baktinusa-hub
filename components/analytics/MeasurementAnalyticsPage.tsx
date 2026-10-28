import { env } from "cloudflare:workers";
import Link from "next/link";
import { CascadingFilters } from "@/components/analytics/CascadingFilters";
import { MobileCollapse } from "@/components/MobileCollapse";
import { PredicateDonut } from "@/components/analytics/Charts";
import { NoPeriod, QuestionHighlights, RegionBars } from "@/components/results/Panels";
import { BarRows, PredicateBadge, fmt } from "@/components/results/Pieces";
import { requireUser } from "@/lib/auth";
import { measurementAnalytics, resolveFilter } from "@/lib/data/analytics";
import { FILLED_BY_LABEL, isFilledBy } from "@/lib/data/measurements";
import { scopeFor, type Role } from "@/lib/data/scope";
import { pickPeriod } from "@/lib/periode";
import { filterQuery, readFilter, type FilterParams } from "./readFilter";

// Sub analitik: satu jenis pengukuran dibedah — per soal, per wilayah, lalu per awardee.
//
// Rata-rata per soal di sini dihitung LINTAS awardee, dan itulah yang tidak bisa dibaca dari halaman
// Hasil: di sana rincian per soal selalu milik satu orang. Pertanyaan "soal mana yang paling lemah
// se-wilayah" hanya terjawab di halaman ini.

export async function MeasurementAnalyticsPage({
  role,
  basePath,
  params,
  searchParams,
}: {
  role: Exclude<Role, "awardee">;
  basePath: string;
  params: Promise<{ kode: string }>;
  searchParams: Promise<FilterParams & { periode?: string }>;
}) {
  const user = await requireUser(role);
  const scope = scopeFor(user);
  const [{ kode }, query] = await Promise.all([params, searchParams]);
  const { periods, active } = await pickPeriod(query.periode);
  if (!active) {
    return (
      <>
        <div className="page-head"><h1>Analitik</h1></div>
        <NoPeriod />
      </>
    );
  }

  // Jenis ada di alamat halaman ini, jadi tidak ikut dibawa sebagai saringan.
  const { filter, types: semua, regions, awardees } = await resolveFilter(env.DB, scope, active.id, {
    ...readFilter(query),
    code: null,
  });
  const data = await measurementAnalytics(env.DB, scope, active.id, kode, filter);

  const q = filterQuery(active.slug, filter);
  const hrefOf = (code: string) => `${basePath}/${code.toLowerCase()}?${q}`;
  const cycles = periods.map((p) => ({ slug: p.slug, name: p.name }));

  // Jenis ini tidak dijalankan di siklus yang sedang dipilih — biasanya karena siklusnya baru saja diganti
  // lewat dropdown dari halaman jenis lain. 404 akan terasa seperti galat; penjelasan dengan jalan keluar
  // (tab jenis yang ada, dan dropdown siklus untuk kembali) jauh lebih ramah.
  if (!data) {
    return (
      <>
        <div className="page-head">
          <Link href={`${basePath}?${q}`} className="back-link">Kembali ke analitik</Link>
          <h1>{kode.toUpperCase()}</h1>
          <p>{active.name}</p>
        </div>

        <section className="card">
          <div className="card-head"><h2 className="section-title">Pilih siklus</h2></div>
          <CascadingFilters
            cycles={cycles}
            types={semua}
            regions={regions}
            awardees={awardees}
            values={filter}
            periode={active.slug}
            showTypes={false}
          />
        </section>

        <section className="card">
          <h2 className="section-title">Jenis ini tidak dijalankan di {active.name}</h2>
          <p className="section-hint">
            {semua.length === 0
              ? "Siklus ini belum menjalankan jenis pengukuran apa pun."
              : "Siklus ini hanya menjalankan jenis berikut. Pilih salah satu, atau ganti siklusnya di atas."}
          </p>
          {semua.length > 0 && (
            <div className="tabs">
              {semua.map((t) => (
                <Link key={t.code} href={hrefOf(t.code)}>{t.name}</Link>
              ))}
            </div>
          )}
        </section>
      </>
    );
  }

  // Target hanya berarti untuk jenis yang memang memasang target.
  const target =
    data.targetRule === "fixed" ? `${data.targetMin} responden per awardee`
    : data.targetRule === "region_peers" ? "semua awardee lain se-wilayah"
    : null;
  const belumDinilai = data.awardees - data.scored;

  return (
    <>
      <div className="page-head">
        <Link href={`${basePath}?${q}`} className="back-link">Kembali ke analitik</Link>
        <h1>{data.name}</h1>
        <p>
          {data.code}, diisi oleh {isFilledBy(data.filledBy) ? FILLED_BY_LABEL[data.filledBy] : data.filledBy}, {active.name}
        </p>
      </div>

      {/* Pindah antar jenis tanpa kehilangan saringan yang sedang dipakai. */}
      <div className="tabs">
        {semua.map((t) => (
          <Link key={t.code} href={hrefOf(t.code)} aria-current={t.code === data.code ? "page" : undefined}>
            {t.name}
          </Link>
        ))}
      </div>

      <section className="card">
        <MobileCollapse summary={<h2 className="section-title">Saring data{filter.regionId !== null || filter.awardeeId !== null ? " (aktif)" : ""}</h2>}>
          {(filter.regionId !== null || filter.awardeeId !== null) && (
            <p style={{ margin: "0 0 var(--gap-sm)" }}>
              <Link className="btn btn-muted btn-small btn-inline" href={`${basePath}/${data.code.toLowerCase()}?periode=${active.slug}`}>
                Hapus saringan
              </Link>
            </p>
          )}
          <CascadingFilters
            cycles={cycles}
            types={semua}
            regions={regions}
            awardees={awardees}
            values={filter}
            periode={active.slug}
            showTypes={false}
          />
        </MobileCollapse>
      </section>

      <section className="card">
        <h2 className="section-title">Ringkasan</h2>
        <ul className="stat-list">
          <li><b>{data.awardees}</b> awardee</li>
          <li><b>{data.scored}</b> sudah dinilai</li>
          <li><b>{belumDinilai}</b> belum dinilai</li>
          <li><b>{data.responses}</b> respons masuk</li>
          <li><b>{fmt(data.ipk)}</b> rata-rata IPK</li>
          <li><b>{data.questionCount}</b> soal</li>
        </ul>
        {target && <p className="section-hint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>Target: {target}.</p>}
      </section>

      {data.questionCount === 0 ? (
        <section className="card">
          <h2 className="section-title">Kuesionernya masih kosong</h2>
          <p className="section-hint" style={{ margin: 0 }}>
            Jenis ini dijadwalkan siklus {active.name}, tetapi belum punya satu soal pun, jadi tidak akan
            pernah menghasilkan nilai. Isi soalnya dari menu Pengukuran.
          </p>
        </section>
      ) : data.scored === 0 ? (
        <section className="card">
          <h2 className="section-title">Belum ada jawaban</h2>
          <p className="section-hint" style={{ margin: 0 }}>
            {filter.regionId !== null || filter.awardeeId !== null
              ? "Tidak ada awardee yang lolos saringan ini sudah dinilai. Coba longgarkan saringannya."
              : "Angka akan muncul begitu penilaian pertama masuk."}
          </p>
        </section>
      ) : (
        <>
          <div className="grid-2">
            <section className="card">
              <h2 className="section-title">Sebaran predikat</h2>
              <PredicateDonut spread={data.spread} />
            </section>

            <section className="card">
              <h2 className="section-title">Rata-rata IPK per wilayah</h2>
              {data.regions.length <= 1 ? (
                <p className="section-hint" style={{ margin: 0 }}>Hanya satu wilayah dalam lingkup ini.</p>
              ) : (
                <RegionBars
                  regions={data.regions.map((r) => ({
                    regionId: r.regionId,
                    region: r.region,
                    awardees: r.awardees,
                    responses: r.responses,
                    ipk: r.ipk,
                  }))}
                />
              )}
            </section>
          </div>

          <section className="card">
            <h2 className="section-title">Soal terkuat &amp; terlemah</h2>
            <p className="section-hint hide-mobile">Rata-rata lintas awardee, bahan untuk memilih fokus pembinaan.</p>
            <QuestionHighlights questions={data.questions} />
          </section>

          <section className="card">
            <h2 className="section-title">Semua soal</h2>
            <p className="section-hint hide-mobile">{data.questions.length} soal, urut sesuai kuesioner.</p>
            <BarRows rows={data.questions.map((q2) => ({ label: q2.code, value: q2.average, note: q2.text }))} />
          </section>
        </>
      )}

      <section className="card">
        <h2 className="section-title">Awardee</h2>
        <p className="section-hint">
          {data.rows.length} awardee dalam lingkup dan saringan ini. Yang belum dinilai sengaja tetap
          ditampilkan. Kosongnya itu sendiri yang perlu ditindaklanjuti.
        </p>
        {data.rows.length === 0 ? (
          <p className="section-hint" style={{ margin: 0 }}>Tidak ada awardee yang cocok dengan saringan.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Awardee</th>
                  <th scope="col">Wilayah</th>
                  <th scope="col" className="num">Respons</th>
                  <th scope="col" className="num">IPK</th>
                  <th scope="col">Predikat</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <th scope="row" style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, fontSize: "0.88rem" }}>
                      {r.name}
                    </th>
                    <td>{r.region}</td>
                    <td className="num">{r.responses}</td>
                    <td className="num"><b>{fmt(r.ipk)}</b></td>
                    <td><PredicateBadge predicate={r.predicate} /></td>
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
