import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" });

export const metadata: Metadata = {
  title: { default: "BAKTINUSA HUB", template: "%s · BAKTINUSA HUB" },
  description: "Portal pengukuran awardee BAKTI NUSA untuk Admin, Awardee, dan Manajer Wilayah.",
};

export const viewport: Viewport = {
  themeColor: "#1b1f2e",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" className={`${inter.variable} ${playfair.variable}`}>
      <body>{children}</body>
    </html>
  );
}
