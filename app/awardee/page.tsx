import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { CopyField } from "@/components/CopyField";
import { MobileCollapse } from "@/components/MobileCollapse";
import { ProgressTable } from "@/components/ProgressTable";
import { requireUser } from "@/lib/auth";
import { listAwardees, progressForScope } from "@/lib/data/awardees";
import { isRunningOrDone, listPeriods } from "@/lib/data/periods";
import { scopeFor } from "@/lib/data/scope";
import { publicOrigin } from "@/lib/origin";

export const metadata: Metadata = { title: "Beranda Awardee" };

export default async function AwardeeHome() {
  const user = await requireUser("awardee");
  const scope = scopeFor(user);
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

        <section className="card">
          <h2 className="section-title">Tautan penilaian Anda</h2>
          <p className="section-hint hide-mobile">
            Bagikan ke jejaring Anda (rekan organisasi, pembina, tim, penerima manfaat) saat periode penilaian dibuka.
            Siapa pun yang memegang tautan ini bisa menilai Anda.
          </p>
          {shareUrl && <CopyField value={shareUrl} label="tautan-penilaian" />}
        </section>

      <section className="card">
        <h2 className="section-title">Perkembangan penilaian</h2>
        {progress.length === 0 ? (
          <p className="section-hint" style={{ margin: 0 }}>Belum ada periode penilaian yang berjalan.</p>
        ) : (
          progress.map(({ period, rows }, i) => (
            <MobileCollapse
              key={period.id}
              className="progress-period"
              openMobile={i === 0}
              summary={
                <p className="label" style={{ margin: 0 }}>
                  {period.name} <span className={`pill ${period.status === "open" ? "pill-ok" : "pill-muted"}`}>{period.status === "open" ? "dibuka" : "ditutup"}</span>
                </p>
              }
            >
              <ProgressTable rows={rows} showAwardee={false} />
            </MobileCollapse>
          ))
        )}
      </section>
    </>
  );
}
