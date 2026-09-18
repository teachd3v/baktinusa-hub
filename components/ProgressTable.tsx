import type { AwardeeProgress, TypeProgress } from "@/lib/data/awardees";

function Status({ type }: { type: TypeProgress }) {
  if (type.target === null) return <span className="pill pill-muted">{type.count} masuk</span>;
  const tone = type.count >= type.target ? "pill-ok" : type.count > 0 ? "pill-warn" : "pill-bad";
  const label = type.count >= type.target ? "terpenuhi" : type.count > 0 ? "sebagian" : "belum ada";
  return (
    <span className={`pill ${tone}`} title={label}>
      {type.count} / {type.target}
      <span className="sr-only"> — {label}</span>
    </span>
  );
}

// Satu baris per awardee, satu kolom per tipe penilai di periode itu.
export function ProgressTable({ rows, showAwardee = true }: { rows: AwardeeProgress[]; showAwardee?: boolean }) {
  const types = rows[0]?.types ?? [];
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {showAwardee && <th scope="col">Awardee</th>}
            {types.map((t) => (
              <th key={t.code} scope="col">{t.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {showAwardee && (
                <td>
                  <b>{row.name}</b>
                  {row.campus && <div className="section-hint" style={{ margin: 0 }}>{row.campus}</div>}
                </td>
              )}
              {row.types.map((t) => (
                <td key={t.code}><Status type={t} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
