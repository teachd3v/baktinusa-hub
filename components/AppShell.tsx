import Link from "next/link";
import { homeFor, type SessionUser } from "@/lib/data/scope";
import { NavLinks } from "./NavLinks";

const ROLE_LABEL = { admin: "Admin", manwil: "Manajer Wilayah", awardee: "Awardee" } as const;

export function AppShell({
  user,
  nav,
  children,
}: {
  user: SessionUser;
  nav: { href: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="shell-bar-inner">
          <Link href={homeFor(user.role)} className="shell-brand">
            <span className="shell-logo"><img src="/logo.webp" alt="" /></span>
            <span>BAKTINUSA <b>HUB</b></span>
          </Link>
          <NavLinks items={nav} />
          <div className="shell-user">
            <span>
              {user.name}
              <small>{ROLE_LABEL[user.role]}</small>
            </span>
            <form method="post" action="/api/auth/logout">
              <button type="submit" className="btn-ghost">Keluar</button>
            </form>
          </div>
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
