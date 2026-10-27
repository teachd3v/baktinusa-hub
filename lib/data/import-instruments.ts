// Impor massal instrumen (soal) per jenis pengukuran.
//
// Alurnya dua langkah:
// 1. **Rencana (Plan)**: validasi format, deteksi duplikasi dalam berkas, dan bandingkan dengan status di database
//    (apakah soal baru, update teks, atau ditolak karena pengukuran terkunci oleh jawaban yang sudah ada).
// 2. **Terapkan (Apply)**: penulisan bertahap (chunked) ke D1 dan pencatatan jejak audit.

import { writeAudit } from "./audit.ts";
import { ScopeError, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengimpor instrumen");
}

export const INSTRUMENT_TEMPLATE_HEADERS = ["Kode", "Pernyataan", "Skala Maksimal"] as const;

export type RawInstrumentRow = Record<string, string>;

export type InstrumentRowPlan = {
  line: number;
  action: "buat" | "perbarui" | "tolak";
  reason: string;
  code: string;
  statement: string;
  scaleMax: number;
  instrumentId: number | null;
  input: { code: string; statement: string; scaleMax: number } | null;
};

export type InstrumentRowResult = {
  line: number;
  ok: boolean;
  message: string;
  code: string;
};

export type MeasurementMeta = {
  id: number;
  code: string;
  slug: string;
  name: string;
  filledBy: string;
};

const pick = (row: RawInstrumentRow, ...keys: string[]) => {
  const rowKeys = Object.keys(row);
  for (const key of keys) {
    const found = rowKeys.find((k) => k.trim().toLowerCase() === key.toLowerCase());
    if (found && row[found] !== undefined && row[found] !== null) {
      return String(row[found]).trim();
    }
  }
  return "";
};

