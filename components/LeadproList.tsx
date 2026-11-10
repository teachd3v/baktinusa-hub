import Link from "next/link";
import {
  fieldCounts,
  filterLeadpros,
  leadproOptions,
  type LeadproFilters,
  type LeadproRow,
} from "@/lib/data/leadpro";
import { AutoSearch, ParamSelect } from "./ListControls";

export type LeadproQuery = { bidang?: string; kampus?: string; wilayah?: string; angkatan?: string; cari?: string };

// Parameter alamat (bahasa Indonesia) → saringan. Angka yang tidak sah dibaca sebagai "semua".
export function parseLeadproQuery(q: LeadproQuery): LeadproFilters {
  const id = (v?: string) => (v && /^\d+$/.test(v) ? Number(v) : undefined);
  return { field: q.bidang || undefined, campusId: id(q.kampus), regionId: id(q.wilayah), batch: q.angkatan || undefined, q: q.cari || undefined };
}

// Daftar LeadPro untuk Admin dan Manwil. `rows` harus hasil listLeadpros() (sudah berlingkup); yang disaring di sini
// hanya tampilannya. Admin juga mendapat saringan wilayah; Manwil hanya punya satu wilayah, jadi saringannya disembunyikan.
export function LeadproList({
  rows,
  query,
  path,
  profilePath,
  showRegion,
}: {
  rows: LeadproRow[];
  query: LeadproQuery;
  path: string;
  profilePath: string;
  showRegion: boolean;
}) {
  const filters = parseLeadproQuery(query);
  const shown = filterLeadpros(rows, filters);
  const options = leadproOptions(rows);
  const counts = fieldCounts(shown);
  const filled = shown.filter((r) => r.name).length;
  const active = Boolean(query.bidang || query.kampus || query.wilayah || query.angkatan || query.cari);

  const current: Record<string, string> = {
    bidang: query.bidang ?? "",
    kampus: query.kampus ?? "",
    wilayah: query.wilayah ?? "",
    angkatan: query.angkatan ?? "",
    cari: query.cari ?? "",
  };
  const keepWithout = (param: string) => Object.fromEntries(Object.entries(current).filter(([key]) => key !== param));
  const withParam = (param: string, value: string) => {
    const next = new URLSearchParams();
    for (const [key, v] of Object.entries({ ...current, [param]: value })) if (v) next.set(key, v);
    const text = next.toString();
    return text ? `${path}?${text}` : path;
  };

  return (
    <>
      <section className="card">
        <p className="section-hint" style={{ marginTop: 0 }}>
          {shown.length} awardee{active ? " sesuai saringan" : ""}, {filled} sudah punya LeadPro.
        </p>
        {counts.length > 0 && (
          <div className="leadpro-chips" aria-label="Jumlah per bidang">
            {counts.map((c) => (
              <Link
                key={c.field}
                href={withParam("bidang", query.bidang === c.field ? "" : c.field)}
                className={`pill ${query.bidang === c.field ? "pill-ok" : "pill-muted"}`}
                aria-pressed={query.bidang === c.field}
              >
                {c.field} · {c.count}
              </Link>
            ))}
          </div>
        )}

        <div className="leadpro-filters">
          <AutoSearch path={path} value={current.cari} keep={keepWithout("cari")} placeholder="Cari awardee, proyek, atau kampus" label="Cari LeadPro" />
          <ParamSelect
            className="select"
            path={path}
            param="bidang"
            value={current.bidang}
            keep={keepWithout("bidang")}
            label="Saring menurut bidang"
            options={[["", "Semua bidang"], ...options.fields.map((f): [string, string] => [f, f])]}
          />
          {showRegion && (
            <ParamSelect
              className="select"
              path={path}
              param="wilayah"
              value={current.wilayah}
              keep={keepWithout("wilayah")}
              label="Saring menurut wilayah"
              options={[["", "Semua wilayah"], ...options.regions.map((r): [string, string] => [String(r.id), r.name])]}
            />
          )}
          <ParamSelect
            className="select"
            path={path}
            param="kampus"
            value={current.kampus}
            keep={keepWithout("kampus")}
            label="Saring menurut kampus"
            options={[["", "Semua kampus"], ...options.campuses.map((c): [string, string] => [String(c.id), c.name])]}
          />
          {options.batches.length > 1 && (
            <ParamSelect
              className="select"
              path={path}
              param="angkatan"
              value={current.angkatan}
              keep={keepWithout("angkatan")}
              label="Saring menurut angkatan"
              options={[["", "Semua angkatan"], ...options.batches.map((b): [string, string] => [b, b])]}
            />
          )}
          {active && <Link href={path} className="btn btn-small btn-muted">Atur ulang</Link>}
        </div>
      </section>

      <section className="card">
        {shown.length === 0 ? (
          <p className="section-hint" style={{ margin: 0 }}>Tidak ada awardee yang sesuai saringan.</p>
        ) : (
          <div className="table-wrap">
            <table className="table" data-collapse="1">
              <thead>
                <tr>
                  <th scope="col">Awardee</th>
                  {showRegion && <th scope="col">Wilayah</th>}
                  <th scope="col">Kampus</th>
                  <th scope="col">LeadPro</th>
                  <th scope="col">Bidang</th>
                  <th scope="col"><span className="sr-only">Aksi</span></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.awardeeId}>
                    <td>{r.awardee}<br /><small className="muted">{r.batch}</small></td>
                    {showRegion && <td>{r.region}</td>}
                    <td>{r.campus ?? "—"}</td>
                    <td>
                      {r.name ? (
                        <>
                          <strong>{r.name}</strong>
                          {r.description && <p className="leadpro-desc">{r.description}</p>}
                        </>
                      ) : (
                        <span className="muted">Belum diisi</span>
                      )}
                    </td>
                    <td>{r.field ? <span className="pill pill-muted">{r.field}</span> : "—"}</td>
                    <td><Link href={`${profilePath}/${r.awardeeId}`} className="btn btn-small btn-muted">Buka</Link></td>
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
