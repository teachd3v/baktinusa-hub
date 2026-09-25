"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { deleteAwardee } from "@/lib/data/admin-awardees";
import { applyPlan, planImport, type RawRow, type RowPlan, type RowResult } from "@/lib/data/import-people";
import { createPerson, deleteAccount, updateAwardeeData, updatePerson, type PersonInput } from "@/lib/data/people";
import type { Role } from "@/lib/data/scope";

// Server action adalah endpoint publik: masing-masing memeriksa ulang bahwa pemanggilnya Admin.

export type PersonState = { ok: boolean; message: string } | null;

const text = (form: FormData, name: string) => String(form.get(name) ?? "");

function inputOf(form: FormData): PersonInput | null {
  const role = form.get("role");
  if (role !== "admin" && role !== "manwil" && role !== "awardee") return null;
  return {
    role: role as Role,
    loginId: text(form, "loginId"),
    name: text(form, "name"),
    email: text(form, "email"),
    password: text(form, "password"),
    status: form.get("status") === "disabled" ? "disabled" : "active",
    regionId: Number(form.get("regionId")) || null,
    awardeeId: Number(form.get("awardeeId")) || null,
    batch: text(form, "batch"),
    campus: text(form, "campus"),
    referralCode: text(form, "referralCode"),
  };
}

const refresh = () => revalidatePath("/admin", "layout");

export async function createPersonAction(_previous: PersonState, form: FormData): Promise<PersonState> {
  const admin = await requireUser("admin");
  const input = inputOf(form);
  if (!input) return { ok: false, message: "Pilih peran akun." };

  const result = await createPerson(env.DB, admin, input);
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Tersimpan. Berikan ID dan kata sandinya lewat jalur pribadi." };
}

export async function updatePersonAction(_previous: PersonState, form: FormData): Promise<PersonState> {
  const admin = await requireUser("admin");
  const input = inputOf(form);
  if (!input) return { ok: false, message: "Peran akun tidak dikenal." };

  const result = await updatePerson(env.DB, admin, Number(form.get("userId")), input);
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Perubahan tersimpan." };
}

export async function deleteAccountAction(_previous: PersonState, form: FormData): Promise<PersonState> {
  const admin = await requireUser("admin");
  const result = await deleteAccount(env.DB, admin, Number(form.get("userId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Akun dihapus. Data awardee-nya tetap tersimpan." };
}

// ---------- data awardee yang belum punya akun ----------

export async function updateAwardeeDataAction(_previous: PersonState, form: FormData): Promise<PersonState> {
  const admin = await requireUser("admin");
  const result = await updateAwardeeData(env.DB, admin, Number(form.get("awardeeId")), {
    name: text(form, "name"),
    batch: text(form, "batch"),
    regionId: Number(form.get("regionId")) || null,
    campus: text(form, "campus"),
    referralCode: text(form, "referralCode"),
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Data awardee tersimpan." };
}

export async function deleteAwardeeDataAction(_previous: PersonState, form: FormData): Promise<PersonState> {
  const admin = await requireUser("admin");
  const result = await deleteAwardee(env.DB, admin, Number(form.get("awardeeId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Data awardee dihapus." };
}

// ---------- impor massal ----------

export async function planImportAction(rows: RawRow[]): Promise<RowPlan[]> {
  const admin = await requireUser("admin");
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 2000) {
    throw new Error("Berkas kosong atau terlalu besar (maksimal 2000 baris).");
  }
  return planImport(env.DB, admin, rows);
}

// Dipanggil berulang per potongan kecil; penulisannya tetap divalidasi ulang di lapisan data.
export async function applyImportAction(plans: RowPlan[]): Promise<RowResult[]> {
  const admin = await requireUser("admin");
  if (!Array.isArray(plans) || plans.length > 50) throw new Error("Potongan impor terlalu besar.");
  const results = await applyPlan(env.DB, admin, plans);
  refresh();
  return results;
}
