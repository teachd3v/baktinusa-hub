import { PREDICATE_LABEL, type Predicate, type PredicateCount } from "@/lib/data/results";

// Grafik dashboard: SVG yang dirender di server, tanpa library dan tanpa JavaScript di sisi klien —
// aturan yang sama dipegang seluruh halaman hasil. Warnanya selalu dari token --chart-*, jadi tema
// gelap maupun terang mengikuti satu sumber.
//
// Angka tidak pernah disampaikan lewat warna saja: tiap grafik punya keterangan bertulisan di sebelahnya,
// dan pembaca layar mendapat ringkasan lewat role="img" + aria-label.

const COLOR: Record<string, string> = {
  cumlaude: "var(--chart-ok)",
  sangat_memuaskan: "var(--chart-info)",
  memuaskan: "var(--chart-warn)",
  perlu_peningkatan: "var(--chart-bad)",
  belum: "var(--chart-none)",
};

const keyOf = (p: Predicate | null) => p ?? "belum";
const labelOf = (p: Predicate | null) => (p ? PREDICATE_LABEL[p] : "Belum dinilai");

// ---------- donat sebaran predikat ----------

const TAU = Math.PI * 2;
const R = 54;
const THICK = 22;

// Busur sebagai path: dua lengkung lingkaran yang disambung, bukan stroke-dasharray — dengan begitu
// tiap potongan bisa diberi warna sendiri tanpa saling menimpa di sambungannya.
function arc(from: number, to: number) {
  const outer = R;
  const inner = R - THICK;
  const p = (radius: number, t: number) => [60 + radius * Math.sin(t * TAU), 60 - radius * Math.cos(t * TAU)];
  const besar = to - from > 0.5 ? 1 : 0;
  const [x1, y1] = p(outer, from);
  const [x2, y2] = p(outer, to);
  const [x3, y3] = p(inner, to);
  const [x4, y4] = p(inner, from);
  return `M ${x1} ${y1} A ${outer} ${outer} 0 ${besar} 1 ${x2} ${y2} L ${x3} ${y3} A ${inner} ${inner} 0 ${besar} 0 ${x4} ${y4} Z`;
}

export function PredicateDonut({ spread, center }: { spread: PredicateCount[]; center?: { value: string; label: string } }) {
  const shown = spread.filter((p) => p.count > 0);
  const total = shown.reduce((s, p) => s + p.count, 0);
  if (total === 0) return <p className="section-hint" style={{ margin: 0 }}>Belum ada data.</p>;

  let mulai = 0;
  const potongan = shown.map((p) => {
    const dari = mulai;
    mulai += p.count / total;
    // Satu-satunya potongan: lingkaran penuh, karena busur 0→1 berakhir di titik yang sama dengan awalnya.
    return { ...p, d: shown.length === 1 ? null : arc(dari, mulai) };
  });

  return (
    <div className="chart-donut">
      <svg viewBox="0 0 120 120" role="img" aria-label={shown.map((p) => `${labelOf(p.predicate)} ${p.count}`).join(", ")}>
        {potongan.map((p) =>
          p.d === null ? (
            <circle key={keyOf(p.predicate)} cx="60" cy="60" r={R - THICK / 2} fill="none" stroke={COLOR[keyOf(p.predicate)]} strokeWidth={THICK} />
          ) : (
            <path key={keyOf(p.predicate)} d={p.d} fill={COLOR[keyOf(p.predicate)]} />
          ),
        )}
        <text x="60" y="58" textAnchor="middle" className="chart-donut-value">{center?.value ?? total}</text>
        <text x="60" y="74" textAnchor="middle" className="chart-donut-label">{center?.label ?? "awardee"}</text>
      </svg>
      <ul className="legend">
        {shown.map((p) => (
          <li key={keyOf(p.predicate)}>
            <i style={{ background: COLOR[keyOf(p.predicate)] }} aria-hidden="true" />
            {labelOf(p.predicate)}: <b>{p.count}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- batang tegak berskala ----------

export type Column = { label: string; value: number | null; note?: string };

// Batang tegak dengan garis bantu, untuk membandingkan sedikit hal berdampingan (jenis pengukuran,
// wilayah). Untuk daftar panjang berlabel kalimat, BarRows mendatar tetap lebih terbaca.
export function ColumnChart({ columns, max = 4, ticks = 4 }: { columns: Column[]; max?: number; ticks?: number }) {
  const ada = columns.filter((c) => c.value !== null);
  if (ada.length === 0) return <p className="section-hint" style={{ margin: 0 }}>Belum ada nilai untuk digambar.</p>;

  const garis = Array.from({ length: ticks + 1 }, (_, i) => (max / ticks) * i);

  return (
    <div
      className="chart-columns"
      role="img"
      aria-label={columns.map((c) => `${c.label} ${c.value === null ? "belum dinilai" : c.value.toFixed(2)}`).join(", ")}
    >
      <div className="chart-grid" aria-hidden="true">
        {[...garis].reverse().map((g) => (
          <span key={g}><i>{g.toFixed(g % 1 === 0 ? 0 : 1)}</i></span>
        ))}
      </div>
      <div className="chart-plot">
        {columns.map((c) => (
          <div key={c.label} className="chart-col">
            <span className="chart-col-track">
              <span
                className="chart-col-fill"
                style={{ height: `${c.value === null ? 0 : Math.max(1, Math.min(100, (c.value / max) * 100))}%` }}
              >
                <span className="chart-col-value">{c.value === null ? "belum ada" : c.value.toFixed(2)}</span>
              </span>
            </span>
            <span className="chart-col-label">
              {c.label}
              {c.note && <small>{c.note}</small>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- kartu angka besar ----------

export function ScoreCards({ cards, columns }: { cards: { label: string; value: string; note?: string }[]; columns?: 3 }) {
  return (
    <div className={columns === 3 ? "score-grid score-grid-3" : "score-grid"}>
      {cards.map((c) => (
        <div key={c.label} className="score-tile">
          <span className="score-label">{c.label}</span>
          <b className="score-value">{c.value}</b>
          {c.note && <span className="score-note">{c.note}</span>}
        </div>
      ))}
    </div>
  );
}
