"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { Icon } from "@/components/Icon";
import type { InstrumentListRow, MeasurementRow } from "@/lib/data/measurements";
import { deleteManyInstrumentsAction, type BulkInstrumentState } from "./actions";
import { InstrumentRowForm } from "./InstrumentForms";

export function InstrumentsManager({
  instruments,
  measurements,
  activeSlug,
}: {
  instruments: InstrumentListRow[];
  measurements: MeasurementRow[];
  activeSlug?: string;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const bulkForm = useId();
  const [state, action, pending] = useActionState<BulkInstrumentState, FormData>(
    deleteManyInstrumentsAction,
    null,
  );

  // Accordion state untuk filter "Semua pengukuran"
  // Default semua tertutup agar tidak scrolling panjang ke bawah
  const [openGroups, setOpenGroups] = useState<Record<number, boolean>>({});

  // Hanya soal yang belum memiliki jawaban yang boleh dicentang untuk dihapus
  const canDeleteIds = new Set(instruments.filter((i) => i.answers === 0).map((i) => i.id));
  const dipilih = picked.filter((id) => canDeleteIds.has(id));

  // Reset pilihan setelah server action selesai
  useEffect(() => {
    if (state) {
      setPicked([]);
    }
  }, [state]);

  const toggle = (id: number) => {
    if (!canDeleteIds.has(id)) return;
    setPicked((now) => (now.includes(id) ? now.filter((item) => item !== id) : [...now, id]));
  };

  const toggleGroup = (groupItems: InstrumentListRow[]) => {
    const groupDeletable = groupItems.filter((i) => i.answers === 0).map((i) => i.id);
    if (groupDeletable.length === 0) return;

    const allInGroupPicked = groupDeletable.every((id) => dipilih.includes(id));
    if (allInGroupPicked) {
      // Hapus pilihan untuk grup ini
      setPicked((now) => now.filter((id) => !groupDeletable.includes(id)));
    } else {
      // Pilih semua yang bisa dihapus di grup ini
      setPicked((now) => Array.from(new Set([...now, ...groupDeletable])));
    }
  };

  const toggleAll = () => {
    const allDeletable = Array.from(canDeleteIds);
    if (allDeletable.length === 0) return;
    if (dipilih.length === allDeletable.length) {
      setPicked([]);
    } else {
      setPicked(allDeletable);
    }
  };

  const setAllGroupsOpen = (isOpen: boolean) => {
    const updated: Record<number, boolean> = {};
    for (const m of measurements) {
      updated[m.id] = isOpen;
    }
    setOpenGroups(updated);
  };

  // Komponen Bilah Aksi Massal (Bulk Bar)
  const bulkBar = (dipilih.length > 0 || state) && (
    <form id={bulkForm} action={action} className="bulk-bar" style={{ marginTop: "0.5rem" }}>
      {dipilih.map((id) => (
        <input key={id} type="hidden" name="pilih" value={id} />
      ))}

      {dipilih.length > 0 && (
        <div className="bulk-count">
          <b>{dipilih.length} butir soal dipilih</b>
          <span className="section-hint" style={{ margin: 0 }}>
            Hanya soal yang belum memiliki jawaban responden yang bisa dihapus.
          </span>
        </div>
      )}

      <div className="bulk-actions">
        {dipilih.length > 0 && (
          <>
            <ConfirmDelete
              label="Hapus terpilih"
              className="btn btn-small btn-danger"
              title={`Hapus ${dipilih.length} butir soal?`}
              confirmLabel={`Ya, hapus ${dipilih.length} butir soal`}
              form={bulkForm}
              pending={pending}
            >
              <p>{dipilih.length} butir soal yang dipilih akan dihapus.</p>
              <p>Tindakan ini tidak bisa dibatalkan.</p>
            </ConfirmDelete>
            <button type="button" className="btn-link" onClick={() => setPicked([])}>
              Bersihkan pilihan
            </button>
          </>
        )}
      </div>

      {state && (
        <div className="bulk-result" role="status">
          <p className={state.ok ? "section-hint" : "form-error"} style={{ margin: 0 }}>
            {state.ok ? "✓ " : ""}
            {state.message}
          </p>
          {state.failures.length > 0 && (
            <ul className="bulk-failures">
              {state.failures.map((f, i) => (
                <li key={i}>
                  <b>{f.code}</b>: {f.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );

  // 1. Tampilan ketika filter tab spesifik dipilih (misal: ?pengukuran=sa)
  if (activeSlug) {
    const allDeletableInView = instruments.filter((i) => i.answers === 0).map((i) => i.id);
    const allChecked =
      allDeletableInView.length > 0 && allDeletableInView.every((id) => dipilih.includes(id));
    const isIndeterminate =
      !allChecked && allDeletableInView.some((id) => dipilih.includes(id));

    return (
      <>
        {bulkBar}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col" className="check-col" style={{ width: "2.5rem", textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(el) => {
                      if (el) el.indeterminate = isIndeterminate;
                    }}
                    disabled={allDeletableInView.length === 0}
                    onChange={toggleAll}
                    aria-label="Pilih semua soal yang dapat dihapus"
                  />
                </th>
                <th scope="col">Kode</th>
                <th scope="col">Pernyataan</th>
                <th scope="col" className="num">
                  Skala
                </th>
                <th scope="col" className="num">
                  Jawaban
                </th>
                <th scope="col">
                  <span className="sr-only">Aksi</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {instruments.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: "center", padding: "1.5rem" }}>
                    <p className="section-hint" style={{ margin: 0 }}>
                      Belum ada butir soal untuk pengukuran ini.
                    </p>
                  </td>
                </tr>
              ) : (
                instruments.map((i) => (
                  <InstrumentRowForm
                    key={i.id}
                    instrument={i}
                    selected={dipilih.includes(i.id)}
                    onToggle={toggle}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  }

  // 2. Tampilan ketika filter "Semua pengukuran" aktif (COLLAPSE/ACCORDION PER PENGUKURAN)
  const groups = measurements.map((m) => ({
    measurement: m,
    items: instruments.filter((i) => i.measurementId === m.id),
  }));

  return (
    <>
      {bulkBar}

      {/* Kontrol Collapse Cepat */}
      <div
        className="hide-mobile"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          margin: "0 0 1rem",
        }}
      >
        <p className="section-hint" style={{ margin: 0 }}>
          {instruments.length} total butir soal dikelompokkan ke {measurements.length} jenis pengukuran. Klik
          judul untuk membuka/menutup daftar soal.
        </p>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            className="btn btn-small btn-muted"
            onClick={() => setAllGroupsOpen(true)}
          >
            Buka semua
          </button>
          <button
            type="button"
            className="btn btn-small btn-muted"
            onClick={() => setAllGroupsOpen(false)}
          >
            Tutup semua
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {groups.map(({ measurement: m, items }) => {
          const isOpen = Boolean(openGroups[m.id]);
          const deletableInGroup = items.filter((i) => i.answers === 0).map((i) => i.id);
          const allInGroupChecked =
            deletableInGroup.length > 0 && deletableInGroup.every((id) => dipilih.includes(id));
          const groupIndeterminate =
            !allInGroupChecked && deletableInGroup.some((id) => dipilih.includes(id));

          return (
            <div
              key={m.id}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--radius-md)",
                overflow: "hidden",
                background: "var(--card)",
              }}
            >
              {/* Header Collapse / Accordion */}
              <div
                className="grp-head"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0.85rem 1.15rem",
                  background: isOpen ? "var(--surface-sunken)" : "var(--card)",
                  cursor: "pointer",
                  userSelect: "none",
                  borderBottom: isOpen ? "1px solid var(--line)" : "none",
                  transition: "background 0.15s ease",
                }}
                onClick={() =>
                  setOpenGroups((prev) => ({
                    ...prev,
                    [m.id]: !isOpen,
                  }))
                }
              >
                <div className="grp-title" style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                  <span
                    className="grp-chevron"
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--ink-muted)",
                      display: "inline-block",
                      width: "1.2rem",
                      textAlign: "center",
                      fontWeight: 700,
                    }}
                  >
                    <Icon name="chevron" className={isOpen ? "chevron open" : "chevron"} />
                  </span>
                  <span className="grp-name" style={{ fontWeight: 700, fontSize: "0.95rem" }}>
                    {m.name}
                  </span>
                  <code className="grp-code" style={{ fontSize: "0.75rem", padding: "0.1rem 0.35rem", background: "var(--line)", borderRadius: "4px" }}>
                    {m.code}
                  </code>
                  <span className="section-hint hide-mobile" style={{ margin: 0, fontSize: "0.8rem" }}>
                    {items.length} soal{m.responses > 0 ? `, ${m.responses} jawaban` : ""}
                  </span>
                  {m.responses > 0 && (
                    <>
                      <span className="pill pill-warn hide-mobile" style={{ fontSize: "0.7rem", padding: "0.1rem 0.4rem" }}>
                        Terkunci
                      </span>
                      <svg className="grp-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Terkunci">
                        <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
                      </svg>
                    </>
                  )}
                </div>

                <div className="hide-mobile" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }} onClick={(e) => e.stopPropagation()}>
                  <Link
                    href={`/admin/instrumen?pengukuran=${m.slug}`}
                    className="btn-link"
                    style={{ fontSize: "0.8rem" }}
                  >
                    Buka tab
                  </Link>
                </div>
              </div>

              {/* Isi Daftar Soal Saat Terbuka */}
              {isOpen && (
                <div className="table-wrap" style={{ margin: 0, border: "none", borderRadius: 0 }}>
                  <table className="table" style={{ margin: 0 }}>
                    <thead>
                      <tr>
                        <th scope="col" className="check-col" style={{ width: "2.5rem", textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={allInGroupChecked}
                            ref={(el) => {
                              if (el) el.indeterminate = groupIndeterminate;
                            }}
                            disabled={deletableInGroup.length === 0}
                            onChange={() => toggleGroup(items)}
                            aria-label={`Pilih semua soal ${m.name}`}
                          />
                        </th>
                        <th scope="col">Kode</th>
                        <th scope="col">Pernyataan</th>
                        <th scope="col" className="num">
                          Skala
                        </th>
                        <th scope="col" className="num">
                          Jawaban
                        </th>
                        <th scope="col">
                          <span className="sr-only">Aksi</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 ? (
                        <tr>
                          <td colSpan={6} style={{ textAlign: "center", padding: "1.25rem" }}>
                            <p className="section-hint" style={{ margin: 0 }}>
                              Belum ada butir soal untuk jenis pengukuran ini.
                            </p>
                          </td>
                        </tr>
                      ) : (
                        items.map((i) => (
                          <InstrumentRowForm
                            key={i.id}
                            instrument={i}
                            selected={dipilih.includes(i.id)}
                            onToggle={toggle}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
