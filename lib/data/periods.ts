// Siklus bukan data pribadi, jadi tidak perlu lingkup.
//
// Satu angkatan punya tiga siklus: Awal, Tengah, Akhir. Tiap siklus menjalankan beberapa jenis
// pengukuran sekaligus (lihat period_measurements).

export const CYCLES = ["awal", "tengah", "akhir"] as const;
export type Cycle = (typeof CYCLES)[number];

export const CYCLE_LABEL: Record<Cycle, string> = {
  awal: "Siklus Awal",
  tengah: "Siklus Tengah",
  akhir: "Siklus Akhir",
};

export const isCycle = (v: unknown): v is Cycle => CYCLES.includes(v as Cycle);

export type PeriodItem = {
  id: number;
  slug: string;
  name: string;
  batch: string;
  cycle: Cycle;
  status: "draft" | "open" | "closed" | "archived";
  opensAt: string | null;
  closesAt: string | null;
};

type PeriodDbRow = {
  id: number;
  slug: string;
  name: string;
  batch: string;
  cycle: Cycle;
  status: PeriodItem["status"];
  opens_at: string | null;
  closes_at: string | null;
};

const toItem = (p: PeriodDbRow): PeriodItem => ({
  id: p.id,
  slug: p.slug,
  name: p.name,
  batch: p.batch,
  cycle: p.cycle,
  status: p.status,
  opensAt: p.opens_at,
  closesAt: p.closes_at,
});

export async function listPeriods(db: D1Database): Promise<PeriodItem[]> {
  const { results } = await db
    .prepare(
      // Urutan siklus mengikuti jalannya program, bukan abjad.
      `SELECT id, slug, name, batch, cycle, status, opens_at, closes_at FROM periods
       ORDER BY batch DESC, CASE cycle WHEN 'awal' THEN 0 WHEN 'tengah' THEN 1 ELSE 2 END`,
    )
    .all<PeriodDbRow>();
  return results.map(toItem);
}

// Periode yang sudah pernah dibuka: yang masih draft belum punya angka untuk dipantau.
export const isRunningOrDone = (p: PeriodItem) => p.status === "open" || p.status === "closed";
