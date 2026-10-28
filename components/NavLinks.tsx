"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";

// Menu aktif ditandai lewat CSS saja: ubin yang lebih terang dan satu garis aksen di tepi kirinya (lihat .shell-nav
// di globals.css). Dulu di sini ada puluhan baris geometri untuk lekukan rail yang harus selalu sama dengan angka
// di CSS. Lekukan itu hanya hiasan, dan satu-satunya yang membuat dua berkas ini tidak bisa diubah sendiri-sendiri.

// Tautan paling spesifik yang cocok dianggap aktif, supaya "/admin" tidak ikut menyala di "/admin/pengguna".
export function activeHref(items: { href: string }[], pathname: string) {
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  const active = activeHref(items, pathname);

  return (
    <nav className="shell-nav" aria-label="Navigasi utama">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.href === active ? "page" : undefined} data-label={item.label}>
          <span className="nav-dot">
            <NavIcon label={item.label} />
          </span>
          <span className="sr-only">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
