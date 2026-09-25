"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";

// Lekukan rail di sekitar menu aktif.
//
// Bentuknya bukan sekadar rail dikurangi lingkaran — kalau begitu, tepi lurus dan lingkarannya bertemu
// di sudut yang patah. Yang dipakai di sini kurva-S: garis lurus → busur sambung (fillet) → busur
// melingkari tombol → busur sambung → garis lurus lagi. Fillet-nya menyinggung keduanya, jadi arah
// tepinya tidak pernah melompat dan lekukannya terbaca mulus.
//
// Caranya menggambar: satu path berwarna latar halaman dilukis DI ATAS pil gelap, dan batas kirinya
// itulah tepi gelap yang baru. Semua yang di sebelah kanan batas jadi warna halaman — di luar rail pun
// tidak apa-apa, di sana memang sudah warna halaman.

const ITEM = 48; // diameter tombol menu
const PAD = 12; // jarak tepi pil ke tombol
const POP = 18; // seberapa jauh tombol aktif menyembul dari pil
const RING = 10; // lebar cincin putih antara tombol dan tepi gelap
// Radius busur sambung. Harus lebih kecil dari (edge - cx), jarak pusat tombol ke tepi pil:
// kalau tidak, pusat fillet jatuh melewati pusat gigitan dan tepinya berbalik jadi paruh.
const FILLET = 14;

// Semua koordinat relatif terhadap kotak tombol aktif yang sudah digeser keluar.
const cx = ITEM / 2;
const cy = ITEM / 2;
const bite = ITEM / 2 + RING; // radius gigitan
const edge = ITEM + PAD - POP; // tepi kanan pil
const margin = 24; // sisa ruang di atas & bawah lekukan

// Titik tempat fillet meninggalkan garis lurus. Pusat fillet ada di (edge - FILLET, y), dan supaya ia
// menyinggung gigitan dari dalam, jarak pusatnya ke pusat gigitan harus tepat bite + FILLET.
const reach = Math.sqrt((bite + FILLET) ** 2 - (edge - FILLET - cx) ** 2);
const yTop = cy - reach;
const yBottom = cy + reach;

// Titik singgung fillet dengan gigitan: bergerak sejauh FILLET dari pusat fillet ke arah pusat gigitan.
const span = bite + FILLET;
const tx = edge - FILLET + (FILLET * (cx - (edge - FILLET))) / span;
const tyTop = yTop + (FILLET * (cy - yTop)) / span;
const tyBottom = cy + (cy - tyTop);

const round = (n: number) => Math.round(n * 100) / 100;
const boxTop = yTop - margin;
const boxHeight = yBottom - yTop + margin * 2;
// Kotak gambar dimulai di kiri gigitan, karena lekukannya memakan pil sampai sejauh itu.
const boxLeft = cx - bite - 8;
const boxWidth = edge + margin - boxLeft;

const NOTCH = [
  `M ${edge} ${round(boxTop)}`,
  `L ${edge} ${round(yTop)}`,
  `A ${FILLET} ${FILLET} 0 0 1 ${round(tx)} ${round(tyTop)}`,
  // sweep 1: busurnya melingkar ke kiri, memakan pil — bukan menjauh ke kanan.
  `A ${bite} ${bite} 0 1 1 ${round(tx)} ${round(tyBottom)}`,
  `A ${FILLET} ${FILLET} 0 0 1 ${edge} ${round(yBottom)}`,
  `L ${edge} ${round(boxTop + boxHeight)}`,
  `L ${round(boxLeft + boxWidth)} ${round(boxTop + boxHeight)}`,
  `L ${round(boxLeft + boxWidth)} ${round(boxTop)}`,
  "Z",
].join(" ");

function Notch() {
  return (
    <svg
      className="nav-notch"
      viewBox={`${round(boxLeft)} ${round(boxTop)} ${round(boxWidth)} ${round(boxHeight)}`}
      style={{ width: boxWidth, height: boxHeight, left: boxLeft }}
      aria-hidden="true"
      focusable="false"
    >
      <path d={NOTCH} fill="var(--surface)" />
    </svg>
  );
}

export function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  // Tautan paling spesifik yang cocok dianggap aktif, supaya "/admin" tidak ikut menyala di "/admin/pengguna".
  const active = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="shell-nav" aria-label="Navigasi utama">
      {items.map((item) => {
        const current = item.href === active;
        return (
          <Link key={item.href} href={item.href} aria-current={current ? "page" : undefined} data-label={item.label}>
            {current && <Notch />}
            <span className="nav-dot">
              <NavIcon label={item.label} />
            </span>
            <span className="sr-only">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
