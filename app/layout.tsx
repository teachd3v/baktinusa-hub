import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BAKTINUSA HUB",
  description: "Portal pengukuran awardee BAKTI NUSA untuk Admin, Awardee, dan Manajer Wilayah.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
