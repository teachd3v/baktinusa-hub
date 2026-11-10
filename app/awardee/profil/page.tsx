import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { LeadproCard } from "@/components/LeadproCard";
import { ProfileForm } from "@/components/ProfileForm";
import { requireUser } from "@/lib/auth";
import { getProfileView } from "@/lib/data/profiles";
import { saveMyProfileAction } from "./actions";

export const metadata: Metadata = { title: "Profil Saya" };

export default async function MyProfilePage() {
  const user = await requireUser("awardee");
  const view = await getProfileView(env.DB, user, user.awardeeId!);

  if (!view) {
    return (
      <div className="page-head">
        <h1>Profil Saya</h1>
        <p>Data awardee Anda belum terhubung. Hubungi Admin.</p>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Profil Saya</h1>
        <p>{view.awardee.batch} · {view.awardee.region}{view.awardee.campus ? ` · ${view.awardee.campus}` : ""}</p>
      </div>

      <LeadproCard leadpro={view.leadpro} own />

      <ProfileForm
        version={view.meta.updatedAt ?? "baru"}
        profile={view.profile}
        action={saveMyProfileAction}
        mode="self"
        consented={Boolean(view.meta.consentAt)}
        initial={view.completeness}
      />
    </>
  );
}
