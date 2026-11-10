import type { Completeness } from "@/lib/data/profiles";

// Persen kelengkapan profil plus daftar yang masih kosong. Hanya penanda: tidak menghalangi apa pun.
export function ProfileProgress({ value, showMissing = true }: { value: Completeness; showMissing?: boolean }) {
  const complete = value.percent === 100;
  return (
    <div>
      <div className="bar-row" style={{ gridTemplateColumns: "1fr auto" }}>
        <span className="bar" role="progressbar" aria-valuenow={value.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Kelengkapan profil">
          <span className={`bar-fill ${complete ? "bar-ink" : "bar-accent"}`} style={{ width: `${value.percent}%` }} />
        </span>
        <span className="bar-value">{value.percent}%</span>
      </div>
      {showMissing && !complete && (
        <p className="section-hint" style={{ margin: "0.6rem 0 0" }}>Belum diisi: {value.missing.join(", ")}.</p>
      )}
    </div>
  );
}
