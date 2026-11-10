"use client";

import { startTransition, useActionState } from "react";
import type { Semester } from "@/lib/data/profiles";
import type { ProfileState } from "./ProfileForm";

// IPK kuliah per semester. Menyimpan semester yang sudah ada berarti menimpanya, jadi satu form cukup untuk tambah dan koreksi.
export function SemesterCard({
  semesters,
  saveAction,
  deleteAction,
  awardeeId,
}: {
  semesters: Semester[];
  saveAction: (previous: ProfileState, form: FormData) => Promise<ProfileState>;
  deleteAction: (form: FormData) => Promise<void>;
  awardeeId?: number;
}) {
  const [state, action, pending] = useActionState(saveAction, null);
  const hidden = awardeeId !== undefined ? <input type="hidden" name="awardeeId" value={awardeeId} /> : null;
  const next = semesters.length > 0 ? Math.min(20, semesters[semesters.length - 1].semester + 1) : 1;

  return (
    <section className="card">
      <h2 className="section-title">IPK kuliah per semester</h2>
      <p className="section-hint">Isi setiap semester setelah nilai keluar. Ini IPK kampus Anda, bukan indeks hasil pengukuran.</p>

      {semesters.length > 0 && (
        <div className="table-wrap" style={{ marginBottom: "1rem" }}>
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Semester</th>
                <th scope="col">Tahun ajaran</th>
                <th scope="col" className="num">IPK</th>
                <th scope="col"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {semesters.map((s) => (
                <tr key={s.semester}>
                  <td>{s.semester}</td>
                  <td>{s.academicYear}</td>
                  <td className="num">{s.gpa.toFixed(2)}</td>
                  <td>
                    <form action={deleteAction}>
                      {hidden}
                      <input type="hidden" name="semester" value={s.semester} />
                      <button type="submit" className="btn btn-small btn-ghost" aria-label={`Hapus semester ${s.semester}`}>Hapus</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <form
        key={semesters.length}
        onSubmit={(event) => {
          // Bukan prop action: isian yang gagal validasi tidak boleh dikosongkan React.
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          startTransition(() => action(data));
        }}
      >
        {hidden}
        <div className="form-row">
          <div className="field">
            <label className="label" htmlFor="sem-semester">Semester</label>
            <input id="sem-semester" className="input" name="semester" type="number" min={1} max={20} defaultValue={next} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="sem-year">Tahun ajaran</label>
            <input id="sem-year" className="input" name="academicYear" placeholder="2025/2026" maxLength={9} required />
          </div>
          <div className="field">
            <label className="label" htmlFor="sem-gpa">IPK</label>
            <input id="sem-gpa" className="input" name="gpa" inputMode="decimal" placeholder="3.75" maxLength={4} required />
          </div>
        </div>
        <button type="submit" className="btn" disabled={pending}>{pending ? "Menyimpan…" : "Simpan semester"}</button>
        {state && (
          <p className={state.ok ? "section-hint" : "form-error"} role={state.ok ? "status" : "alert"} style={{ margin: "0.75rem 0 0" }}>
            {state.ok ? "✓ " : ""}
            {state.message}
          </p>
        )}
      </form>
    </section>
  );
}
