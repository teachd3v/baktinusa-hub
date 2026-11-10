"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { deleteSemester, saveProfile, saveSemester, setAwardeeStatus } from "@/lib/data/profiles";
import { profileFromForm, semesterFromForm } from "@/lib/profile-form";

export type AdminProfileState = { ok: boolean; message: string } | null;

// Server action adalah endpoint publik: masing-masing memeriksa ulang bahwa pemanggilnya Admin.
const awardeeIdOf = (form: FormData) => Number(form.get("awardeeId"));
const refresh = (id: number) => {
  revalidatePath("/admin/profil");
  revalidatePath(`/admin/profil/${id}`);
};

export async function saveProfileAsAdminAction(_previous: AdminProfileState, form: FormData): Promise<AdminProfileState> {
  const admin = await requireUser("admin");
  const id = awardeeIdOf(form);
  const result = await saveProfile(env.DB, admin, id, profileFromForm(form));
  if (!result.ok) return result;
  refresh(id);
  return { ok: true, message: "Profil tersimpan." };
}

export async function saveSemesterAsAdminAction(_previous: AdminProfileState, form: FormData): Promise<AdminProfileState> {
  const admin = await requireUser("admin");
  const id = awardeeIdOf(form);
  const result = await saveSemester(env.DB, admin, id, semesterFromForm(form));
  if (!result.ok) return result;
  refresh(id);
  return { ok: true, message: "Semester tersimpan." };
}

export async function deleteSemesterAsAdminAction(form: FormData): Promise<void> {
  const admin = await requireUser("admin");
  const id = awardeeIdOf(form);
  const semester = Number(form.get("semester"));
  if (Number.isInteger(id) && Number.isInteger(semester)) await deleteSemester(env.DB, admin, id, semester);
  refresh(id);
}

export async function saveStatusAction(_previous: AdminProfileState, form: FormData): Promise<AdminProfileState> {
  const admin = await requireUser("admin");
  const id = awardeeIdOf(form);
  const result = await setAwardeeStatus(env.DB, admin, id, String(form.get("status") ?? ""), String(form.get("joinedAt") ?? ""));
  if (!result.ok) return result;
  refresh(id);
  return { ok: true, message: "Status tersimpan." };
}
