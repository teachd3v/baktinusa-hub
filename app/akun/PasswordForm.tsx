"use client";

import { useActionState, useRef } from "react";
import { changePasswordAction, type PasswordState } from "./actions";

export function PasswordForm() {
  const [state, action, pending] = useActionState(async (previous: PasswordState, form: FormData) => {
    const result = await changePasswordAction(previous, form);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action}>
      <div className="field">
        <label className="label" htmlFor="current">Kata sandi saat ini</label>
        <input id="current" className="input" name="current" type="password" autoComplete="current-password" maxLength={200} required />
      </div>
      <div className="field">
        <label className="label" htmlFor="next">Kata sandi baru</label>
        <input id="next" className="input" name="next" type="password" autoComplete="new-password" minLength={6} maxLength={200} required />
        <p className="section-hint" style={{ margin: "0.35rem 0 0" }}>Minimal 6 karakter. Makin panjang makin aman.</p>
      </div>
      <div className="field">
        <label className="label" htmlFor="confirm">Ulangi kata sandi baru</label>
        <input id="confirm" className="input" name="confirm" type="password" autoComplete="new-password" maxLength={200} required />
      </div>
      <button type="submit" className="btn" style={{ width: "100%" }} disabled={pending}>
        {pending ? "Menyimpan…" : "Simpan kata sandi"}
      </button>
      {state && (
        <p className={state.ok ? "section-hint" : "form-error"} role={state.ok ? "status" : "alert"} style={{ margin: "0.75rem 0 0" }}>
          {state.ok ? "✓ " : ""}
          {state.message}
        </p>
      )}
    </form>
  );
}
