import { env } from "cloudflare:workers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NoPeriod, PeriodTabs } from "@/components/results/Panels";
import { ResultDetail } from "@/components/results/ResultDetail";
import { requireUser } from "@/lib/auth";
import { awardeeDetail } from "@/lib/data/results";
import { scopeFor, type Role } from "@/lib/data/scope";
import { pickPeriod } from "@/lib/periode";

// Rincian satu awardee untuk pengelola (Manwil & Admin). Awardee di luar lingkup dijawab 404, sama seperti
// yang tidak ada — kode referal orang lain tidak boleh bisa ditebak dari respons yang berbeda.
export async function AwardeeDetailPage({
  role,
  params,
  searchParams,
  basePath,
}: {
  role: Exclude<Role, "awardee">;
  params: Promise<{ kode: string }>;
  searchParams: Promise<{ periode?: string }>;
  basePath: string;
}) {
  const user = await requireUser(role);
  const [{ kode }, { periode }] = await Promise.all([params, searchParams]);
  const { periods, active } = await pickPeriod(periode);
  if (!active) return <NoPeriod />;

  const detail = await awardeeDetail(env.DB, scopeFor(user), active.id, kode);
  if (!detail) notFound();

  return (
    <>
      <div className="page-head">
        <Link href={basePath} className="back-link">← Kembali ke daftar</Link>
        <h1>{detail.name}</h1>
        <p>
          {detail.region}
          {detail.campus ? ` · ${detail.campus}` : ""} · {active.name}
        </p>
      </div>

      <PeriodTabs periods={periods} active={active.slug} basePath={`${basePath}/${detail.referralCode}`} />

      <ResultDetail detail={detail} showProgram />
    </>
  );
}
