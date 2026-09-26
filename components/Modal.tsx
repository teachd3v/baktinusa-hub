"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// Tombol "+" yang membuka jendela. Dipakai untuk form tambah di halaman-halaman Admin, supaya daftar
// datanya tidak terdorong jauh ke bawah oleh form yang jarang dipakai.
//
// Isinya tetap form biasa: pesan hasil muncul di dalam jendela dan jendelanya tidak menutup sendiri,
// jadi kalau ada isian yang ditolak, yang sudah diketik tidak hilang.
export function AddButton({
  label,
  title,
  hint,
  children,
}: {
  label: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    // Halaman di belakang jendela tidak ikut menggulir.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Fokus dikembalikan ke tombolnya supaya pengguna papan ketik tidak tersesat di awal halaman.
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  return (
    <>
      <button ref={trigger} type="button" className="btn btn-small btn-inline add-button" onClick={() => setOpen(true)}>
        <span aria-hidden="true">+</span> {label}
      </button>

      {open && (
        <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
          <div
            ref={panel}
            className="modal modal-form fade-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-judul"
            tabIndex={-1}
          >
            <div className="modal-head">
              <div>
                <h2 id="modal-judul" className="section-title">{title}</h2>
                {hint && <p className="section-hint" style={{ margin: 0 }}>{hint}</p>}
              </div>
              <button type="button" className="modal-close" onClick={close} aria-label="Tutup">
                <span aria-hidden="true">×</span>
              </button>
            </div>

            <div className="modal-body">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
