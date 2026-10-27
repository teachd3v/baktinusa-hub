import { env } from "cloudflare:workers";
import Link from "next/link";
import { CascadingFilters } from "@/components/analytics/CascadingFilters";
import { ColumnChart, PredicateDonut, ScoreCards } from "@/components/analytics/Charts";
import { CycleInfo } from "@/components/analytics/CycleInfo";
import { NoPeriod, QuestionHighlights, RegionBars } from "@/components/results/Panels";
import { fmt } from "@/components/results/Pieces";
import { requireUser } from "@/lib/auth";
import { analyticsDashboard, cycleFacts, measurementAnalytics, resolveFilter } from "@/lib/data/analytics";
import { FILLED_BY_LABEL, isFilledBy } from "@/lib/data/measurements";
import { scopeFor, type Role } from "@/lib/data/scope";
import { pickPeriod } from "@/lib/periode";
import { filterQuery, readFilter, type FilterParams } from "./readFilter";

// Dashboard analitik: satu siklus dibaca per JENIS pengukuran.
//
// Bedanya dengan Hasil: Hasil menjawab "bagaimana awardee ini?", Analitik menjawab "bagaimana
// pengukuran ini berjalan?".
//
// Susunannya mengikuti urutan orang membaca: empat angka besar dulu, lalu saringan untuk mempersempit,
// baru grafiknya. Memilih satu pengukuran di saringan mengubah halaman ini dari perbandingan antar
// jenis menjadi bedah satu jenis — angka besarnya ikut bicara tentang jenis itu saja.

export async function AnalyticsOverview({
  role,
  basePath,
  searchParams,
}: {
  role: Exclude<Role, "awardee">;
  basePath: string;
  searchParams: Promise<FilterParams & { periode?: string }>;
}) {
  const user = await requireUser(role);
  const scope = scopeFor(user);
  const params = await searchParams;
  const { periods, active } = await pickPeriod(params.periode);

  if (!active) {
    return (
      <>
        <div className="page-head"><h1>Analitik</h1></div>
        <NoPeriod />
      </>
    );
  }

  // Saringan dicocokkan dulu dengan pilihan yang benar-benar tersedia di siklus ini (lihat resolveFilter),
  // supaya angka yang dihitung selalu sama dengan yang ditunjukkan dropdown.
  const { filter, types: semuaJenis, regions, awardees } = await resolveFilter(env.DB, scope, active.id, readFilter(params));
  const [{ types, totals }, facts, rinci] = await Promise.all([
    analyticsDashboard(env.DB, scope, active.id, filter),
    cycleFacts(env.DB, scope, active.id),
    // Satu jenis dipilih → tarik rinciannya: per soal dan per wilayah.
    filter.code ? measurementAnalytics(env.DB, scope, active.id, filter.code, filter) : Promise.resolve(null),
  ]);
  const q = filterQuery(active.slug, filter);
  const disaring = filter.code !== null || filter.regionId !== null || filter.awardeeId !== null;
  const bersoal = types.filter((t) => t.questionCount > 0);
  const belumBersoal = semuaJenis.filter((t) => t.questionCount === 0);

  return (
    <>
      <div className="page-head">
        <h1>Analitik</h1>
        <p>
          {active.name}
          {rinci ? `, ${rinci.name} (${rinci.code})` : `, ${semuaJenis.length} jenis pengukuran`}
        </p>
      </div>

      <CycleInfo period={active} types={semuaJenis} facts={facts} filtered={disaring} />

      <ScoreCards
        cards={[
          { label: "Total Awardee", value: String(totals.awardees), note: active.batch },
          { label: "Total Wilayah", value: String(totals.regions), note: totals.regions === 1 ? "wilayah" : "wilayah terwakili" },
          { label: "Total Responden", value: String(totals.responses), note: rinci ? rinci.name : "semua pengukuran" },
          { label: "Rata-rata IPK", value: fmt(totals.ipk), note: "skala 0 sampai 4" },
        ]}
      />

      <section className="card" style={{ marginTop: "var(--gap-md)" }}>
        <div className="card-head">
          <h2 className="section-title">Saring data</h2>
          {disaring && (
            <Link className="btn btn-muted btn-small btn-inline" href={`${basePath}?periode=${active.slug}`}>
              Hapus saringan
            </Link>
          )}
        </div>
        <CascadingFilters
          cycles={periods.map((p) => ({ slug: p.slug, name: p.name }))}
          types={semuaJenis}
          regions={regions}
          awardees={awardees}
          values={filter}
          periode={active.slug}
        />
        <p className="section-hint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
          Semua angka di bawah dihitung ulang dari data yang lolos saringan, bukan sekadar disembunyikan.
        </p>
      </section>

      {semuaJenis.length === 0 ? (
        <section className="card">
          <h2 className="section-title">Siklus ini belum menjalankan jenis pengukuran</h2>
          <p className="section-hint" style={{ margin: 0 }}>
            Tambahkan jenisnya dari menu Siklus, lalu grafiknya akan muncul di sini.
          </p>
        </section>
      ) : rinci ? (
        <SatuJenis rinci={rinci} basePath={basePath} query={q} />
      ) : (
        <SemuaJenis types={bersoal} />
      )}

      {belumBersoal.length > 0 && (
        <section className="card">
          <h2 className="section-title">Belum punya soal</h2>
          <p className="section-hint" style={{ margin: 0 }}>
            {belumBersoal.map((t) => t.name).join(", ")} dijadwalkan siklus ini tetapi kuesionernya masih
            kosong, jadi tidak akan pernah menghasilkan nilai. Isi dari menu Pengukuran.
          </p>
        </section>
      )}
    </>
  );
}

