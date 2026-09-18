import type { FeedbackField, FeedbackItem } from "./form-config.ts";

// Aturan isian yang sama untuk form publik dan form berakun.

export type ScoredInstrument = { id: number; code: string; scaleMax: number };

export function validateScores(
  instruments: ScoredInstrument[],
  given: unknown,
): { ok: true; value: [instrumentId: number, score: number][] } | { ok: false; message: string } {
  const scores = given && typeof given === "object" ? (given as Record<string, unknown>) : {};
  const value: [number, number][] = [];
  for (const instrument of instruments) {
    const score = scores[instrument.code];
    if (!Number.isInteger(score) || (score as number) < 0 || (score as number) > instrument.scaleMax) {
      return { ok: false, message: "Masih ada pernyataan yang belum dinilai." };
    }
    value.push([instrument.id, score as number]);
  }
  return { ok: true, value };
}

const text = (value: unknown, max: number) => (typeof value === "string" ? value.trim().slice(0, max + 1) : "");

export function validateFeedback(
  items: FeedbackItem[],
  given: unknown,
): { ok: true; value: [field: FeedbackField, body: string][] } | { ok: false; message: string } {
  const feedback = given && typeof given === "object" ? (given as Record<string, unknown>) : {};
  const value: [FeedbackField, string][] = [];
  for (const item of items) {
    const body = text(feedback[item.field], 5000);
    if (body.length > 5000) return { ok: false, message: `${item.label} maksimal 5.000 karakter.` };
    if (item.required && !body) return { ok: false, message: `${item.label} wajib diisi.` };
    if (body) value.push([item.field, body]);
  }
  return { ok: true, value };
}

export const boundedText = text;

// Kode kuitansi 8 karakter yang ditunjukkan ke pengisi.
export const receiptCode = (publicId: string) => publicId.replaceAll("-", "").slice(0, 8).toUpperCase();
