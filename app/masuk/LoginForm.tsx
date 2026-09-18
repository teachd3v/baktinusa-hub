"use client";

import { useRef, useState, type FormEvent } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";

type State = { kind: "idle" | "sending" | "sent" | "error"; message?: string };

export function LoginForm({ siteKey, action }: { siteKey: string; action: string }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });
  const turnstile = useRef<TurnstileHandle>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/auth/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: token }),
      });
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setState({ kind: res.ok ? "sent" : "error", message: data?.message ?? "Terjadi gangguan jaringan. Coba lagi." });
    } catch {
      setState({ kind: "error", message: "Terjadi gangguan jaringan. Coba lagi." });
    } finally {
      turnstile.current?.reset();
    }
  }

  if (state.kind === "sent") {
    return (
      <div className="notice fade-in" role="status">
        <div className="notice-emoji" aria-hidden="true">📬</div>
        <h2 className="section-title">Cek email Anda</h2>
        <p className="section-hint">{state.message}</p>
        <button type="button" className="btn btn-muted" style={{ flex: "none" }} onClick={() => setState({ kind: "idle" })}>
          Kirim ulang
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label className="label" htmlFor="email">Email terdaftar</label>
        <input
          id="email"
          type="email"
          className="input"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={200}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <Turnstile ref={turnstile} siteKey={siteKey} action={action} onToken={setToken} />
      {state.kind === "error" && <p className="form-error" role="alert">{state.message}</p>}
      <div className="actions">
        <button type="submit" className="btn" disabled={!token || !email.trim() || state.kind === "sending"}>
          {state.kind === "sending" ? "Mengirim…" : token ? "Kirim tautan masuk" : "Menunggu verifikasi…"}
        </button>
      </div>
    </form>
  );
}
