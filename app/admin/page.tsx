import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAwardees } from "@/lib/data/awardees";
import { listPeriods } from "@/lib/data/periods";
import { scopeFor } from "@/lib/data/scope";
import { listUsers } from "@/lib/data/users";
import { formatWib } from "@/lib/format";

export const metadata: Metadata = { title: "Ringkasan Admin" };

const STATUS = {
  draft: { label: "draft", tone: "pill-muted" },
  open: { label: "dibuka", tone: "pill-ok" },
  closed: { label: "ditutup", tone: "pill-warn" },
  archived: { label: "diarsipkan", tone: "pill-muted" },
} as const;

export default async function AdminHome() {
  const user = await requireUser("admin");
  const [awardees, periods, users] = await Promise.all([
    listAwardees(env.DB, scopeFor(user)),
    listPeriods(env.DB),
    listUsers(env.DB, user),
  ]);

  const perRegion = new Map<string, number>();
  for (const a of awardees) perRegion.set(a.region, (perRegion.get(a.region) ?? 0) + 1);
  const count = (role: string) => users.filter((u) => u.role === role && u.status === "active").length;
  const awardeesWithAccount = users.filter((u) => u.role === "awardee").length;

  return (
    <>
      <div className="page-head">
        <h1>Ringkasan nasional</h1>
        <p>{awardees.length} awardee di {perRegion.size} wilayah</p>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Akun</h2>
          <ul className="stat-list">
            <li><b>{count("admin")}</b> Admin</li>
            <li><b>{count("manwil")}</b> Manwil</li>
            <li><b>{count("awardee")}</b> Awardee</li>
          </ul>
          <p className="section-hint" style={{ margin: "0.75rem 0 1rem" }}>
            {awardeesWithAccount} dari {awardees.length} awardee sudah punya akun. {perRegion.size - count("manwil") > 0 ? `${perRegion.size - count("manwil")} wilayah belum punya akun Manwil.` : ""}
          </p>
          <Link className="btn" href="/admin/pengguna" style={{ display: "inline-block", padding: "0.6rem 1.2rem" }}>Kelola pengguna</Link>
        </section>

        <section className="card">
          <h2 className="section-title">Periode penilaian</h2>
          <div className="table-wrap">
            <table className="table">
              <tbody>
                {periods.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b></td>
                    <td><span className={`pill ${STATUS[p.status].tone}`}>{STATUS[p.status].label}</span></td>
                    <td className="section-hint" style={{ margin: 0 }}>{p.closesAt ? `tutup ${formatWib(p.closesAt)}` : "tanpa jadwal"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="section-hint" style={{ margin: "0.75rem 0 0" }}>Membuka dan menjadwalkan periode dari sini hadir di Fase 5.</p>
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Awardee per wilayah</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Wilayah</th>
                <th scope="col" className="num">Awardee</th>
              </tr>
            </thead>
            <tbody>
              {[...perRegion].map(([region, n]) => (
                <tr key={region}>
                  <td>{region}</td>
                  <td className="num">{n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
