"use client";

import { useId, useRef, useState } from "react";
import type { MeasurementRow } from "@/lib/data/measurements";
import {
  generateInstrumentTemplateCsv,
  getTemplateExamples,
  INSTRUMENT_TEMPLATE_HEADERS,
  type InstrumentRowPlan,
  type InstrumentRowResult,
  type RawInstrumentRow,
} from "@/lib/data/import-instruments";
import { applyInstrumentImportAction, planInstrumentImportAction } from "./actions";

type Stage =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "preview"; plans: InstrumentRowPlan[]; fileName: string; targetMeasurement: MeasurementRow }
  | { kind: "applying"; plans: InstrumentRowPlan[]; done: number; targetMeasurement: MeasurementRow }
  | { kind: "done"; results: InstrumentRowResult[]; targetMeasurement: MeasurementRow };

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

function parseCsv(text: string): RawInstrumentRow[] {
  const body = text.replace(/^\uFEFF/, "");
  const firstLine = body.slice(0, body.indexOf("\n") === -1 ? body.length : body.indexOf("\n"));
  const sep = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: string[][] = [];
  let cell = "";
  let row: string[] = [];
  let quoted = false;

  for (let i = 0; i < body.length; i++) {
    const c = body[i]!;
    if (quoted) {
      if (c === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        quoted = false;
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (c !== "\r") {
      cell += c;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [header, ...rest] = rows;
  if (!header) return [];
  return rest.map((cells) => Object.fromEntries(header.map((h, i) => [h.trim(), (cells[i] ?? "").trim()])));
}

async function parseFile(file: File): Promise<RawInstrumentRow[]> {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const sheet = book.Sheets[book.SheetNames[0]!]!;
  return XLSX.utils.sheet_to_json<RawInstrumentRow>(sheet, { defval: "", raw: false });
}

export function InstrumentImportPanel({
  measurements,
  activeSlug,
}: {
  measurements: MeasurementRow[];
  activeSlug?: string;
}) {
  const selectId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  // Inisialisasi jenis pengukuran yang dipilih
  const initial =
    (activeSlug ? measurements.find((m) => m.slug === activeSlug) : null) ?? measurements[0] ?? null;

  const [selectedId, setSelectedId] = useState<number>(initial?.id ?? 0);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState("");

  const currentMeasurement = measurements.find((m) => m.id === selectedId) ?? measurements[0] ?? null;

  if (!currentMeasurement) {
    return (
      <p className="section-hint" style={{ margin: 0 }}>
        Belum ada jenis pengukuran. Buat pengukuran terlebih dahulu sebelum mengimpor soal.
      </p>
    );
  }

  const isLocked = currentMeasurement.responses > 0;

  async function unduhTemplate(format: "csv" | "xlsx") {
    if (!currentMeasurement) return;
    const fileBase = `template-soal-${currentMeasurement.code.toLowerCase()}-${currentMeasurement.slug}`;

    if (format === "csv") {
      const csv = generateInstrumentTemplateCsv(currentMeasurement);
      downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `${fileBase}.csv`);
      return;
    }

    const XLSX = await import("xlsx");
    const examples = getTemplateExamples(currentMeasurement.filledBy);
    const sheet = XLSX.utils.json_to_sheet(examples, { header: [...INSTRUMENT_TEMPLATE_HEADERS] });
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, currentMeasurement.code);
    XLSX.writeFile(book, `${fileBase}.xlsx`);
  }

  async function pilihBerkas(file: File) {
    setError("");
    setStage({ kind: "reading" });
    try {
      const rows = await parseFile(file);
      if (rows.length === 0) throw new Error("Berkas tidak berisi baris data soal.");
      const plans = await planInstrumentImportAction(currentMeasurement.id, rows);
      setStage({ kind: "preview", plans, fileName: file.name, targetMeasurement: currentMeasurement });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Berkas tidak bisa dibaca.");
      setStage({ kind: "idle" });
    }
  }

  async function terapkan(plans: InstrumentRowPlan[]) {
    if (stage.kind !== "preview") return;
    const target = stage.targetMeasurement;
    const siap = plans.filter((p) => p.action !== "tolak");
    const ditolak: InstrumentRowResult[] = plans
      .filter((p) => p.action === "tolak")
      .map((p) => ({ line: p.line, ok: false, message: p.reason, code: p.code }));
    const hasil: InstrumentRowResult[] = [];
    setStage({ kind: "applying", plans: siap, done: 0, targetMeasurement: target });

    try {
      for (let i = 0; i < siap.length; i += CHUNK) {
        const bagian = await applyInstrumentImportAction(target.id, siap.slice(i, i + CHUNK));
        hasil.push(...bagian);
        setStage({ kind: "applying", plans: siap, done: Math.min(i + CHUNK, siap.length), targetMeasurement: target });
      }
      setStage({
        kind: "done",
        results: [...hasil, ...ditolak].sort((a, b) => a.line - b.line),
        targetMeasurement: target,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impor terhenti di tengah jalan.");
      setStage({
        kind: "done",
        results: [...hasil, ...ditolak].sort((a, b) => a.line - b.line),
        targetMeasurement: target,
      });
    }
  }

  function unduhGagal(results: InstrumentRowResult[]) {
    const gagal = results.filter((r) => !r.ok);
    const lines = ["Baris;Kode;Keterangan", ...gagal.map((r) => `${r.line}${SEP}${csvCell(r.code)}${SEP}${csvCell(r.message)}`)];
    downloadBlob(new Blob([`\uFEFF${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }), "impor-soal-gagal.csv");
  }

  const hitung = (plans: InstrumentRowPlan[], action: InstrumentRowPlan["action"]) =>
    plans.filter((p) => p.action === action).length;

  return (
    <>
      <p className="section-hint">
        Unduh template kuesioner yang disesuaikan dengan jenis pengukuran tujuan, isi butir soal di Excel/CSV, lalu
        unggah kembali. Berkas akan divalidasi dan diperiksa pratinjaunya terlebih dahulu sebelum disimpan ke sistem.
      </p>

      {/* Pemilihan Jenis Pengukuran Tujuan */}
      <div style={{ marginBottom: "1rem" }}>
        <div className="field" style={{ maxWidth: "28rem" }}>
          <label className="label" htmlFor={selectId}>
            Target jenis pengukuran
          </label>
          <select
            id={selectId}
            className="select"
            value={currentMeasurement.id}
            disabled={stage.kind === "reading" || stage.kind === "applying"}
            onChange={(e) => {
              setSelectedId(Number(e.target.value));
              if (stage.kind !== "idle") setStage({ kind: "idle" });
              setError("");
            }}
          >
            {measurements.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.name} ({m.instruments} soal{m.responses > 0 ? `, ${m.responses} jawaban` : ""})
              </option>
            ))}
          </select>
        </div>

        {isLocked && (
          <p className="form-error" style={{ margin: "0.5rem 0 0" }}>
            <b>Pengukuran terkunci</b>: Jenis ini sudah memiliki {currentMeasurement.responses} jawaban responden.
            Penambahan soal baru dilarang, hanya perbaikan kalimat pernyataan untuk soal yang sudah ada yang diizinkan.
          </p>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <button
          type="button"
          className="btn btn-small btn-inline btn-muted"
          onClick={() => void unduhTemplate("csv")}
          disabled={stage.kind === "reading" || stage.kind === "applying"}
        >
          Unduh template CSV ({currentMeasurement.code})
        </button>
        <button
          type="button"
          className="btn btn-small btn-inline btn-muted"
          onClick={() => void unduhTemplate("xlsx")}
          disabled={stage.kind === "reading" || stage.kind === "applying"}
        >
          Unduh template Excel ({currentMeasurement.code})
        </button>
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
        <button
          type="button"
          className="btn btn-muted btn-small btn-inline"
          onClick={() => fileInput.current?.click()}
          disabled={stage.kind === "reading" || stage.kind === "applying"}
        >
          {stage.kind === "reading" ? "Membaca berkas…" : `Pilih berkas untuk ${currentMeasurement.code}`}
        </button>
      </div>

      {error && (
        <p className="form-error" role="alert" style={{ marginTop: "0.75rem" }}>
          {error}
        </p>
      )}

      {/* Pratinjau (Preview Stage) */}
      {stage.kind === "preview" && (
        <div style={{ marginTop: "1.25rem" }}>
          <p className="label">
            Pratinjau {stage.fileName} untuk <b>{stage.targetMeasurement.code} · {stage.targetMeasurement.name}</b>
          </p>
          <p className="section-hint">
            {hitung(stage.plans, "buat")} akan dibuat, {hitung(stage.plans, "perbarui")} akan diperbarui,{" "}
            {hitung(stage.plans, "tolak")} ditolak
          </p>

          <div className="table-wrap" style={{ maxHeight: "24rem", overflowY: "auto" }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col" className="num">
                    Baris
                  </th>
                  <th scope="col">Kode</th>
                  <th scope="col">Pernyataan</th>
                  <th scope="col" className="num">
                    Skala
                  </th>
                  <th scope="col">Tindakan</th>
                  <th scope="col">Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {stage.plans.map((p) => (
                  <tr key={p.line}>
                    <td className="num">{p.line}</td>
                    <td>
                      <code style={{ fontSize: "0.82rem", fontWeight: 700 }}>{p.code || "—"}</code>
                    </td>
                    <td style={{ maxWidth: "26rem", whiteSpace: "normal" }}>
                      {p.statement ? (
                        <span>{p.statement}</span>
                      ) : (
                        <span className="section-hint" style={{ margin: 0 }}>
                          (kosong)
                        </span>
                      )}
                    </td>
                    <td className="num">{p.scaleMax}</td>
                    <td>
                      <span
                        className={`pill ${
                          p.action === "buat" ? "pill-ok" : p.action === "perbarui" ? "pill-info" : "pill-bad"
                        }`}
                      >
                        {p.action}
                      </span>
                    </td>
                    <td className="section-hint" style={{ margin: 0, fontSize: "0.78rem" }}>
                      {p.reason}
                    </td>
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
              Terapkan {hitung(stage.plans, "buat") + hitung(stage.plans, "perbarui")} soal ke{" "}
              {stage.targetMeasurement.code}
            </button>
            <button
              type="button"
              className="btn btn-small btn-inline btn-muted"
              onClick={() => setStage({ kind: "idle" })}
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Applying Stage */}
      {stage.kind === "applying" && (
        <div style={{ marginTop: "1.25rem" }}>
          <p className="label">
            Menyimpan {stage.done} dari {stage.plans.length} butir soal ke {stage.targetMeasurement.code}…
          </p>
          <span className="bar" aria-hidden="true">
            <span
              className="bar-fill bar-accent"
              style={{ width: `${(stage.done / Math.max(stage.plans.length, 1)) * 100}%` }}
            />
          </span>
        </div>
      )}

      {/* Done Stage */}
      {stage.kind === "done" && (
        <div style={{ marginTop: "1.25rem" }}>
          <p className="label">
            Selesai untuk {stage.targetMeasurement.code}: {stage.results.filter((r) => r.ok).length} berhasil,{" "}
            {stage.results.filter((r) => !r.ok).length} gagal
          </p>
          {stage.results.some((r) => !r.ok) && (
            <>
              <div className="table-wrap" style={{ maxHeight: "16rem", overflowY: "auto" }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col" className="num">
                        Baris
                      </th>
                      <th scope="col">Kode</th>
                      <th scope="col">Alasan Gagal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stage.results
                      .filter((r) => !r.ok)
                      .map((r) => (
                        <tr key={r.line}>
                          <td className="num">{r.line}</td>
                          <td>
                            <code>{r.code}</code>
                          </td>
                          <td>{r.message}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                className="btn-link"
                style={{ marginTop: "0.5rem" }}
                onClick={() => unduhGagal(stage.results)}
              >
                Unduh daftar baris yang gagal
              </button>
            </>
          )}
          <div style={{ marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-small btn-inline btn-muted"
              onClick={() => setStage({ kind: "idle" })}
            >
              Impor berkas lain
            </button>
          </div>
        </div>
      )}
    </>
  );
}
