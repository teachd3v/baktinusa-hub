import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { CopyField } from "@/components/CopyField";
import { ProgressTable } from "@/components/ProgressTable";
import { requireUser } from "@/lib/auth";
import { listTasks } from "@/lib/data/evaluations";
import { listAwardees, progressForScope } from "@/lib/data/awardees";
import { isRunningOrDone, listPeriods } from "@/lib/data/periods";
import { scopeFor } from "@/lib/data/scope";
import { publicOrigin } from "@/lib/origin";

export const metadata: Metadata = { title: "Beranda Awardee" };

export default async function AwardeeHome() {
  const user = await requireUser("awardee");
  const scope = scopeFor(user);
  const tasks = await listTasks(env.DB, user);
  const pending = tasks.filter((t) => !t.submitted).length;
  const [me] = await listAwardees(env.DB, scope);
  const periods = (await listPeriods(env.DB)).filter(isRunningOrDone);
  const progress = await Promise.all(periods.map(async (period) => ({ period, rows: await progressForScope(env.DB, scope, period.id) })));
  const shareUrl = me ? `${await publicOrigin()}/s/${me.referralCode}` : null;

  return (
    <>
      <div className="page-head">
        <h1>Halo, {user.name}</h1>
        {me && <p>{me.region}{me.campus ? ` · ${me.campus}` : ""}</p>}
      </div>

      <div className="grid-2">
        <section className="card">
          <h2 className="section-title">Tautan penilaian Anda</h2>
          <p className="section-hint">
            Bagikan ke jejaring Anda — rekan organisasi, pembina, tim, penerima manfaat — saat periode penilaian dibuka.
            Siapa pun yang memegang tautan ini bisa menilai Anda.
          </p>
          {shareUrl && <CopyField value={shareUrl} label="tautan-penilaian" />}
        </section>

        <section className="card">
          <h2 className="section-title">Hasil penilaian Anda</h2>
          <p className="section-hint">
            IPK per sudut pandang, perbandingan kategori, dan masukan yang ditulis para penilai.
          </p>
          <Link href="/awardee/hasil" className="btn btn-small btn-inline">Lihat hasil</Link>
        </section>

        <section className="card">
          <h2 className="section-title">Penilaian untuk Anda</h2>
          {tasks.length === 0 ? (
            <p className="section-hint" style={{ margin: 0 }}>Belum ada penilaian yang dibuka untuk Anda saat ini.</p>
          ) : (
            <>
              <p className="section-hint">
                {pending === 0 ? "Semua penilaian sudah Anda kirim. Terima kasih!" : `${pending} dari ${tasks.length} penilaian menunggu Anda isi.`}
              </p>
              <Link href="/awardee/nilai" className="btn btn-small btn-inline">Buka penilaian</Link>
            </>
          )}
        </section>
      </div>

      <section className="card">
        <h2 className="section-title">Perkembangan penilaian</h2>
        {progress.length === 0 ? (
          <p className="section-hint" style={{ margin: 0 }}>Belum ada periode penilaian yang berjalan.</p>
        ) : (
          progress.map(({ period, rows }) => (
            <div key={period.id} style={{ marginTop: "0.75rem" }}>
              <p className="label">
                {period.name} <span className={`pill ${period.status === "open" ? "pill-ok" : "pill-muted"}`}>{period.status === "open" ? "dibuka" : "ditutup"}</span>
              </p>
              <ProgressTable rows={rows} showAwardee={false} />
            </div>
          ))
        )}
      </section>
    </>
  );
}
