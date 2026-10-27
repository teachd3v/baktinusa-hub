"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import {
  applyInstrumentImport,
  planInstrumentImport,
  type InstrumentRowPlan,
  type InstrumentRowResult,
  type RawInstrumentRow,
} from "@/lib/data/import-instruments";

import { deleteManyInstruments } from "@/lib/data/measurements";

export async function planInstrumentImportAction(
  measurementId: number,
  rows: RawInstrumentRow[],
): Promise<InstrumentRowPlan[]> {
  const admin = await requireUser("admin");
  return planInstrumentImport(env.DB, admin, measurementId, rows);
}

export async function applyInstrumentImportAction(
  measurementId: number,
  plans: InstrumentRowPlan[],
): Promise<InstrumentRowResult[]> {
  const admin = await requireUser("admin");
  const results = await applyInstrumentImport(env.DB, admin, measurementId, plans);
  revalidatePath("/admin", "layout");
  return results;
}

export type BulkInstrumentState = {
  ok: boolean;
  message: string;
  failures: { code: string; reason: string }[];
} | null;

export async function deleteManyInstrumentsAction(
  _previous: BulkInstrumentState,
  form: FormData,
): Promise<BulkInstrumentState> {
  const admin = await requireUser("admin");
  const ids = form
    .getAll("pilih")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  if (ids.length === 0) {
    return { ok: false, message: "Pilih minimal satu butir soal untuk dihapus.", failures: [] };
  }

  const outcomes = await deleteManyInstruments(env.DB, admin, ids);
  const berhasil = outcomes.filter((o) => o.ok).length;
  const gagal = outcomes
    .filter((o) => !o.ok)
    .map((o) => ({ code: o.code || `ID ${o.id}`, reason: o.message }));

  revalidatePath("/admin", "layout");
  return {
    ok: gagal.length === 0,
    message: `${berhasil} butir soal berhasil dihapus.${gagal.length > 0 ? ` ${gagal.length} butir soal gagal dihapus.` : ""}`,
    failures: gagal,
  };
}
