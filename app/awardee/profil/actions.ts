"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { saveProfile } from "@/lib/data/profiles";
import { profileFromForm } from "@/lib/profile-form";

export type ProfileActionState = { ok: boolean; message: string } | null;

// Server action adalah endpoint publik: tiap aksi memeriksa ulang perannya, dan awardee hanya bisa menulis ke dirinya
// sendiri (id awardee diambil dari sesi, bukan dari form).
const limited = async (kind: "profile", userId: number) => !(await env.SUBMIT_LIMITER.limit({ key: `${kind}:${userId}` })).success;
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
