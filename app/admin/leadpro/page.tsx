import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { LeadproList, type LeadproQuery } from "@/components/LeadproList";
import { requireUser } from "@/lib/auth";
import { listLeadpros } from "@/lib/data/leadpro";

export const metadata: Metadata = { title: "LeadPro" };

export default async function AdminLeadproPage({ searchParams }: { searchParams: Promise<LeadproQuery> }) {
  const admin = await requireUser("admin");
  const [query, rows] = await Promise.all([searchParams, listLeadpros(env.DB, admin)]);
  return (
    <>
      <div className="page-head">
        <h1>LeadPro</h1>
        <p>Leadership Project semua awardee. Saring menurut bidang, wilayah, kampus, atau angkatan. Buka awardee untuk mengubah datanya.</p>
      </div>
      <LeadproList rows={rows} query={query} path="/admin/leadpro" profilePath="/admin/profil" showRegion />
    </>
  );
}