const SEP = ";";
const csvCell = (v: string) => (/["\n\r;]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);

export function getTemplateExamples(filledBy: string): Record<string, string>[] {
  switch (filledBy) {
    case "self":
      return [
        {
          Kode: "Q1",
          Pernyataan: "Saya menyelesaikan tugas dan kewajiban dengan tuntas dan tepat waktu.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q2",
          Pernyataan: "Saya berani menyampaikan ide dan masukan meski dalam situasi yang menantang.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q3",
          Pernyataan: "Saya aktif mengevaluasi dan meningkatkan kapasitas diri secara berkala.",
          "Skala Maksimal": "4",
        },
      ];
    case "peer":
      return [
        {
          Kode: "Q1",
          Pernyataan: "Yang bersangkutan menyelesaikan tugas bersama dengan tuntas dan bertanggung jawab.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q2",
          Pernyataan: "Yang bersangkutan aktif berkolaborasi dan saling menguatkan dalam tim wilayah.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q3",
          Pernyataan: "Yang bersangkutan terbuka menerima kritik serta masukan yang membangun.",
          "Skala Maksimal": "4",
        },
      ];
    case "manwil":
      return [
        {
          Kode: "Q1",
          Pernyataan: "Yang bersangkutan menunjukkan integritas dan komitmen dalam seluruh agenda pembinaan.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q2",
          Pernyataan: "Yang bersangkutan proaktif berkomunikasi dan berkoordinasi dengan pengurus wilayah.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q3",
          Pernyataan: "Yang bersangkutan menunjukkan inisiatif tinggi dalam memecahkan persoalan.",
          "Skala Maksimal": "4",
        },
      ];
    case "public":
      return [
        {
          Kode: "Q1",
          Pernyataan: "Yang bersangkutan menunjukkan keteladanan dan dedikasi dalam aktivitas sosial/proyek.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q2",
          Pernyataan: "Yang bersangkutan mampu menggerakkan tim dan merangkul masyarakat sekitar.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q3",
          Pernyataan: "Inisiatif yang dijalankan memberikan dampak positif nyata bagi penerima manfaat.",
          "Skala Maksimal": "4",
        },
      ];
    default:
      return [
        {
          Kode: "Q1",
          Pernyataan: "Awardee mampu memaparkan gagasan strategis secara terstruktur dan terukur.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q2",
          Pernyataan: "Awardee memiliki pemahaman mendalam terkait nilai-nilai kepemimpinan BAKTI NUSA.",
          "Skala Maksimal": "4",
        },
        {
          Kode: "Q3",
          Pernyataan: "Awardee menunjukkan kesiapan kontribusi nyata bagi nusa dan bangsa.",
          "Skala Maksimal": "4",
        },
      ];
  }
}

export function generateInstrumentTemplateCsv(measurement: MeasurementMeta): string {
  const examples = getTemplateExamples(measurement.filledBy);
  const lines = [
    INSTRUMENT_TEMPLATE_HEADERS.join(SEP),
    ...examples.map((row) => INSTRUMENT_TEMPLATE_HEADERS.map((h) => csvCell(row[h] ?? "")).join(SEP)),
  ];
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}

const tolak = (line: number, code: string, statement: string, scaleMax: number, reason: string): InstrumentRowPlan => ({
  line,
  action: "tolak",
  reason,
  code,
  statement,
  scaleMax,
  instrumentId: null,
  input: null,
});

export async function planInstrumentImport(
  db: D1Database,
  actor: SessionUser,
  measurementId: number,
  rows: RawInstrumentRow[],
): Promise<InstrumentRowPlan[]> {
  assertAdmin(actor);

  const measurement = await db
    .prepare("SELECT id, code, slug, name, filled_by FROM measurements WHERE id = ?")
    .bind(measurementId)
    .first<{ id: number; code: string; slug: string; name: string; filled_by: string }>();

  if (!measurement) {
    throw new Error("Jenis pengukuran tidak ditemukan.");
  }

  // Cek apakah pengukuran sudah menghasilkan jawaban lewat siklus mana pun
  const responseCountRow = await db
    .prepare("SELECT COUNT(*) AS n FROM responses WHERE measurement_id = ?")
    .bind(measurementId)
    .first<{ n: number }>();
  const isLocked = (responseCountRow?.n ?? 0) > 0;

  // Tarik seluruh instrumen yang sudah ada di pengukuran ini
  const { results: existingRows } = await db
    .prepare(
      `SELECT i.id, i.code, i.statement, i.scale_max,
        (SELECT COUNT(*) FROM response_scores s WHERE s.instrument_id = i.id) AS answers
       FROM instruments i
       WHERE i.measurement_id = ?`,
    )
    .bind(measurementId)
    .all<{ id: number; code: string; statement: string; scale_max: number; answers: number }>();

  const existingByCode = new Map(existingRows.map((item) => [item.code.toUpperCase(), item]));
  const seenCode = new Map<string, number>();
  const plans: InstrumentRowPlan[] = [];

  rows.forEach((row, index) => {
    const line = index + 2; // Baris 1 di file adalah header
    const code = pick(row, "Kode", "Kode Soal", "Code");
    const statement = pick(row, "Pernyataan", "Teks Soal", "Pernyataan / Soal", "Statement", "Teks");
    const scaleMaxStr = pick(row, "Skala Maksimal", "Skala", "Skala Max", "Scale Max", "Scale");

    // Baris kosong diabaikan
    if (!code && !statement && !scaleMaxStr) return;

    let scaleMax = 4;
    if (scaleMaxStr) {
      const parsed = Number(scaleMaxStr);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
        return void plans.push(
          tolak(line, code, statement, 4, `Skala maksimal "${scaleMaxStr}" tidak valid. Harus angka bulat 1–10.`),
        );
      }
      scaleMax = parsed;
    }

    if (!code) {
      return void plans.push(tolak(line, "", statement, scaleMax, "Kode soal wajib diisi (misal: Q1)."));
    }
    if (code.length > 20) {
      return void plans.push(tolak(line, code, statement, scaleMax, "Kode soal maksimal 20 karakter."));
    }

    if (!statement) {
      return void plans.push(tolak(line, code, "", scaleMax, "Pernyataan soal wajib diisi."));
    }
    if (statement.length > 1000) {
      return void plans.push(tolak(line, code, statement, scaleMax, "Pernyataan soal maksimal 1.000 karakter."));
    }

    const codeUpper = code.toUpperCase();
    const beforeLine = seenCode.get(codeUpper);
    if (beforeLine) {
      return void plans.push(tolak(line, code, statement, scaleMax, `Kode "${code}" bentrok dengan baris ${beforeLine}.`));
    }
    seenCode.set(codeUpper, line);

    const existing = existingByCode.get(codeUpper);

    if (existing) {
      // Soal sudah ada di DB
      if ((isLocked || existing.answers > 0) && scaleMax !== existing.scale_max) {
        return void plans.push(
          tolak(
            line,
            code,
            statement,
            scaleMax,
            `Pengukuran ini sudah menghasilkan jawaban responden. Skala terkunci (tetap ${existing.scale_max}), tidak boleh diubah.`,
          ),
        );
      }

      const reason =
        isLocked || existing.answers > 0
          ? `Soal sudah ada (pengukuran memiliki jawaban responden). Pernyataan diperbarui, skala dipertahankan.`
          : statement === existing.statement && scaleMax === existing.scale_max
            ? "Soal sudah ada dengan data identik (tidak ada perubahan)."
            : "Soal sudah ada. Data pernyataan/skala akan diperbarui.";

      plans.push({
        line,
        action: "perbarui",
        reason,
        code,
        statement,
        scaleMax: isLocked || existing.answers > 0 ? existing.scale_max : scaleMax,
        instrumentId: existing.id,
        input: {
          code: existing.code,
          statement,
          scaleMax: isLocked || existing.answers > 0 ? existing.scale_max : scaleMax,
        },
      });
    } else {
      // Soal baru
      if (isLocked) {
        return void plans.push(
          tolak(
            line,
            code,
            statement,
            scaleMax,
            `Pengukuran ini sudah menghasilkan jawaban responden. Penambahan soal baru "${code}" dilarang demi integritas data.`,
          ),
        );
      }

      plans.push({
        line,
        action: "buat",
        reason: "Soal baru akan ditambahkan ke pengukuran ini.",
        code,
        statement,
        scaleMax,
        instrumentId: null,
        input: { code, statement, scaleMax },
      });
    }
  });

  return plans;
}

export async function applyInstrumentImport(
  db: D1Database,
  actor: SessionUser,
  measurementId: number,
  plans: InstrumentRowPlan[],
): Promise<InstrumentRowResult[]> {
  assertAdmin(actor);

  const measurement = await db
    .prepare("SELECT id, name FROM measurements WHERE id = ?")
    .bind(measurementId)
    .first<{ id: number; name: string }>();

  if (!measurement) {
    throw new Error("Jenis pengukuran tidak ditemukan.");
  }

  const results: InstrumentRowResult[] = [];
  let createdCount = 0;
  let updatedCount = 0;

  for (const plan of plans) {
    if (plan.action === "tolak" || !plan.input) {
      results.push({ line: plan.line, ok: false, message: plan.reason, code: plan.code });
      continue;
    }

    if (plan.action === "perbarui" && plan.instrumentId) {
      try {
        await db
          .prepare("UPDATE instruments SET statement = ?, scale_max = ? WHERE id = ? AND measurement_id = ?")
          .bind(plan.input.statement, plan.input.scaleMax, plan.instrumentId, measurementId)
          .run();
        updatedCount++;
        results.push({ line: plan.line, ok: true, message: "Diperbarui.", code: plan.code });
      } catch (err) {
        results.push({
          line: plan.line,
          ok: false,
          message: err instanceof Error ? err.message : "Gagal memperbarui soal.",
          code: plan.code,
        });
      }
    } else if (plan.action === "buat") {
      try {
        const nextOrderRow = await db
          .prepare("SELECT COALESCE(MAX(order_index), 0) + 1 AS n FROM instruments WHERE measurement_id = ?")
          .bind(measurementId)
          .first<{ n: number }>();
        const nextOrder = nextOrderRow?.n ?? 1;

        await db
          .prepare(
            "INSERT INTO instruments (measurement_id, code, statement, scale_max, order_index) VALUES (?, ?, ?, ?, ?)",
          )
          .bind(measurementId, plan.input.code, plan.input.statement, plan.input.scaleMax, nextOrder)
          .run();
        createdCount++;
        results.push({ line: plan.line, ok: true, message: "Dibuat.", code: plan.code });
      } catch (err) {
        results.push({
          line: plan.line,
          ok: false,
          message: err instanceof Error ? err.message : "Gagal menambahkan soal baru.",
          code: plan.code,
        });
      }
    }
  }

  if (createdCount > 0 || updatedCount > 0) {
    await writeAudit(db, actor, {
      action: "soal.impor",
      entity: "measurement",
      entityId: measurementId,
      summary: `Impor massal soal "${measurement.name}": ${createdCount} dibuat, ${updatedCount} diperbarui`,
    });
  }

  return results;
}
