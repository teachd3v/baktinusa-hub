"use client";

import { useActionState, useState } from "react";
import type { CategoryRow, FormText, InstrumentRow } from "@/lib/data/admin-instruments";
import type { PeriodItem } from "@/lib/data/periods";
import {
  addCategoryAction,
  addInstrumentAction,
  createPeriodAction,
  deleteCategoryAction,
  deleteInstrumentAction,
  saveFormTextAction,
  updateInstrumentAction,
  type ActionState,
} from "./actions";

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "section-hint" : "form-error"} role="status" style={{ margin: "0.5rem 0 0" }}>
      {state.ok ? "✓ " : ""}
      {state.message}
    </p>
  );
}

// Slug ikut mengikuti angkatan + jenis, tapi tetap bisa ditimpa — dia yang jadi bagian URL form publik.
export function NewPeriodForm({ periods }: { periods: PeriodItem[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createPeriodAction, null);
  const [batch, setBatch] = useState("BA16");
  const [kind, setKind] = useState<"assessment" | "leadpro">("assessment");
  const [slug, setSlug] = useState("ba16-pengukuran");
  const [touched, setTouched] = useState(false);

  const follow = (nextBatch: string, nextKind: string) => {
    if (!touched) setSlug(`${nextBatch.toLowerCase().trim()}-${nextKind === "leadpro" ? "leadpro" : "pengukuran"}`);
  };

  return (
    <form action={action}>
      <div className="form-row">
        <div className="field">
          <label className="label" htmlFor="batch">Angkatan</label>
          <input id="batch" className="input" name="batch" maxLength={20} value={batch}
            onChange={(e) => { setBatch(e.target.value); follow(e.target.value, kind); }} />
        </div>
        <div className="field">
          <label className="label" htmlFor="kind">Jenis</label>
          <select id="kind" className="select" name="kind" value={kind}
            onChange={(e) => { const v = e.target.value as "assessment" | "leadpro"; setKind(v); follow(batch, v); }}>
            <option value="assessment">Asesmen &amp; 360°</option>
            <option value="leadpro">Leadership Project</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="name">Nama periode</label>
        <input id="name" className="input" name="name" maxLength={120} defaultValue="" placeholder="BA16 · Pengukuran Awardee" />
      </div>

      <div className="field">
        <label className="label" htmlFor="slug">Slug (dipakai di alamat form)</label>
        <input id="slug" className="input" name="slug" maxLength={60} value={slug}
          onChange={(e) => { setTouched(true); setSlug(e.target.value); }} />
        <p className="section-hint" style={{ margin: "0.3rem 0 0" }}>Alamat formnya nanti: /s/&lt;kode-referal&gt;/{slug || "…"}</p>
      </div>

      <div className="field">
        <label className="label" htmlFor="copyFromId">Salin kuesioner dari</label>
        <select id="copyFromId" className="select" name="copyFromId" defaultValue="">
          <option value="">Mulai kosong</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <p className="section-hint" style={{ margin: "0.3rem 0 0" }}>
          Menyalin kategori, pertanyaan, dan tipe penilai — tanpa tanggal dan tanpa satu pun jawaban.
        </p>
      </div>

      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Membuat…" : "Buat periode"}</button>
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

export function InstrumentRowForm({ periodId, instrument, locked }: { periodId: number; instrument: InstrumentRow; locked: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(updateInstrumentAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<ActionState, FormData>(deleteInstrumentAction, null);
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
            <input type="hidden" name="periodId" value={periodId} />
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
              <input type="hidden" name="periodId" value={periodId} />
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

export function CategoryBlock({ periodId, category, locked }: { periodId: number; category: CategoryRow; locked: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addInstrumentAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<ActionState, FormData>(deleteCategoryAction, null);
  const [open, setOpen] = useState(false);

  return (
    <section className="card" style={{ background: "var(--surface-sunken)", boxShadow: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 className="section-title" style={{ margin: 0 }}>{category.name}</h3>
        <span className="section-hint" style={{ margin: 0 }}>{category.instruments.length} pertanyaan</span>
      </div>

      {category.instruments.map((i) => (
        <InstrumentRowForm key={i.id} periodId={periodId} instrument={i} locked={locked} />
      ))}

      {!locked && (
        <div style={{ marginTop: "0.75rem" }}>
          <button type="button" className="btn-link" onClick={() => setOpen(!open)}>
            {open ? "Batal" : "+ Tambah pertanyaan ke kategori ini"}
          </button>
          {open && (
            <form action={action} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="periodId" value={periodId} />
              <input type="hidden" name="categoryId" value={category.id} />
              <InstrumentFields />
              <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menambah…" : "Tambah"}</button>
              <Result state={state} />
            </form>
          )}
          {category.instruments.length === 0 && (
            <form action={hapusAction} style={{ marginTop: "0.5rem" }}>
              <input type="hidden" name="periodId" value={periodId} />
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

export function AddCategory({ periodId }: { periodId: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addCategoryAction, null);
  return (
    <form action={action} className="copy-row">
      <input type="hidden" name="periodId" value={periodId} />
      <input className="input" name="name" maxLength={120} placeholder="Nama kategori baru" aria-label="Nama kategori baru" />
      <button type="submit" className="btn btn-small" disabled={pending}>Tambah</button>
      <Result state={state} />
    </form>
  );
}

// Judul & subjudul yang dilihat responden di form publik.
export function FormTextForm({ periodId, text }: { periodId: number; text: FormText }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveFormTextAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="periodId" value={periodId} />
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
