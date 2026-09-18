"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // Tautan paling spesifik yang cocok dianggap aktif, supaya "/admin" tidak ikut menyala di "/admin/pengguna".
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav className="shell-nav" aria-label="Navigasi utama">
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.href === active ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
