import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { CopyField } from "@/components/CopyField";
import { PeriodTabs } from "@/components/results/Panels";
import { requireUser } from "@/lib/auth";
import { shortfalls } from "@/lib/data/cron";
import { deliveryMode } from "@/lib/login-delivery";
import { publicOrigin } from "@/lib/origin";
import { pickPeriod } from "@/lib/periode";

export const metadata: Metadata = { title: "Pengingat" };

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  await requireUser("admin");
  const { periode } = await searchParams;
  const { periods, active } = await pickPeriod(periode);
  if (!active) {
    return (
      <>
        <div className="page-head"><h1>Pengingat</h1></div>
        <section className="card">
          <p className="section-hint" style={{ margin: 0 }}>Belum ada periode berjalan.</p>
        </section>
      </>
    );
  }

  const [behind, origin] = await Promise.all([shortfalls(env.DB, active.id), publicOrigin()]);
  const mode = deliveryMode();
  const byRegion = new Map<string, typeof behind>();
  for (const a of behind) byRegion.set(a.region, [...(byRegion.get(a.region) ?? []), a]);

  return (
    <>
      <div className="page-head">
        <h1>Pengingat</h1>
        <p>{active.name} · {behind.length} awardee respondennya belum penuh</p>
      </div>

      <PeriodTabs periods={periods} active={active.slug} basePath="/admin/pengingat" />

      <section className="card">
        <h2 className="section-title">Cara pengingat dikirim</h2>
        <p className="section-hint" style={{ margin: 0 }}>
          {mode === "email"
            ? "Pengiriman lewat email sudah aktif. Tugas terjadwal menghitung daftar ini tiap 15 menit."
            : "Pengiriman email belum aktif karena domain pengirim BAKTI NUSA belum dipasang. Sementara ini, salin pesan di bawah dan kirim sendiri lewat WhatsApp."}
        </p>
      </section>

      {behind.length === 0 ? (
        <section className="card">
          <h2 className="section-title">Semua target sudah terpenuhi 🎉</h2>
          <p className="section-hint" style={{ margin: 0 }}>Tidak ada yang perlu diingatkan untuk periode ini.</p>
        </section>
      ) : (
        [...byRegion.entries()].map(([region, awardees]) => (
          <section key={region} className="card">
            <h2 className="section-title">{region}</h2>
            <p className="section-hint">{awardees.length} awardee perlu tambahan responden</p>

            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Awardee</th>
                    <th scope="col">Yang masih kurang</th>
                  </tr>
                </thead>
                <tbody>
                  {awardees.map((a) => (
                    <tr key={a.awardeeId}>
                      <td><b>{a.awardee}</b></td>
                      <td>
                        {a.missing.map((m) => (
                          <span key={m.typeCode} className="pill pill-warn" style={{ marginRight: "0.35rem" }}>
                            {m.typeName} {m.count}/{m.target}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="label" style={{ marginTop: "1rem" }}>Pesan siap kirim untuk Manwil {region}</p>
            <CopyField
              label={`pesan-${region}`}
              value={
                `Halo Manwil ${region}, mohon bantuannya mengingatkan awardee berikut untuk melengkapi responden ${active.name}: ` +
                awardees
                  .map((a) => `${a.awardee} (${a.missing.map((m) => `${m.typeName} ${m.count}/${m.target}`).join(", ")}; tautan: ${origin}/s/${a.referralCode})`)
                  .join(" · ") +
                (active.closesAt ? ". Batas pengisian sesuai jadwal periode." : ".")
              }
            />
          </section>
        ))
      )}
    </>
  );
}
