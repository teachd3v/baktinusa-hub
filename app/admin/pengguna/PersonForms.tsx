"use client";

import { useActionState, useState } from "react";
import type { Person } from "@/lib/data/people";
import {
  createPersonAction,
  deleteAccountAction,
  deleteAwardeeDataAction,
  updateAwardeeDataAction,
  updatePersonAction,
  type PersonState,
} from "./actions";

type Region = { id: number; name: string };
type FreeAwardee = { id: number; name: string; region: string };

function Result({ state }: { state: PersonState }) {
  if (!state) return null;
  return (
    <p className={state.ok ? "section-hint" : "form-error"} role="status" style={{ margin: "0.5rem 0 0" }}>
      {state.ok ? "✓ " : ""}
      {state.message}
    </p>
  );
}

// Satu set isian untuk membuat maupun mengubah. Yang muncul mengikuti peran: Admin tidak punya wilayah,
// Manwil punya wilayah, Awardee punya wilayah plus angkatan, kampus, dan kode referal.
function Fields({
  regions,
  freeAwardees,
  person,
  role,
  setRole,
}: {
  regions: Region[];
  freeAwardees?: FreeAwardee[];
  person?: Person;
  role: string;
  setRole?: (value: string) => void;
}) {
  const editing = Boolean(person);
  const [link, setLink] = useState("");
  const [name, setName] = useState(person?.name ?? "");

  return (
    <>
      <div className="form-row">
        <div className="field">
          <label className="label">Peran</label>
          <select
            className="select"
            name="role"
            value={role}
            disabled={editing}
            onChange={(e) => setRole?.(e.target.value)}
          >
            <option value="awardee">Awardee</option>
            <option value="manwil">Manajer Wilayah</option>
            <option value="admin">Admin</option>
          </select>
          {editing && <input type="hidden" name="role" value={role} />}
        </div>

        <div className="field">
          <label className="label">ID masuk</label>
          <input
            className="input"
            name="loginId"
            maxLength={20}
            autoComplete="off"
            defaultValue={person?.loginId ?? ""}
            placeholder={role === "admin" ? "ADM002" : role === "manwil" ? "MW00226" : "BA00226"}
            onChange={(e) => (e.target.value = e.target.value.toUpperCase())}
          />
        </div>
      </div>

      {!editing && role === "awardee" && freeAwardees && freeAwardees.length > 0 && (
        <div className="field">
          <label className="label">Data awardee</label>
          <select
            className="select"
            name="awardeeId"
            value={link}
            onChange={(e) => {
              setLink(e.target.value);
              const picked = freeAwardees.find((a) => String(a.id) === e.target.value);
              if (picked) setName(picked.name);
            }}
          >
            <option value="">Buat data awardee baru</option>
            {freeAwardees.map((a) => (
              <option key={a.id} value={a.id}>{a.name} — {a.region}</option>
            ))}
          </select>
          <p className="section-hint" style={{ margin: "0.3rem 0 0" }}>
            {link ? "Memakai data awardee yang sudah ada — wilayah dan kode referalnya dipertahankan." : "Data awardee baru akan dibuat sekalian."}
          </p>
        </div>
      )}

      <div className="form-row">
        <div className="field">
          <label className="label">Nama</label>
          <input className="input" name="name" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label className="label">Email</label>
          <input className="input" name="email" type="email" maxLength={200} autoComplete="off" defaultValue={person?.email ?? ""} />
        </div>
      </div>

      <div className="form-row">
        {role !== "admin" && (
          <div className="field">
            <label className="label">Wilayah</label>
            <select className="select" name="regionId" defaultValue={String(person?.regionId ?? "")} disabled={!editing && role === "awardee" && link !== ""}>
              <option value="">Pilih wilayah…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label className="label">Status</label>
          <select className="select" name="status" defaultValue={person?.status ?? "active"}>
            <option value="active">Aktif</option>
            <option value="disabled">Nonaktif</option>
          </select>
        </div>
      </div>

      {role === "awardee" && (!link || editing) && (
        <div className="form-row">
          <div className="field">
            <label className="label">Angkatan</label>
            <input className="input" name="batch" maxLength={20} defaultValue={person?.batch ?? "BA16"} />
          </div>
          <div className="field">
            <label className="label">Kode referal</label>
            <input className="input" name="referralCode" maxLength={12} autoComplete="off" defaultValue={person?.referralCode ?? ""} />
          </div>
          <div className="field">
            <label className="label">Kampus</label>
            <input className="input" name="campus" maxLength={160} defaultValue={person?.campus ?? ""} />
          </div>
        </div>
      )}

      <div className="field">
        <label className="label">{editing ? "Kata sandi baru" : "Kata sandi"}</label>
        <input
          className="input"
          name="password"
          type="text"
          maxLength={200}
          autoComplete="off"
          placeholder={editing ? "Kosongkan bila tidak diganti" : "Minimal 6 karakter"}
        />
      </div>
    </>
  );
}

export function NewPersonForm({ regions, freeAwardees }: { regions: Region[]; freeAwardees: FreeAwardee[] }) {
  const [state, action, pending] = useActionState<PersonState, FormData>(createPersonAction, null);
  const [role, setRole] = useState("awardee");

  return (
    <form action={action}>
      <Fields regions={regions} freeAwardees={freeAwardees} role={role} setRole={setRole} />
      <p className="section-hint">
        Kata sandi tampil apa adanya di sini supaya bisa disalin sekali — setelah tersimpan, yang tersisa hanya turunannya
        dan tidak ada yang bisa membacanya lagi.
      </p>
      <button type="submit" className="btn btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Tambah"}</button>
      <Result state={state} />
    </form>
  );
}

export function PersonRow({ person, regions }: { person: Person; regions: Region[] }) {
  const [state, action, pending] = useActionState<PersonState, FormData>(updatePersonAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<PersonState, FormData>(deleteAccountAction, null);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const ROLE_LABEL: Record<string, string> = { admin: "Admin", manwil: "Manwil", awardee: "Awardee" };

  return (
    <>
      <tr>
        <td>
          <b>{person.name}</b>
          {person.email && <div className="section-hint" style={{ margin: 0 }}>{person.email}</div>}
        </td>
        <td>{person.loginId ? <code style={{ fontSize: "0.78rem" }}>{person.loginId}</code> : <span className="pill pill-muted">tanpa akun</span>}</td>
        <td>{person.role ? ROLE_LABEL[person.role] : <span className="section-hint">data awardee</span>}</td>
        <td>{person.region ?? "—"}</td>
        <td>
          {person.referralCode ? (
            <>
              <code style={{ fontSize: "0.78rem" }}>{person.referralCode}</code>
              <div className="section-hint" style={{ margin: 0 }}>{person.batch} · {person.responses} penilaian</div>
            </>
          ) : (
            "—"
          )}
        </td>
        <td>
          {person.status === "active" ? (
            <span className="pill pill-ok">aktif</span>
          ) : person.status === "disabled" ? (
            <span className="pill pill-bad">nonaktif</span>
          ) : (
            <span className="pill pill-warn">belum ada akun</span>
          )}
        </td>
        <td>
          <button type="button" className="btn-link" onClick={() => setOpen(!open)}>{open ? "Tutup" : "Ubah"}</button>
        </td>
      </tr>

      {open && !person.userId && person.awardeeId && (
        <tr>
          <td colSpan={7} style={{ background: "var(--surface-sunken)" }}>
            <AwardeeDataForm person={person} regions={regions} />
          </td>
        </tr>
      )}

      {open && person.userId && person.role && (
        <tr>
          <td colSpan={7} style={{ background: "var(--surface-sunken)" }}>
            <form action={action}>
              <input type="hidden" name="userId" value={person.userId} />
              <Fields regions={regions} person={person} role={person.role} />
              <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
              <Result state={state} />
            </form>

            <form action={hapusAction} style={{ marginTop: "0.75rem" }}>
              <input type="hidden" name="userId" value={person.userId} />
              {confirming ? (
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                  <button type="submit" className="btn-link" style={{ color: "var(--bad)" }} disabled={menghapus}>
                    {menghapus ? "Menghapus…" : "Ya, hapus akunnya"}
                  </button>
                  <button type="button" className="btn-link" onClick={() => setConfirming(false)}>Batal</button>
                </div>
              ) : (
                <button type="button" className="btn-link" onClick={() => setConfirming(true)}>Hapus akun</button>
              )}
              <Result state={hapus} />
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

// Baris awardee yang belum punya akun: data masternya tetap bisa dirapikan dari sini.
function AwardeeDataForm({ person, regions }: { person: Person; regions: Region[] }) {
  const [state, action, pending] = useActionState<PersonState, FormData>(updateAwardeeDataAction, null);
  const [hapus, hapusAction, menghapus] = useActionState<PersonState, FormData>(deleteAwardeeDataAction, null);
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <form action={action}>
        <input type="hidden" name="awardeeId" value={person.awardeeId ?? ""} />
        <div className="form-row">
          <div className="field">
            <label className="label">Nama</label>
            <input className="input" name="name" maxLength={120} defaultValue={person.name} />
          </div>
          <div className="field">
            <label className="label">Wilayah</label>
            <select className="select" name="regionId" defaultValue={String(person.regionId ?? "")}>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="field">
            <label className="label">Angkatan</label>
            <input className="input" name="batch" maxLength={20} defaultValue={person.batch ?? ""} />
          </div>
          <div className="field">
            <label className="label">Kode referal</label>
            <input className="input" name="referralCode" maxLength={12} defaultValue={person.referralCode ?? ""} />
          </div>
          <div className="field">
            <label className="label">Kampus</label>
            <input className="input" name="campus" maxLength={160} defaultValue={person.campus ?? ""} />
          </div>
        </div>
        <button type="submit" className="btn btn-small btn-inline" disabled={pending}>{pending ? "Menyimpan…" : "Simpan"}</button>
        <Result state={state} />
      </form>

      <p className="section-hint" style={{ margin: "0.75rem 0 0" }}>
        Orang ini belum punya akun. Buat akunnya lewat form <b>Tambah orang</b> di atas, lalu pilih namanya di daftar
        &quot;Data awardee&quot;.
      </p>

      {person.responses === 0 && (
        <form action={hapusAction} style={{ marginTop: "0.5rem" }}>
          <input type="hidden" name="awardeeId" value={person.awardeeId ?? ""} />
          {confirming ? (
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <button type="submit" className="btn-link" style={{ color: "var(--bad)" }} disabled={menghapus}>
                {menghapus ? "Menghapus…" : "Ya, hapus datanya"}
              </button>
              <button type="button" className="btn-link" onClick={() => setConfirming(false)}>Batal</button>
            </div>
          ) : (
            <button type="button" className="btn-link" onClick={() => setConfirming(true)}>Hapus data awardee</button>
          )}
          <Result state={hapus} />
        </form>
      )}
    </>
  );
}
