"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// Penghapusan selalu lewat jendela konfirmasi: tombol di halaman hanya membuka jendelanya, dan yang benar-benar
// menghapus ada di dalam jendela itu. Fokus awal sengaja di "Batal", jadi Enter yang tidak sengaja tidak menghapus.
//
// Jendelanya dipasang di <body> supaya tidak terjepit jendela lain, jadi tombol hapusnya tidak berada di dalam
// <form>-nya. `form` menunjuk id form yang harus dikirim; atau pakai `onConfirm` untuk aksi yang bukan form.
// Jendela ditutup saat `pending` selesai, dan ikut hilang kalau barisnya hilang karena berhasil dihapus.
export function ConfirmDelete({
  label,
  className = "btn-link",
  title,
  children,
  confirmLabel = "Ya, hapus",
  form,
  onConfirm,
  pending = false,
  disabled = false,
}: {
  label: ReactNode;
  className?: string;
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  form?: string;
  onConfirm?: () => void;
  pending?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(false);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  useEffect(() => {
    if (wasPending.current && !pending) setOpen(false);
    wasPending.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!open) return;
    cancel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener("keydown", onKey, true);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previous;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pending]);

  return (
    <>
      <button ref={trigger} type="button" className={className} disabled={disabled} onClick={() => setOpen(true)}>
        {label}
      </button>

      {open &&
        createPortal(
          <div className="overlay overlay-confirm" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !pending && close()}>
            <div className="modal confirm-dialog fade-in" role="alertdialog" aria-modal="true" aria-labelledby="konfirmasi-judul" aria-describedby="konfirmasi-isi">
              <svg className="modal-icon confirm-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
              </svg>
              <h2 id="konfirmasi-judul">{title}</h2>
              <div id="konfirmasi-isi" className="confirm-body">{children}</div>
              <div className="confirm-actions">
                <button ref={cancel} type="button" className="btn btn-muted" disabled={pending} onClick={close}>
                  Batal
                </button>
                {form ? (
                  <button type="submit" form={form} className="btn btn-danger-solid" disabled={pending}>
                    {pending ? "Menghapus…" : confirmLabel}
                  </button>
                ) : (
                  <button type="button" className="btn btn-danger-solid" disabled={pending} onClick={onConfirm}>
                    {pending ? "Menghapus…" : confirmLabel}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
