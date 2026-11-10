import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProfileForm } from "@/components/ProfileForm";
import { requireUser } from "@/lib/auth";
import { listLeadproFields } from "@/lib/data/leadpro";
import { getProfileView } from "@/lib/data/profiles";
import { saveProfileAsAdminAction } from "../actions";
import { LeadproForm } from "./LeadproForm";
import { StatusForm } from "./StatusForm";

export const metadata: Metadata = { title: "Profil Awardee" };

export default async function AdminProfileDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireUser("admin");
  const { id } = await params;
  const awardeeId = Number(id);
  const view = Number.isInteger(awardeeId) ? await getProfileView(env.DB, admin, awardeeId) : null;
  if (!view) notFound();
  const fields = await listLeadproFields(env.DB);

  return (
    <>
      <div className="page-head">
        <Link href="/admin/profil" className="back-link">Semua profil</Link>
        <h1>{view.awardee.name}</h1>
        <p>{view.awardee.batch} · {view.awardee.region}{view.awardee.campus ? ` · ${view.awardee.campus}` : ""}</p>
      </div>

      <section className="card">
        <h2 className="section-title">Status program</h2>
        <p className="section-hint">Hanya Admin yang bisa mengubahnya. Perubahan tercatat di Jejak perubahan.</p>
        <StatusForm awardeeId={view.awardee.id} status={view.awardee.status} joinedAt={view.awardee.joinedAt} />
      </section>

      <section className="card">
        <h2 className="section-title">Leadership Project</h2>
        <p className="section-hint">Awardee hanya bisa membacanya di Profil Saya. Perubahan tercatat di Jejak perubahan.</p>
        <LeadproForm awardeeId={view.awardee.id} leadpro={view.leadpro} fields={fields} />
      </section>

      <ProfileForm
        version={view.meta.updatedAt ?? "baru"}
        profile={view.profile}
        action={saveProfileAsAdminAction}
        mode="admin"
        consented={Boolean(view.meta.consentAt)}
        awardeeId={view.awardee.id}
        initial={view.completeness}
      />
    </>
  );
}
