import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { NoPeriod, PeriodTabs } from "@/components/results/Panels";
import { ResultDetail } from "@/components/results/ResultDetail";
import { requireUser } from "@/lib/auth";
import { listAwardees } from "@/lib/data/awardees";
import { awardeeDetail } from "@/lib/data/results";
import { scopeFor } from "@/lib/data/scope";
import { pickPeriod } from "@/lib/periode";

export const metadata: Metadata = { title: "Hasil Penilaian" };

export default async function AwardeeResults({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const user = await requireUser("awardee");
  const scope = scopeFor(user);
  const { periode } = await searchParams;
  const [{ periods, active }, [me]] = await Promise.all([pickPeriod(periode), listAwardees(env.DB, scope)]);

  const detail = active && me ? await awardeeDetail(env.DB, scope, active.id, me.referralCode) : null;

  return (
    <>
      <div className="page-head">
        <h1>Hasil penilaian</h1>
        <p>{active ? active.name : "Belum ada periode"}</p>
      </div>

      <PeriodTabs periods={periods} active={active?.slug ?? ""} basePath="/awardee/hasil" />

      {!active || !detail ? <NoPeriod /> : <ResultDetail detail={detail} />}
    </>
  );
}
