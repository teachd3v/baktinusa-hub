import { env } from "cloudflare:workers";
import { getCurrentUser } from "@/lib/auth";
import { csvFilename, matrixCsv, rawCsv } from "@/lib/data/export";
import { listPeriods } from "@/lib/data/periods";
import { scopeFor } from "@/lib/data/scope";

export const dynamic = "force-dynamic";

// Ekspor CSV. Matriks agregat boleh diunduh Manwil untuk wilayahnya; data mentah memuat identitas
// responden, jadi hanya Admin. Keduanya tetap lewat Scope yang sama dengan dashboard.
export async function GET(request: Request, { params }: { params: Promise<{ jenis: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Perlu masuk.", { status: 401 });

  const { jenis } = await params;
  if (jenis !== "matriks" && jenis !== "mentah") return new Response("Jenis ekspor tidak dikenal.", { status: 404 });
  if (jenis === "mentah" && user.role !== "admin") return new Response("Hanya Admin yang boleh mengunduh data mentah.", { status: 403 });
  if (user.role === "awardee") return new Response("Ekspor tidak tersedia untuk akun Awardee.", { status: 403 });

  const slug = new URL(request.url).searchParams.get("periode") ?? "";
  const period = (await listPeriods(env.DB)).find((p) => p.slug === slug);
  if (!period) return new Response("Periode tidak ditemukan.", { status: 404 });

  const scope = scopeFor(user);
  const csv = jenis === "matriks" ? await matrixCsv(env.DB, scope, period.id) : await rawCsv(env.DB, scope, period.id);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${csvFilename(jenis, period.slug)}"`,
      "cache-control": "no-store",
    },
  });
}
