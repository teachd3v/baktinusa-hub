"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { MANUAL_LINK_TTL_MS, createLoginToken } from "@/lib/data/auth";
import { createUser, getUserForAdmin, setUserStatus } from "@/lib/data/users";
import { publicOrigin } from "@/lib/origin";

// Server action adalah endpoint publik: masing-masing memeriksa ulang bahwa pemanggilnya Admin.

export type CreateUserState = { ok: boolean; message: string } | null;

export async function createUserAction(_previous: CreateUserState, form: FormData): Promise<CreateUserState> {
  const admin = await requireUser("admin");
  const role = form.get("role");
  if (role !== "admin" && role !== "manwil" && role !== "awardee") return { ok: false, message: "Pilih peran akun." };
  const result = await createUser(env.DB, admin, {
    email: String(form.get("email") ?? ""),
    name: String(form.get("name") ?? ""),
    role,
    regionId: Number(form.get("regionId")) || null,
    awardeeId: Number(form.get("awardeeId")) || null,
  });
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Akun dibuat. Buat tautan masuk dari daftar di bawah untuk membagikannya." };
}

export type LoginLinkResult = { ok: true; url: string } | { ok: false; message: string };

export async function loginLinkAction(userId: number): Promise<LoginLinkResult> {
  const admin = await requireUser("admin");
  const target = await getUserForAdmin(env.DB, admin, userId);
  if (!target || target.status !== "active") return { ok: false, message: "Akun tidak ditemukan atau sedang nonaktif." };
  const token = await createLoginToken(env.DB, target.id, MANUAL_LINK_TTL_MS);
  return { ok: true, url: `${await publicOrigin()}/masuk/verifikasi?t=${encodeURIComponent(token)}` };
}

export async function setStatusAction(form: FormData): Promise<void> {
  const admin = await requireUser("admin");
  const status = form.get("status") === "disabled" ? "disabled" : "active";
  await setUserStatus(env.DB, admin, Number(form.get("userId")), status);
  revalidatePath("/admin", "layout");
}
