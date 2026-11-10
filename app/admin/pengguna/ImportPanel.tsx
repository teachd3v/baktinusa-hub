"use client";

import { useRef, useState } from "react";
import { TEMPLATE_EXAMPLE, TEMPLATE_GROUPS, TEMPLATE_HEADERS, type RawRow, type RowPlan, type RowResult } from "@/lib/data/import-people";
import { applyImportAction, exportCurrentAction, planImportAction } from "./actions";

// Berkas dibaca di browser, bukan di server: pustaka pembaca Excel cukup besar, dan tidak ada alasan
// membawanya ke Worker kalau hasil bacanya toh diperiksa ulang di sana.
//
// Alurnya: unduh template (kosong atau berisi data saat ini) → pilih berkas → pratinjau (tidak ada yang
// ditulis) → terapkan per 20 baris. Dipakai di menu Pengguna dan Profil Awardee.

type Stage =
  | { kind: "idle" }
  | { kind: "reading" }
  | { kind: "preview"; plans: RowPlan[]; fileName: string }
  | { kind: "applying"; plans: RowPlan[]; done: number }
  | { kind: "done"; results: RowResult[] };

const CHUNK = 20;
const PREVIEW_ROWS = 30;
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
  // Nilai mentah, bukan teks berformat: tanggal berformat Excel dibaca sebagai angka seri (dipulihkan di server)
  // dan tidak bergantung pada format tanggal komputer pembuatnya.
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  return raw.map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? "")])));
}

const PETUNJUK: string[][] = [
  ["Petunjuk pengisian"],
  ["1. Satu baris = satu orang. Kolom ID adalah kunci: ID yang sudah ada diperbarui, ID baru dibuat sebagai akun baru."],
  ["2. Sel kosong berarti BIARKAN data yang ada. Untuk mengosongkan isian, tulis [kosongkan]."],
  ["3. Kolom Profil, LeadPro, dan Program hanya untuk Awardee. Kosongkan untuk Admin dan Manwil."],
  ["4. Wilayah, Kampus, dan Bidang LeadPro harus sudah ada di sistem; tidak dibuat otomatis dari berkas."],
  ["5. Tanggal ditulis 2004-05-17 atau 17/05/2004. Nomor telepon tanpa nol di depan akan dilengkapi otomatis."],
  ["6. Bidang minat, keahlian, dan bahasa dipisahkan koma."],
  ["7. Deskripsi LeadPro sebaiknya satu kalimat, maksimal 100 karakter."],
  ["8. Persetujuan penggunaan data tidak bisa diimpor; awardee mencentangnya sendiri di Profil Saya."],
  ["9. Status akun: aktif atau nonaktif. Status awardee: aktif, lulus, atau dicabut."],
  ["10. Berkas hasil Unduh data saat ini memuat data pribadi. Simpan dengan hati-hati dan hapus setelah selesai."],
  [""],
  ["Kelompok kolom: " + TEMPLATE_GROUPS.map((g) => `${g.title} (${g.headers.length})`).join(", ")],
];

