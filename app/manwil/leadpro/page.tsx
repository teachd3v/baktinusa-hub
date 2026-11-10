import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { LeadproList, type LeadproQuery } from "@/components/LeadproList";
import { requireUser } from "@/lib/auth";
import { listLeadpros } from "@/lib/data/leadpro";

export const metadata: Metadata = { title: "LeadPro" };

export default async function ManwilLeadproPage({ searchParams }: { searchParams: Promise<LeadproQuery> }) {
  const user = await requireUser("manwil");
  const [query, rows] = await Promise.all([searchParams, listLeadpros(env.DB, user)]);
  return (
    <>
      <div className="page-head">
        <h1>LeadPro</h1>
        <p>Leadership Project awardee di wilayah Anda.</p>
      </div>
      <LeadproList rows={rows} query={query} path="/manwil/leadpro" profilePath="/manwil/profil" showRegion={false} />
    </>
  );
}
