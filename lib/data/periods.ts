// Periode bukan data pribadi, jadi tidak perlu lingkup.

export type PeriodItem = {
  id: number;
  slug: string;
  name: string;
  batch: string;
  kind: "assessment" | "leadpro";
  status: "draft" | "open" | "closed" | "archived";
  opensAt: string | null;
  closesAt: string | null;
};

export async function listPeriods(db: D1Database): Promise<PeriodItem[]> {
  const { results } = await db
    .prepare("SELECT id, slug, name, batch, kind, status, opens_at, closes_at FROM periods ORDER BY batch DESC, id")
    .all<{ id: number; slug: string; name: string; batch: string; kind: PeriodItem["kind"]; status: PeriodItem["status"]; opens_at: string | null; closes_at: string | null }>();
  return results.map((p) => ({ id: p.id, slug: p.slug, name: p.name, batch: p.batch, kind: p.kind, status: p.status, opensAt: p.opens_at, closesAt: p.closes_at }));
}

// Periode yang sudah pernah dibuka: yang masih draft belum punya angka untuk dipantau.
export const isRunningOrDone = (p: PeriodItem) => p.status === "open" || p.status === "closed";
