"use client";

import { useActionState, useState } from "react";
import type { CategoryRow, FormText, InstrumentRow, MeasurementRow } from "@/lib/data/measurements";
import {
  addCategoryAction,
  addInstrumentAction,
  createMeasurementAction,
  deleteMeasurementAction,
  deleteCategoryAction,
  deleteInstrumentAction,
  renameCategoryAction,
  renameMeasurementAction,
  saveFormTextAction,
  updateInstrumentAction,
  type MeasurementState,
} from "./actions";

function Result({ state }: { state: MeasurementState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "section-hint" : "form-error"} role="status" style={{ margin: "0.5rem 0 0" }}>
      {state.ok ? "✓ " : ""}
      {state.message}
    </p>
  );
}

// Slug ikut mengikuti angkatan + jenis, tapi tetap bisa ditimpa — dia yang jadi bagian URL form publik.
// Pengukuran baru bisa dimulai dari nol atau menyalin kuesioner pengukuran lain sebagai titik awal.
export function NewMeasurementForm({ measurements }: { measurements: MeasurementRow[] }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(createMeasurementAction, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touched, setTouched] = useState(false);

  const ikutNama = (value: string) => {
    setName(value);
    if (!touched) setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""));
  };

  return (
    <form action={action}>
      <div className="form-row">
        <div className="field">
          <label className="label" htmlFor="name">Nama pengukuran</label>
          <input id="name" className="input" name="name" maxLength={120} value={name}
            onChange={(e) => ikutNama(e.target.value)} placeholder="Pengukuran Awardee 360°" />
        </div>
        <div className="field">
          <label className="label" htmlFor="kind">Jenis</label>
          <select id="kind" className="select" name="kind" defaultValue="assessment">
            <option value="assessment">Asesmen &amp; 360°</option>
            <option value="leadpro">Leadership Project</option>
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label className="label" htmlFor="slug">Slug</label>
          <input id="slug" className="input" name="slug" maxLength={60} value={slug}
            onChange={(e) => { setTouched(true); setSlug(e.target.value); }} placeholder="pengukuran-awardee" />
        </div>
        <div className="field">
          <label className="label" htmlFor="copyFromId">Salin kuesioner dari</label>
          <select id="copyFromId" className="select" name="copyFromId" defaultValue="">
            <option value="">Mulai kosong</option>
            {measurements.map((m) => (
              <option key={m.id} value={m.id}>{m.name} ({m.instruments} soal)</option>
            ))}
          </select>
        </div>
      </div>

      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Membuat…" : "Buat pengukuran"}</button>
      <Result state={state} />
    </form>
  );
}

// Sub pengukuran bisa diganti namanya kapan saja — nilai menempel ke id, bukan ke namanya.
export function CategoryNameForm({ measurementId, category }: { measurementId: number; category: CategoryRow }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(renameCategoryAction, null);
  return (
    <form action={action} className="copy-row" style={{ marginTop: "0.5rem" }}>
      <input type="hidden" name="measurementId" value={measurementId} />
      <input type="hidden" name="categoryId" value={category.id} />
      <input className="input" name="name" maxLength={120} defaultValue={category.name} aria-label={`Nama sub pengukuran ${category.name}`} />
      <button type="submit" className="btn btn-small" disabled={pending}>{pending ? "Menyimpan…" : "Ganti nama"}</button>
      <Result state={state} />
    </form>
  );
}

function InstrumentFields({ instrument }: { instrument?: InstrumentRow }) {
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
        <textarea className="textarea" name="textPublic" maxLength={1000} rows={2} defaultValue={instrument?.textPublic ?? ""}
          placeholder="Yang bersangkutan …" />
      </div>
      <div className="field">
        <label className="label">Teks untuk asesmen mandiri</label>
        <textarea className="textarea" name="textSelf" maxLength={1000} rows={2} defaultValue={instrument?.textSelf ?? ""}
          placeholder="Saya …" />
      </div>
    </>
  );
}

export function InstrumentRowForm({ measurementId, instrument, locked }: { measurementId: number; instrument: InstrumentRow; locked: boolean }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(updateInstrumentAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<MeasurementState, FormData>(deleteInstrumentAction, null);
  const [open, setOpen] = useState(false);

  return (
    <div style={{ borderTop: "1px solid var(--line)", padding: "0.6rem 0" }}>
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "baseline", justifyContent: "space-between" }}>
        <p style={{ margin: 0, fontSize: "0.88rem" }}>
          <b>{instrument.code}</b> · {instrument.textPublic}
          {instrument.answers > 0 && <span className="pill pill-muted" style={{ marginLeft: "0.4rem" }}>{instrument.answers} jawaban</span>}
        </p>
        <button type="button" className="btn-link" onClick={() => setOpen(!open)}>{open ? "Tutup" : "Ubah"}</button>
      </div>

      {open && (
        <>
          <form action={action} style={{ marginTop: "0.5rem" }}>
            <input type="hidden" name="measurementId" value={measurementId} />
            <input type="hidden" name="instrumentId" value={instrument.id} />
            <InstrumentFields instrument={instrument} />
            {instrument.answers > 0 && (
              <p className="section-hint">Pertanyaan ini sudah dijawab: kode dan skalanya terkunci, teksnya masih bisa diperbaiki.</p>
            )}
            <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
            <Result state={state} />
          </form>

          {!locked && instrument.answers === 0 && (
            <form action={hapusAction} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="measurementId" value={measurementId} />
              <input type="hidden" name="instrumentId" value={instrument.id} />
              <button type="submit" className="btn-link" disabled={menghapus}>Hapus pertanyaan ini</button>
              <Result state={hapus} />
            </form>
          )}
        </>
      )}
    </div>
  );
}

