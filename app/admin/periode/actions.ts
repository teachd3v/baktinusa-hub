"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import {
  addCategory,
  addInstrument,
  createPeriod,
  deleteCategory,
  deleteInstrument,
  updateFormText,
  updateInstrument,
} from "@/lib/data/admin-instruments";
import {
  addTypeToPeriod,
  isStatus,
  removeTypeFromPeriod,
  setPeriodStatus,
  updatePeriod,
  updateTypeConfig,
  type Fail,
  type PeriodTypeConfig,
} from "@/lib/data/admin-periods";
import { wibInputToIso } from "@/lib/waktu";

// Server action adalah endpoint publik: tiap fungsi memeriksa ulang bahwa pemanggilnya Admin.

export type ActionState = { ok: boolean; message: string } | null;

const field = (form: FormData, name: string) => String(form.get(name) ?? "");
const gagal = (message: string): Fail => ({ ok: false, message });

// Dua kolom waktu sekaligus: keduanya diketik dalam WIB dan disimpan sebagai UTC.
function windowOf(form: FormData, prefix = ""): { ok: true; opensAt: string | null; closesAt: string | null } | Fail {
  const opens = wibInputToIso(field(form, `${prefix}opensAt`));
  if (!opens.ok) return gagal(`Waktu buka: ${opens.message}`);
  const closes = wibInputToIso(field(form, `${prefix}closesAt`));
  if (!closes.ok) return gagal(`Waktu tutup: ${closes.message}`);
  return { ok: true, opensAt: opens.iso, closesAt: closes.iso };
}

const refresh = () => revalidatePath("/admin", "layout");

export async function savePeriodAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const window = windowOf(form);
  if (!window.ok) return window;

  const result = await updatePeriod(env.DB, admin, Number(form.get("periodId")), {
    name: field(form, "name"),
    opensAt: window.opensAt,
    closesAt: window.closesAt,
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Jadwal periode tersimpan." };
}

export async function setStatusAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const status = form.get("status");
  if (!isStatus(status)) return gagal("Status tidak dikenal.");

  const result = await setPeriodStatus(env.DB, admin, Number(form.get("periodId")), status);
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: `Status periode sekarang: ${status}.` };
}

export async function saveTypeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const window = windowOf(form);
  if (!window.ok) return window;
  const rule = field(form, "targetRule");
  if (rule !== "none" && rule !== "fixed" && rule !== "region_peers") return gagal("Aturan target tidak dikenal.");

  const result = await updateTypeConfig(env.DB, admin, Number(form.get("periodId")), Number(form.get("typeId")), {
    targetRule: rule as PeriodTypeConfig["targetRule"],
    targetMin: Number(form.get("targetMin")) || null,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Jadwal & target tipe penilai tersimpan." };
}

export async function addTypeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await addTypeToPeriod(env.DB, admin, Number(form.get("periodId")), Number(form.get("typeId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Tipe penilai ditambahkan. Atur jadwal dan targetnya di bawah." };
}

export async function removeTypeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await removeTypeFromPeriod(env.DB, admin, Number(form.get("periodId")), Number(form.get("typeId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Tipe penilai dilepas dari periode." };
}

// ---------- periode baru & kuesioner ----------

export async function createPeriodAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const kind = field(form, "kind");
  if (kind !== "assessment" && kind !== "leadpro") return gagal("Pilih jenis periode.");

  const result = await createPeriod(env.DB, admin, {
    slug: field(form, "slug"),
    name: field(form, "name"),
    batch: field(form, "batch"),
    kind,
    copyFromId: Number(form.get("copyFromId")) || null,
  });
  if (!result.ok) return result;
  refresh();
  redirect(`/admin/periode/${field(form, "slug").trim().toLowerCase()}`);
}

export async function addCategoryAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await addCategory(env.DB, admin, Number(form.get("periodId")), field(form, "name"));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Kategori ditambahkan." };
}

export async function deleteCategoryAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await deleteCategory(env.DB, admin, Number(form.get("periodId")), Number(form.get("categoryId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Kategori dihapus." };
}

const instrumentInput = (form: FormData) => ({
  code: field(form, "code"),
  textPublic: field(form, "textPublic"),
  textSelf: field(form, "textSelf") || null,
  scaleMax: Number(form.get("scaleMax")) || 4,
});

export async function addInstrumentAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await addInstrument(env.DB, admin, Number(form.get("periodId")), Number(form.get("categoryId")), instrumentInput(form));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Pertanyaan ditambahkan." };
}

export async function updateInstrumentAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await updateInstrument(env.DB, admin, Number(form.get("periodId")), Number(form.get("instrumentId")), instrumentInput(form));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Pertanyaan diperbarui." };
}

export async function deleteInstrumentAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await deleteInstrument(env.DB, admin, Number(form.get("periodId")), Number(form.get("instrumentId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Pertanyaan dihapus." };
}

export async function saveFormTextAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await updateFormText(env.DB, admin, Number(form.get("periodId")), {
    title: field(form, "title"),
    subtitle: field(form, "subtitle") || null,
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Teks form publik tersimpan." };
}
