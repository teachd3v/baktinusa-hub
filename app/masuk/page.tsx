import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandHeader } from "@/components/BrandHeader";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/data/scope";
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
        <section className="card fade-in">
          <h2 className="section-title">Masuk ke akun Anda</h2>
          <p className="section-hint">Pakai ID akun dan kata sandi yang diberikan Admin program.</p>
          <LoginForm siteKey={env.TURNSTILE_SITE_KEY ?? ""} action={LOGIN_ACTION} />
        </section>
      </div>
    </main>
  );
}
