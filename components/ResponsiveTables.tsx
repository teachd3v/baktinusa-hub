"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Di ponsel tabel berubah jadi daftar kartu (lihat "Tabel jadi kartu" di globals.css). CSS tidak bisa membaca teks
// kepala kolom, jadi di sini tiap sel diberi data-label dari kepalanya. Satu tempat untuk semua tabel, termasuk
// yang baris-barisnya berganti saat disaring, dan tabel baru tidak perlu mengingat apa pun.
// Tabel matriks ("matrix") sengaja dilewati: ia hanya terbaca sebagai kisi.

function label(table: HTMLTableElement) {
  const head = table.tHead?.rows[0];
  if (!head) return;
  const names: string[] = [];
  for (const th of Array.from(head.cells)) {
    const text = th.classList.contains("check-col") ? "" : (th.textContent ?? "").trim();
    const name = th.querySelector(".sr-only") && !th.querySelector(":scope > :not(.sr-only)") ? "" : text;
    for (let i = 0; i < Math.max(1, th.colSpan); i++) names.push(name);
  }
  for (const row of Array.from(table.tBodies).flatMap((body) => Array.from(body.rows))) {
    Array.from(row.cells).forEach((cell, i) => {
      if (cell.colSpan > 1) return;
      const name = names[i];
      if (name && cell.dataset.label !== name) cell.dataset.label = name;
      const empty = /^[—–-]?$/.test((cell.textContent ?? "").trim()) &&!cell.querySelector("input, button, a, svg, img, select");
      if (empty) cell.dataset.empty = "";
      else if ("empty" in cell.dataset) delete cell.dataset.empty;
    });
  }
}

const labelAll = () => document.querySelectorAll<HTMLTableElement>("table.table:not(.matrix)").forEach(label);

export function ResponsiveTables() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(labelAll);
    };
    labelAll();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [pathname]);

  // Saringan yang tidak muat satu baris digeser mendatar; yang terpilih dibawa ke tengah supaya kelihatan.
  useEffect(() => {
    document.querySelectorAll<HTMLElement>(".tabs [aria-current]").forEach((chip) => chip.scrollIntoView({ inline: "center", block: "nearest" }));
  }, [pathname, params]);

  return null;
}