export function ImportPanel() {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [error, setError] = useState("");
  const [skipWarned, setSkipWarned] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  async function tulisBerkas(rows: Record<string, string>[], filename: string, sheetName: string) {
    const XLSX = await import("xlsx");
    const sheet = XLSX.utils.json_to_sheet(rows, { header: TEMPLATE_HEADERS });
    sheet["!cols"] = TEMPLATE_HEADERS.map((h) => ({ wch: Math.max(12, Math.min(28, h.length + 4)) }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, sheetName);
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(PETUNJUK), "Petunjuk");
    XLSX.writeFile(book, filename);
  }

  const unduhTemplate = () => tulisBerkas(TEMPLATE_EXAMPLE, "template-impor-awardee.xlsx", "Impor");

  async function unduhDataSaatIni() {
    setError("");
    setBusy(true);
    try {
      await tulisBerkas(await exportCurrentAction(), "data-awardee-saat-ini.xlsx", "Impor");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Data tidak bisa diunduh.");
    } finally {
      setBusy(false);
    }
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

  const ditulis = (plans: RowPlan[]) =>
    plans.filter((p) => (p.action === "buat" || p.action === "perbarui") && !(skipWarned && p.warnings.length > 0));

  async function terapkan(plans: RowPlan[]) {
    const siap = ditulis(plans);
    const ditolak: RowResult[] = plans.filter((p) => p.action === "tolak").map((p) => ({ line: p.line, ok: false, message: p.reason }));
    const dilewati: RowResult[] = plans
      .filter((p) => (p.action === "buat" || p.action === "perbarui") && skipWarned && p.warnings.length > 0)
      .map((p) => ({ line: p.line, ok: false, message: `Dilewati karena ada peringatan: ${p.warnings.join(" ")}` }));
    const hasil: RowResult[] = [];
    setStage({ kind: "applying", plans: siap, done: 0 });

    try {
      for (let i = 0; i < siap.length; i += CHUNK) {
        const bagian = await applyImportAction(siap.slice(i, i + CHUNK));
        hasil.push(...bagian);
        setStage({ kind: "applying", plans: siap, done: Math.min(i + CHUNK, siap.length) });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Impor terhenti di tengah jalan.");
    }
    setStage({ kind: "done", results: [...hasil, ...ditolak, ...dilewati].sort((a, b) => a.line - b.line) });
  }

  function unduhGagal(results: RowResult[]) {
    const gagal = results.filter((r) => !r.ok);
    const lines = ["Baris;Keterangan", ...gagal.map((r) => `${r.line}${SEP}${csvCell(r.message)}`)];
    downloadBlob(new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" }), "impor-gagal.csv");
  }

  const hitung = (plans: RowPlan[], action: RowPlan["action"]) => plans.filter((p) => p.action === action).length;
  const berperingatan = (plans: RowPlan[]) => plans.filter((p) => p.action !== "tolak" && p.warnings.length > 0).length;
  const pill = (action: RowPlan["action"]) => (action === "buat" ? "pill-ok" : action === "perbarui" ? "pill-info" : action === "tetap" ? "pill-muted" : "pill-bad");

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        <button type="button" className="btn btn-small btn-inline btn-muted" onClick={() => void unduhTemplate()}>Unduh template kosong</button>
        <button type="button" className="btn btn-small btn-inline btn-muted" onClick={() => void unduhDataSaatIni()} disabled={busy}>
          {busy ? "Menyiapkan…" : "Unduh data saat ini"}
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
        <button type="button" className="btn btn-muted btn-small btn-inline" onClick={() => fileInput.current?.click()} disabled={stage.kind === "reading" || stage.kind === "applying"}>
          {stage.kind === "reading" ? "Membaca…" : "Pilih berkas"}
        </button>
      </div>
      <p className="section-hint">
        Satu berkas untuk akun, profil, LeadPro, dan status. Sel kosong berarti biarkan data yang ada; tulis [kosongkan] untuk menghapus.
        Unduhan data saat ini memuat data pribadi dan dicatat di Jejak perubahan.
      </p>

      {error && <p className="form-error" role="alert">{error}</p>}

      {stage.kind === "preview" && (
        <div style={{ marginTop: "1rem" }}>
          <p className="label">Pratinjau {stage.fileName}</p>
          <p className="section-hint">
            {hitung(stage.plans, "buat")} akan dibuat, {hitung(stage.plans, "perbarui")} akan diperbarui, {hitung(stage.plans, "tetap")} tidak berubah,{" "}
            {hitung(stage.plans, "tolak")} ditolak, {berperingatan(stage.plans)} berperingatan.
            {stage.plans.length > PREVIEW_ROWS && ` Menampilkan ${PREVIEW_ROWS} baris yang paling perlu dilihat dari ${stage.plans.length}; semuanya ikut diterapkan.`}
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
                {[...stage.plans]
                  .sort((a, b) => (a.action === "tolak" ? 0 : a.warnings.length > 0 ? 1 : 2) - (b.action === "tolak" ? 0 : b.warnings.length > 0 ? 1 : 2))
                  .slice(0, PREVIEW_ROWS)
                  .map((p) => (
                    <tr key={p.line}>
                      <td className="num">{p.line}</td>
                      <td>{p.name || "—"}</td>
                      <td><code style={{ fontSize: "0.78rem" }}>{p.loginId || "—"}</code></td>
                      <td><span className={`pill ${pill(p.action)}`}>{p.action}</span></td>
                      <td className="section-hint" style={{ margin: 0 }}>
                        {p.reason}
                        {p.warnings.map((w) => (
                          <span key={w} className="pill pill-warn" style={{ display: "block", marginTop: "0.25rem", whiteSpace: "normal" }}>⚠ {w}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {berperingatan(stage.plans) > 0 && (
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
              <input type="checkbox" checked={skipWarned} onChange={(e) => setSkipWarned(e.target.checked)} />
              <span className="section-hint" style={{ margin: 0 }}>Lewati {berperingatan(stage.plans)} baris yang berperingatan (periksa dulu, lalu impor ulang)</span>
            </label>
          )}

          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-small btn-inline"
              onClick={() => void terapkan(stage.plans)}
              disabled={ditulis(stage.plans).length === 0}
            >
              Terapkan {ditulis(stage.plans).length} baris
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
            Selesai: {stage.results.filter((r) => r.ok).length} berhasil, {stage.results.filter((r) => !r.ok).length} gagal atau dilewati
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
