import { formatWib, formatWibDate } from "@/lib/format";
import type { AnalyticsType, CycleFacts } from "@/lib/data/analytics";
import type { PeriodItem } from "@/lib/data/periods";

// Keterangan siklus yang sedang dibaca: apa ini, kapan berjalan, jenis apa saja yang dijalankan, dan
// seberapa banyak data yang sudah masuk. Ditaruh paling atas karena semua angka di bawahnya adalah angka
// SIKLUS INI — orang yang berpindah siklus lewat dropdown perlu tahu persis sedang melihat yang mana.

// Kosakata yang sama dengan beranda Manwil dan Awardee.
const STATUS: Record<PeriodItem["status"], { label: string; tone: string }> = {
  draft: { label: "draft", tone: "pill-muted" },
  open: { label: "dibuka", tone: "pill-ok" },
  closed: { label: "ditutup", tone: "pill-muted" },
  archived: { label: "diarsipkan", tone: "pill-muted" },
};

const number = new Intl.NumberFormat("id-ID");

function schedule(p: PeriodItem): string {
  if (p.opensAt && p.closesAt) return `${formatWibDate(p.opensAt)} – ${formatWibDate(p.closesAt)}`;
  if (p.opensAt) return `dibuka ${formatWibDate(p.opensAt)}, tanpa batas tutup`;
  if (p.closesAt) return `ditutup ${formatWibDate(p.closesAt)}`;
  return "tanpa jadwal";
}

export function CycleInfo({
  period,
  types,
  facts,
  filtered,
}: {
  period: PeriodItem;
  types: AnalyticsType[];
  facts: CycleFacts;
  // Saringan sedang aktif: angka di bawah ini bukan angka keterangan ini, dan itu perlu dikatakan.
  filtered: boolean;
}) {
  const status = STATUS[period.status];
  return (
    <section className="card cycle-info" aria-label="Keterangan siklus">
      <div className="card-head">
        <h2 className="section-title">
          {period.name} <span className={`pill ${status.tone}`}>{status.label}</span>
        </h2>
      </div>

      <dl className="cycle-facts">
        <div>
          <dt>Angkatan</dt>
          <dd>{period.batch}</dd>
        </div>
        <div>
          <dt>Jadwal (WIB)</dt>
          <dd>{schedule(period)}</dd>
        </div>
        <div>
          <dt>Data masuk</dt>
          <dd>
            {number.format(facts.responses)} respons dari {number.format(facts.awardees)} awardee
          </dd>
        </div>
        <div>
          <dt>Kiriman terakhir</dt>
          <dd>{facts.lastAt ? formatWib(facts.lastAt) : "belum ada"}</dd>
        </div>
      </dl>

      <p className="label" style={{ marginTop: "0.9rem" }}>
        {types.length} jenis pengukuran dijalankan
      </p>
      {types.length === 0 ? (
        <p className="section-hint" style={{ margin: 0 }}>Belum ada jenis yang dijadwalkan di siklus ini.</p>
      ) : (
        <ul className="badges">
          {types.map((t) => (
            <li key={t.code} className="pill pill-muted" title={t.questionCount === 0 ? "Belum punya soal" : `${t.questionCount} soal`}>
              {t.code} · {t.name}
              {t.questionCount === 0 && " (belum bersoal)"}
            </li>
          ))}
        </ul>
      )}

      {filtered && (
        <p className="section-hint" style={{ marginTop: "0.8rem", marginBottom: 0 }}>
          Keterangan ini untuk seluruh siklus. Angka di bawahnya sedang mengikuti saringan.
        </p>
      )}
    </section>
  );
}
