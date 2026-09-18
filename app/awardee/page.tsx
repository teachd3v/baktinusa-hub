import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { CopyField } from "@/components/CopyField";
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
          <h2 className="section-title">Segera hadir</h2>
          <ul className="section-hint" style={{ margin: 0, paddingLeft: "1.1rem" }}>
            <li>Mengisi asesmen mandiri dan menilai rekan se-wilayah dari akun ini.</li>
            <li>Hasil penilaian 360° dan Leadership Project Anda.</li>
          </ul>
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
