"use client";

import { startTransition, useActionState, useState } from "react";
import type { Leadpro } from "@/lib/data/leadpro";
import { saveLeadproAction } from "../actions";

const OTHER = "__other__";

// Dikirim lewat onSubmit supaya isian tidak dikosongkan React saat validasi gagal.
export function LeadproForm({ awardeeId, leadpro, fields }: { awardeeId: number; leadpro: Leadpro | null; fields: string[] }) {
  const [state, action, pending] = useActionState(saveLeadproAction, null);
  // Bidang dipilih dari daftar yang sudah ada; "Lainnya" membuka isian untuk bidang baru.
  const current = leadpro?.field ?? "";
  const known = current && !fields.includes(current) ? [...fields, current] : fields;
  const [choice, setChoice] = useState(current);
  const [custom, setCustom] = useState("");
  const other = choice === OTHER;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="awardeeId" value={awardeeId} />
      <div className="form-row">
        <div className="field" style={{ flex: 2 }}>
          <label className="label" htmlFor="lp-name">Nama proyek</label>
          <input id="lp-name" className="input" name="name" maxLength={120} defaultValue={leadpro?.name ?? ""} />
        </div>
        <div className="field">
          <label className="label" htmlFor="lp-field">Bidang</label>
          <select id="lp-field" className="select" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="">Belum dipilih</option>
            {known.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
            <option value={OTHER}>Lainnya…</option>
          </select>
          {other && (
            <input className="input" aria-label="Bidang baru" maxLength={40} placeholder="Tulis bidang baru" value={custom} onChange={(e) => setCustom(e.target.value)} style={{ marginTop: "0.4rem" }} />
          )}
          <input type="hidden" name="field" value={other ? custom : choice} />
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="lp-desc">Deskripsi</label>
        <textarea id="lp-desc" className="textarea" name="description" rows={5} maxLength={2000} defaultValue={leadpro?.description ?? ""} />
        <p className="section-hint" style={{ margin: "0.35rem 0 0" }}>Maksimal 2000 karakter. Mengosongkan nama proyek menghapus LeadPro awardee ini.</p>
      </div>
      <button type="submit" className="btn" disabled={pending}>{pending ? "Menyimpan…" : "Simpan LeadPro"}</button>
      {state && (
        <p className={state.ok ? "section-hint" : "form-error"} role={state.ok ? "status" : "alert"} style={{ margin: "0.75rem 0 0" }}>
          {state.ok ? "✓ " : ""}
          {state.message}
        </p>
      )}
    </form>
  );
}
