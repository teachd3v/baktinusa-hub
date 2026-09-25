"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  addCategory,
  addInstrument,
  createMeasurement,
  deleteCategory,
  deleteInstrument,
  deleteMeasurement,
  renameCategory,
  renameMeasurement,
  updateFormText,
  updateInstrument,
} from "@/lib/data/measurements";

export type MeasurementState = { ok: boolean; message: string } | null;

const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const refresh = () => revalidatePath("/admin", "layout");
const num = (form: FormData, name: string) => Number(form.get(name));

export async function createMeasurementAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const kind = text(form, "kind");
  if (kind !== "assessment" && kind !== "leadpro") return { ok: false, message: "Pilih jenis pengukuran." };

  const result = await createMeasurement(env.DB, admin, {
    slug: text(form, "slug"),
    name: text(form, "name"),
    kind,
    copyFromId: num(form, "copyFromId") || null,
  });
  if (!result.ok) return result;
  refresh();
  redirect(`/admin/pengukuran/${text(form, "slug").trim().toLowerCase()}`);
}

export async function renameMeasurementAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await renameMeasurement(env.DB, admin, num(form, "measurementId"), text(form, "name"));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Nama pengukuran tersimpan." };
}

export async function deleteMeasurementAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await deleteMeasurement(env.DB, admin, num(form, "measurementId"));
  if (!result.ok) return result;
  refresh();
  redirect("/admin/pengukuran");
}

export async function saveFormTextAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await updateFormText(env.DB, admin, num(form, "measurementId"), {
    title: text(form, "title"),
    subtitle: text(form, "subtitle") || null,
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Teks form publik tersimpan." };
}

// ---------- sub pengukuran & soal ----------

export async function addCategoryAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await addCategory(env.DB, admin, num(form, "measurementId"), text(form, "name"));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Sub pengukuran ditambahkan." };
}

export async function renameCategoryAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await renameCategory(env.DB, admin, num(form, "measurementId"), num(form, "categoryId"), text(form, "name"));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Nama sub pengukuran tersimpan." };
}

export async function deleteCategoryAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await deleteCategory(env.DB, admin, num(form, "measurementId"), num(form, "categoryId"));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Sub pengukuran dihapus." };
}

const instrumentInput = (form: FormData) => ({
  code: text(form, "code"),
  textPublic: text(form, "textPublic"),
  textSelf: text(form, "textSelf") || null,
  scaleMax: Number(form.get("scaleMax")) || 4,
});

export async function addInstrumentAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await addInstrument(env.DB, admin, num(form, "measurementId"), num(form, "categoryId"), instrumentInput(form));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Soal ditambahkan." };
}

export async function updateInstrumentAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await updateInstrument(env.DB, admin, num(form, "measurementId"), num(form, "instrumentId"), instrumentInput(form));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Soal diperbarui." };
}

export async function deleteInstrumentAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await deleteInstrument(env.DB, admin, num(form, "measurementId"), num(form, "instrumentId"));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Soal dihapus." };
}
