"use client";

import { useRef, useState } from "react";
import { TEMPLATE_EXAMPLE, TEMPLATE_HEADERS, type RawRow, type RowPlan, type RowResult } from "@/lib/data/import-people";
import { applyImportAction, planImportAction } from "./actions";

// Berkas dibaca di browser, bukan di server: pustaka pembaca Excel cukup besar, dan tidak ada alasan
// membawanya ke Worker kalau hasil bacanya toh diperiksa ulang di sana.
//
// Alurnya: unduh template → pilih berkas → pratinjau (tidak ada yang ditulis) → terapkan per 20 baris.

type Stage =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "preview"; plans: RowPlan[]; fileName: string }
  | { kind: "applying"; plans: RowPlan[]; done: number }
  | { kind: "done"; results: RowResult[] };

const CHUNK = 20;
const SEP = ";";

const csvCell = (v: string) => (/["\n\r;]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Pemisah titik koma + BOM supaya Excel berbahasa Indonesia membacanya langsung benar.
function templateCsv(): string {
  const lines = [TEMPLATE_HEADERS.join(SEP), ...TEMPLATE_EXAMPLE.map((row) => TEMPLATE_HEADERS.map((h) => csvCell(row[h] ?? "")).join(SEP))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

// Pembaca CSV kecil: menghormati tanda kutip, dan menebak pemisahnya antara ; dan ,
function parseCsv(text: string): RawRow[] {
  const body = text.replace(/^﻿/, "");
  const firstLine = body.slice(0, body.indexOf("\n") === -1 ? body.length : body.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }

  const [header, ...rest] = rows;
  if (!header) return [];
  return rest.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? "").trim()])));
}

async function parseFile(file: File): Promise<RawRow[]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  // Pustaka Excel dimuat hanya saat benar-benar dipakai.
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: "", raw: false });
}

