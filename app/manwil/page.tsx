import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { ProgressTable } from "@/components/ProgressTable";
import { requireUser } from "@/lib/auth";
import { listTasks } from "@/lib/data/evaluations";
import { listAwardees, progressForScope } from "@/lib/data/awardees";
import { isRunningOrDone, listPeriods } from "@/lib/data/periods";
import { scopeFor } from "@/lib/data/scope";
import { publicOrigin } from "@/lib/origin";

export const metadata: Metadata = { title: "Wilayah saya" };

export default async function ManwilHome() {
  const user = await requireUser("manwil");
  const scope = scopeFor(user);
  const tasks = await listTasks(env.DB, user);
  const pending = tasks.filter((t) => !t.submitted).length;
  const awardees = await listAwardees(env.DB, scope);
  const periods = (await listPeriods(env.DB)).filter(isRunningOrDone);
  const progress = await Promise.all(periods.map(async (period) => ({ period, rows: await progressForScope(env.DB, scope, period.id) })));
  const origin = await publicOrigin();

  return (
    <>
      <div className="page-head">
        <h1>Wilayah {awardees[0]?.region ?? ""}</h1>
        <p>{awardees.length} awardee binaan</p>
      </div>

      <section className="card">
        <h2 className="section-title">Penilaian untuk Anda</h2>
        {tasks.length === 0 ? (
          <p className="section-hint" style={{ margin: 0 }}>Belum ada penilaian yang dibuka untuk Anda saat ini.</p>
        ) : (
          <>
            <p className="section-hint">
              {pending === 0 ? "Semua penilaian sudah Anda kirim. Terima kasih!" : `${pending} dari ${tasks.length} penilaian menunggu Anda isi.`}
            </p>
            <Link href="/manwil/nilai" className="btn btn-small btn-inline">Buka penilaian</Link>
          </>
        )}
      </section>

      {progress.length === 0 ? (
        <section className="card">
          <h2 className="section-title">Belum ada periode penilaian yang berjalan</h2>
          <p className="section-hint" style={{ margin: 0 }}>
            Pantauan target setiap awardee akan muncul di sini begitu Admin membuka periode penilaian.
          </p>
        </section>
      ) : (
        progress.map(({ period, rows }) => (
          <section key={period.id} className="card">
            <h2 className="section-title">
              {period.name} <span className={`pill ${period.status === "open" ? "pill-ok" : "pill-muted"}`}>{period.status === "open" ? "dibuka" : "ditutup"}</span>
            </h2>
            <p className="section-hint">Jumlah penilaian yang sudah masuk dibanding target minimal tiap tipe penilai.</p>
            <ProgressTable rows={rows} />
          </section>
        ))
      )}

      <section className="card">
        <h2 className="section-title">Tautan penilaian awardee</h2>
        <p className="section-hint">Tautan publik yang dibagikan setiap awardee ke jejaringnya.</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Awardee</th>
                <th scope="col">Kampus</th>
                <th scope="col">Tautan</th>
              </tr>
            </thead>
            <tbody>
              {awardees.map((a) => (
                <tr key={a.id}>
                  <td><b>{a.name}</b></td>
                  <td>{a.campus ?? "—"}</td>
                  <td><code>{`${origin}/s/${a.referralCode}`}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
