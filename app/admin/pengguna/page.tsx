import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listCampusOptions } from "@/lib/data/campuses";
import { listPeople } from "@/lib/data/people";
import { listAwardeesWithoutAccount, listRegions } from "@/lib/data/users";
import { AddButton, ModalButton } from "@/components/Modal";
import { ImportPanel } from "./ImportPanel";
import { PeopleSearch, RoleSelect } from "./PeopleControls";
import { PeopleTable } from "./PeopleTable";
import { NewPersonForm } from "./PersonForms";

export const metadata: Metadata = { title: "Pengguna" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ peran?: string; cari?: string }> }) {
  const admin = await requireUser("admin");
  const [{ peran, cari }, people, regions, campuses, freeAwardees] = await Promise.all([
    searchParams,
    listPeople(env.DB, admin),
    listRegions(env.DB),
    listCampusOptions(env.DB),
    listAwardeesWithoutAccount(env.DB, admin),
  ]);

  const needle = (cari ?? "").trim().toLowerCase();
  const shown = people
    .filter((p) => !peran || (peran === "tanpa-akun" ? p.userId === null : p.role === peran))
    .filter((p) => !needle || [p.name, p.email ?? "", p.loginId ?? "", p.region ?? "", p.referralCode ?? ""].some((v) => v.toLowerCase().includes(needle)));

  const count = (role: string) => people.filter((p) => p.role === role).length;
  const tabs: [string, string][] = [
    ["", `Semua (${people.length})`],
    ["admin", `Admin (${count("admin")})`],
    ["manwil", `Manwil (${count("manwil")})`],
    ["awardee", `Awardee (${count("awardee")})`],
    ["tanpa-akun", `Tanpa akun (${people.filter((p) => p.userId === null).length})`],
  ];

  return (
    <>
      <div className="page-head">
        <h1>Pengguna</h1>
      </div>

      <section className="card">
        {/* Di ponsel judul "Daftar" disembunyikan, saringan jadi dropdown, dan kedua tombol tinggal ikon. */}
        <div className="card-head people-head">
          <h2 className="section-title">Daftar</h2>
          <RoleSelect tabs={tabs} peran={peran ?? ""} cari={cari ?? ""} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <ModalButton
              label="Impor"
              title="Impor pengguna"
              hint="Unduh template, isi di Excel, lalu pilih berkasnya. Tidak ada yang tersimpan sampai Anda menekan terapkan."
              className="btn btn-small btn-inline btn-muted btn-icon-mobile"
              trigger={
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
                  </svg>
                  <span className="btn-text">Impor</span>
                </>
              }
            >
              <ImportPanel />
            </ModalButton>
            <AddButton
              label="Tambah manual"
              className="btn btn-small btn-inline add-button btn-icon-mobile"
              title="Tambah orang"
              hint="Untuk peran Awardee, data awardee ikut dibuat sekalian, atau hubungkan ke data yang sudah ada."
            >
              <NewPersonForm regions={regions} campuses={campuses} freeAwardees={freeAwardees} />
            </AddButton>
          </div>
        </div>

        <div className="tabs tabs-desktop">
          {tabs.map(([value, label]) => (
            <a key={value || "semua"} href={value ? `/admin/pengguna?peran=${value}` : "/admin/pengguna"} aria-current={(peran ?? "") === value ? "page" : undefined}>
              {label}
            </a>
          ))}
        </div>

        <PeopleSearch peran={peran ?? ""} cari={cari ?? ""} />

        <p className="section-hint">{shown.length} ditampilkan</p>

        <PeopleTable people={shown} regions={regions} campuses={campuses} selfId={admin.id} expanded={Boolean(needle || peran)} />
      </section>
    </>
  );
}
