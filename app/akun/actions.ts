"use server";

import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { SESSION_COOKIE, requireUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/data/account";

export type PasswordState = { ok: boolean; message: string } | null;

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

// Server action adalah endpoint publik: pemanggilnya harus sudah masuk, dan tebakan kata sandi lama dibatasi
// per akun supaya sesi curian tidak bisa dipakai untuk menebak.
export async function changePasswordAction(_previous: PasswordState, form: FormData): Promise<PasswordState> {
  const user = await requireUser();
  const current = text(form, "current");
  const next = text(form, "next");
  const confirm = text(form, "confirm");

  if (!current || !next) return { ok: false, message: "Isi kata sandi saat ini dan kata sandi baru." };
  if (next !== confirm) return { ok: false, message: "Konfirmasi tidak sama dengan kata sandi baru." };

  if (!(await env.SUBMIT_LIMITER.limit({ key: `pw:${user.id}` })).success) {
    return { ok: false, message: "Terlalu banyak percobaan. Tunggu satu menit lalu coba lagi." };
  }

  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const result = await changeOwnPassword(env.DB, user.id, current, next, token);
  if (!result.ok) return result;
  return { ok: true, message: "Kata sandi diperbarui. Perangkat lain yang sedang masuk akan keluar otomatis." };
}
