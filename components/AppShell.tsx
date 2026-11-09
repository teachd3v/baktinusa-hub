import Link from "next/link";
import { Suspense } from "react";
import { homeFor, type SessionUser } from "@/lib/data/scope";
import { MobileChrome } from "./MobileChrome";
import { NavLinks } from "./NavLinks";
import { ResponsiveTables } from "./ResponsiveTables";

const ROLE_LABEL = { admin: "Admin", manwil: "Manajer Wilayah", awardee: "Awardee" } as const;

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");

// Rail ikon: merek di kartu putih sendiri, menu di pil gelap, lalu akun di bawahnya — seperti dok aplikasi.
// Labelnya tetap ada untuk pembaca layar dan muncul sebagai tooltip saat disentuh.
export function AppShell({
  user,
  nav,
  photoSrc,
  children,
}: {
  user: SessionUser;
  photoSrc?: string;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <>
    <MobileChrome items={nav} homeHref={homeFor(user.role)} name={user.name} role={ROLE_LABEL[user.role]} initials={initials(user.name)} photoSrc={photoSrc} />
    <div className="shell">
      <header className="shell-bar">
        <div className="shell-bar-inner">
          <Link href={homeFor(user.role)} className="shell-brand" data-label="BAKTINUSA HUB">
            <span className="shell-logo"><img src="/logo.webp" alt="" /></span>
            <span className="sr-only">BAKTINUSA HUB</span>
          </Link>

          <div className="shell-dock">
            <NavLinks items={nav} />

            <div className="shell-user">
              <span className="shell-avatar" data-label={`${user.name} · ${ROLE_LABEL[user.role]}`} aria-hidden="true">
              {initials(user.name)}
            </span>
              <span className="sr-only">
                Masuk sebagai {user.name}, {ROLE_LABEL[user.role]}
              </span>
              <Link href="/akun" className="shell-logout" data-label="Kata sandi">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
                </svg>
                <span className="sr-only">Ganti kata sandi</span>
              </Link>
              <form method="post" action="/api/auth/logout">
                <button type="submit" className="shell-logout" data-label="Keluar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10" />
                </svg>
                  <span className="sr-only">Keluar</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
    <Suspense fallback={null}>
      <ResponsiveTables />
    </Suspense>
    </>
  );
}
