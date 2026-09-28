"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { FILLED_BY_LABEL, PRESET_MEASUREMENTS, type FilledBy, type FormText, type MeasurementRow } from "@/lib/data/measurements";
import {
  createMeasurementAction,
  deleteMeasurementAction,
  renameMeasurementAction,
  saveFormTextAction,
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

// Nama dipilih dari daftar jenis baku; kode, slug, dan pengisinya ikut dari sana. Mengetik kode
// sendiri tiap kali adalah cara paling mudah memutus rute — salah satu huruf, dan formnya jadi tidak
// bisa dibuka siapa pun. Jenis yang kodenya sudah terpakai dimatikan dari daftar, bukan disembunyikan,
// supaya terlihat bahwa ia memang sudah ada.
//
// "Lainnya" membuka isian manual untuk jenis di luar keenam itu.
export function NewMeasurementForm({ measurements }: { measurements: MeasurementRow[] }) {
  const [state, action, pending] = useActionState<MeasurementState, FormData>(createMeasurementAction, null);
  const terpakai = new Set(measurements.map((m) => m.code));
  const tersedia = PRESET_MEASUREMENTS.filter((x) => !terpakai.has(x.code));

  const [pilihan, setPilihan] = useState<string>(tersedia[0]?.code ?? "lainnya");
  const preset = PRESET_MEASUREMENTS.find((x) => x.code === pilihan);

  // Isian manual hanya hidup saat "Lainnya" dipilih.
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
          <label className="label" htmlFor="preset">Nama pengukuran</label>
          <select id="preset" className="select" value={pilihan} onChange={(e) => setPilihan(e.target.value)}>
            {PRESET_MEASUREMENTS.map((x) => (
              <option key={x.code} value={x.code} disabled={terpakai.has(x.code)}>
                {x.name} ({x.code}){terpakai.has(x.code) ? " — sudah ada" : ""}
              </option>
            ))}
            <option value="lainnya">Lainnya — isi sendiri</option>
          </select>
        </div>

        {preset ? (
          <div className="field">
            <label className="label">Kode &amp; pengisinya</label>
            <p className="preset-note">
              <code>{preset.code}</code> · diisi {FILLED_BY_LABEL[preset.filledBy].toLowerCase()}
            </p>
            <input type="hidden" name="name" value={preset.name} />
            <input type="hidden" name="code" value={preset.code} />
            <input type="hidden" name="slug" value={preset.slug} />
            <input type="hidden" name="filledBy" value={preset.filledBy} />
          </div>
        ) : (
          <div className="field">
            <label className="label" htmlFor="code">Kode</label>
            <input id="code" className="input" name="code" maxLength={8} placeholder="XX"
              onChange={(e) => (e.target.value = e.target.value.toUpperCase())} />
          </div>
        )}
      </div>

      {!preset && (
        <>
          <div className="form-row">
            <div className="field">
              <label className="label" htmlFor="name">Nama jenis</label>
              <input id="name" className="input" name="name" maxLength={120} value={name}
                onChange={(e) => ikutNama(e.target.value)} placeholder="Uji Tambahan" />
            </div>
            <div className="field">
              <label className="label" htmlFor="filledBy">Diisi oleh</label>
              <select id="filledBy" className="select" name="filledBy" defaultValue="public">
                {(Object.keys(FILLED_BY_LABEL) as FilledBy[]).map((value) => (
                  <option key={value} value={value}>{FILLED_BY_LABEL[value]}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="slug">Slug</label>
            <input id="slug" className="input" name="slug" maxLength={60} value={slug}
              onChange={(e) => { setTouched(true); setSlug(e.target.value); }} placeholder="uji-tambahan" />
          </div>
        </>
      )}

      <div className="field">
        <label className="label" htmlFor="copyFromId">Salin kuesioner dari</label>
        <select id="copyFromId" className="select" name="copyFromId" defaultValue="">
          <option value="">Mulai kosong</option>
          {measurements.map((m) => (
            <option key={m.id} value={m.id}>{m.name} ({m.instruments} soal)</option>
          ))}
        </select>
      </div>

      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Membuat…" : "Buat pengukuran"}</button>
      <Result state={state} />
    </form>
  );
}

// Sub pengukuran bisa diganti namanya kapan saja — nilai menempel ke id, bukan ke namanya.
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

// Seluruh pengaturan satu jenis, muat dalam satu jendela: nama, teks form publik, dan penghapusan.
// Soalnya tidak ikut ke sini — itu milik menu Instrumen, yang bisa menyaring per jenis.
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

      <hr className="modal-rule" />
      <h3 className="section-title" style={{ fontSize: "0.9rem" }}>Teks form publik</h3>
      <p className="section-hint">Yang dilihat responden di bagian atas form penilaian.</p>
      <FormTextForm measurementId={measurement.id} text={measurement.formText} />

      <hr className="modal-rule" />
      <p className="section-hint" style={{ margin: 0 }}>
        <Link href={`/admin/instrumen?pengukuran=${measurement.slug}`}>
          Kelola {measurement.instruments} soal di menu Instrumen →
        </Link>
      </p>

      <hr className="modal-rule" />

      {measurement.periods > 0 ? (
        <p className="section-hint" style={{ margin: "0.75rem 0 0" }}>
          Dijalankan {measurement.periods} siklus, jadi belum bisa dihapus. Lepas dari siklusnya dulu.
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
