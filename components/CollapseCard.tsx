import type { ReactNode } from "react";
import { MobileCollapse } from "@/components/MobileCollapse";

// Kartu yang di ponsel dilipat: judul selalu tampak, isinya terbuka saat diketuk. Di layar lebar tampil seperti kartu biasa.
export function CollapseCard({
  title,
  openMobile = false,
  className = "",
  children,
}: {
  title: ReactNode;
  openMobile?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`card ${className}`}>
      <MobileCollapse openMobile={openMobile} summary={<h2 className="section-title">{title}</h2>}>
        {children}
      </MobileCollapse>
    </section>
  );
}
