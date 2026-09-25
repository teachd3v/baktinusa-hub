"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createAwardee, deleteAwardee, updateAwardee, type AwardeeInput } from "@/lib/data/admin-awardees";

export type ActionState = { ok: boolean; message: string } | null;

const field = (form: FormData, name: string) => String(form.get(name) ?? "");
const optional = (form: FormData, name: string) => field(form, name).trim() || null;

const inputOf = (form: FormData): AwardeeInput => ({
  name: field(form, "name"),
  batch: field(form, "batch"),
  regionId: Number(form.get("regionId")),
  campus: optional(form, "campus"),
  referralCode: field(form, "referralCode"),
  photoKey: optional(form, "photoKey"),
  leadproName: optional(form, "leadproName"),
  leadproField: optional(form, "leadproField"),
  leadproDescription: optional(form, "leadproDescription"),
});

const refresh = () => revalidatePath("/admin", "layout");

export async function createAwardeeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await createAwardee(env.DB, admin, inputOf(form));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Awardee ditambahkan. Buat akunnya di halaman Pengguna kalau perlu." };
}

export async function updateAwardeeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await updateAwardee(env.DB, admin, Number(form.get("awardeeId")), inputOf(form));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Data awardee tersimpan." };
}

export async function deleteAwardeeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await deleteAwardee(env.DB, admin, Number(form.get("awardeeId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Awardee dihapus." };
}
