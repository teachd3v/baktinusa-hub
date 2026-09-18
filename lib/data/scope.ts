// Lingkup data per peran. Semua query yang membaca awardee atau respons WAJIB lewat sini:
// menyembunyikan tombol bukan otorisasi, menyaring baris di SQL barulah otorisasi.

export type Role = "admin" | "manwil" | "awardee";

export type SessionUser = {
  id: number;
  name: string;
  email: string;
  role: Role;
  regionId: number | null;
  awardeeId: number | null;
};

export type Scope =
  | { kind: "national" }
  | { kind: "region"; regionId: number }
  | { kind: "self"; awardeeId: number };

export class ScopeError extends Error {}

export function scopeFor(user: SessionUser): Scope {
  switch (user.role) {
    case "admin":
      return { kind: "national" };
    case "manwil":
      if (user.regionId === null) throw new ScopeError(`Manwil #${user.id} tidak punya wilayah`);
      return { kind: "region", regionId: user.regionId };
    case "awardee":
      if (user.awardeeId === null) throw new ScopeError(`Awardee #${user.id} tidak terhubung ke data awardee`);
      return { kind: "self", awardeeId: user.awardeeId };
    default:
      throw new ScopeError(`Peran tidak dikenal: ${String((user as { role: unknown }).role)}`);
  }
}

// Predikat SQL untuk tabel awardees dengan alias tertentu. Nilai selalu lewat parameter, tidak pernah disisipkan.
export function awardeeFilter(scope: Scope, alias = "a"): { sql: string; params: number[] } {
  switch (scope.kind) {
    case "national":
      return { sql: "1 = 1", params: [] };
    case "region":
      return { sql: `${alias}.region_id = ?`, params: [scope.regionId] };
    case "self":
      return { sql: `${alias}.id = ?`, params: [scope.awardeeId] };
  }
}

export const homeFor = (role: Role) => (role === "admin" ? "/admin" : role === "manwil" ? "/manwil" : "/awardee");
