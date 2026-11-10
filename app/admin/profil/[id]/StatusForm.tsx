"use client";

import { useActionState } from "react";
import { AWARDEE_STATUSES, type AwardeeStatus } from "@/lib/data/profiles";
import { saveStatusAction } from "../actions";

export function StatusForm({ awardeeId, status, joinedAt }: { awardeeId: number; status: AwardeeStatus; joinedAt: string | null }) {
  const [state, action, pending] = useActionState(saveStatusAction, null);
  return (
    <form action={action}>
      <input type="hidden" name="awardeeId" value={awardeeId} />
      <div className="form-row">
        <div className="field">
          <label className="label" htmlFor="st-status">Status awardee</label>
          <select id="st-status" className="select" name="status" defaultValue={status}>
            {AWARDEE_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="label" htmlFor="st-joined">Tanggal bergabung</label>
          <input id="st-joined" className="input" name="joinedAt" type="date" defaultValue={joinedAt ?? ""} />
        </div>
      </div>
      <button type="submit" className="btn" disabled={pending}>{pending ? "Menyimpan…" : "Simpan status"}</button>
      {state && (
        <p className={state.ok ? "section-hint" : "form-error"} role={state.ok ? "status" : "alert"} style={{ margin: "0.75rem 0 0" }}>
          {state.ok ? "✓ " : ""}
          {state.message}
        </p>
      )}
    </form>
  );
}
