import Link from "next/link";
import { BarRows, fmt, PredicateBadge } from "@/components/results/Pieces";
import type { PeriodItem } from "@/lib/data/periods";
import {
  PREDICATE_LABEL,
  type AwardeeResult,
  type FeedbackEntry,
  type Predicate,
  type PredicateCount,
  type QuestionScore,
  type RegionSummary,
} from "@/lib/data/results";

const SPREAD_COLOR: Record<string, string> = {
  cumlaude: "var(--chart-ok)",
  sangat_memuaskan: "var(--chart-info)",
  memuaskan: "var(--chart-warn)",
  perlu_peningkatan: "var(--chart-bad)",
  belum: "var(--chart-none)",
};

const keyOf = (p: Predicate | null) => p ?? "belum";
const labelOf = (p: Predicate | null) => (p ? PREDICATE_LABEL[p] : "Belum dinilai");

// Sebaran predikat: satu batang bertumpuk plus keterangan warna — pengganti donat dashboard lama.
export function PredicateSpread({ spread }: { spread: PredicateCount[] }) {
  const total = spread.reduce((s, p) => s + p.count, 0);
  if (total === 0) return <p className="section-hint" style={{ margin: 0 }}>Belum ada data.</p>;
  const shown = spread.filter((p) => p.count > 0);
  return (
    <>
      <div className="spread" role="img" aria-label={shown.map((p) => `${labelOf(p.predicate)} ${p.count}`).join(", ")}>
        {shown.map((p) => (
          <span key={keyOf(p.predicate)} style={{ width: `${(p.count / total) * 100}%`, background: SPREAD_COLOR[keyOf(p.predicate)] }} />
        ))}
      </div>
      <ul className="legend">
        {shown.map((p) => (
          <li key={keyOf(p.predicate)}>
            <i style={{ background: SPREAD_COLOR[keyOf(p.predicate)] }} aria-hidden="true" />
            {labelOf(p.predicate)} — {p.count}
          </li>
        ))}
      </ul>
    </>
  );
}

export function RegionBars({ regions }: { regions: RegionSummary[] }) {
  return (
    <BarRows
      rows={regions.map((r) => ({ label: r.region, value: r.ipk, note: `${r.awardees} awardee · ${r.responses} respons` }))}
    />
  );
}

// Pertanyaan tertinggi dan terendah — bahan percakapan pembinaan, bukan peringkat.
export function QuestionHighlights({ questions, count = 3 }: { questions: QuestionScore[]; count?: number }) {
  if (questions.length === 0) return <p className="section-hint" style={{ margin: 0 }}>Belum ada jawaban.</p>;
  const sorted = [...questions].sort((a, b) => b.average - a.average);
  const top = sorted.slice(0, count);
  const bottom = sorted.slice(-count).reverse();
  return (
    <div className="grid-2">
      <div>
        <p className="label">Nilai tertinggi</p>
        <BarRows rows={top.map((q) => ({ label: q.code, value: q.average, note: q.text }))} />
      </div>
      <div>
        <p className="label">Paling perlu perhatian</p>
        <BarRows rows={bottom.map((q) => ({ label: q.code, value: q.average, note: q.text }))} />
      </div>
    </div>
  );
}

// Saran kualitatif tanpa nama pengisi: yang ditampilkan hanya tipe penilai dan hubungannya.
// `from` memisahkan refleksi awardee sendiri (asesmen mandiri) dari masukan orang lain.
export function FeedbackList({
  entries,
  field,
  from = "all",
}: {
  entries: FeedbackEntry[];
  field: string;
  from?: "all" | "self" | "others";
}) {
  const shown = entries.filter(
    (e) => e.field === field && (from === "all" || (from === "self") === (e.audience === "self")),
  );
  if (shown.length === 0) return <p className="section-hint" style={{ margin: 0 }}>Belum ada masukan.</p>;
  return (
    <>
      {shown.map((e, i) => (
        <blockquote key={`${e.typeCode}-${i}`} className="quote">
          {e.body}
          <footer>
            {e.typeName}
            {e.relation && e.relation !== e.typeName ? ` · ${e.relation}` : ""}
          </footer>
        </blockquote>
      ))}
    </>
  );
}

// Matriks seluruh awardee dalam lingkup: satu baris per awardee, satu kolom per tipe penilai.
export function MatrixTable({
  results,
  typeCodes,
  hrefBase,
}: {
  results: AwardeeResult[];
  typeCodes: { code: string; name: string }[];
  hrefBase?: string;
}) {
  if (results.length === 0) return <p className="section-hint" style={{ margin: 0 }}>Tidak ada awardee yang cocok.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Awardee</th>
            <th scope="col">Wilayah</th>
            {typeCodes.map((t) => (
              <th key={t.code} scope="col" className="num">{t.name}</th>
            ))}
            <th scope="col">Predikat 360°</th>
          </tr>
        </thead>
        <tbody>
          {results.map((a) => {
            const external = a.types.find((t) => t.code === "external");
            return (
              <tr key={a.id}>
                <td>
                  {hrefBase ? (
                    <Link href={`${hrefBase}/${a.referralCode}`} style={{ fontWeight: 700 }}>{a.name}</Link>
                  ) : (
                    <b>{a.name}</b>
                  )}
                  {a.campus && <div className="section-hint" style={{ margin: 0 }}>{a.campus}</div>}
                </td>
                <td>{a.region}</td>
                {typeCodes.map((t) => (
                  <td key={t.code} className="num">{fmt(a.types.find((x) => x.code === t.code)?.ipk ?? null)}</td>
                ))}
                <td><PredicateBadge predicate={external?.predicate ?? null} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Pemilih periode. Tautan biasa, bukan tab berJavaScript — halaman ini dirender di server.
export function PeriodTabs({ periods, active, basePath }: { periods: PeriodItem[]; active: string; basePath: string }) {
  if (periods.length < 2) return null;
  return (
    <div className="tabs">
      {periods.map((p) => (
        <Link key={p.slug} href={`${basePath}?periode=${p.slug}`} aria-current={p.slug === active ? "page" : undefined}>
          {p.name}
        </Link>
      ))}
    </div>
  );
}

// Ditampilkan saat belum ada periode yang pernah dibuka: dashboard kosong bukan berarti ada yang salah.
export function NoPeriod() {
  return (
    <section className="card">
      <h2 className="section-title">Belum ada periode berjalan</h2>
      <p className="section-hint" style={{ margin: 0 }}>
        Hasil penilaian muncul setelah Admin membuka periode dan jawaban mulai masuk.
      </p>
    </section>
  );
}
