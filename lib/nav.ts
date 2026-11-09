import type { Role } from "./data/scope.ts";

// Menu utama tiap peran. Dipakai layout masing-masing peran dan halaman /akun, supaya tidak ada dua daftar yang bisa berbeda.
export const NAV: Record<Role, { href: string; label: string }[]> = {
  admin: [
    { href: "/admin/pengguna", label: "Pengguna" },
    { href: "/admin/wilayah", label: "Wilayah" },
    { href: "/admin/pengukuran", label: "Pengukuran" },
    { href: "/admin/instrumen", label: "Instrumen" },
    { href: "/admin/periode", label: "Siklus" },
    { href: "/admin/analitik", label: "Analitik" },
  ],
  manwil: [
    { href: "/manwil", label: "Beranda" },
    { href: "/manwil/nilai", label: "Penilaian" },
    { href: "/manwil/hasil", label: "Hasil" },
    { href: "/manwil/analitik", label: "Analitik" },
  ],
  awardee: [
    { href: "/awardee", label: "Beranda" },
    { href: "/awardee/nilai", label: "Penilaian" },
    { href: "/awardee/hasil", label: "Hasil" },
  ],
};
