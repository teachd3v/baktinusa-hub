import { env } from "cloudflare:workers";

// Hash IP + user agent dengan kunci rahasia: cukup untuk mengenali kiriman ganda dari perangkat yang sama,
// tanpa pernah menyimpan IP mentah.
export async function deviceFingerprint(request: Request): Promise<string> {
  if (!env.FINGERPRINT_SALT) throw new Error("FINGERPRINT_SALT belum diatur");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(env.FINGERPRINT_SALT), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const ip = request.headers.get("cf-connecting-ip") ?? "";
  const userAgent = request.headers.get("user-agent") ?? "";
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${ip}|${userAgent}`)));
  return Array.from(signature.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
