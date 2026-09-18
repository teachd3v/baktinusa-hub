import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandHeader } from "@/components/BrandHeader";
import { peekLoginToken } from "@/lib/data/auth";

export const dynamic = "force-dynamic";
// "same-origin": token di URL tidak ikut terkirim sebagai referrer ke pihak luar (font, Turnstile).
// Jangan "no-referrer" — itu membuat browser mengirim Origin: null pada POST, dan verifikasi Origin menolaknya.
export const metadata: Metadata = { title: "Masuk", referrer: "same-origin" };

// Membuka tautan TIDAK langsung memakai token (lihat /api/auth/verify): pengguna menekan "Masuk" dulu.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ t?: string; gagal?: string }> }) {
  const { t, gagal } = await searchParams;
  const pending = !gagal && typeof t === "string" ? await peekLoginToken(env.DB, t) : null;

  return (
    <main className="page">
      <BrandHeader title="Masuk" subtitle="BAKTINUSA HUB" />
      <div className="app-screen">
        {pending ? (
          <section className="card fade-in notice">
            <div className="notice-emoji" aria-hidden="true">👋</div>
            <h2 className="section-title">Masuk sebagai {pending.name}</h2>
            <p className="section-hint">Tautan ini hanya bisa dipakai sekali.</p>
            <form method="post" action="/api/auth/verify">
              <input type="hidden" name="t" value={t} />
              <button type="submit" className="btn" style={{ width: "100%" }}>Masuk</button>
            </form>
          </section>
        ) : (
          <div className="notice fade-in">
            <div className="notice-emoji" aria-hidden="true">⌛</div>
            <h2 className="section-title">Tautan masuk tidak berlaku</h2>
            <p className="section-hint">Tautan ini sudah dipakai atau sudah kedaluwarsa. Minta tautan baru untuk masuk.</p>
            <Link className="btn" href="/masuk">Minta tautan baru</Link>
          </div>
        )}
      </div>
    </main>
  );
}
