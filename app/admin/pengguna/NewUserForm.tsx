"use client";

import { useActionState, useState } from "react";
import { createUserAction, type CreateUserState } from "./actions";

type Props = {
  regions: { id: number; name: string }[];
  awardees: { id: number; name: string; region: string }[];
};

export function NewUserForm({ regions, awardees }: Props) {
  const [state, action, pending] = useActionState<CreateUserState, FormData>(createUserAction, null);
  const [role, setRole] = useState("awardee");
  const [name, setName] = useState("");

  return (
    <form action={action}>
      <div className="form-row">
        <div className="field">
          <label className="label" htmlFor="role">Peran</label>
          <select id="role" name="role" className="select" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="awardee">Awardee</option>
            <option value="manwil">Manajer Wilayah</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        {role === "awardee" && (
          <div className="field">
            <label className="label" htmlFor="awardeeId">Data awardee</label>
            <select
              id="awardeeId"
              name="awardeeId"
              className="select"
              defaultValue=""
              onChange={(e) => {
                const picked = awardees.find((a) => a.id === Number(e.target.value));
                if (picked) setName(picked.name);
              }}
            >
              <option value="" disabled>{awardees.length ? "Pilih awardee…" : "Semua awardee sudah punya akun"}</option>
              {awardees.map((a) => (
                <option key={a.id} value={a.id}>{a.name} — {a.region}</option>
              ))}
            </select>
          </div>
        )}

        {role === "manwil" && (
          <div className="field">
            <label className="label" htmlFor="regionId">Wilayah</label>
            <select id="regionId" name="regionId" className="select" defaultValue="">
              <option value="" disabled>Pilih wilayah…</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="name">Nama</label>
          <input id="name" name="name" className="input" maxLength={120} value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <div className="field">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" maxLength={200} autoComplete="off" />
        </div>
      </div>

      {state && (
        <p className={state.ok ? "section-hint" : "form-error"} role={state.ok ? "status" : "alert"} style={state.ok ? { color: "#166534" } : undefined}>
          {state.message}
        </p>
      )}
      <div className="actions" style={{ marginTop: "0.5rem" }}>
        <button type="submit" className="btn" style={{ flex: "none", padding: "0.7rem 1.4rem" }} disabled={pending}>
          {pending ? "Menyimpan…" : "Tambah akun"}
        </button>
      </div>
    </form>
  );
}
