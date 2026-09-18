// Adapter D1 di atas node:sqlite: fungsi lib/data/* diuji dengan migrasi yang sama persis seperti production,
// tanpa menjalankan Worker.
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

type Params = (string | number | null)[];

export function createTestDb(): D1Database {
  const raw = new DatabaseSync(":memory:");
  raw.exec("PRAGMA foreign_keys = ON");
  for (const file of readdirSync("migrations").filter((f) => f.endsWith(".sql")).sort()) {
    raw.exec(readFileSync(`migrations/${file}`, "utf8"));
  }

  const statement = (sql: string, params: Params = []) => ({
    bind: (...args: Params) => statement(sql, args),
    first: async (column?: string) => {
      const row = raw.prepare(sql).get(...params) as Record<string, unknown> | undefined;
      if (!row) return null;
      return column ? row[column] : { ...row };
    },
    all: async () => ({ results: raw.prepare(sql).all(...params).map((r) => ({ ...r })), success: true, meta: {} }),
    run: async () => {
      const info = raw.prepare(sql).run(...params);
      return { results: [], success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
    },
    runAll: () => raw.prepare(sql).all(...params).map((r) => ({ ...r })),
  });

  return {
    prepare: (sql: string) => statement(sql),
    // D1 menjalankan batch dalam satu transaksi.
    batch: async (statements: { runAll: () => unknown[] }[]) => {
      raw.exec("BEGIN");
      try {
        const out = statements.map((s) => ({ results: s.runAll(), success: true, meta: {} }));
        raw.exec("COMMIT");
        return out;
      } catch (error) {
        raw.exec("ROLLBACK");
        throw error;
      }
    },
    exec: async (sql: string) => {
      raw.exec(sql);
      return { count: 0, duration: 0 };
    },
  } as unknown as D1Database;
}

// Tiga wilayah, empat awardee, satu periode terbuka, dan respons tersebar di semua awardee.
export async function seedFixture(db: D1Database) {
  await db.exec(`
    INSERT INTO regions (id, name) VALUES (1, 'Bandung'), (2, 'Medan'), (3, 'Makassar');
    INSERT INTO awardees (id, region_id, batch, name, referral_code) VALUES
      (1, 1, 'BA15', 'Ayu', 'AAAA0001'),
      (2, 1, 'BA15', 'Budi', 'AAAA0002'),
      (3, 2, 'BA15', 'Citra', 'BBBB0003'),
      (4, 3, 'BA15', 'Dedi', 'CCCC0004');
    INSERT INTO periods (id, slug, name, batch, kind, status) VALUES (1, 'uji', 'Periode Uji', 'BA15', 'assessment', 'open');
    INSERT INTO respondent_types (id, code, name, audience) VALUES
      (1, 'self_initial', 'Asesmen Awal', 'self'),
      (3, 'peer', 'Peer Awardee', 'internal'),
      (4, 'manwil', 'Manajer Wilayah', 'internal'),
      (5, 'external', 'Jejaring Eksternal', 'external');
    INSERT INTO period_respondent_types (period_id, respondent_type_id, target_rule, target_min) VALUES
      (1, 1, 'fixed', 1), (1, 3, 'region_peers', NULL), (1, 4, 'fixed', 1), (1, 5, 'fixed', 20);
    INSERT INTO responses (id, period_id, awardee_id, respondent_type_id, source) VALUES
      (1, 1, 1, 5, 'app'), (2, 1, 1, 5, 'app'),
      (3, 1, 2, 5, 'app'),
      (4, 1, 3, 5, 'app'),
      (5, 1, 4, 5, 'app');
    INSERT INTO users (id, email, name, role, region_id, awardee_id, status) VALUES
      (1, 'admin@contoh.id', 'Admin', 'admin', NULL, NULL, 'active'),
      (2, 'manwil.bandung@contoh.id', 'Manwil Bandung', 'manwil', 1, NULL, 'active'),
      (3, 'ayu@contoh.id', 'Ayu', 'awardee', NULL, 1, 'active'),
      (4, 'citra@contoh.id', 'Citra', 'awardee', NULL, 3, 'active'),
      (5, 'nonaktif@contoh.id', 'Nonaktif', 'awardee', NULL, 4, 'disabled');
  `);
}