export function CategoryBlock({ measurementId, category, locked }: { measurementId: number; category: CategoryRow; locked: boolean }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(addInstrumentAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<MeasurementState, FormData>(deleteCategoryAction, null);
  const [open, setOpen] = useState(false);

  return (
    <section className="card" style={{ background: "var(--surface-sunken)", boxShadow: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 className="section-title" style={{ margin: 0 }}>{category.name}</h3>
        <span className="section-hint" style={{ margin: 0 }}>{category.instruments.length} pertanyaan</span>
      </div>

      {category.instruments.map((i) => (
        <InstrumentRowForm key={i.id} measurementId={measurementId} instrument={i} locked={locked} />
      ))}

      {!locked && (
        <div style={{ marginTop: "0.75rem" }}>
          <button type="button" className="btn-link" onClick={() => setOpen(!open)}>
            {open ? "Batal" : "+ Tambah pertanyaan ke kategori ini"}
          </button>
          {open && (
            <form action={action} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="measurementId" value={measurementId} />
              <input type="hidden" name="categoryId" value={category.id} />
              <InstrumentFields />
              <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menambah…" : "Tambah"}</button>
              <Result state={state} />
            </form>
          )}
          {category.instruments.length === 0 && (
            <form action={hapusAction} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="measurementId" value={measurementId} />
              <input type="hidden" name="categoryId" value={category.id} />
              <button type="submit" className="btn-link" disabled={menghapus}>Hapus kategori kosong ini</button>
              <Result state={hapus} />
            </form>
          )}
        </div>
      )}
    </section>
  );
}

export function AddCategory({ measurementId }: { measurementId: number }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(addCategoryAction, null);
  return (
    <form action={action} className="copy-row">
      <input type="hidden" name="measurementId" value={measurementId} />
      <input className="input" name="name" maxLength={120} placeholder="Nama kategori baru" aria-label="Nama kategori baru" />
      <button type="submit" className="btn btn-small" disabled={pending}>Tambah</button>
      <Result state={state} />
    </form>
  );
}

// Judul & subjudul yang dilihat responden di form publik.
export function FormTextForm({ measurementId, text }: { measurementId: number; text: FormText }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(saveFormTextAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="measurementId" value={measurementId} />
      <div className="field">
        <label className="label" htmlFor="form-title">Judul form</label>
        <input id="form-title" className="input" name="title" maxLength={120} defaultValue={text.title} />
      </div>
      <div className="field">
        <label className="label" htmlFor="form-subtitle">Subjudul</label>
        <input id="form-subtitle" className="input" name="subtitle" maxLength={200} defaultValue={text.subtitle ?? ""} placeholder="Awardee BAKTI NUSA 16" />
      </div>
      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan teks"}</button>
      <Result state={state} />
    </form>
  );
}

// Ganti nama selalu aman; hapus hanya kalau tidak ada periode yang menjadwalkannya.
export function MeasurementSettings({ measurement }: { measurement: MeasurementRow }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(renameMeasurementAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<MeasurementState, FormData>(deleteMeasurementAction, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <form action={action} className="copy-row">
        <input type="hidden" name="measurementId" value={measurement.id} />
        <input className="input" name="name" maxLength={120} defaultValue={measurement.name} aria-label="Nama pengukuran" />
        <button type="submit" className="btn btn-small" disabled={pending}>{pending ? "Menyimpan…" : "Ganti nama"}</button>
      </form>
      <Result state={state} />

      {measurement.periods > 0 ? (
        <p className="section-hint" style={{ margin: "0.75rem 0 0" }}>
          Dipakai {measurement.periods} periode, jadi belum bisa dihapus. Lepas dari periodenya dulu.
        </p>
      ) : (
        <form action={hapusAction} style={{ marginTop: "0.75rem" }}>
          <input type="hidden" name="measurementId" value={measurement.id} />
          {confirming ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button type="submit" className="btn-link" style={{ color: "var(--bad)" }} disabled={menghapus}>
                {menghapus ? "Menghapus…" : `Ya, hapus beserta ${measurement.instruments} soalnya`}
              </button>
              <button type="button" className="btn-link" onClick={() => setConfirming(false)}>Batal</button>
            </div>
          ) : (
            <button type="button" className="btn-link" onClick={() => setConfirming(true)}>Hapus pengukuran</button>
          )}
          <Result state={hapus} />
        </form>
      )}
    </>
  );
}
