"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AwardeeCard } from "@/components/AwardeeCard";
import { BrandHeader } from "@/components/BrandHeader";
import { DeadlineBanner } from "@/components/DeadlineBanner";
import { Turnstile, type TurnstileHandle } from "@/components/Turnstile";
import type { FeedbackField, FeedbackItem, FormConfig, ScaleOption } from "@/lib/data/form-config";

// Satu form, dua varian:
// - "public": responden tanpa akun lewat tautan referal — ada langkah profil dan Turnstile;
// - "internal": asesmen mandiri, Peer, Manwil — pengisi dan hubungannya sudah diketahui dari akun.

type Common = {
  kode: string;
  periode: string;
  title: string;
  subtitle?: string;
  hint: string;
  closesAt: string | null;
  draftKey: string;
  awardee: { name: string; region: string; campus: string | null; referralCode: string };
  instruments: { code: string; text: string; category: string }[];
  scale: ScaleOption[];
  feedback: FeedbackItem[];
};

type Props =
  | (Common & {
      variant: "public";
      profile: Pick<FormConfig, "identity" | "relation" | "knownDuration">;
      siteKey: string;
      turnstileAction: string;
    })
  | (Common & { variant: "internal"; tipe: string; returnTo: string });

type Answers = {
  name: string;
  city: string;
  relationIndex: number | null;
  relationDetail: string;
  knownDuration: string;
  scores: Record<string, number>;
  feedback: Partial<Record<FeedbackField, string>>;
};

type Modal = { kind: "confirm" } | { kind: "message"; emoji: string; title: string; text: string };

const EMPTY: Answers = { name: "", city: "", relationIndex: null, relationDetail: "", knownDuration: "", scores: {}, feedback: {} };

const scrollBehavior = (): ScrollBehavior =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

