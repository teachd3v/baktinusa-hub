"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";

// Masuk dengan ID akun dan kata sandi. ID diseragamkan jadi huruf besar di sini supaya orang bisa
// mengetik "ba00126" tanpa gagal, sementara pencocokannya di server tetap tegas.
export function LoginForm({ siteKey, action }: { siteKey: string; action: string }) {
  const router = useRouter();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const turnstile = useRef<TurnstileHandle>(null);

  const ready = loginId.trim() !== "" && password !== "" && (siteKey === "" || token !== "");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId: loginId.trim().toUpperCase(), password, turnstileToken: token }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; redirect?: string; message?: string } | null;
      if (!res.ok || !data?.ok || !data.redirect) {
        setError(data?.message ?? "Terjadi gangguan jaringan. Coba lagi.");
        setPassword("");
        turnstile.current?.reset();
        setToken("");
        setSending(false);
        return;
      }
      router.replace(data.redirect);
      router.refresh();
    } catch {
      setError("Terjadi gangguan jaringan. Coba lagi.");
      turnstile.current?.reset();
      setToken("");
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="field">
        <label className="label" htmlFor="loginId">ID akun</label>
        <input
          id="loginId"
          className="input"
          name="loginId"
          autoComplete="username"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          placeholder="Mis. BA00126"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value.toUpperCase())}
        />
      </div>

      <div className="field">
        <label className="label" htmlFor="password">Kata sandi</label>
        <input
          id="password"
          className="input"
          name="password"
          type="password"
          autoComplete="current-password"
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {siteKey ? (
        <Turnstile ref={turnstile} siteKey={siteKey} action={action} onToken={setToken} />
      ) : (
        <p className="form-error" role="alert">Verifikasi keamanan belum diatur pengelola.</p>
      )}

      <button type="submit" className="btn" style={{ width: "100%" }} disabled={!ready || sending}>
        {sending ? "Memeriksa…" : "Masuk"}
      </button>

      {error && <p className="form-error" role="alert">{error}</p>}

      <p className="section-hint" style={{ margin: "1rem 0 0", textAlign: "center" }}>
        Lupa kata sandi? Hubungi Admin program — Admin yang mengatur ulang kata sandi akun Anda.
      </p>
    </form>
  );
}
