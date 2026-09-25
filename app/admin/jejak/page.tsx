import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listAudit } from "@/lib/data/audit";
import { formatWib } from "@/lib/format";

export const metadata: Metadata = { title: "Jejak Perubahan" };

export default async function AuditPage() {
  const admin = await requireUser("admin");
  const entries = await listAudit(env.DB, admin, 200);

  return (
    <>
      <div className="page-head">
        <h1>Jejak perubahan</h1>
        <p>Siapa mengubah apa lewat konsol Admin. Jejak tidak bisa dihapus dari dalam aplikasi.</p>
      </div>

      <section className="card">
        {entries.length === 0 ? (
          <p className="section-hint" style={{ margin: 0 }}>Belum ada perubahan yang tercatat.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Waktu</th>
                  <th scope="col">Oleh</th>
                  <th scope="col">Tindakan</th>
                  <th scope="col">Perubahan</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: "nowrap" }}>{formatWib(e.at)}</td>
                    <td>{e.actorName}</td>
                    <td><code style={{ fontSize: "0.78rem" }}>{e.action}</code></td>
                    <td>{e.summary}</td>
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
