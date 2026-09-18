"use client";

import { useState, useTransition } from "react";
import { CopyField } from "@/components/CopyField";
import { loginLinkAction, type LoginLinkResult } from "./actions";

export function LoginLinkButton({ userId, name }: { userId: number; name: string }) {
  const [result, setResult] = useState<LoginLinkResult | null>(null);
  const [pending, startTransition] = useTransition();

  if (result?.ok) {
    return (
      <div style={{ minWidth: 260 }}>
        <CopyField value={result.url} label={`tautan-masuk-${userId}`} />
        <p className="section-hint" style={{ margin: "0.35rem 0 0" }}>
          Kirim ke {name}. Sekali pakai, berlaku 3 hari.
        </p>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-small"
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await loginLinkAction(userId)))}
      >
        {pending ? "Membuat…" : "Buat tautan masuk"}
      </button>
      {result && !result.ok && <p className="form-error">{result.message}</p>}
    </>
  );
}
