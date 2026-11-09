"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type Bip = Window & { __bip?: InstallEvent };

const KEY = "bh-installed";

// Android/Chrome memberi tombol pasang lewat beforeinstallprompt (ditangkap skrip di layout, lebih awal dari React).
// iOS Safari tidak punya, jadi di sana tombol hanya menunjukkan caranya.
//
// "Terpasang" dikenali dari tiga petunjuk: aplikasi sedang dibuka dari layar utama, peristiwa appinstalled, atau
// getInstalledRelatedApps. Chrome tidak memberi tahu halaman web biasa bahwa PWA-nya sudah terpasang, jadi petunjuk
// itu diingat di perangkat. Kalau Chrome menawarkan pemasangan lagi (artinya sudah dicopot), ingatannya dihapus.
function useInstall() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const remember = () => {
      try {
        localStorage.setItem(KEY, "1");
      } catch {}
    };
    const forget = () => {
      try {
        localStorage.removeItem(KEY);
      } catch {}
    };
    const w = window as Bip;
    const nav = navigator as Navigator & { standalone?: boolean; getInstalledRelatedApps?: () => Promise<unknown[]> };

    setIos(/iphone|ipad|ipod/i.test(nav.userAgent));

    const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    let flagged = false;
    try {
      flagged = localStorage.getItem(KEY) === "1";
    } catch {}
    if (standalone) {
      remember();
      setInstalled(true);
    } else if (flagged) {
      setInstalled(true);
    }

    nav.getInstalledRelatedApps?.().then((apps) => {
      if (apps.length > 0) {
        remember();
        setInstalled(true);
      }
    }).catch(() => {});

    const offered = () => {
      if (!w.__bip) return;
      setEvent(w.__bip);
      if (!standalone) {
        forget();
        setInstalled(false);
      }
    };
    offered();
    const onInstalled = () => {
      remember();
      setInstalled(true);
      setEvent(null);
    };
    window.addEventListener("bip-ready", offered);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("bip-ready", offered);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!event) return false;
    await event.prompt();
    const choice = await event.userChoice;
    (window as Bip).__bip = undefined;
    setEvent(null);
    return choice.outcome === "accepted";
  }

  return { event, installed, ios, install };
}

const DOWNLOAD = "M12 4v10m0 0-4-4m4 4 4-4M5 19h14";

// variant "sheet": tombol di lembar akun ponsel (bentuknya sama dengan tombol di sekitarnya).
// variant "card": tombol di halaman Akun.
export function InstallButton({ variant }: { variant: "sheet" | "card" }) {
  const { event, installed, ios, install } = useInstall();
  const [hint, setHint] = useState(false);

  const base = variant === "sheet" ? "mobile-logout mobile-account-link" : "btn";
  const className = `${base}${installed ? " install-done" : ""}`;

  return (
    <>
      <button
        type="button"
        className={className}
        disabled={installed}
        aria-disabled={installed}
        onClick={async () => {
          if (installed) return;
          if (event) await install();
          else setHint((open) => !open);
        }}
      >
        {installed ? (
          <Icon name="check" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d={DOWNLOAD} />
          </svg>
        )}
        {installed ? "Aplikasi terinstal" : "Pasang aplikasi"}
      </button>
      {hint && !installed && !event && (
        <p className="section-hint" role="status" style={{ margin: "0.5rem 0 0.75rem" }}>
          {ios ? (
            <>Di Safari, ketuk tombol Bagikan lalu pilih <strong>Tambah ke Layar Utama</strong>.</>
          ) : (
            <>Buka menu browser (⋮) lalu pilih <strong>Instal aplikasi</strong>.</>
          )}
        </p>
      )}
    </>
  );
}
