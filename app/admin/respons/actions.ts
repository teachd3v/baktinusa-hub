"use server";

import { env } from "cloudflare:workers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { deleteResponse } from "@/lib/data/admin-responses";

export type ActionState = { ok: boolean; message: string } | null;

export async function deleteResponseAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const admin = await requireUser("admin");
  const result = await deleteResponse(env.DB, admin, Number(form.get("responseId")));
  if (!result.ok) return result;
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Respons dihapus." };
}
