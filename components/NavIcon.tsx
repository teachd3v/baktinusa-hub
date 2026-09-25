// Ikon rail navigasi. Digambar sebagai SVG stroke sederhana — satu berkas, tanpa library ikon,
// jadi tidak ada JavaScript tambahan yang dikirim ke pengunjung.

const PATHS: Record<string, string> = {
  beranda: "M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z",
  nilai: "M9 4h6v3H9zM6 7h12v13H6zM9 12h6M9 16h4",
  hasil: "M5 19V9M10 19V5M15 19v-7M20 19v-4M3 21h18",
  periode: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15h2",
  awardee: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM5 20a7 7 0 0 1 14 0",
  respons: "M5 5h14v10H9l-4 4z",
  pengingat: "M6 9a6 6 0 1 1 12 0c0 4 2 5 2 5H4s2-1 2-5M10 19a2 2 0 0 0 4 0",
  pengguna: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM3 20a6 6 0 0 1 12 0M17 8h4M19 6v4",
  jejak: "M5 4h14v16H5zM9 9h6M9 13h6M9 17h3",
  instrumen: "M7 4h10v16H7zM10 8h4M10 12h4M10 16h2",
  pengukuran: "M4 14h4l2-6 3 12 2.5-8 1.5 2h3",
  gaya: "M12 3a9 9 0 1 0 0 18h2a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h2a4 4 0 0 0 0-8ZM7.5 10.5h.01M10.5 7.5h.01M14 7.5h.01",
  wilayah: "M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11ZM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
};

// Label navigasi menentukan ikonnya, supaya menambah menu tidak perlu menyentuh berkas ini dua kali.
const KEY_OF: [RegExp, string][] = [
  [/beranda|ringkasan/i, "beranda"],
  [/penilaian/i, "nilai"],
  [/hasil/i, "hasil"],
  [/periode/i, "periode"],
  [/awardee/i, "awardee"],
  [/respons/i, "respons"],
  [/pengingat/i, "pengingat"],
  [/pengguna/i, "pengguna"],
  [/jejak/i, "jejak"],
  [/wilayah/i, "wilayah"],
  [/instrumen/i, "instrumen"],
  [/pengukuran/i, "pengukuran"],
  [/gaya/i, "gaya"],
];

export function NavIcon({ label }: { label: string }) {
  const key = KEY_OF.find(([pattern]) => pattern.test(label))?.[1] ?? "beranda";
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[key]} />
    </svg>
  );
}
