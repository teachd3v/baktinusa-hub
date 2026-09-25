"use client";

import { useActionState, useState } from "react";
import type { ResponseRow } from "@/lib/data/admin-responses";
import { formatWib } from "@/lib/format";
import { deleteResponseAction, type ActionState } from "./actions";

// Menghapus respons tidak bisa dibatalkan, jadi tombolnya bertahap: "Hapus" dulu, baru konfirmasi.
function DeleteCell({ row }: { row: ResponseRow }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteResponseAction, null);
  const [confirming, setConfirming] = useState(false);

  if (state && !state.ok) return <span className="form-error">{state.message}</span>;
  if (!confirming) {
    return <button type="button" className="btn-link" onClick={() => setConfirming(true)}>Hapus</button>;
  }
  return (
    <form action={action} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
      <input type="hidden" name="responseId" value={row.id} />
      <button type="submit" className="btn-link" style={{ color: "var(--bad)" }} disabled={pending}>
        {pending ? "Menghapus…" : "Ya, hapus"}
      </button>
      <button type="button" className="btn-link" onClick={() => setConfirming(false)}>Batal</button>
    </form>
  );
}

export function ResponseTable({ rows }: { rows: ResponseRow[] }) {
  const [onlyDuplicates, setOnlyDuplicates] = useState(false);
  const shown = onlyDuplicates ? rows.filter((r) => r.duplicateOf !== null) : rows;
  const duplicates = rows.filter((r) => r.duplicateOf !== null).length;

  return (
    <>
      <p className="section-hint">
        {rows.length} respons terbaru · {duplicates} ditandai kembar{" "}
        {duplicates > 0 && (
          <button type="button" className="btn-link" onClick={() => setOnlyDuplicates(!onlyDuplicates)}>
            {onlyDuplicates ? "tampilkan semua" : "tampilkan yang kembar saja"}
          </button>
        )}
      </p>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Awardee</th>
              <th scope="col">Tipe</th>
              <th scope="col">Responden</th>
              <th scope="col">Waktu</th>
              <th scope="col" className="num">Skor</th>
              <th scope="col">Catatan</th>
              <th scope="col"><span className="sr-only">Aksi</span></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.awardee}<div className="section-hint" style={{ margin: 0 }}>{r.region}</div></td>
                <td>{r.type}</td>
                <td>
                  {r.respondentName ?? <span className="section-hint">berakun</span>}
                  {r.relation && <div className="section-hint" style={{ margin: 0 }}>{r.relation}</div>}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>{r.submittedAt ? formatWib(r.submittedAt) : "—"}</td>
                <td className="num">{r.scores}</td>
                <td>
                  {r.duplicateOf !== null ? (
                    <span className="pill pill-warn">kembar dengan #{r.duplicateOf}</span>
                  ) : (
                    <span className="section-hint">{r.source}</span>
                  )}
                </td>
                <td><DeleteCell row={r} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
