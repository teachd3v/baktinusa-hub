"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { deleteSemester, saveProfile, saveSemester } from "@/lib/data/profiles";
import { profileFromForm, semesterFromForm } from "@/lib/profile-form";

export type ProfileActionState = { ok: boolean; message: string } | null;

// Server action adalah endpoint publik: tiap aksi memeriksa ulang perannya, dan awardee hanya bisa menulis ke dirinya
// sendiri (id awardee diambil dari sesi, bukan dari form).
const limited = async (kind: "profile" | "semester", userId: number) => !(await env.SUBMIT_LIMITER.limit({ key: `${kind}:${userId}` })).success;
const TOO_MANY = { ok: false, message: "Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi." } as const;
const refresh = () => revalidatePath("/awardee", "layout");

export async function saveMyProfileAction(_previous: ProfileActionState, form: FormData): Promise<ProfileActionState> {
  const user = await requireUser("awardee");
  if (await limited("profile", user.id)) return TOO_MANY;
  const result = await saveProfile(env.DB, user, user.awardeeId!, profileFromForm(form), form.get("consent") === "1");
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Profil tersimpan." };
}

export async function saveMySemesterAction(_previous: ProfileActionState, form: FormData): Promise<ProfileActionState> {
  const user = await requireUser("awardee");
  if (await limited("semester", user.id)) return TOO_MANY;
  const result = await saveSemester(env.DB, user, user.awardeeId!, semesterFromForm(form));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Semester tersimpan." };
}

export async function deleteMySemesterAction(form: FormData): Promise<void> {
  const user = await requireUser("awardee");
  const semester = Number(form.get("semester"));
  if (Number.isInteger(semester)) await deleteSemester(env.DB, user, user.awardeeId!, semester);
  refresh();
}
