import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LeadproCard } from "@/components/LeadproCard";
import { ProfileProgress } from "@/components/ProfileProgress";
import { ProfileReadonly } from "@/components/ProfileReadonly";
import { requireUser } from "@/lib/auth";
import { getProfileView } from "@/lib/data/profiles";

export const metadata: Metadata = { title: "Profil Awardee" };

export default async function ManwilProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("manwil");
  const { id } = await params;
  const awardeeId = Number(id);
  // Awardee di luar wilayah Manwil dibaca sebagai tidak ada.
  const view = Number.isInteger(awardeeId) ? await getProfileView(env.DB, user, awardeeId) : null;
  if (!view) notFound();

  return (
    <>
      <div className="page-head">
        <Link href="/manwil/profil" className="back-link">Semua profil</Link>
        <h1>{view.awardee.name}</h1>
        <p>{view.awardee.batch} · {view.awardee.region}{view.awardee.campus ? ` · ${view.awardee.campus}` : ""}</p>
      </div>
      <section className="card">
        <h2 className="section-title">Kelengkapan profil</h2>
        <ProfileProgress value={view.completeness} />
      </section>
      <LeadproCard leadpro={view.leadpro} />
      <ProfileReadonly view={view} />
    </>
  );
}
