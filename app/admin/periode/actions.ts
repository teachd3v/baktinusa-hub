"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import {
  addMeasurementToPeriod,
  createPeriod,
  isStatus,
  removeMeasurementFromPeriod,
  setPeriodStatus,
  updateMeasurementConfig,
  updatePeriod,
  type Fail,
  type PeriodMeasurementConfig,
} from "@/lib/data/admin-periods";
import { isCycle } from "@/lib/data/periods";
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

  const result = await updateMeasurementConfig(env.DB, admin, Number(form.get("periodId")), Number(form.get("measurementId")), {
    targetRule: rule as PeriodMeasurementConfig["targetRule"],
    targetMin: Number(form.get("targetMin")) || null,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
  });
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Jadwal & target jenis pengukuran tersimpan." };
}

export async function addTypeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await addMeasurementToPeriod(env.DB, admin, Number(form.get("periodId")), Number(form.get("measurementId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Jenis pengukuran ditambahkan. Atur jadwal dan targetnya di bawah." };
}

export async function removeTypeAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await removeMeasurementFromPeriod(env.DB, admin, Number(form.get("periodId")), Number(form.get("measurementId")));
  if (!result.ok) return result;
  refresh();
  return { ok: true, message: "Jenis pengukuran dilepas dari siklus." };
}

export async function createPeriodAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const cycle = field(form, "cycle");
  if (!isCycle(cycle)) return gagal("Pilih siklusnya: Awal, Tengah, atau Akhir.");

  const batch = field(form, "batch").trim().toUpperCase();
  const result = await createPeriod(env.DB, admin, { batch, cycle, slug: field(form, "slug"), name: field(form, "name") });
  if (!result.ok) return result;
  refresh();
  redirect(`/admin/periode/${(field(form, "slug").trim() || `${batch}-${cycle}`).toLowerCase()}`);
}
