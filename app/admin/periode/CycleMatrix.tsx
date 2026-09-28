"use client";

import { useActionState } from "react";
import type { CycleMatrix as Matrix, MatrixCell } from "@/lib/data/admin-periods";
import { FILLED_BY_LABEL } from "@/lib/data/measurements";
import { CYCLES, CYCLE_LABEL } from "@/lib/data/periods";
import { toggleMatrixCellAction, type ActionState } from "./actions";

// Peta jenis × siklus. Baris = jenis pengukuran, kolom = Awal/Tengah/Akhir. Sekali lihat langsung
// terbaca "Siklus Tengah jalan SA, PA, MA, PU, LA" — yang tidak terjawab oleh daftar siklus biasa.
//
// Selnya bukan sekadar tampilan: mencentang memasang jenis itu ke siklus tersebut.
export function CycleMatrix({ matrix }: { matrix: Matrix }) {
  const ada = new Set(matrix.periods.map((p) => p.cycle));

  return (
    <div className="table-wrap">
      <table className="table matrix">
        <thead>
          <tr>
            <th scope="col">Jenis pengukuran</th>
            {CYCLES.map((c) => (
              <th key={c} scope="col" className="num">
                {CYCLE_LABEL[c].replace("Siklus ", "")}
                {!ada.has(c) && <div className="section-hint" style={{ margin: 0, fontWeight: 400 }}>belum dibuat</div>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => (
            <tr key={row.measurementId}>
              <td>
                <code style={{ fontSize: "0.78rem" }}>{row.code}</code> {row.name}
                <div className="section-hint" style={{ margin: 0 }}>
                  {FILLED_BY_LABEL[row.filledBy]} · {row.instruments} soal
                </div>
              </td>
              {row.cells.map((cell) => (
                <td key={cell.cycle} className="num">
                  <Cell measurementId={row.measurementId} cell={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ measurementId, cell }: { measurementId: number; cell: MatrixCell }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(toggleMatrixCellAction, null);

  // Siklusnya belum ada, jadi tidak ada yang bisa dipasangi.
  if (cell.periodId === null) return <span className="section-hint">—</span>;

  // Jenis yang sudah punya jawaban di siklus itu tidak boleh dilepas: jawabannya akan menggantung.
  const terkunci = cell.on && cell.responses > 0;

  return (
    <form action={action} style={{ display: "inline" }}>
      <input type="hidden" name="periodId" value={cell.periodId} />
      <input type="hidden" name="measurementId" value={measurementId} />
      <input type="hidden" name="on" value={cell.on ? "0" : "1"} />
      <button
        type="submit"
        className={`matrix-cell${cell.on ? " is-on" : ""}`}
        disabled={pending || terkunci}
        title={
          terkunci
            ? `Sudah punya ${cell.responses} jawaban, jadi tidak bisa dilepas.`
            : cell.on
              ? "Klik untuk melepas dari siklus ini"
              : "Klik untuk memasang ke siklus ini"
        }
        aria-pressed={cell.on}
      >
        <span aria-hidden="true">{cell.on ? "✓" : "+"}</span>
        <span className="sr-only">{cell.on ? "Dipasang" : "Belum dipasang"}</span>
      </button>
      {state && !state.ok && <div className="form-error" style={{ fontSize: "0.72rem" }}>{state.message}</div>}
    </form>
  );
}
