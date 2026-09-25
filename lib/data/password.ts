// Kata sandi. Database tidak pernah menyimpan kata sandi apa adanya — hanya turunan PBKDF2 dengan
// garam acak per akun, jadi dua orang berkata sandi sama pun menghasilkan simpanan berbeda.
//
// PBKDF2-HMAC-SHA256 dipilih karena tersedia langsung di WebCrypto Workers; bcrypt/argon2 butuh modul
// native yang tidak ada di runtime ini. Jumlah iterasi ikut disimpan di dalam string, jadi kelak bisa
// dinaikkan tanpa membuat kata sandi lama tidak bisa dipakai.

const ITERATIONS = 210_000;
const KEY_BITS = 256;
const SALT_BYTES = 16;

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

const fromB64 = (text: string) => {
  const padded = text.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(padded + "=".repeat((4 - (padded.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: salt as unknown as BufferSource, iterations, hash: "SHA-256" },
    key,
    KEY_BITS,
  );
  return new Uint8Array(bits);
}

export type PasswordProblem = { ok: false; message: string };

// Aturan kata sandi sengaja sederhana: panjang lebih menentukan daripada campuran simbol.
// Batas 6 mengikuti pola kata sandi program yang sudah dipakai (mis. BA2026); yang menahan tebakan
// beruntun bukan aturan ini, melainkan Turnstile plus batas laju per perangkat dan per ID saat masuk.
export const MIN_PASSWORD = 6;

export function checkPassword(password: string): PasswordProblem | null {
  if (password.length < MIN_PASSWORD) return { ok: false, message: `Kata sandi minimal ${MIN_PASSWORD} karakter.` };
  if (password.length > 200) return { ok: false, message: "Kata sandi maksimal 200 karakter." };
  if (!/\S/.test(password)) return { ok: false, message: "Kata sandi tidak boleh hanya spasi." };
  return null;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

// Selalu memeriksa seluruh panjang turunan supaya waktu jawabnya tidak membocorkan seberapa dekat tebakan.
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const [scheme, iterations, salt, hash] = stored.split("$");
  if (scheme !== "pbkdf2" || !iterations || !salt || !hash) return false;

  const rounds = Number(iterations);
  if (!Number.isInteger(rounds) || rounds < 1000 || rounds > 2_000_000) return false;

  const expected = fromB64(hash);
  const actual = await derive(password, fromB64(salt), rounds);
  if (actual.length !== expected.length) return false;

  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

// ID masuk: huruf besar dan angka, mis. ADM001, BA00126, MW00126.
const ID_PATTERN = /^[A-Z0-9]{3,20}$/;

export const normalizeLoginId = (value: string) => value.trim().toUpperCase();

export function checkLoginId(value: string): PasswordProblem | null {
  return ID_PATTERN.test(normalizeLoginId(value))
    ? null
    : { ok: false, message: "ID masuk 3–20 karakter, hanya huruf dan angka. Contoh: BA00126." };
}
