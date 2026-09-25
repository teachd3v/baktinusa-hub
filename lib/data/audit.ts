import { ScopeError, type SessionUser } from "./scope.ts";

// Jejak audit. Ditulis di lapisan data, bukan di halaman: kalau perubahannya lewat fungsi ini,
// jejaknya ikut — tidak bergantung pada halaman yang ingat memanggilnya.

export type AuditEntry = {
  id: number;
  at: string;
  actorName: string;
  action: string;
  entity: string;
  entityId: number | null;
  summary: string;
};

export type AuditInput = { action: string; entity: string; entityId?: number | null; summary: string; detail?: unknown };

export async function writeAudit(db: D1Database, actor: SessionUser, input: AuditInput): Promise<void> {
  await db
    .prepare(
      "INSERT INTO audit_log (user_id, actor_name, action, entity, entity_id, summary, detail) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      actor.id,
      actor.name,
      input.action,
      input.entity,
      input.entityId ?? null,
      input.summary.slice(0, 500),
      input.detail === undefined ? null : JSON.stringify(input.detail).slice(0, 4000),
    )
    .run();
}

export async function listAudit(db: D1Database, actor: SessionUser, limit = 100): Promise<AuditEntry[]> {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh membaca jejak audit");
  const { results } = await db
    .prepare("SELECT id, at, actor_name, action, entity, entity_id, summary FROM audit_log ORDER BY at DESC, id DESC LIMIT ?")
    .bind(Math.min(Math.max(limit, 1), 500))
    .all<{ id: number; at: string; actor_name: string; action: string; entity: string; entity_id: number | null; summary: string }>();
  return results.map((r) => ({
    id: r.id,
    at: r.at,
    actorName: r.actor_name,
    action: r.action,
    entity: r.entity,
    entityId: r.entity_id,
    summary: r.summary,
  }));
}
