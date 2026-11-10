import type { Leadpro } from "@/lib/data/leadpro";

// Leadership Project awardee, baca saja. Dipakai di Profil Saya (awardee) dan halaman profil untuk Manwil.
export function LeadproCard({ leadpro, own = false }: { leadpro: Leadpro | null; own?: boolean }) {
  return (
    <section className="card">
      <h2 className="section-title">Leadership Project</h2>
      {leadpro ? (
        <>
          <p style={{ margin: "0 0 0.4rem", display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
            <strong style={{ fontSize: "var(--text-lg, 1.1rem)" }}>{leadpro.name}</strong>
            {leadpro.field && <span className="pill pill-muted">{leadpro.field}</span>}
          </p>
          {leadpro.description && <p className="leadpro-full">{leadpro.description}</p>}
          {own && <p className="section-hint" style={{ margin: "0.75rem 0 0" }}>Ada yang kurang pas? Hubungi Admin program untuk mengubahnya.</p>}
        </>
      ) : (
        <p className="section-hint" style={{ margin: 0 }}>
          {own ? "LeadPro Anda belum diisi. Hubungi Admin program." : "LeadPro belum diisi."}
        </p>
      )}
    </section>
  );
}
