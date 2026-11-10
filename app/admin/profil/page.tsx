import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { ProfileListTable } from "@/components/ProfileListTable";
import { requireUser } from "@/lib/auth";
import { listProfileStatus } from "@/lib/data/profiles";

export const metadata: Metadata = { title: "Profil Awardee" };

export default async function AdminProfileListPage() {
  const admin = await requireUser("admin");
  const rows = await listProfileStatus(env.DB, admin);
  return (
    <>
      <div className="page-head">
        <h1>Profil Awardee</h1>
        <p>Kelengkapan profil semua awardee. Buka satu untuk melihat dan mengedit datanya.</p>
      </div>
      <ProfileListTable rows={rows} basePath="/admin/profil" />
    </>
  );
}
