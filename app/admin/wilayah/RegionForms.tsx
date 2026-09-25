"use client";

import { useActionState, useState } from "react";
import type { RegionRow } from "@/lib/data/regions";
import { createRegionAction, deleteRegionAction, renameRegionAction, type RegionState } from "./actions";

function Result({ state }: { state: RegionState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "section-hint" : "form-error"} role="status" style={{ margin: "0.4rem 0 0" }}>
      {state.ok ? "✓ " : ""}
      {state.message}
    </p>
  );
}

export function NewRegionForm() {
  const [state, action, pending] = useActionState<RegionState, FormData>(createRegionAction, null);
  return (
    <form action={action} className="copy-row">
      <input className="input" name="name" maxLength={60} placeholder="Nama wilayah baru, mis. Denpasar" aria-label="Nama wilayah baru" />
      <button type="submit" className="btn btn-small" disabled={pending}>{pending ? "Menyimpan…" : "Tambah"}</button>
      <Result state={state} />
    </form>
  );
}

// Wilayah yang masih dipakai tetap bisa diganti namanya — yang ditahan hanya penghapusannya.
export function RegionRowForm({ region }: { region: RegionRow }) {
  const [state, action, pending] = useActionState<RegionState, FormData>(renameRegionAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<RegionState, FormData>(deleteRegionAction, null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dipakai = region.awardees + region.manwils > 0;

  return (
    <>
      <tr>
        <td><b>{region.name}</b></td>
        <td className="num">{region.awardees}</td>
        <td className="num">{region.manwils}</td>
        <td className="num">{region.responses}</td>
        <td>
          <button type="button" className="btn-link" onClick={() => setOpen(!open)}>{open ? "Tutup" : "Ubah"}</button>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={5} style={{ background: "var(--surface-sunken)" }}>
            <form action={action} className="copy-row">
              <input type="hidden" name="regionId" value={region.id} />
              <input className="input" name="name" maxLength={60} defaultValue={region.name} aria-label={`Nama wilayah ${region.name}`} />
              <button type="submit" className="btn btn-small" disabled={pending}>{pending ? "Menyimpan…" : "Simpan nama"}</button>
            </form>
            <Result state={state} />

            {dipakai ? (
              <p className="section-hint" style={{ margin: "0.75rem 0 0" }}>
                Masih dipakai {region.awardees} awardee dan {region.manwils} akun Manwil, jadi belum bisa dihapus.
                Pindahkan mereka lewat menu Pengguna dulu.
              </p>
            ) : (
              <form action={hapusAction} style={{ marginTop: "0.75rem" }}>
                <input type="hidden" name="regionId" value={region.id} />
                {confirming ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button type="submit" className="btn-link" style={{ color: "var(--bad)" }} disabled={menghapus}>
                      {menghapus ? "Menghapus…" : "Ya, hapus wilayahnya"}
                    </button>
                    <button type="button" className="btn-link" onClick={() => setConfirming(false)}>Batal</button>
                  </div>
                ) : (
                  <button type="button" className="btn-link" onClick={() => setConfirming(true)}>Hapus wilayah</button>
                )}
                <Result state={hapus} />
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
