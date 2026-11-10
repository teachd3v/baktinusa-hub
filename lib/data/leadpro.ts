// Leadership Project (LeadPro) awardee: nama proyek, bidang, dan deskripsi. Tiga kolom itu ada di tabel awardees,
// satu proyek per awardee. Admin mengisi dan mengedit; awardee hanya membaca di Profil Saya; Manwil melihat daftar
// wilayahnya. Pembacaan selalu lewat Scope, seperti data awardee lainnya.

import { writeAudit } from "./audit.ts";
import type { Fail } from "./admin-periods.ts";
import { awardeeFilter, ScopeError, scopeFor, type SessionUser } from "./scope.ts";

export type Leadpro = { name: string; field: string; description: string };

export type LeadproRow = Leadpro & {
  awardeeId: number;
  awardee: string;
  batch: string;
  regionId: number;
  region: string;
  campusId: number | null;
  campus: string | null;
};

// Data lama membawa pemisah baris gaya Windows (\r\n). Disamakan jadi \n, dan baris kosong beruntun dipadatkan.
export const normalizeText = (value: unknown): string =>
  String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const toLeadpro = (name: unknown, field: unknown, description: unknown): Leadpro => ({
  name: normalizeText(name),
  field: normalizeText(field),
  description: normalizeText(description),
});

// ---------- membaca ----------

// Daftar LeadPro untuk Admin (semua wilayah) dan Manwil (wilayahnya). Awardee tidak punya daftar.
// Awardee yang proyeknya belum diisi ikut terdaftar dengan nama kosong, supaya Admin bisa melihat siapa yang belum.
export async function listLeadpros(db: D1Database, user: SessionUser): Promise<LeadproRow[]> {
  if (user.role === "awardee") throw new ScopeError("Awardee tidak boleh melihat daftar LeadPro");
  const f = awardeeFilter(scopeFor(user));
  const { results } = await db
    .prepare(
      `SELECT a.id, a.name AS awardee, a.batch, a.region_id, r.name AS region, a.campus_id, c.name AS campus,
              a.leadpro_name, a.leadpro_field, a.leadpro_description
       FROM awardees a JOIN regions r ON r.id = a.region_id
       LEFT JOIN campuses c ON c.id = a.campus_id
       WHERE ${f.sql} ORDER BY r.name, a.name`,
    )
    .bind(...f.params)
    .all<{
      id: number;
      awardee: string;
      batch: string;
      region_id: number;
      region: string;
      campus_id: number | null;
      campus: string | null;
      leadpro_name: string | null;
      leadpro_field: string | null;
      leadpro_description: string | null;
    }>();
  return results.map((r) => ({
    awardeeId: r.id,
    awardee: r.awardee,
    batch: r.batch,
    regionId: r.region_id,
    region: r.region,
    campusId: r.campus_id,
    campus: r.campus,
    ...toLeadpro(r.leadpro_name, r.leadpro_field, r.leadpro_description),
  }));
}

export type LeadproFilters = { field?: string; campusId?: number; regionId?: number; batch?: string; q?: string };

// Penyaringan murni di atas hasil listLeadpros(): lingkup sudah ditegakkan di SQL, jadi di sini aman memfilter bebas.
export function filterLeadpros(rows: LeadproRow[], f: LeadproFilters): LeadproRow[] {
  const needle = (f.q ?? "").trim().toLowerCase();
  return rows.filter(
    (r) =>
      (!f.field || r.field === f.field) &&
      (!f.campusId || r.campusId === f.campusId) &&
      (!f.regionId || r.regionId === f.regionId) &&
      (!f.batch || r.batch === f.batch) &&
      (!needle || [r.awardee, r.name, r.field, r.campus ?? "", r.region].some((v) => v.toLowerCase().includes(needle))),
  );
}

export type LeadproOptions = {
  fields: string[];
  batches: string[];
  regions: { id: number; name: string }[];
  campuses: { id: number; name: string }[];
};

// Pilihan saringan diambil dari daftar yang sudah berlingkup, jadi Manwil hanya melihat wilayah dan kampusnya.
export function leadproOptions(rows: LeadproRow[]): LeadproOptions {
  const sorted = (items: string[]) => [...new Set(items.filter(Boolean))].sort((a, b) => a.localeCompare(b, "id"));
  const byId = (pairs: [number | null, string | null][]) => {
    const map = new Map<number, string>();
    for (const [id, name] of pairs) if (id !== null && name) map.set(id, name);
    return [...map.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "id"));
  };
  return {
    fields: sorted(rows.map((r) => r.field)),
    batches: sorted(rows.map((r) => r.batch)),
    regions: byId(rows.map((r) => [r.regionId, r.region])),
    campuses: byId(rows.map((r) => [r.campusId, r.campus])),
  };
}

export const fieldCounts = (rows: LeadproRow[]): { field: string; count: number }[] => {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.field) counts.set(r.field, (counts.get(r.field) ?? 0) + 1);
  return [...counts.entries()].map(([field, count]) => ({ field, count })).sort((a, b) => b.count - a.count || a.field.localeCompare(b.field, "id"));
};

// ---------- mengubah (Admin) ----------

export type LeadproInput = { name: string; field: string; description: string };

export function validateLeadpro(input: LeadproInput): { ok: true; value: Leadpro } | Fail {
  const value = toLeadpro(input.name, input.field, input.description);
  if (value.name.length > 120) return { ok: false, message: "Nama proyek terlalu panjang (maksimal 120 karakter)." };
  if (value.field.length > 40) return { ok: false, message: "Bidang terlalu panjang (maksimal 40 karakter)." };
  if (value.description.length > 2000) return { ok: false, message: "Deskripsi terlalu panjang (maksimal 2000 karakter)." };
  // Nama, bidang, dan deskripsi satu paket: proyek tanpa nama tidak bisa punya bidang atau deskripsi.
  if (!value.name && (value.field || value.description)) return { ok: false, message: "Isi nama proyek dulu, atau kosongkan bidang dan deskripsinya." };
  return { ok: true, value };
}

export async function updateLeadpro(db: D1Database, admin: SessionUser, awardeeId: number, input: LeadproInput): Promise<{ ok: true } | Fail> {
  if (admin.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengubah LeadPro");
  const checked = validateLeadpro(input);
  if (!checked.ok) return checked;

  const before = await db
    .prepare("SELECT name, leadpro_name, leadpro_field, leadpro_description FROM awardees WHERE id = ?")
    .bind(awardeeId)
    .first<{ name: string; leadpro_name: string | null; leadpro_field: string | null; leadpro_description: string | null }>();
  if (!before) return { ok: false, message: "Awardee tidak ditemukan." };

  const { name, field, description } = checked.value;
  await db
    .prepare("UPDATE awardees SET leadpro_name = ?, leadpro_field = ?, leadpro_description = ? WHERE id = ?")
    .bind(name || null, field || null, description || null, awardeeId)
    .run();

  const old = toLeadpro(before.leadpro_name, before.leadpro_field, before.leadpro_description);
  const changed = [
    old.name !== name && "Nama proyek",
    old.field !== field && "Bidang",
    old.description !== description && "Deskripsi",
  ].filter(Boolean);
  if (changed.length > 0) {
    await writeAudit(db, admin, {
      action: "leadpro.update",
      entity: "awardee",
      entityId: awardeeId,
      summary: `Mengubah LeadPro ${before.name}: ${changed.join(", ")}`,
    });
  }
  return { ok: true };
}
