import type { AnalyticsFilter } from "@/lib/data/analytics";

export type FilterParams = { jenis?: string; wilayah?: string; awardee?: string };

// Saringan datang dari alamat, jadi isinya apa saja. Yang tidak berbentuk angka dianggap "tanpa saringan"
// — bukan galat: alamat yang dibagikan lalu diedit orang tidak boleh membuat halaman gagal dibuka.
//
// Angka yang lolos di sini belum berarti boleh dilihat. Izinnya ditegakkan di SQL, tempat saringan
// dipadukan dengan predikat lingkup (lihat lib/data/analytics.ts).
const angka = (v: string | undefined) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export function readFilter(params: FilterParams): AnalyticsFilter {
  const code = (params.jenis ?? "").trim().toUpperCase();
  return {
    code: /^[A-Z0-9]{1,20}$/.test(code) ? code : null,
    regionId: angka(params.wilayah),
    awardeeId: angka(params.awardee),
  };
}

// Saringan yang sedang berlaku, untuk disematkan ke tautan lain di halaman yang sama.
export function filterQuery(periode: string, filter: AnalyticsFilter): URLSearchParams {
  const q = new URLSearchParams({ periode });
  if (filter.code) q.set("jenis", filter.code);
  if (filter.regionId !== null) q.set("wilayah", String(filter.regionId));
  if (filter.awardeeId !== null) q.set("awardee", String(filter.awardeeId));
  return q;
}
