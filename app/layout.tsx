import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Satu keluarga, tiga bobot (400, 600, 700). Plus Jakarta Sans dirancang di Indonesia, dan dipakai untuk isi
// maupun judul: layar kerja tidak butuh huruf tampilan. Playfair Display dulu ikut dimuat tapi tidak dipakai.
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-jakarta", display: "swap" });

export const metadata: Metadata = {
  title: { default: "BAKTINUSA HUB", template: "%s · BAKTINUSA HUB" },
  description: "Portal pengukuran awardee BAKTI NUSA untuk Admin, Awardee, dan Manajer Wilayah.",
};

// viewportFit "cover" membiarkan halaman sampai ke tepi layar berponi; tab bawah memakai env(safe-area-inset-*).
export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: "#1e1616",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body>{children}</body>
    </html>
  );
}
