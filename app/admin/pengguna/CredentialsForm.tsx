"use client";

import { useActionState, useState } from "react";
import { setCredentialsAction, type CreateUserState } from "./actions";

// Admin mengatur ulang ID masuk dan kata sandi akun lain. Kata sandi lama tidak bisa dibaca dari mana pun —
// yang tersimpan hanya turunannya — jadi "lupa kata sandi" selalu berarti membuat yang baru.
export function CredentialsForm({ userId, name, loginId }: { userId: number; name: string; loginId: string | null }) {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(setCredentialsAction, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button type="button" className="btn-link" onClick={() => setOpen(true)}>
        {loginId ? "Ubah ID / kata sandi" : "Tetapkan ID & kata sandi"}
      </button>
    );
  }

  return (
    <form action={action} style={{ minWidth: "14rem" }}>
      <input type="hidden" name="userId" value={userId} />
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label className="label" htmlFor={`id-${userId}`}>ID masuk</label>
        <input
          id={`id-${userId}`}
          name="loginId"
          className="input"
          maxLength={20}
          defaultValue={loginId ?? ""}
          autoComplete="off"
          aria-label={`ID masuk untuk ${name}`}
        />
      </div>
      <div className="field" style={{ marginBottom: "0.5rem" }}>
        <label className="label" htmlFor={`pw-${userId}`}>Kata sandi baru</label>
        <input
          id={`pw-${userId}`}
          name="password"
          type="text"
          className="input"
          maxLength={200}
          autoComplete="off"
          placeholder="Kosongkan bila tidak diganti"
        />
      </div>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
        <button type="button" className="btn-link" onClick={() => setOpen(false)}>Tutup</button>
      </div>
      {state && (
        <p className={state.ok ? "section-hint" : "form-error"} role="status" style={{ margin: "0.4rem 0 0" }}>
          {state.ok ? "✓ " : ""}
          {state.message}
        </p>
      )}
    </form>
  );
}
