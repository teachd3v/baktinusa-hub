"use client";

import { useActionState, useState } from "react";
import type { PeriodDetail, PeriodMeasurementConfig } from "@/lib/data/admin-periods";
import { CYCLES, CYCLE_LABEL, type Cycle } from "@/lib/data/periods";
import { isoToWibInput } from "@/lib/waktu";
import {
  addTypeAction,
  createPeriodAction,
  removeTypeAction,
  savePeriodAction,
  saveTypeAction,
  setStatusAction,
  type ActionState,
} from "./actions";

// Semua waktu diketik dalam WIB; konversinya terjadi di server, bukan di zona waktu browser pengelola.

function Result({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "section-hint" : "form-error"} role="status" style={{ margin: "0.5rem 0 0" }}>
      {state.ok ? "✓ " : ""}
      {state.message}
    </p>
  );
}

function WindowFields({ opensAt, closesAt, idPrefix }: { opensAt: string | null; closesAt: string | null; idPrefix: string }) {
  return (
    <div className="form-row">
      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-opens`}>Dibuka (WIB)</label>
        <input id={`${idPrefix}-opens`} className="input" type="datetime-local" name="opensAt" defaultValue={isoToWibInput(opensAt)} />
      </div>
      <div className="field">
        <label className="label" htmlFor={`${idPrefix}-closes`}>Ditutup (WIB)</label>
        <input id={`${idPrefix}-closes`} className="input" type="datetime-local" name="closesAt" defaultValue={isoToWibInput(closesAt)} />
      </div>
    </div>
  );
}

export function PeriodSchedule({ period }: { period: PeriodDetail }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePeriodAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="periodId" value={period.id} />
      <div className="field">
        <label className="label" htmlFor="period-name">Nama siklus</label>
        <input id="period-name" className="input" name="name" maxLength={120} defaultValue={period.name} />
      </div>
      <WindowFields opensAt={period.opensAt} closesAt={period.closesAt} idPrefix="period" />
      <p className="section-hint">Kosongkan salah satunya kalau siklus ini tidak dibatasi waktu di sisi itu.</p>
      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan jadwal"}</button>
      <Result state={state} />
    </form>
  );
}

const NEXT: Record<string, { status: string; label: string; hint: string }[]> = {
  draft: [{ status: "open", label: "Buka siklus", hint: "Form mulai bisa diisi." }],
  open: [{ status: "closed", label: "Tutup siklus", hint: "Jawaban baru ditolak, hasil tetap terbaca." }],
  closed: [
    { status: "open", label: "Buka lagi", hint: "Mis. memberi perpanjangan waktu." },
    { status: "archived", label: "Arsipkan", hint: "Disembunyikan dari daftar aktif." },
  ],
  archived: [{ status: "closed", label: "Kembalikan ke ditutup", hint: "" }],
};

export function StatusSwitch({ period }: { period: PeriodDetail }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setStatusAction, null);
  const options = NEXT[period.status] ?? [];
  return (
    <form action={action}>
      <input type="hidden" name="periodId" value={period.id} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
        {options.map((o) => (
          <button key={o.status} type="submit" name="status" value={o.status} className="btn btn-small btn-inline" disabled={pending} title={o.hint}>
            {o.label}
          </button>
        ))}
      </div>
      {period.status === "draft" && period.instruments === 0 && (
        <p className="section-hint" style={{ margin: "0.5rem 0 0" }}>Siklus ini belum punya satu pun soal, jadi belum bisa dibuka.</p>
      )}
      <Result state={state} />
    </form>
  );
}

const RULE_LABEL = {
  none: "Tanpa target",
  fixed: "Jumlah tetap",
  region_peers: "Semua rekan se-wilayah",
} as const;

export function MeasurementRow({ periodId, type }: { periodId: number; type: PeriodMeasurementConfig }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveTypeAction, null);
  const [removeState, removeAction, removing] = useActionState<ActionState, FormData>(removeTypeAction, null);
  const id = `jenis-${type.measurementId}`;

  return (
    <div className="card" style={{ background: "var(--surface-sunken)", boxShadow: "none" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", alignItems: "baseline" }}>
        <h3 className="section-title" style={{ margin: 0 }}>
          <code style={{ fontSize: "0.78rem" }}>{type.code}</code> {type.name}
        </h3>
        <span className="section-hint" style={{ margin: 0 }}>{type.instruments} soal · {type.responses} jawaban masuk</span>
      </div>

      <form action={action}>
        <input type="hidden" name="periodId" value={periodId} />
        <input type="hidden" name="measurementId" value={type.measurementId} />
        <div className="form-row">
          <div className="field">
            <label className="label" htmlFor={`${id}-rule`}>Target responden</label>
            <select id={`${id}-rule`} className="select" name="targetRule" defaultValue={type.targetRule}>
              {Object.entries(RULE_LABEL).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor={`${id}-min`}>Minimal (kalau jumlah tetap)</label>
            <input id={`${id}-min`} className="input" type="number" name="targetMin" min={1} max={1000} defaultValue={type.targetMin ?? ""} />
          </div>
        </div>
        <WindowFields opensAt={type.opensAt} closesAt={type.closesAt} idPrefix={id} />
        <p className="section-hint">Kosongkan jadwal untuk mengikuti jadwal siklus.</p>
        <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
        <Result state={state} />
      </form>

      {type.responses === 0 && (
        <form action={removeAction} style={{ marginTop: "0.5rem" }}>
          <input type="hidden" name="periodId" value={periodId} />
          <input type="hidden" name="measurementId" value={type.measurementId} />
          <button type="submit" className="btn-link" disabled={removing}>Lepas jenis ini dari siklus</button>
          <Result state={removeState} />
        </form>
      )}
    </div>
  );
}

export function AddMeasurement({ periodId, available }: { periodId: number; available: { id: number; code: string; name: string; instruments: number }[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addTypeAction, null);
  if (available.length === 0) return <p className="section-hint" style={{ margin: 0 }}>Semua jenis pengukuran sudah dijalankan siklus ini.</p>;
  return (
    <form action={action} className="copy-row">
      <input type="hidden" name="periodId" value={periodId} />
      <select className="select" name="measurementId" defaultValue={String(available[0]!.id)} aria-label="Jenis pengukuran">
        {available.map((t) => (
          <option key={t.id} value={t.id}>{t.name}</option>
        ))}
      </select>
      <button type="submit" className="btn btn-small" disabled={pending}>Tambah</button>
      <Result state={state} />
    </form>
  );
}

// Siklus = jadwal milik satu angkatan. Jenis pengukuran yang dijalankannya dipilih setelah ini.
export function NewPeriodForm() {
  const [state, action, pending] = useActionState<ActionState, FormData>(createPeriodAction, null);
  const [batch, setBatch] = useState("BA16");
  const [cycle, setCycle] = useState<Cycle>("awal");
  const [slug, setSlug] = useState("ba16-awal");
  const [touched, setTouched] = useState(false);

  const ikut = (nextBatch: string, nextCycle: Cycle) => {
    if (touched) return;
    setSlug(`${nextBatch.toLowerCase().trim()}-${nextCycle}`);
  };

  return (
    <form action={action}>
      <div className="form-row">
        <div className="field">
          <label className="label" htmlFor="cycle">Siklus</label>
          <select
            id="cycle"
            className="select"
            name="cycle"
            value={cycle}
            onChange={(e) => {
              const next = e.target.value as Cycle;
              setCycle(next);
              ikut(batch, next);
            }}
          >
            {CYCLES.map((c) => (
              <option key={c} value={c}>{CYCLE_LABEL[c]}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="batch">Angkatan</label>
          <input id="batch" className="input" name="batch" maxLength={20} value={batch}
            onChange={(e) => { setBatch(e.target.value); ikut(e.target.value, cycle); }} />
        </div>
      </div>

      <div className="form-row">
        <div className="field">
          <label className="label" htmlFor="periode-name">Nama siklus <span className="section-hint">(boleh kosong)</span></label>
          <input id="periode-name" className="input" name="name" maxLength={120} placeholder={`${batch} · ${CYCLE_LABEL[cycle]}`} />
        </div>
        <div className="field">
          <label className="label" htmlFor="periode-slug">Slug (dipakai di alamat form)</label>
          <input id="periode-slug" className="input" name="slug" maxLength={60} value={slug}
            onChange={(e) => { setTouched(true); setSlug(e.target.value); }} placeholder="ba16-awal" />
        </div>
      </div>

      <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Membuat…" : "Buat siklus"}</button>
      <Result state={state} />
    </form>
  );
}
