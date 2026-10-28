"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

// Di ponsel tabel berubah jadi daftar kartu (lihat "Tabel jadi kartu" di globals.css). CSS tidak bisa membaca teks
// kepala kolom, jadi di sini tiap sel diberi data-label dari kepalanya. Satu tempat untuk semua tabel, termasuk
// yang baris-barisnya berganti saat disaring, dan tabel baru tidak perlu mengingat apa pun.
// Tabel matriks ("matrix") sengaja dilewati: ia hanya terbaca sebagai kisi.
//
// Tabel dengan data-collapse lebih ringkas lagi: hanya kolom yang disebut yang tampak, sisanya baru muncul saat
// barisnya diketuk. Nilainya nomor kolom (mulai dari 1) dipisah koma, mis. "1,3"; satu angka "N" berarti N kolom
// pertama. Kotak centang tidak dihitung. Hanya atribut yang dipasang di sini, tidak ada simpul baru,
// supaya React tidak bertabrakan dengan DOM-nya. Tanda panahnya digambar CSS.

function label(table: HTMLTableElement) {
  const head = table.tHead?.rows[0];
  if (!head) return;
  const names: string[] = [];
  for (const th of Array.from(head.cells)) {
    const text = th.classList.contains("check-col") ? "" : (th.textContent ?? "").trim();
    const name = th.querySelector(".sr-only") && !th.querySelector(":scope > :not(.sr-only)") ? "" : text;
    for (let i = 0; i < Math.max(1, th.colSpan); i++) names.push(name);
  }
  const spec = (table.dataset.collapse ?? "").split(",").map(Number).filter(Boolean);
  const keepCols = new Set(spec.length === 1 ? Array.from({ length: spec[0]! }, (_, n) => n + 1) : spec);
  for (const row of Array.from(table.tBodies).flatMap((body) => Array.from(body.rows))) {
    // Baris pengubah (satu sel selebar tabel) bukan kartu, jadi tidak ikut dilipat.
    const collapsible = keepCols.size > 0 && !Array.from(row.cells).some((cell) => cell.colSpan > 1);
    if (collapsible && !row.hasAttribute("data-collapsible")) {
      row.setAttribute("data-collapsible", "");
    }
    let column = 0;
    let firstHidden = true;
    Array.from(row.cells).forEach((cell, i) => {
      if (collapsible) {
        const check = cell.classList.contains("check-col");
        if (!check) column++;
        const kept = check || keepCols.has(column);
        if (kept) cell.setAttribute("data-keep", "");
        else cell.removeAttribute("data-keep");
        if (!kept && firstHidden) cell.setAttribute("data-first-hidden", "");
        else cell.removeAttribute("data-first-hidden");
        if (!kept) firstHidden = false;
      }
      if (cell.colSpan > 1) return;
      const name = names[i];
      if (name && cell.dataset.label !== name) cell.dataset.label = name;
      const empty = /^[—–-]?$/.test((cell.textContent ?? "").trim()) && !cell.querySelector("input, button, a, svg, img, select");
      if (empty) cell.dataset.empty = "";
      else if ("empty" in cell.dataset) delete cell.dataset.empty;
    });
  }
}

const labelAll = () => document.querySelectorAll<HTMLTableElement>("table.table:not(.matrix)").forEach(label);

// Ketukan di baris yang bisa dilipat membuka atau menutupnya, kecuali yang mengenai tautan atau kontrol di dalamnya.
const INTERACTIVE = "a, button, input, select, textarea, label, summary, form";

function toggleRow(row: HTMLElement) {
  row.toggleAttribute("data-open");
}

export function ResponsiveTables() {
  const pathname = usePathname();
  const params = useSearchParams();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const row = target.closest<HTMLElement>("tr[data-collapsible]");
      if (!row || target.closest(INTERACTIVE)) return;
      toggleRow(row);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

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
