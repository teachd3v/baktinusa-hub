"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NavIcon } from "./NavIcon";
import { activeHref } from "./NavLinks";

type Item = { href: string; label: string };

// Di layar ponsel kerangka berganti rupa jadi aplikasi: bilah judul di atas, tab di bawah (jempol sampai),
// dan satu lembar yang naik dari bawah untuk akun serta menu yang tidak muat. Tab maksimal lima: kalau menunya
// lebih dari empat, sisanya pindah ke "Lainnya". Di layar lebar semuanya disembunyikan CSS.
const MAX_TABS = 4;

export function MobileChrome({
  items,
  homeHref,
  name,
  role,
  initials,
}: {
  items: Item[];
  homeHref: string;
  name: string;
  role: string;
  initials: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);

  const overflowing = items.length > MAX_TABS;
  const tabs = overflowing ? items.slice(0, MAX_TABS) : items;
  const rest = overflowing ? items.slice(MAX_TABS) : [];

  const active = activeHref(items, pathname);
  const restActive = rest.some((item) => item.href === active);

  // Pindah halaman menutup lembar; Escape juga.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !sheet.current) return;
      // Fokus berputar di dalam lembar selama terbuka.
      const focusable = sheet.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.classList.add("sheet-open");
    sheet.current?.querySelector<HTMLElement>("a[href], button")?.focus();
    const trigger = opener.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.classList.remove("sheet-open");
      trigger?.focus();
    };
  }, [open]);

  const openFrom = (button: HTMLButtonElement) => {
    opener.current = button;
    setOpen(true);
  };

  return (
    <div className="mobile-chrome">
      <header className="mobile-bar">
        <Link href={homeHref} className="mobile-logo" aria-label="BAKTINUSA HUB, ke beranda">
          <img src="/logo.webp" alt="" />
        </Link>
        {/* Nama halaman sudah jadi judul di isinya, jadi bilah ini memegang merek saja. */}
        <p className="mobile-title">BAKTINUSA HUB</p>
        <button type="button" className="mobile-avatar" aria-label={`Akun ${name}`} aria-haspopup="dialog" aria-expanded={open} onClick={(e) => openFrom(e.currentTarget)}>
          {initials}
        </button>
      </header>

      <nav className="mobile-tabs" aria-label="Navigasi utama">
        {tabs.map((item) => (
          <Link key={item.href} href={item.href} className="mobile-tab" aria-current={item.href === active ? "page" : undefined}>
            <span className="mobile-tab-icon"><NavIcon label={item.label} /></span>
            <span className="mobile-tab-label">{item.label}</span>
          </Link>
        ))}
        {overflowing && (
          <button type="button" className="mobile-tab" aria-haspopup="dialog" aria-expanded={open} data-current={restActive ? "true" : undefined} onClick={(e) => openFrom(e.currentTarget)}>
            <span className="mobile-tab-icon"><NavIcon label="Lainnya" /></span>
            <span className="mobile-tab-label">Lainnya</span>
          </button>
        )}
      </nav>

      <div className="mobile-sheet-layer" data-open={open ? "true" : undefined} inert={!open}>
        <button type="button" className="mobile-scrim" tabIndex={-1} aria-label="Tutup" onClick={() => setOpen(false)} />
        <div ref={sheet} className="mobile-sheet" role="dialog" aria-modal="true" aria-label="Akun dan menu lainnya">
          <span className="mobile-grip" aria-hidden="true" />
          <div className="mobile-account">
            <span className="mobile-account-avatar" aria-hidden="true">{initials}</span>
            <div>
              <p className="mobile-account-name">{name}</p>
              <p className="mobile-account-role">{role}</p>
            </div>
          </div>

          {rest.length > 0 && (
            <ul className="mobile-more">
              {rest.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} aria-current={item.href === active ? "page" : undefined}>
                    <span className="mobile-tab-icon"><NavIcon label={item.label} /></span>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <form method="post" action="/api/auth/logout">
            <button type="submit" className="mobile-logout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h10" />
              </svg>
              Keluar
            </button>
          </form>
          <button type="button" className="mobile-close" onClick={() => setOpen(false)}>Tutup</button>
        </div>
      </div>
    </div>
  );
}