export function ImportPanel() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  async function unduhTemplate(format: "csv" | "xlsx") {
    if (format === "csv") {
      downloadBlob(new Blob([templateCsv()], { type: "text/csv;charset=utf-8" }), "template-pengguna.csv");
      return;
    }
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(TEMPLATE_EXAMPLE, { header: [...TEMPLATE_HEADERS] });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Pengguna");
    XLSX.writeFile(book, "template-pengguna.xlsx");
  }

  async function pilihBerkas(file: File) {
    setError("");
    setStage({ kind: "reading" });
    try {
      const rows = await parseFile(file);
      if (rows.length === 0) throw new Error("Berkas tidak berisi baris data.");
      const plans = await planImportAction(rows);
      setStage({ kind: "preview", plans, fileName: file.name });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Berkas tidak bisa dibaca.");
      setStage({ kind: "idle" });
    }
  }

  async function terapkan(plans: RowPlan[]) {
    const siap = plans.filter((p) => p.action !== "tolak");
    const ditolak: RowResult[] = plans.filter((p) => p.action === "tolak").map((p) => ({ line: p.line, ok: false, message: p.reason }));
    const hasil: RowResult[] = [];
    setStage({ kind: "applying", plans: siap, done: 0 });

    try {
      for (let i = 0; i < siap.length; i += CHUNK) {
        const bagian = await applyImportAction(siap.slice(i, i + CHUNK));
        hasil.push(...bagian);
        setStage({ kind: "applying", plans: siap, done: Math.min(i + CHUNK, siap.length) });
      }
      setStage({ kind: "done", results: [...hasil, ...ditolak].sort((a, b) => a.line - b.line) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impor terhenti di tengah jalan.");
      setStage({ kind: "done", results: [...hasil, ...ditolak].sort((a, b) => a.line - b.line) });
    }
  }

  function unduhGagal(results: RowResult[]) {
    const gagal = results.filter((r) => !r.ok);
    const lines = ["Baris;Keterangan", ...gagal.map((r) => `${r.line}${SEP}${csvCell(r.message)}`)];
    downloadBlob(new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }), "impor-gagal.csv");
  }

  const hitung = (plans: RowPlan[], action: RowPlan["action"]) => plans.filter((p) => p.action === action).length;

  return (
    <>
      <p className="section-hint">
        Unduh template, isi di Excel, lalu unggah kembali. Berkasnya diperiksa dulu dan ditampilkan di sini —
        tidak ada yang tersimpan sampai Anda menekan tombol terapkan.
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <button type="button" className="btn btn-small btn-inline btn-muted" onClick={() => unduhTemplate("csv")}>Template CSV</button>
        <button type="button" className="btn btn-small btn-inline btn-muted" onClick={() => unduhTemplate("xlsx")}>Template Excel</button>
        <input
          ref={fileInput}
          type="file"
          accept=".csv,.xlsx,.xls"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void pilihBerkas(file);
          }}
        />
        <button type="button" className="btn btn-small btn-inline" onClick={() => fileInput.current?.click()} disabled={stage.kind === "reading" || stage.kind === "applying"}>
          {stage.kind === "reading" ? "Membaca…" : "Pilih berkas"}
        </button>
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}

      {stage.kind === "preview" && (
        <div style={{ marginTop: "1rem" }}>
          <p className="label">Pratinjau {stage.fileName}</p>
          <p className="section-hint">
            {hitung(stage.plans, "buat")} akan dibuat · {hitung(stage.plans, "perbarui")} akan diperbarui ·{" "}
            {hitung(stage.plans, "tolak")} ditolak
          </p>

          <div className="table-wrap" style={{ maxHeight: "22rem", overflowY: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" className="num">Baris</th>
                  <th scope="col">Nama</th>
                  <th scope="col">ID</th>
                  <th scope="col">Tindakan</th>
                  <th scope="col">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {stage.plans.map((p) => (
                  <tr key={p.line}>
                    <td className="num">{p.line}</td>
                    <td>{p.name || "—"}</td>
                    <td><code style={{ fontSize: "0.78rem" }}>{p.loginId || "—"}</code></td>
                    <td>
                      <span className={`pill ${p.action === "buat" ? "pill-ok" : p.action === "perbarui" ? "pill-info" : "pill-bad"}`}>
                        {p.action}
                      </span>
                    </td>
                    <td className="section-hint" style={{ margin: 0 }}>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-small btn-inline"
              onClick={() => void terapkan(stage.plans)}
              disabled={hitung(stage.plans, "buat") + hitung(stage.plans, "perbarui") === 0}
            >
              Terapkan {hitung(stage.plans, "buat") + hitung(stage.plans, "perbarui")} baris
            </button>
            <button type="button" className="btn btn-small btn-inline btn-muted" onClick={() => setStage({ kind: "idle" })}>Batal</button>
          </div>
        </div>
      )}

      {stage.kind === "applying" && (
        <div style={{ marginTop: "1rem" }}>
          <p className="label">Menulis {stage.done} dari {stage.plans.length} baris…</p>
          <span className="bar" aria-hidden="true">
            <span className="bar-fill bar-accent" style={{ width: `${(stage.done / Math.max(stage.plans.length, 1)) * 100}%` }} />
          </span>
        </div>
      )}

      {stage.kind === "done" && (
        <div style={{ marginTop: "1rem" }}>
          <p className="label">
            Selesai: {stage.results.filter((r) => r.ok).length} berhasil, {stage.results.filter((r) => !r.ok).length} gagal
          </p>
          {stage.results.some((r) => !r.ok) && (
            <>
              <div className="table-wrap" style={{ maxHeight: "16rem", overflowY: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col" className="num">Baris</th>
                      <th scope="col">Kenapa gagal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage.results.filter((r) => !r.ok).map((r) => (
                      <tr key={r.line}>
                        <td className="num">{r.line}</td>
                        <td>{r.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn-link" style={{ marginTop: "0.5rem" }} onClick={() => unduhGagal(stage.results)}>
                Unduh daftar baris yang gagal
              </button>
            </>
          )}
          <div style={{ marginTop: "0.75rem" }}>
            <button type="button" className="btn btn-small btn-inline btn-muted" onClick={() => setStage({ kind: "idle" })}>Impor berkas lain</button>
          </div>
        </div>
      )}
    </>
  );
}
