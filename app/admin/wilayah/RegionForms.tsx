"use client";

import { useActionState, useState } from "react";
import type { CampusRow } from "@/lib/data/campuses";
import type { RegionRow } from "@/lib/data/regions";
import {
  createCampusAction,
  createRegionAction,
  deleteCampusAction,
  deleteRegionAction,
  renameCampusAction,
  renameRegionAction,
  type RegionState,
} from "./actions";

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
export function RegionRowForm({ region, campuses }: { region: RegionRow; campuses: CampusRow[] }) {
  const [state, action, pending] = useActionState<RegionState, FormData>(renameRegionAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<RegionState, FormData>(deleteRegionAction, null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const dipakai = region.awardees + region.manwils > 0;

  return (
    <>
      <tr>
        <td><b>{region.name}</b></td>
        <td className="num">{region.campuses}</td>
        <td className="num">{region.awardees}</td>
        <td className="num">{region.manwils}</td>
        <td className="num">{region.responses}</td>
        <td>
          <button type="button" className="btn-link" onClick={() => setOpen(!open)}>{open ? "Tutup" : "Ubah"}</button>
        </td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} style={{ background: "var(--surface-sunken)" }}>
            <form action={action} className="copy-row">
              <input type="hidden" name="regionId" value={region.id} />
              <input className="input" name="name" maxLength={60} defaultValue={region.name} aria-label={`Nama wilayah ${region.name}`} />
              <button type="submit" className="btn btn-small" disabled={pending}>{pending ? "Menyimpan…" : "Simpan nama"}</button>
            </form>
            <Result state={state} />

            <CampusList regionId={region.id} regionName={region.name} campuses={campuses} />

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
                  <button type="button" className="btn-link" onClick={() => setConfirming(true)}>
                    Hapus wilayah{region.campuses > 0 ? ` (beserta ${region.campuses} kampusnya)` : ""}
                  </button>
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

// Kampus milik wilayah ini. Ditaruh di dalam baris wilayahnya, bukan di daftar terpisah, supaya jelas
// kampus mana milik siapa — dropdown Kampus di form Pengguna disaring persis dengan hubungan itu.
function CampusList({
  regionId,
  regionName,
  campuses,
}: {
  regionId: number;
  regionName: string;
  campuses: CampusRow[];
}) {
  const [state, action, pending] = useActionState<RegionState, FormData>(createCampusAction, null);
  const milik = campuses.filter((c) => c.regionId === regionId);

  return (
    <div style={{ marginTop: "1rem" }}>
      <h3 className="section-title" style={{ fontSize: "0.9rem" }}>Kampus di {regionName}</h3>
      <p className="section-hint">
        Daftar ini yang muncul sebagai pilihan Kampus saat menambah awardee di wilayah ini.
      </p>

      {milik.length > 0 ? (
        <ul className="campus-list">
          {milik.map((c) => (
            <CampusItem key={c.id} campus={c} />
          ))}
        </ul>
      ) : (
        <p className="section-hint">Belum ada kampus. Tambahkan di bawah.</p>
      )}

      <form action={action} className="copy-row" style={{ marginTop: "0.5rem" }}>
        <input type="hidden" name="regionId" value={regionId} />
        <input
          className="input"
          name="name"
          maxLength={120}
          placeholder="Nama kampus baru, mis. Institut Pertanian Bogor"
          aria-label={`Nama kampus baru di ${regionName}`}
        />
        <button type="submit" className="btn btn-small" disabled={pending}>{pending ? "Menyimpan…" : "Tambah kampus"}</button>
      </form>
      <Result state={state} />
    </div>
  );
}

function CampusItem({ campus }: { campus: CampusRow }) {
  const [state, action, pending] = useActionState<RegionState, FormData>(renameCampusAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<RegionState, FormData>(deleteCampusAction, null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <li className="campus-item">
      <div className="campus-head">
        <span>
          {campus.name}
          {campus.awardees > 0 && <span className="pill pill-info" style={{ marginLeft: "0.5rem" }}>{campus.awardees} awardee</span>}
        </span>
        <button type="button" className="btn-link" onClick={() => setOpen(!open)}>{open ? "Tutup" : "Ubah"}</button>
      </div>

      {open && (
        <div style={{ marginTop: "0.5rem" }}>
          <form action={action} className="copy-row">
            <input type="hidden" name="campusId" value={campus.id} />
            <input className="input" name="name" maxLength={120} defaultValue={campus.name} aria-label={`Nama kampus ${campus.name}`} />
            <button type="submit" className="btn btn-small" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
          </form>
          <Result state={state} />

          {campus.awardees === 0 && (
            <form action={hapusAction} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="campusId" value={campus.id} />
              {confirming ? (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button type="button" className="btn-link" onClick={() => setConfirming(false)}>Batal</button>
                  <button type="submit" className="btn-link" style={{ color: "var(--bad)" }} disabled={menghapus}>
                    {menghapus ? "Menghapus…" : "Ya, hapus kampusnya"}
                  </button>
                </div>
              ) : (
                <button type="button" className="btn-link" onClick={() => setConfirming(true)}>Hapus kampus</button>
              )}
              <Result state={hapus} />
            </form>
          )}
        </div>
      )}
    </li>
  );
}
