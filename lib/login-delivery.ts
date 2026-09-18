import { env } from "cloudflare:workers";
import type { SessionUser } from "./data/scope.ts";

// Pengiriman tautan masuk bisa ditukar:
// - email lewat Cloudflare Email Service, begitu EMAIL_FROM diisi dan binding EMAIL dipasang (butuh domain terverifikasi);
// - dicetak ke log untuk pengembangan lokal (LOGIN_LINK_TO_LOG=1 di .dev.vars);
// - selain itu tidak tersedia, dan Admin membagikan tautan masuk sendiri dari halaman Pengguna.

type EmailBinding = {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    html: string;
    text: string;
  }): Promise<{ messageId: string }>;
};

const config = env as unknown as { EMAIL?: EmailBinding; EMAIL_FROM?: string; LOGIN_LINK_TO_LOG?: string };

export type DeliveryMode = "email" | "log" | "unavailable";

export function deliveryMode(): DeliveryMode {
  if (config.EMAIL && config.EMAIL_FROM) return "email";
  if (config.LOGIN_LINK_TO_LOG === "1") return "log";
  return "unavailable";
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function deliverLoginLink(user: SessionUser, url: string, validMinutes: number): Promise<void> {
  const mode = deliveryMode();
  if (mode === "log") {
    console.log(`[masuk] tautan untuk ${user.email}: ${url}`);
    return;
  }
  if (mode !== "email") throw new Error("Pengiriman tautan masuk belum dikonfigurasi");

  const text = [
    `Halo ${user.name},`,
    "",
    "Buka tautan berikut untuk masuk ke BAKTINUSA HUB:",
    url,
    "",
    `Tautan ini hanya bisa dipakai sekali dan berlaku ${validMinutes} menit.`,
    "Kalau Anda tidak meminta tautan ini, abaikan email ini.",
  ].join("\n");
  const html = `<p>Halo ${escapeHtml(user.name)},</p>
<p>Klik tombol berikut untuk masuk ke BAKTINUSA HUB:</p>
<p><a href="${escapeHtml(url)}" style="display:inline-block;padding:12px 22px;background:#bef264;color:#111827;border-radius:9999px;font-weight:700;text-decoration:none">Masuk ke BAKTINUSA HUB</a></p>
<p style="color:#6b7280;font-size:13px">Tautan ini hanya bisa dipakai sekali dan berlaku ${validMinutes} menit. Kalau Anda tidak meminta tautan ini, abaikan email ini.</p>`;

  await config.EMAIL!.send({
    to: user.email,
    from: { email: config.EMAIL_FROM!, name: "BAKTINUSA HUB" },
    subject: "Tautan masuk BAKTINUSA HUB",
    html,
    text,
  });
}
