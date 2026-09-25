"use client";

import { useActionState, useState } from "react";
import type { AwardeeAdminRow } from "@/lib/data/admin-awardees";
import { createAwardeeAction, deleteAwardeeAction, updateAwardeeAction, type ActionState } from "./actions";

type Region = { id: number; name: string };

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "section-hint" : "form-error"} role="status" style={{ margin: "0.5rem 0 0" }}>
      {state.ok ? "✓ " : ""}
      {state.message}
    </p>
  );
}

function Fields({ regions, awardee, suggestedCode }: { regions: Region[]; awardee?: AwardeeAdminRow; suggestedCode?: string }) {
  return (
    <>
      <div className="form-row">
        <div className="field">
          <label className="label">Nama</label>
          <input className="input" name="name" maxLength={120} defaultValue={awardee?.name ?? ""} />
        </div>
        <div className="field">
          <label className="label">Angkatan</label>
          <input className="input" name="batch" maxLength={20} defaultValue={awardee?.batch ?? "BA16"} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label className="label">Wilayah</label>
          <select className="select" name="regionId" defaultValue={String(awardee?.regionId ?? regions[0]?.id ?? "")}>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label">Kampus</label>
          <input className="input" name="campus" maxLength={160} defaultValue={awardee?.campus ?? ""} />
        </div>
      </div>
      <div className="form-row">
        <div className="field">
          <label className="label">Kode referal</label>
          <input className="input" name="referralCode" maxLength={12} defaultValue={awardee?.referralCode ?? suggestedCode ?? ""} />
        </div>
        <div className="field">
          <label className="label">Kunci foto di R2</label>
          <input className="input" name="photoKey" maxLength={200} defaultValue={awardee?.photoKey ?? ""} placeholder="awardees/ba16/KODE.webp" />
        </div>
      </div>
    </>
  );
}

export function NewAwardeeForm({ regions, suggestedCode }: { regions: Region[]; suggestedCode: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createAwardeeAction, null);
  return (
    <form action={action}>
      <Fields regions={regions} suggestedCode={suggestedCode} />
      <p className="section-hint">
        Kode referal jadi bagian tautan yang dibagikan ke penilai, jadi hindari yang mudah tertukar saat didikte.
        Kode saran di atas sudah dipastikan belum terpakai.
      </p>
      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Tambah awardee"}</button>
      <Result state={state} />
    </form>
  );
}

export function AwardeeRow({ regions, awardee }: { regions: Region[]; awardee: AwardeeAdminRow }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateAwardeeAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<ActionState, FormData>(deleteAwardeeAction, null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr>
        <td>
          <b>{awardee.name}</b>
          {awardee.campus && <div className="section-hint" style={{ margin: 0 }}>{awardee.campus}</div>}
        </td>
        <td>{awardee.region}</td>
        <td>{awardee.batch}</td>
        <td><code style={{ fontSize: "0.78rem" }}>{awardee.referralCode}</code></td>
        <td className="num">{awardee.responses}</td>
        <td>
          {awardee.hasAccount ? <span className="pill pill-ok">punya akun</span> : <span className="pill pill-muted">belum</span>}
        </td>
        <td><button type="button" className="btn-link" onClick={() => setOpen(!open)}>{open ? "Tutup" : "Ubah"}</button></td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} style={{ background: "var(--surface-sunken)" }}>
            <form action={action}>
              <input type="hidden" name="awardeeId" value={awardee.id} />
              <Fields regions={regions} awardee={awardee} />
              <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
              <Result state={state} />
            </form>
            {awardee.responses === 0 && !awardee.hasAccount && (
              <form action={hapusAction} style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="awardeeId" value={awardee.id} />
                <button type="submit" className="btn-link" disabled={menghapus}>Hapus awardee ini</button>
                <Result state={hapus} />
              </form>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
