"use client";

import Script from "next/script";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";

export type TurnstileHandle = { reset: () => void };

type Props = {
  siteKey: string;
  action: string;
  onToken: (token: string) => void;
  ref?: Ref<TurnstileHandle>;
};

// Token Turnstile sekali pakai: panggil reset() setelah setiap percobaan kirim yang tidak berpindah halaman.
export function Turnstile({ siteKey, action, onToken, ref }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.turnstile) setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !box.current || widgetId.current) return;
    widgetId.current = window.turnstile!.render(box.current, {
      sitekey: siteKey,
      action,
      callback: onToken,
      "expired-callback": () => onToken(""),
      "error-callback": () => onToken(""),
    });
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
      onToken("");
    };
  }, [ready, siteKey, action, onToken]);

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      onToken("");
    },
  }), [onToken]);

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      />
      {/* Ruang widget dipesan sejak awal supaya tombol di bawahnya tidak bergeser saat widget muncul. */}
      <div ref={box} style={{ display: "flex", justifyContent: "center", minHeight: 72, marginTop: "0.5rem" }} />
    </>
  );
}
