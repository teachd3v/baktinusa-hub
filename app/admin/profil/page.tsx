import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { ModalButton } from "@/components/Modal";
import { ProfileListTable } from "@/components/ProfileListTable";
import { requireUser } from "@/lib/auth";
import { listProfileStatus } from "@/lib/data/profiles";
import { ImportPanel } from "../pengguna/ImportPanel";

export const metadata: Metadata = { title: "Profil Awardee" };

export default async function AdminProfileListPage() {
  const admin = await requireUser("admin");
  const rows = await listProfileStatus(env.DB, admin);
  return (
    <>
      <div className="page-head">
        <h1>Profil Awardee</h1>
        <p>Kelengkapan profil semua awardee. Buka satu untuk melihat dan mengedit datanya.</p>
        <div style={{ marginTop: "0.75rem" }}>
          <ModalButton
            label="Impor"
            title="Impor awardee"
            hint="Satu berkas untuk akun, profil, LeadPro, dan status. Tidak ada yang tersimpan sampai Anda menekan terapkan."
            className="btn btn-small btn-inline btn-muted"
            trigger={<span className="btn-text">Impor dari Excel</span>}
          >
            <ImportPanel />
          </ModalButton>
        </div>
      </div>
      <ProfileListTable rows={rows} basePath="/admin/profil" />
    </>
  );
}
