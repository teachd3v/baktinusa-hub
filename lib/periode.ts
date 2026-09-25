import { env } from "cloudflare:workers";
import { isRunningOrDone, listPeriods, type PeriodItem } from "@/lib/data/periods";

// Periode mana yang sedang dilihat. Halaman hasil memakai ?periode=<slug>; kalau kosong, ambil yang terbaru
// dari periode yang sudah pernah dibuka — periode draft belum punya angka untuk ditampilkan.
export async function pickPeriod(slug?: string): Promise<{ periods: PeriodItem[]; active: PeriodItem | null }> {
  const periods = (await listPeriods(env.DB)).filter(isRunningOrDone);
  const active = (slug ? periods.find((p) => p.slug === slug) : undefined) ?? periods.at(-1) ?? null;
  return { periods, active };
}
