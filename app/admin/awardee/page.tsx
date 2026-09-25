import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listAwardeesForAdmin, suggestReferralCode } from "@/lib/data/admin-awardees";
import { listRegions } from "@/lib/data/users";
import { AwardeeRow, NewAwardeeForm } from "./AwardeeForms";

export const metadata: Metadata = { title: "Awardee" };

export default async function AwardeesPage({ searchParams }: { searchParams: Promise<{ angkatan?: string }> }) {
  const admin = await requireUser("admin");
  const { angkatan } = await searchParams;
  const [all, regions, suggestedCode] = await Promise.all([
    listAwardeesForAdmin(env.DB, admin),
    listRegions(env.DB),
    suggestReferralCode(env.DB, admin),
  ]);

  const batches = [...new Set(all.map((a) => a.batch))].sort().reverse();
  const shown = angkatan ? all.filter((a) => a.batch === angkatan) : all;

  return (
    <>
      <div className="page-head">
        <h1>Awardee</h1>
        <p>{all.length} awardee di {batches.length} angkatan. Kode referal di sini yang dipakai form publik.</p>
      </div>

      {batches.length > 1 && (
        <div className="tabs">
          <Link href="/admin/awardee" aria-current={angkatan ? undefined : "page"}>Semua</Link>
          {batches.map((b) => (
            <Link key={b} href={`/admin/awardee?angkatan=${b}`} aria-current={angkatan === b ? "page" : undefined}>{b}</Link>
          ))}
        </div>
      )}

      <section className="card">
        <h2 className="section-title">Tambah awardee</h2>
        <NewAwardeeForm regions={regions} suggestedCode={suggestedCode} />
      </section>

      <section className="card">
        <h2 className="section-title">Daftar awardee</h2>
        <p className="section-hint">{shown.length} ditampilkan</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Wilayah</th>
                <th scope="col">Angkatan</th>
                <th scope="col">Kode referal</th>
                <th scope="col" className="num">Jawaban</th>
                <th scope="col">Akun</th>
                <th scope="col"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((a) => (
                <AwardeeRow key={a.id} regions={regions} awardee={a} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
