"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { formatWib } from "@/lib/format";

const pad = (n: number) => String(n).padStart(2, "0");

export function DeadlineBanner({ closesAt }: { closesAt: string | null }) {
  const router = useRouter();
  const [msLeft, setMsLeft] = useState<number | null>(null);
  const refreshed = useRef(false);

  useEffect(() => {
    if (!closesAt) return;
    const end = Date.parse(closesAt);
    const tick = () => {
      const left = end - Date.now();
      setMsLeft(left);
      // Server yang memutuskan form ditutup; muat ulang sekali supaya halaman berganti ke status "ditutup".
      if (left <= 0 && !refreshed.current) {
        refreshed.current = true;
        router.refresh();
      }
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [closesAt, router]);

  // Tanggal baru dirender setelah mount supaya format Intl server dan browser tidak bentrok saat hidrasi.
  if (!closesAt || msLeft === null) return null;

  if (msLeft > 48 * 3_600_000) {
    return <p className="section-hint" style={{ textAlign: "center" }}>Survei ditutup {formatWib(closesAt)}</p>;
  }

  const total = Math.max(0, Math.floor(msLeft / 1000));
  return (
    <div className="deadline" role="status">
      <strong>⏳ Survei segera ditutup</strong>
      <span>Form ditutup otomatis pada {formatWib(closesAt)}.</span>
      <span className="countdown" aria-label="Sisa waktu">
        {pad(Math.floor(total / 3600))}:{pad(Math.floor((total % 3600) / 60))}:{pad(total % 60)}
      </span>
    </div>
  );
}