export function SurveyForm(props: Props) {
  const { kode, periode, title, subtitle, hint, closesAt, draftKey, awardee, instruments, scale, feedback } = props;
  const isPublic = props.variant === "public";
  const profile = isPublic ? props.profile : null;

  const router = useRouter();
  const categories = useMemo(() => [...new Set(instruments.map((i) => i.category))], [instruments]);
  const offset = profile ? 1 : 0; // langkah 0 = profil, hanya untuk form publik
  const lastStep = categories.length + offset; // langkah terakhir = saran

  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>(EMPTY);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [flagged, setFlagged] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal | null>(null);
  const [sending, setSending] = useState(false);
  const [token, setToken] = useState("");
  const turnstile = useRef<TurnstileHandle>(null);
  const flagTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Draf jawaban disimpan di perangkat supaya puluhan jawaban tidak hilang saat berpindah aplikasi.
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

  const update = (patch: Partial<Answers>) => setAnswers((prev) => ({ ...prev, ...patch }));
  const relation = profile && answers.relationIndex !== null ? profile.relation.options[answers.relationIndex] : undefined;
  const canSubmit = !isPublic || token !== "";

  function firstMissing(target: number): string | null {
    if (profile && target === 0) {
      if (!answers.name.trim()) return "f-name";
      if (!answers.city.trim()) return "f-city";
      if (!relation) return "f-relation";
      if (relation.detail && !answers.relationDetail.trim()) return "f-relation-detail";
      if (profile.knownDuration && !answers.knownDuration) return "f-duration";
      return null;
    }
    if (target < lastStep) {
      const category = categories[target - offset];
      const missing = instruments.find((i) => i.category === category && answers.scores[i.code] === undefined);
      return missing ? `q-${missing.code}` : null;
    }
    const required = feedback.find((f) => f.required && !answers.feedback[f.field]?.trim());
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
      const res = isPublic
        ? await fetch("/api/responses", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              kode,
              periode,
              name: answers.name,
              city: answers.city,
              relationIndex: answers.relationIndex,
              relationDetail: relation?.detail ? answers.relationDetail : undefined,
              knownDuration: profile?.knownDuration ? answers.knownDuration : undefined,
              scores: answers.scores,
              feedback: answers.feedback,
              turnstileToken: token,
            }),
          })
        : await fetch("/api/evaluasi", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ periode, tipe: props.tipe, kode, scores: answers.scores, feedback: answers.feedback }),
          });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; receipt?: string; message?: string } | null;
      if (!res.ok || !data?.ok || !data.receipt) throw new Error(data?.message ?? "Terjadi gangguan jaringan. Coba kirim lagi.");
      try {
        localStorage.removeItem(draftKey);
      } catch {}
      const receipt = encodeURIComponent(data.receipt);
      router.push(isPublic ? `/s/${kode}/${periode}/selesai?r=${receipt}` : `${props.returnTo}?terkirim=${receipt}`);
    } catch (err) {
      setModal({ kind: "message", emoji: "🥺", title: "Belum terkirim", text: err instanceof Error ? err.message : "Coba kirim lagi." });
      turnstile.current?.reset();
      setSending(false);
    }
  }

  const fieldClass = (id: string) => `field${flagged === id ? " flagged" : ""}`;

  const body = (
    <>
      <DeadlineBanner closesAt={closesAt} />
      <AwardeeCard {...awardee} />

      <div className="progress" aria-hidden="true">
        {Array.from({ length: lastStep + 1 }, (_, i) => (
          <span key={i} className={i <= step ? "done" : undefined} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">Langkah {step + 1} dari {lastStep + 1}</p>

      <form onSubmit={(e) => e.preventDefault()} noValidate>
        {profile && step === 0 && (
          <section className="card fade-in">
            <h2 className="section-title">Profil Responden</h2>
            <p className="section-hint">Identitas Anda hanya dilihat pengelola program.</p>

            <div id="f-name" className={fieldClass("f-name")}>
              <label className="label" htmlFor="name">{profile.identity.name} *</label>
              <input id="name" className="input" autoComplete="name" maxLength={120} value={answers.name} onChange={(e) => update({ name: e.target.value })} />
            </div>

            <div id="f-city" className={fieldClass("f-city")}>
              <label className="label" htmlFor="city">{profile.identity.city} *</label>
              <input id="city" className="input" autoComplete="address-level2" maxLength={120} value={answers.city} onChange={(e) => update({ city: e.target.value })} />
            </div>

            <div id="f-relation" className={fieldClass("f-relation")}>
              <label className="label" htmlFor="relation">{profile.relation.question} *</label>
              <select
                id="relation"
                className="select"
                value={answers.relationIndex ?? ""}
                onChange={(e) => update({ relationIndex: e.target.value === "" ? null : Number(e.target.value), relationDetail: "" })}
              >
                <option value="">Pilih hubungan…</option>
                {profile.relation.options.map((option, index) => (
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

            {profile.knownDuration && (
              <div id="f-duration" className={fieldClass("f-duration")}>
                <label className="label" htmlFor="duration">{profile.knownDuration.question} *</label>
                <select id="duration" className="select" value={answers.knownDuration} onChange={(e) => update({ knownDuration: e.target.value })}>
                  <option value="">Pilih durasi…</option>
                  {profile.knownDuration.options.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}
          </section>
        )}

        {categories.map((category, index) =>
          step === index + offset ? (
            <section key={category} className="card fade-in">
              <h2 className="section-title">{category}</h2>
              <p className="section-hint">{hint}</p>
              {instruments
                .filter((instrument) => instrument.category === category)
                .map((instrument) => {
                  const selected = answers.scores[instrument.code];
                  return (
                    <div key={instrument.code} id={`q-${instrument.code}`} className={fieldClass(`q-${instrument.code}`)}>
                      <p className="statement" id={`label-${instrument.code}`}>{instrument.text}</p>
                      <fieldset className="likert" aria-labelledby={`label-${instrument.code}`}>
                        {scale.map((option) => (
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
                        {scale.find((option) => option.value === selected)?.label ?? ""}
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
            {feedback.map((item) => (
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
            {isPublic &&
              (props.siteKey ? (
                // Widget hanya hidup di langkah terakhir: dibuat ulang tiap masuk langkah ini, karena token sekali pakai.
                <Turnstile ref={turnstile} siteKey={props.siteKey} action={props.turnstileAction} onToken={setToken} />
              ) : (
                <p className="section-hint" role="alert">Form belum bisa dikirim: verifikasi keamanan belum diatur pengelola.</p>
              ))}
          </section>
        )}

        <div className="actions">
          {step > 0 && (
            <button type="button" className="btn btn-muted" onClick={() => goTo(step - 1)} aria-label="Kembali ke langkah sebelumnya">←</button>
          )}
          {step < lastStep ? (
            <button type="button" className="btn" onClick={next}>Lanjut</button>
          ) : (
            <button type="button" className="btn" onClick={requestSubmit} disabled={sending || !canSubmit}>
              {sending ? "Mengirim…" : canSubmit ? "Kirim" : "Menunggu verifikasi…"}
            </button>
          )}
        </div>
      </form>
    </>
  );

  const dialog = modal && (
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
  );

  if (isPublic) {
    return (
      <main className="page">
        <BrandHeader title={title} subtitle={subtitle} />
        <div className="app-screen">{body}</div>
        {dialog}
      </main>
    );
  }

  return (
    <div className="internal-form">
      <div className="page-head">
        <Link href={props.returnTo} className="back-link">← Kembali</Link>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {body}
      {dialog}
    </div>
  );
}
