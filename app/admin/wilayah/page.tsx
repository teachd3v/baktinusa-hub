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
  const terpakai = regions.filter((r) => r.awardees + r.manwils > 0).length;

  return (
    <>
      <div className="page-head">
        <h1>Wilayah</h1>
        <p>Daftar ini yang muncul sebagai pilihan wilayah di seluruh portal. Tiap wilayah juga menyimpan daftar kampusnya, yang jadi pilihan Kampus saat menambah awardee.</p>
      </div>

      <section className="card">
        <div className="card-head">
          <h2 className="section-title">Daftar wilayah</h2>
          <AddButton
            label="Tambah wilayah"
            title="Tambah wilayah"
            hint="Nama wilayah tidak boleh kembar, termasuk yang hanya beda huruf besar-kecil."
          >
            <NewRegionForm />
          </AddButton>
        </div>
        <p className="section-hint">
          {regions.length} wilayah, {campuses.length} kampus, {terpakai} wilayah sedang dipakai. Wilayah yang masih
          dipakai tidak bisa dihapus, tapi namanya tetap bisa dirapikan kapan saja. Buka <b>Ubah</b> untuk mengelola
          kampusnya.
        </p>
        <div className="table-wrap">
          <table className="table">
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
