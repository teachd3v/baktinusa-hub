export function BrandHeader({ title, subtitle, emoji }: { title: string; subtitle?: string; emoji?: string }) {
  return (
    <header className="brand-header">
      <div className="blob" aria-hidden={emoji ? true : undefined}>
        {emoji ? <span style={{ fontSize: "1.9rem" }}>{emoji}</span> : <img src="/logo.webp" alt="BAKTI NUSA" />}
      </div>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}
