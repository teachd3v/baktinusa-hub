"use client";

import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Android/Chrome menyediakan tombol pasang sendiri lewat beforeinstallprompt; iOS Safari tidak, jadi di sana yang
// bisa dilakukan hanya menunjukkan caranya. Kalau aplikasi sudah dibuka dari layar utama, bagian ini tidak tampil.
export function InstallApp() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [standalone, setStandalone] = useState(true);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(isStandalone);
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent));

    // Peristiwanya ditangkap skrip di layout (lebih awal dari React) dan disimpan di window.__bip.
    const w = window as Window & { __bip?: InstallEvent };
    if (w.__bip) setEvent(w.__bip);
    const onReady = () => setEvent(w.__bip ?? null);
    const onInstalled = () => setStandalone(true);
    window.addEventListener("bip-ready", onReady);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("bip-ready", onReady);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return <p className="section-hint">Aplikasi ini sudah terpasang di perangkat Anda.</p>;

  if (event) {
    return (
      <button
        type="button"
        className="btn"
        onClick={async () => {
          await event.prompt();
          await event.userChoice;
          (window as Window & { __bip?: InstallEvent }).__bip = undefined;
          setEvent(null);
        }}
      >
        Pasang aplikasi
      </button>
    );
  }

  if (ios) {
    return (
      <p className="section-hint">
        Di Safari, ketuk tombol Bagikan lalu pilih <strong>Tambah ke Layar Utama</strong>.
      </p>
    );
  }

  return (
    <p className="section-hint">
      Buka menu browser (⋮) lalu pilih <strong>Instal aplikasi</strong> atau <strong>Tambahkan ke layar utama</strong>.
    </p>
  );
}
