"use client";

import { useActionState, useState } from "react";
import type { InstrumentListRow } from "@/lib/data/measurements";
import { addInstrumentAction, deleteInstrumentAction, updateInstrumentAction, type MeasurementState } from "../pengukuran/actions";

type CategoryOption = { id: number; name: string; measurementId: number; measurementName: string };

function Result({ state }: { state: MeasurementState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "section-hint" : "form-error"} role="status" style={{ margin: "0.5rem 0 0" }}>
      {state.ok ? "✓ " : ""}
      {state.message}
    </p>
  );
}

function Fields({ instrument, locked }: { instrument?: InstrumentListRow; locked?: boolean }) {
  return (
    <>
      <div className="form-row">
        <div className="field">
          <label className="label">Kode</label>
          <input className="input" name="code" maxLength={20} defaultValue={instrument?.code ?? ""} placeholder="Q1" />
        </div>
        <div className="field">
          <label className="label">Skala maksimal</label>
          <input className="input" type="number" name="scaleMax" min={1} max={10} defaultValue={instrument?.scaleMax ?? 4} />
        </div>
      </div>
      <div className="field">
        <label className="label">Teks untuk penilai</label>
        <textarea className="textarea" name="textPublic" rows={2} maxLength={1000} defaultValue={instrument?.textPublic ?? ""} placeholder="Yang bersangkutan …" />
      </div>
      <div className="field">
        <label className="label">Teks untuk asesmen mandiri</label>
        <textarea className="textarea" name="textSelf" rows={2} maxLength={1000} defaultValue={instrument?.textSelf ?? ""} placeholder="Saya …" />
      </div>
      {locked && (
        <p className="section-hint">
          Pengukuran ini sudah punya jawaban: kode dan skala terkunci, teksnya masih bisa diperbaiki.
        </p>
      )}
    </>
  );
}

// Menambah soal berarti memilih sub pengukuran tujuannya — pengukurannya ikut dari sana.
export function NewInstrumentForm({ options }: { options: CategoryOption[] }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(addInstrumentAction, null);
  const [categoryId, setCategoryId] = useState(String(options[0]?.id ?? ""));
  const picked = options.find((o) => String(o.id) === categoryId);

  if (options.length === 0) {
    return <p className="section-hint" style={{ margin: 0 }}>Belum ada sub pengukuran. Buat dulu di menu Pengukuran.</p>;
  }

  return (
    <form action={action}>
      <input type="hidden" name="measurementId" value={picked?.measurementId ?? ""} />
      <div className="field">
        <label className="label" htmlFor="categoryId">Masuk ke sub pengukuran</label>
        <select id="categoryId" className="select" name="categoryId" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.measurementName} — {o.name}</option>
          ))}
        </select>
      </div>
      <Fields />
      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Tambah soal"}</button>
      <Result state={state} />
    </form>
  );
}

export function InstrumentRowForm({ instrument }: { instrument: InstrumentListRow }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(updateInstrumentAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<MeasurementState, FormData>(deleteInstrumentAction, null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <tr>
        <td><code style={{ fontSize: "0.78rem" }}>{instrument.code}</code></td>
        <td>
          {instrument.textPublic}
          {instrument.textSelf && <div className="section-hint" style={{ margin: 0 }}>{instrument.textSelf}</div>}
        </td>
        <td>
          {instrument.categoryName}
          <div className="section-hint" style={{ margin: 0 }}>{instrument.measurementName}</div>
        </td>
        <td className="num">{instrument.scaleMax}</td>
        <td className="num">
          {instrument.answers > 0 ? <span className="pill pill-info">{instrument.answers}</span> : <span className="section-hint">0</span>}
        </td>
        <td><button type="button" className="btn-link" onClick={() => setOpen(!open)}>{open ? "Tutup" : "Ubah"}</button></td>
      </tr>

      {open && (
        <tr>
          <td colSpan={6} style={{ background: "var(--surface-sunken)" }}>
            <form action={action}>
              <input type="hidden" name="measurementId" value={instrument.measurementId} />
              <input type="hidden" name="instrumentId" value={instrument.id} />
              <Fields instrument={instrument} locked={instrument.locked} />
              <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
              <Result state={state} />
            </form>

            {instrument.answers === 0 && (
              <form action={hapusAction} style={{ marginTop: "0.5rem" }}>
                <input type="hidden" name="measurementId" value={instrument.measurementId} />
                <input type="hidden" name="instrumentId" value={instrument.id} />
                {confirming ? (
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <button type="submit" className="btn-link" style={{ color: "var(--bad)" }} disabled={menghapus}>
                      {menghapus ? "Menghapus…" : "Ya, hapus soal ini"}
                    </button>
                    <button type="button" className="btn-link" onClick={() => setConfirming(false)}>Batal</button>
                  </div>
                ) : (
                  <button type="button" className="btn-link" onClick={() => setConfirming(true)}>Hapus soal</button>
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
