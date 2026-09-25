import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listPeople } from "@/lib/data/people";
import { listAwardeesWithoutAccount, listRegions } from "@/lib/data/users";
import { ImportPanel } from "./ImportPanel";
import { NewPersonForm, PersonRow } from "./PersonForms";

export const metadata: Metadata = { title: "Pengguna" };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ peran?: string; cari?: string }> }) {
  const admin = await requireUser("admin");
  const [{ peran, cari }, people, regions, freeAwardees] = await Promise.all([
    searchParams,
    listPeople(env.DB, admin),
    listRegions(env.DB),
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
        <p>Satu tempat untuk semua orang: Admin, Manajer Wilayah, dan Awardee — beserta data awardee yang belum punya akun.</p>
      </div>

      <section className="card">
        <h2 className="section-title">Tambah orang</h2>
        <p className="section-hint">
          Untuk peran Awardee, data awardee ikut dibuat sekalian — atau hubungkan ke data yang sudah ada.
        </p>
        <NewPersonForm regions={regions} freeAwardees={freeAwardees} />
      </section>

      <section className="card">
        <h2 className="section-title">Impor massal</h2>
        <ImportPanel />
      </section>

      <section className="card">
        <h2 className="section-title">Daftar</h2>

        <div className="tabs">
          {tabs.map(([value, label]) => (
            <a key={value || "semua"} href={value ? `/admin/pengguna?peran=${value}` : "/admin/pengguna"} aria-current={(peran ?? "") === value ? "page" : undefined}>
              {label}
            </a>
          ))}
        </div>

        <form method="get" className="copy-row" style={{ margin: "0 0 1rem" }}>
          {peran && <input type="hidden" name="peran" value={peran} />}
          <input className="input" type="search" name="cari" defaultValue={cari ?? ""} placeholder="Cari nama, ID, email, wilayah…" aria-label="Cari orang" />
          <button type="submit" className="btn btn-small">Cari</button>
        </form>

        <p className="section-hint">{shown.length} ditampilkan</p>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">ID masuk</th>
                <th scope="col">Peran</th>
                <th scope="col">Wilayah</th>
                <th scope="col">Data awardee</th>
                <th scope="col">Status</th>
                <th scope="col"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <PersonRow key={`${p.userId ?? "a"}-${p.awardeeId ?? "u"}`} person={p} regions={regions} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
