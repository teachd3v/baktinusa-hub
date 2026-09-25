import Link from "next/link";
import { PREDICATE_LABEL, type CategoryScore, type Predicate, type TypeResult } from "@/lib/data/results";

// Batang dibuat dari div, bukan SVG: ikut lebar kartu, tetap tajam di layar apa pun, dan tanpa JavaScript.

const PILL: Record<Predicate, string> = {
  cumlaude: "pill-ok",
  sangat_memuaskan: "pill-info",
  memuaskan: "pill-warn",
  perlu_peningkatan: "pill-bad",
};

export const fmt = (n: number | null, digits = 2) => (n === null ? "—" : n.toFixed(digits));

export function PredicateBadge({ predicate }: { predicate: Predicate | null }) {
  if (!predicate) return <span className="pill pill-muted">belum dinilai</span>;
  return <span className={`pill ${PILL[predicate]}`}>{PREDICATE_LABEL[predicate]}</span>;
}

// Satu batang skala 0–max. Nilai kosong ditampilkan sebagai jalur kosong, bukan batang nol.
export function Bar({ value, max = 4, tone = "accent" }: { value: number | null; max?: number; tone?: "accent" | "muted" }) {
  const pct = value === null ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <span className="bar" aria-hidden="true">
      <span className={`bar-fill bar-${tone}`} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function BarRows({
  rows,
  max = 4,
  digits = 2,
}: {
  rows: { label: string; value: number | null; note?: string }[];
  max?: number;
  digits?: number;
}) {
  return (
    <div className="bar-rows">
      {rows.map((r) => (
        <div key={r.label} className="bar-row">
          <span className="bar-label">
            {r.label}
            {r.note && <small>{r.note}</small>}
          </span>
          <Bar value={r.value} max={max} />
          <b className="bar-value">{fmt(r.value, digits)}</b>
        </div>
      ))}
    </div>
  );
}

// Kartu IPK per tipe penilai: angka besar, predikat, dan jumlah responden yang menyusunnya.
export function TypeCards({ types, hrefOf }: { types: TypeResult[]; hrefOf?: (t: TypeResult) => string | null }) {
  return (
    <div className="score-grid">
      {types.map((t) => {
        const href = hrefOf?.(t) ?? null;
        const body = (
          <>
            <span className="score-label">{t.name}</span>
            <b className="score-value">{fmt(t.ipk)}</b>
            <PredicateBadge predicate={t.predicate} />
            <span className="score-note">{t.responses} responden</span>
          </>
        );
        return href ? (
          <Link key={t.code} className="score-card score-link" href={href}>{body}</Link>
        ) : (
          <div key={t.code} className="score-card">{body}</div>
        );
      })}
    </div>
  );
}

// Perbandingan kategori antar sudut pandang. Kolom = tipe penilai, baris = kategori.
export function CategoryTable({ types }: { types: TypeResult[] }) {
  const shown = types.filter((t) => t.ipk !== null);
  if (shown.length === 0) return <p className="section-hint" style={{ margin: 0 }}>Belum ada nilai untuk dibandingkan.</p>;
  const categories = shown[0]!.categories;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th scope="col">Kategori</th>
            {shown.map((t) => (
              <th key={t.code} scope="col" className="num">{t.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {categories.map((c: CategoryScore) => (
            <tr key={c.id}>
              <th scope="row" style={{ fontWeight: 600, textTransform: "none", letterSpacing: 0, fontSize: "0.88rem", color: "var(--ink)" }}>
                {c.name}
              </th>
              {shown.map((t) => (
                <td key={t.code} className="num">{fmt(t.categories.find((x) => x.id === c.id)?.average ?? null)}</td>
              ))}
            </tr>
          ))}
          <tr>
            <th scope="row" style={{ fontWeight: 800, textTransform: "none", letterSpacing: 0, fontSize: "0.88rem", color: "var(--ink)" }}>IPK</th>
            {shown.map((t) => (
              <td key={t.code} className="num"><b>{fmt(t.ipk)}</b></td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
