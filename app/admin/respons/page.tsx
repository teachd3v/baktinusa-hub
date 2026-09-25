import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { PeriodTabs } from "@/components/results/Panels";
import { requireUser } from "@/lib/auth";
import { listResponsesForAdmin } from "@/lib/data/admin-responses";
import { listPeriods } from "@/lib/data/periods";
import { pickPeriod } from "@/lib/periode";
import { ResponseTable } from "./ResponseTable";

export const metadata: Metadata = { title: "Respons" };

export default async function ResponsesPage({ searchParams }: { searchParams: Promise<{ periode?: string }> }) {
  const admin = await requireUser("admin");
  const { periode } = await searchParams;
  // Berbeda dari halaman hasil: di sini periode draft pun perlu terlihat, supaya kiriman uji coba bisa dibersihkan.
  const all = await listPeriods(env.DB);
  const { active } = await pickPeriod(periode);
  const chosen = (periode ? all.find((p) => p.slug === periode) : null) ?? active ?? all[0] ?? null;

  return (
    <>
      <div className="page-head">
        <h1>Respons</h1>
        <p>Data mentah yang masuk, lengkap dengan penanda kiriman kembar.</p>
      </div>

      <PeriodTabs periods={all} active={chosen?.slug ?? ""} basePath="/admin/respons" />

      <section className="card">
        {chosen ? (
          <ResponseTable rows={await listResponsesForAdmin(env.DB, admin, chosen.id)} />
        ) : (
          <p className="section-hint" style={{ margin: 0 }}>Belum ada periode.</p>
        )}
      </section>
    </>
  );
}
