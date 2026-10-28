"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Bagian yang di ponsel dilipat dan di layar lebar terbuka tetap: ringkasnya (judul) selalu tampil, isinya baru
// muncul saat diketuk. Di layar lebar ringkasnya tidak bisa diketuk dan penandanya hilang (lihat .m-collapse di CSS).
export function MobileCollapse({ summary, children, className = "" }: { summary: ReactNode; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const sync = () => {
      if (box.current) box.current.open = !query.matches;
    };
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return (
    <details ref={box} className={`m-collapse ${className}`} open>
      <summary>{summary}</summary>
      <div className="m-collapse-body">{children}</div>
    </details>
  );
}
