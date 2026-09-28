"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  addInstrument,
  createMeasurement,
  deleteInstrument,
  deleteMeasurement,
  renameMeasurement,
  updateFormText,
  updateInstrument,
  isFilledBy,
} from "@/lib/data/measurements";

export type MeasurementState = { ok: boolean; message: string } | null;

const text = (form: FormData, name: string) => String(form.get(name) ?? "");
const refresh = () => revalidatePath("/admin", "layout");
const num = (form: FormData, name: string) => Number(form.get(name));

export async function createMeasurementAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const filledBy = text(form, "filledBy");
  if (!isFilledBy(filledBy)) return { ok: false, message: "Pilih siapa yang mengisi jenis pengukuran ini." };

  const result = await createMeasurement(env.DB, admin, {
    code: text(form, "code"),
    slug: text(form, "slug"),
    name: text(form, "name"),
    filledBy,
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

// ---------- soal ----------

const instrumentInput = (form: FormData) => ({
  code: text(form, "code"),
  statement: text(form, "statement"),
  scaleMax: Number(form.get("scaleMax")) || 4,
});

export async function addInstrumentAction(_previous: MeasurementState, form: FormData): Promise<MeasurementState> {
  const admin = await requireUser("admin");
  const result = await addInstrument(env.DB, admin, num(form, "measurementId"), instrumentInput(form));
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
