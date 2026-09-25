"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createUser, setCredentials, setUserStatus } from "@/lib/data/users";

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
    loginId: String(form.get("loginId") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Akun dibuat. Berikan ID dan kata sandinya kepada yang bersangkutan lewat jalur pribadi." };
}

// Mengatur ulang ID masuk dan kata sandi — dipakai saat orang lupa kata sandinya.
export async function setCredentialsAction(_previous: CreateUserState, form: FormData): Promise<CreateUserState> {
  const admin = await requireUser("admin");
  const result = await setCredentials(env.DB, admin, Number(form.get("userId")), {
    loginId: String(form.get("loginId") ?? ""),
    password: String(form.get("password") ?? ""),
  });
  if (!result.ok) return { ok: false, message: result.message };
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Kredensial akun diperbarui. Sesi lama akun itu ikut diputus." };
}

export async function setStatusAction(form: FormData): Promise<void> {
  const admin = await requireUser("admin");
  const status = form.get("status") === "disabled" ? "disabled" : "active";
  await setUserStatus(env.DB, admin, Number(form.get("userId")), status);
  revalidatePath("/admin", "layout");
}
