import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { ProfileListTable } from "@/components/ProfileListTable";
import { requireUser } from "@/lib/auth";
import { listProfileStatus } from "@/lib/data/profiles";

export const metadata: Metadata = { title: "Profil Awardee" };

export default async function ManwilProfileListPage() {
  const user = await requireUser("manwil");
  const rows = await listProfileStatus(env.DB, user);
  return (
    <>
      <div className="page-head">
        <h1>Profil Awardee</h1>
        <p>Kelengkapan profil awardee di wilayah Anda. Tanggal lahir dan kontak darurat tidak ditampilkan.</p>
      </div>
      <ProfileListTable rows={rows} basePath="/manwil/profil" />
    </>
  );
}
