import Link from "next/link";
import { AWARDEE_STATUSES, type ProfileListRow } from "@/lib/data/profiles";
import { formatWibDate } from "@/lib/format";

// Daftar kelengkapan profil, dipakai Admin dan Manwil; yang beda hanya tujuan tautannya.
export function ProfileListTable({ rows, basePath }: { rows: ProfileListRow[]; basePath: string }) {
  const complete = rows.filter((r) => r.percent === 100).length;
  return (
    <section className="card">
      <p className="section-hint" style={{ marginTop: 0 }}>
        {complete} dari {rows.length} awardee sudah melengkapi profil.
      </p>
      <div className="table-wrap">
        <table className="table" data-collapse="1">
          <thead>
            <tr>
              <th scope="col">Awardee</th>
              <th scope="col">Wilayah</th>
              <th scope="col">Kampus</th>
              <th scope="col">Status</th>
              <th scope="col" className="num">Kelengkapan</th>
              <th scope="col">Diperbarui</th>
              <th scope="col"><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.awardeeId}>
                <td>{r.name}<br /><small className="muted">{r.batch}</small></td>
                <td>{r.region}</td>
                <td>{r.campus ?? "—"}</td>
                <td>{AWARDEE_STATUSES.find((s) => s.value === r.status)?.label ?? r.status}</td>
                <td className="num">
                  <span className={`pill ${r.percent === 100 ? "pill-ok" : r.percent === 0 ? "pill-bad" : "pill-warn"}`}>{r.percent}%</span>
                </td>
                <td>{r.updatedAt ? formatWibDate(r.updatedAt) : "Belum diisi"}</td>
                <td><Link href={`${basePath}/${r.awardeeId}`} className="btn btn-small btn-ghost">Buka</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
