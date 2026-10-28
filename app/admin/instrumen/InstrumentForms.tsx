"use client";

import { useActionState, useState, useId } from "react";
import { ModalButton } from "@/components/Modal";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import type { InstrumentListRow } from "@/lib/data/measurements";
import { addInstrumentAction, deleteInstrumentAction, updateInstrumentAction, type MeasurementState } from "../pengukuran/actions";

type MeasurementOption = { id: number; code: string; name: string };

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
        <label className="label">Pernyataan</label>
        <textarea className="textarea" name="statement" rows={2} maxLength={1000} defaultValue={instrument?.statement ?? ""} placeholder="Tulis sesuai pengisinya: &quot;Saya …&quot; untuk asesmen mandiri, &quot;Yang bersangkutan …&quot; untuk penilai lain." />
      </div>
      {locked && (
        <p className="section-hint">
          Pengukuran ini sudah punya jawaban: kode dan skala terkunci, teksnya masih bisa diperbaiki.
        </p>
      )}
    </>
  );
}

// Menambah soal berarti memilih jenis pengukuran tujuannya.
export function NewInstrumentForm({ measurements }: { measurements: MeasurementOption[] }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(addInstrumentAction, null);
  const [measurementId, setMeasurementId] = useState(String(measurements[0]?.id ?? ""));

  if (measurements.length === 0) {
    return <p className="section-hint" style={{ margin: 0 }}>Belum ada jenis pengukuran. Buat dulu di menu Pengukuran.</p>;
  }

  return (
    <form action={action}>
      <div className="field">
        <label className="label" htmlFor="measurementId">Masuk ke jenis pengukuran</label>
        <select id="measurementId" className="select" name="measurementId" value={measurementId} onChange={(e) => setMeasurementId(e.target.value)}>
          {measurements.map((m) => (
            <option key={m.id} value={m.id}>{m.code} · {m.name}</option>
          ))}
        </select>
      </div>
      <Fields />
      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Tambah soal"}</button>
      <Result state={state} />
    </form>
  );
}

export function InstrumentRowForm({
  instrument,
  selected,
  onToggle,
  showMeasurementColumn = false,
}: {
  instrument: InstrumentListRow;
  selected?: boolean;
  onToggle?: (id: number) => void;
  showMeasurementColumn?: boolean;
}) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(updateInstrumentAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<MeasurementState, FormData>(deleteInstrumentAction, null);
  const hapusForm = useId();

  return (
    <>
      <tr>
        <td className="check-col" style={{ width: "2.5rem", textAlign: "center" }}>
          <input
            type="checkbox"
            checked={selected ?? false}
            disabled={instrument.answers > 0}
            title={instrument.answers > 0 ? "Soal sudah memiliki jawaban, tidak bisa dihapus" : "Pilih untuk dihapus"}
            aria-label={`Pilih soal ${instrument.code}`}
            onChange={() => onToggle?.(instrument.id)}
          />
          {instrument.answers > 0 && (
            <svg className="row-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label="Sudah punya jawaban, tidak bisa dihapus">
              <path d="M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
            </svg>
          )}
        </td>
        <td><code style={{ fontSize: "0.78rem" }}>{instrument.code}</code></td>
        <td>
          {instrument.statement}
        </td>
        {showMeasurementColumn && <td>{instrument.measurementName}</td>}
        <td className="num">{instrument.scaleMax}</td>
        <td className="num">
          {instrument.answers > 0 ? <span className="pill pill-info">{instrument.answers}</span> : <span className="section-hint">0</span>}
        </td>
        <td>
          <ModalButton label="Edit" className="btn-link" title={`Edit soal ${instrument.code}`}>
          <form action={action}>
            <input type="hidden" name="measurementId" value={instrument.measurementId} />
            <input type="hidden" name="instrumentId" value={instrument.id} />
            <Fields instrument={instrument} locked={instrument.locked} />
            <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
            <Result state={state} />
          </form>

          {instrument.answers === 0 && (
            <form id={hapusForm} action={hapusAction} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="measurementId" value={instrument.measurementId} />
              <input type="hidden" name="instrumentId" value={instrument.id} />
              <ConfirmDelete label="Hapus soal" title="Hapus soal ini?" confirmLabel="Ya, hapus soal" form={hapusForm} pending={menghapus}>
                <p>Soal <b>{instrument.code}</b> akan dihapus.</p>
                <p>Tindakan ini tidak bisa dibatalkan.</p>
              </ConfirmDelete>
              <Result state={hapus} />
            </form>
          )}
          </ModalButton>
        </td>
      </tr>
    </>
  );
}
