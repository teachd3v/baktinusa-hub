"use client";

import Script from "next/script";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AwardeeCard } from "@/components/AwardeeCard";
import { BrandHeader } from "@/components/BrandHeader";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import type { FeedbackField, FormConfig } from "@/lib/survey";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type Props = {
  kode: string;
  periode: string;
  siteKey: string;
  turnstileAction: string;
  closesAt: string | null;
  awardee: { name: string; region: string; campus: string | null; referralCode: string };
  config: FormConfig;
  instruments: { code: string; text: string; category: string }[];
};

type Answers = {
  name: string;
  city: string;
  relationIndex: number | null;
  relationDetail: string;
  knownDuration: string;
  scores: Record<string, number>;
  feedback: Partial<Record<FeedbackField, string>>;
};

type Modal =
  | { kind: "confirm" }
  | { kind: "message"; emoji: string; title: string; text: string };

const EMPTY: Answers = { name: "", city: "", relationIndex: null, relationDetail: "", knownDuration: "", scores: {}, feedback: {} };

const scrollBehavior = (): ScrollBehavior =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

export function SurveyForm({ kode, periode, siteKey, turnstileAction, closesAt, awardee, config, instruments }: Props) {
  const router = useRouter();
  const categories = useMemo(() => [...new Set(instruments.map((i) => i.category))], [instruments]);
  const lastStep = categories.length + 1; // 0 = profil, 1..n = kategori, n+1 = saran
  const draftKey = `baktinusa-hub:draft:${kode}:${periode}`;

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [flagged, setFlagged] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState("");
  const [turnstileReady, setTurnstileReady] = useState(false);
  const turnstileBox = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const flagTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draf jawaban disimpan di perangkat supaya 50 jawaban tidak hilang saat berpindah aplikasi.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      if (saved) setAnswers({ ...EMPTY, ...JSON.parse(saved) });
    } catch {}
    setDraftLoaded(true);
  }, [draftKey]);

  useEffect(() => {
    if (!draftLoaded) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(answers));
    } catch {}
  }, [answers, draftKey, draftLoaded]);

  useEffect(() => {
    if (window.turnstile) setTurnstileReady(true);
  }, []);

  // Widget Turnstile hanya hidup di langkah terakhir; token sekali pakai, jadi widget dibuat ulang tiap masuk langkah itu.
  useEffect(() => {
    if (step !== lastStep || !turnstileReady || !siteKey || !turnstileBox.current || widgetId.current) return;
    widgetId.current = window.turnstile!.render(turnstileBox.current, {
      sitekey: siteKey,
      action: turnstileAction,
      callback: setToken,
      "expired-callback": () => setToken(""),
      "error-callback": () => setToken(""),
    });
    return () => {
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
      setToken("");
    };
  }, [step, lastStep, turnstileReady, siteKey, turnstileAction]);

  const update = (patch: Partial<Answers>) => setAnswers((prev) => ({ ...prev, ...patch }));
  const relation = answers.relationIndex === null ? undefined : config.relation.options[answers.relationIndex];

  function firstMissing(target: number): string | null {
    if (target === 0) {
      if (!answers.name.trim()) return "f-name";
      if (!answers.city.trim()) return "f-city";
      if (!relation) return "f-relation";
      if (relation.detail && !answers.relationDetail.trim()) return "f-relation-detail";
      if (config.knownDuration && !answers.knownDuration) return "f-duration";
      return null;
    }
    if (target <= categories.length) {
      const missing = instruments.find((i) => i.category === categories[target - 1] && answers.scores[i.code] === undefined);
      return missing ? `q-${missing.code}` : null;
    }
    const required = config.feedback.find((f) => f.required && !answers.feedback[f.field]?.trim());
    return required ? `fb-${required.field}` : null;
  }

  function flag(id: string) {
    setFlagged(id);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior(), block: "center" }));
    if (flagTimer.current) clearTimeout(flagTimer.current);
    flagTimer.current = setTimeout(() => setFlagged(null), 1600);
  }

  function goTo(target: number) {
    setStep(target);
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
  }

  function next() {
    const missing = firstMissing(step);
    if (missing) return flag(missing);
    goTo(Math.min(step + 1, lastStep));
  }

  function requestSubmit() {
    for (let s = 0; s <= lastStep; s++) {
      const missing = firstMissing(s);
      if (missing) {
        setModal({ kind: "message", emoji: "🥺", title: "Masih ada yang terlewat", text: "Yuk cek lagi — ada pertanyaan yang belum dijawab." });
        if (s !== step) goTo(s);
        setTimeout(() => flag(missing), 350);
        return;
      }
    }
    setModal({ kind: "confirm" });
  }

  async function send() {
    setModal(null);
    setSending(true);
    try {
      const res = await fetch("/api/responses", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kode,
          periode,
          name: answers.name,
          city: answers.city,
          relationIndex: answers.relationIndex,
          relationDetail: relation?.detail ? answers.relationDetail : undefined,
          knownDuration: config.knownDuration ? answers.knownDuration : undefined,
          scores: answers.scores,
          feedback: answers.feedback,
          turnstileToken: token,
        }),
      });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; receipt?: string; message?: string } | null;
      if (!res.ok || !data?.ok || !data.receipt) throw new Error(data?.message ?? "Terjadi gangguan jaringan. Coba kirim lagi.");
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      router.push(`/s/${kode}/${periode}/selesai?r=${encodeURIComponent(data.receipt)}`);
    } catch (err) {
      setModal({ kind: "message", emoji: "🥺", title: "Belum terkirim", text: err instanceof Error ? err.message : "Coba kirim lagi." });
      if (widgetId.current) window.turnstile?.reset(widgetId.current);
      setToken("");
      setSending(false);
    }
  }

  const fieldClass = (id: string) => `field${flagged === id ? " flagged" : ""}`;

  return (
    <main className="page">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setTurnstileReady(true)}
      />
      <BrandHeader title={config.title} subtitle={config.subtitle} />

      <div className="app-screen">
        <DeadlineBanner closesAt={closesAt} />
        <AwardeeCard {...awardee} />

        <div className="progress" aria-hidden="true">
          {Array.from({ length: lastStep + 1 }, (_, i) => (
            <span key={i} className={i <= step ? "done" : undefined} />
          ))}
        </div>
        <p className="sr-only" aria-live="polite">Langkah {step + 1} dari {lastStep + 1}</p>

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {step === 0 && (
            <section className="card fade-in">
              <h2 className="section-title">Profil Responden</h2>
              <p className="section-hint">Identitas Anda hanya dilihat pengelola program.</p>

              <div id="f-name" className={fieldClass("f-name")}>
                <label className="label" htmlFor="name">{config.identity.name} *</label>
                <input id="name" className="input" autoComplete="name" maxLength={120} value={answers.name} onChange={(e) => update({ name: e.target.value })} />
              </div>

              <div id="f-city" className={fieldClass("f-city")}>
                <label className="label" htmlFor="city">{config.identity.city} *</label>
                <input id="city" className="input" autoComplete="address-level2" maxLength={120} value={answers.city} onChange={(e) => update({ city: e.target.value })} />
              </div>

              <div id="f-relation" className={fieldClass("f-relation")}>
                <label className="label" htmlFor="relation">{config.relation.question} *</label>
                <select
                  id="relation"
                  className="select"
                  value={answers.relationIndex ?? ""}
                  onChange={(e) => update({ relationIndex: e.target.value === "" ? null : Number(e.target.value), relationDetail: "" })}
                >
                  <option value="">Pilih hubungan…</option>
                  {config.relation.options.map((option, index) => (
                    <option key={option.label} value={index}>{option.label}</option>
                  ))}
                </select>
              </div>

              {relation?.detail && (
                <div id="f-relation-detail" className={`${fieldClass("f-relation-detail")} fade-in`}>
                  <label className="label" htmlFor="relation-detail">Detail hubungan *</label>
                  <input
                    id="relation-detail"
                    className="input"
                    maxLength={200}
                    placeholder={relation.detail}
                    value={answers.relationDetail}
                    onChange={(e) => update({ relationDetail: e.target.value })}
                  />
                </div>
              )}

              {config.knownDuration && (
                <div id="f-duration" className={fieldClass("f-duration")}>
                  <label className="label" htmlFor="duration">{config.knownDuration.question} *</label>
                  <select id="duration" className="select" value={answers.knownDuration} onChange={(e) => update({ knownDuration: e.target.value })}>
                    <option value="">Pilih durasi…</option>
                    {config.knownDuration.options.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                </div>
              )}
            </section>
          )}

          {categories.map((category, index) =>
            step === index + 1 ? (
              <section key={category} className="card fade-in">
                <h2 className="section-title">{category}</h2>
                <p className="section-hint">Seberapa setuju Anda dengan pernyataan berikut tentang {awardee.name}?</p>
                {instruments
                  .filter((instrument) => instrument.category === category)
                  .map((instrument) => {
                    const selected = answers.scores[instrument.code];
                    return (
                      <div key={instrument.code} id={`q-${instrument.code}`} className={fieldClass(`q-${instrument.code}`)}>
                        <p className="statement" id={`label-${instrument.code}`}>{instrument.text}</p>
                        <fieldset className="likert" aria-labelledby={`label-${instrument.code}`}>
                          {config.scale.map((option) => (
                            <div key={option.value} className="likert-option">
                              <input
                                type="radio"
                                id={`${instrument.code}-${option.value}`}
                                name={instrument.code}
                                checked={selected === option.value}
                                onChange={() => update({ scores: { ...answers.scores, [instrument.code]: option.value } })}
                              />
                              <label htmlFor={`${instrument.code}-${option.value}`} title={option.label}>
                                <span aria-hidden="true">{option.emoji}</span>
                                <span className="sr-only">{option.label}</span>
                              </label>
                            </div>
                          ))}
                        </fieldset>
                        <p className="likert-caption" aria-hidden="true">
                          {config.scale.find((option) => option.value === selected)?.label ?? ""}
                        </p>
                      </div>
                    );
                  })}
              </section>
            ) : null,
          )}

          {step === lastStep && (
            <section className="card fade-in">
              <h2 className="section-title">Saran & Masukan</h2>
              <p className="section-hint">Tuliskan dengan jujur dan membangun.</p>
              {config.feedback.map((item) => (
                <div key={item.field} id={`fb-${item.field}`} className={fieldClass(`fb-${item.field}`)}>
                  <label className="label" htmlFor={item.field}>{item.label}{item.required ? " *" : ""}</label>
                  <p className="section-hint" style={{ marginBottom: "0.5rem" }}>{item.question}</p>
                  <textarea
                    id={item.field}
                    className="textarea"
                    maxLength={5000}
                    placeholder="Tuliskan di sini…"
                    value={answers.feedback[item.field] ?? ""}
                    onChange={(e) => update({ feedback: { ...answers.feedback, [item.field]: e.target.value } })}
                  />
                </div>
              ))}
              {siteKey ? (
                // Ruang widget dipesan sejak awal supaya tombol Kirim tidak bergeser saat widget muncul.
                <div ref={turnstileBox} style={{ display: "flex", justifyContent: "center", minHeight: 72, marginTop: "0.5rem" }} />
              ) : (
                <p className="section-hint" role="alert">Form belum bisa dikirim: verifikasi keamanan belum diatur pengelola.</p>
              )}
            </section>
          )}

          <div className="actions">
            {step > 0 && (
              <button type="button" className="btn btn-muted" onClick={() => goTo(step - 1)} aria-label="Kembali ke langkah sebelumnya">←</button>
            )}
            {step < lastStep ? (
              <button type="button" className="btn" onClick={next}>Lanjut</button>
            ) : (
              <button type="button" className="btn" onClick={requestSubmit} disabled={sending || !token}>
                {sending ? "Mengirim…" : token ? "Kirim" : "Menunggu verifikasi…"}
              </button>
            )}
          </div>
        </form>
      </div>

      {modal && (
        <div className="overlay" role="presentation">
          <div className="modal fade-in" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            {modal.kind === "confirm" ? (
              <>
                <div className="modal-emoji" aria-hidden="true">🤔</div>
                <h2 id="modal-title">Sudah yakin?</h2>
                <p>Pastikan jawaban Anda benar dan sejujur-jujurnya. Jawaban tidak bisa diubah setelah dikirim.</p>
                <div className="actions" style={{ marginTop: 0 }}>
                  <button type="button" className="btn btn-muted" style={{ flex: 1 }} onClick={() => setModal(null)}>Cek lagi</button>
                  <button type="button" className="btn" onClick={send}>Ya, kirim</button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-emoji" aria-hidden="true">{modal.emoji}</div>
                <h2 id="modal-title">{modal.title}</h2>
                <p>{modal.text}</p>
                <button type="button" className="btn" style={{ width: "100%" }} onClick={() => setModal(null)} autoFocus>Oke</button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
