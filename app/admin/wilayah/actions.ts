"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createCampus, deleteCampus, renameCampus } from "@/lib/data/campuses";
import { createRegion, deleteRegion, renameRegion } from "@/lib/data/regions";

export type RegionState = { ok: boolean; message: string } | null;

const refresh = () => revalidatePath("/admin", "layout");

export async function createRegionAction(_previous: RegionState, form: FormData): Promise<RegionState> {
  const admin = await requireUser("admin");
  const result = await createRegion(env.DB, admin, String(form.get("name") ?? ""));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Wilayah ditambahkan." };
}

export async function renameRegionAction(_previous: RegionState, form: FormData): Promise<RegionState> {
  const admin = await requireUser("admin");
  const result = await renameRegion(env.DB, admin, Number(form.get("regionId")), String(form.get("name") ?? ""));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Nama wilayah tersimpan." };
}

export async function deleteRegionAction(_previous: RegionState, form: FormData): Promise<RegionState> {
  const admin = await requireUser("admin");
  const result = await deleteRegion(env.DB, admin, Number(form.get("regionId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Wilayah dihapus." };
}

// ---------- kampus ----------

export async function createCampusAction(_previous: RegionState, form: FormData): Promise<RegionState> {
  const admin = await requireUser("admin");
  const result = await createCampus(env.DB, admin, Number(form.get("regionId")), String(form.get("name") ?? ""));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Kampus ditambahkan." };
}

export async function renameCampusAction(_previous: RegionState, form: FormData): Promise<RegionState> {
  const admin = await requireUser("admin");
  const result = await renameCampus(env.DB, admin, Number(form.get("campusId")), String(form.get("name") ?? ""));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Nama kampus tersimpan." };
}

export async function deleteCampusAction(_previous: RegionState, form: FormData): Promise<RegionState> {
  const admin = await requireUser("admin");
  const result = await deleteCampus(env.DB, admin, Number(form.get("campusId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Kampus dihapus." };
}