// ---------- tanpa saringan jenis: bandingkan antar pengukuran ----------

function SemuaJenis({ types }: { types: Awaited<ReturnType<typeof analyticsDashboard>>["types"] }) {
  if (types.length === 0) {
    return (
      <section className="card">
        <h2 className="section-title">Belum ada jenis yang punya soal</h2>
        <p className="section-hint" style={{ margin: 0 }}>Isi kuesionernya dulu dari menu Pengukuran.</p>
      </section>
    );
  }

  return (
    <>
      <section className="card">
        <h2 className="section-title">IPK per jenis pengukuran</h2>
        <p className="section-hint">
          Tiap awardee berbobot sama, jadi yang respondennya berpuluh tidak menenggelamkan yang baru punya dua.
        </p>
        <ColumnChart
          columns={types.map((t) => ({ label: t.code, value: t.ipk, note: `${t.scored}/${t.awardees} dinilai` }))}
        />
      </section>

      <div className="chart-cards">
        {types.map((t) => (
          <section key={t.code} className="card">
            <h2 className="section-title">{t.name}</h2>
            <p className="section-hint">
              {isFilledBy(t.filledBy) ? FILLED_BY_LABEL[t.filledBy] : t.filledBy}, {t.responses} respons, IPK {fmt(t.ipk)}
            </p>
            <PredicateDonut spread={t.spread} center={{ value: fmt(t.ipk), label: "IPK" }} />
          </section>
        ))}
      </div>
    </>
  );
}

// ---------- satu jenis dipilih: bedah soal & wilayahnya ----------

function SatuJenis({
  rinci,
  basePath,
  query,
}: {
  rinci: NonNullable<Awaited<ReturnType<typeof measurementAnalytics>>>;
  basePath: string;
  query: URLSearchParams;
}) {
  if (rinci.questionCount === 0) {
    return (
      <section className="card">
        <h2 className="section-title">Kuesionernya masih kosong</h2>
        <p className="section-hint" style={{ margin: 0 }}>
          {rinci.name} dijadwalkan siklus ini tetapi belum punya satu soal pun. Isi dari menu Pengukuran.
        </p>
      </section>
    );
  }
  if (rinci.scored === 0) {
    return (
      <section className="card">
        <h2 className="section-title">Belum ada jawaban</h2>
        <p className="section-hint" style={{ margin: 0 }}>
          Tidak ada awardee yang lolos saringan ini sudah dinilai pada {rinci.name}. Coba longgarkan saringannya.
        </p>
      </section>
    );
  }

  return (
    <>
      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Sebaran predikat</h2>
          <p className="section-hint">{rinci.scored} dari {rinci.awardees} awardee sudah dinilai.</p>
          <PredicateDonut spread={rinci.spread} center={{ value: fmt(rinci.ipk), label: "IPK" }} />
        </section>

        <section className="card">
          <h2 className="section-title">IPK per wilayah</h2>
          {rinci.regions.length <= 1 ? (
            <p className="section-hint" style={{ margin: 0 }}>Hanya satu wilayah dalam lingkup dan saringan ini.</p>
          ) : (
            <RegionBars regions={rinci.regions.map((r) => ({ ...r }))} />
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Soal terkuat &amp; terlemah</h2>
        <p className="section-hint">
          Rata-rata lintas awardee. Inilah yang tidak bisa dibaca dari halaman Hasil, karena di sana
          rincian per soal selalu milik satu orang.
        </p>
        <QuestionHighlights questions={rinci.questions} />
      </section>

      <section className="card">
        <div className="card-head">
          <h2 className="section-title">Rincian lengkap</h2>
          <Link className="btn btn-small btn-inline" href={`${basePath}/${rinci.code.toLowerCase()}?${query}`}>
            Buka {rinci.code}
          </Link>
        </div>
        <p className="section-hint" style={{ margin: 0 }}>
          Semua {rinci.questions.length} soal berurutan dan daftar {rinci.awardees} awardee beserta predikatnya.
        </p>
      </section>
    </>
  );
}
