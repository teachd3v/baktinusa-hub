import { env } from "cloudflare:workers";

export const TURNSTILE_ACTION = "survey_submit";

type SiteverifyResult = {
  success?: boolean;
  action?: string;
  hostname?: string;
  metadata?: { result_with_testing_key?: boolean };
};

// Siteverify kanonik: gagal = tolak. Kunci uji Turnstile tidak mengembalikan action, jadi pemeriksaan action
// hanya dilewati kalau Cloudflare menandai hasilnya sebagai kunci uji DAN flag dev TURNSTILE_ALLOW_TEST_KEYS aktif.
export async function verifyTurnstile(token: unknown, remoteIp: string | null): Promise<boolean> {
  const secret = env.TURNSTILE_SECRET;
  const hostnames = new Set((env.TURNSTILE_HOSTNAMES ?? "").split(",").map((h) => h.trim()).filter(Boolean));
  if (!secret || typeof token !== "string" || token.length === 0 || token.length > 2048 || hostnames.size === 0) return false;

  let result: SiteverifyResult;
  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      signal: AbortSignal.timeout(10_000),
      body: new URLSearchParams({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
    });
    if (!res.ok) return false;
    result = await res.json();
  } catch {
    return false;
  }

  const testKey = result.metadata?.result_with_testing_key === true && env.TURNSTILE_ALLOW_TEST_KEYS === "1";
  return result.success === true && (testKey || result.action === TURNSTILE_ACTION) && hostnames.has(result.hostname ?? "");
}
