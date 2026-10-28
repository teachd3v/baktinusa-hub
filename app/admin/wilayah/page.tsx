import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listCampusesForAdmin } from "@/lib/data/campuses";
import { listRegionsForAdmin } from "@/lib/data/regions";
import { AddButton } from "@/components/Modal";
import { NewRegionForm, RegionRowForm } from "./RegionForms";

export const metadata: Metadata = { title: "Wilayah" };

export default async function RegionsPage() {
  const admin = await requireUser("admin");
  const [regions, campuses] = await Promise.all([listRegionsForAdmin(env.DB, admin), listCampusesForAdmin(env.DB, admin)]);

  return (
    <>
      <div className="page-head">
        <h1>Wilayah</h1>
      </div>

      <section className="card">
        <div className="card-head head-compact">
          <AddButton
            label="Tambah wilayah"
            className="btn btn-small btn-inline add-button btn-icon-mobile"
            title="Tambah wilayah"
            hint="Nama wilayah tidak boleh kembar, termasuk yang hanya beda huruf besar-kecil."
          >
            <NewRegionForm />
          </AddButton>
        </div>
        <div className="table-wrap">
          <table className="table" data-collapse="1">
            <thead>
              <tr>
                <th scope="col">Wilayah</th>
                <th scope="col" className="num">Kampus</th>
                <th scope="col" className="num">Awardee</th>
                <th scope="col" className="num">Akun Manwil</th>
                <th scope="col" className="num">Penilaian masuk</th>
                <th scope="col"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <RegionRowForm key={r.id} region={r} campuses={campuses} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
