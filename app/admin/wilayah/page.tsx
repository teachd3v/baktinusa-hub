import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listRegionsForAdmin } from "@/lib/data/regions";
import { NewRegionForm, RegionRowForm } from "./RegionForms";

export const metadata: Metadata = { title: "Wilayah" };

export default async function RegionsPage() {
  const admin = await requireUser("admin");
  const regions = await listRegionsForAdmin(env.DB, admin);
  const terpakai = regions.filter((r) => r.awardees + r.manwils > 0).length;

  return (
    <>
      <div className="page-head">
        <h1>Wilayah</h1>
        <p>Daftar ini yang muncul sebagai pilihan wilayah di seluruh portal.</p>
      </div>

      <section className="card">
        <h2 className="section-title">Tambah wilayah</h2>
        <p className="section-hint">Nama wilayah tidak boleh kembar, termasuk yang hanya beda huruf besar-kecil.</p>
        <NewRegionForm />
      </section>

      <section className="card">
        <h2 className="section-title">Daftar wilayah</h2>
        <p className="section-hint">
          {regions.length} wilayah · {terpakai} sedang dipakai. Wilayah yang masih dipakai tidak bisa dihapus, tapi namanya
          tetap bisa dirapikan kapan saja.
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Wilayah</th>
                <th scope="col" className="num">Awardee</th>
                <th scope="col" className="num">Akun Manwil</th>
                <th scope="col" className="num">Penilaian masuk</th>
                <th scope="col"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {regions.map((r) => (
                <RegionRowForm key={r.id} region={r} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
