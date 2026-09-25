// Admin mengetik jadwal dalam WIB; database menyimpan ISO UTC. Konversinya di satu tempat supaya
// tidak ada halaman yang diam-diam memakai zona waktu browser pengelola.

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const LOCAL_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

// "2026-10-01T23:59" (WIB) → "2026-10-01T16:59:00.000Z". Kosong berarti tanpa batas, bukan error.
export function wibInputToIso(value: string | null | undefined): { ok: true; iso: string | null } | { ok: false; message: string } {
  const raw = (value ?? "").trim();
  if (!raw) return { ok: true, iso: null };
  const m = LOCAL_PATTERN.exec(raw);
  if (!m) return { ok: false, message: "Format tanggal tidak dikenali." };
  const [, y, mo, d, h, min] = m.map(Number) as unknown as number[];
  const utc = Date.UTC(y!, mo! - 1, d!, h!, min!) - WIB_OFFSET_MS;
  const date = new Date(utc);
  if (Number.isNaN(date.getTime())) return { ok: false, message: "Tanggal tidak valid." };
  return { ok: true, iso: date.toISOString() };
}

// Kebalikannya, untuk mengisi <input type="datetime-local">.
export function isoToWibInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 16);
}
