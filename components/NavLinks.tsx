"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon } from "./NavIcon";

// Lekukan rail di sekitar menu aktif.
//
// Bentuknya satu gelombang panjang, bukan gigitan lingkaran: tepi pil turun lurus, melandai ke dalam,
// memeluk tombol, lalu melandai keluar lagi. Tombolnya sendiri tidak menyembul — ia duduk di atas
// lekukan itu, sehingga sisi kirinya menumpang sedikit pada pil yang tersisa.
//
// Tiga ukuran yang menentukan rupanya:
//   DEPTH  — seberapa dalam gelombang memakan pil (sisa pil = lebar pil − DEPTH)
//   REACH  — setengah tinggi gelombang; 54 membuatnya setinggi dua slot menu
//   MIDDLE — radius busur yang memeluk tombol; makin kecil, makin ketat pelukannya
//
// Radius busur sambungnya (FILLET) TIDAK ditebak, melainkan dihitung supaya ketiga busur benar-benar
// bersinggungan: dengan SPAN = FILLET + MIDDLE, berlaku REACH² = SPAN² − (SPAN − DEPTH)².
// Kalau ditebak, sambungannya patah atau tepinya berbalik jadi paruh.
//
// Melukisnya: satu path berwarna latar halaman ditaruh DI ATAS pil gelap; batas kirinya jadi tepi baru.

const ITEM = 48; // diameter tombol menu
const PAD = 12; // jarak tepi pil ke tombol
const SHIFT = 6; // tombol aktif digeser sedikit ke luar, jadi tidak pas di poros rail
const DEPTH = 44;
const REACH = 54;
const MIDDLE = 30;
const MARGIN = 20; // sisa ruang di atas & bawah gelombang

const cy = ITEM / 2;
const edge = ITEM + PAD - SHIFT; // tepi kanan pil, relatif terhadap kotak tombol yang sudah digeser
const SPAN = (REACH ** 2 + DEPTH ** 2) / (2 * DEPTH);
const FILLET = SPAN - MIDDLE;
const middleX = edge - DEPTH + MIDDLE; // pusat busur pemeluk tombol

// Titik singgung fillet atas dengan busur pemeluk: sejauh FILLET dari pusat fillet ke arah pusat busur.
const filletTopY = cy - REACH;
const touchX = edge - FILLET + (FILLET * (middleX - (edge - FILLET))) / SPAN;
const touchTopY = filletTopY + (FILLET * (cy - filletTopY)) / SPAN;
const touchBottomY = cy + (cy - touchTopY);

const round = (n: number) => Math.round(n * 100) / 100;
const boxTop = cy - REACH - MARGIN;
const boxBottom = cy + REACH + MARGIN;
const boxLeft = edge - DEPTH - 8;
const boxRight = edge + MARGIN;

const NOTCH = [
  `M ${edge} ${round(boxTop)}`,
  `L ${edge} ${round(filletTopY)}`,
  `A ${round(FILLET)} ${round(FILLET)} 0 0 1 ${round(touchX)} ${round(touchTopY)}`,
  `A ${MIDDLE} ${MIDDLE} 0 0 0 ${round(touchX)} ${round(touchBottomY)}`,
  `A ${round(FILLET)} ${round(FILLET)} 0 0 1 ${edge} ${round(cy + REACH)}`,
  `L ${edge} ${round(boxBottom)}`,
  `L ${round(boxRight)} ${round(boxBottom)}`,
  `L ${round(boxRight)} ${round(boxTop)}`,
  "Z",
].join(" ");

function Notch() {
  return (
    <svg
      className="nav-notch"
      viewBox={`${round(boxLeft)} ${round(boxTop)} ${round(boxRight - boxLeft)} ${round(boxBottom - boxTop)}`}
      style={{ width: boxRight - boxLeft, height: boxBottom - boxTop, left: boxLeft }}
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
