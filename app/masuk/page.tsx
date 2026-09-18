import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/data/scope";
import { deliveryMode } from "@/lib/login-delivery";
import { LOGIN_ACTION } from "@/lib/turnstile";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Masuk" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  return (
    <main className="page">
      <BrandHeader title="Masuk" subtitle="BAKTINUSA HUB · Admin, Manwil, Awardee" />
      <div className="app-screen">
        {deliveryMode() === "unavailable" ? (
          <div className="notice fade-in">
            <div className="notice-emoji" aria-hidden="true">🔑</div>
            <h2 className="section-title">Masuk memakai tautan dari Admin</h2>
            <p className="section-hint">
              Hub ini tidak memakai kata sandi. Hubungi Admin program untuk mendapatkan tautan masuk pribadi Anda, lalu buka
              tautan itu di perangkat ini.
            </p>
          </div>
        ) : (
          <section className="card fade-in">
            <h2 className="section-title">Masuk dengan email</h2>
            <p className="section-hint">Tidak perlu kata sandi. Kami kirim tautan masuk sekali pakai ke email Anda.</p>
            <LoginForm siteKey={env.TURNSTILE_SITE_KEY ?? ""} action={LOGIN_ACTION} />
          </section>
        )}
      </div>
    </main>
  );
}
