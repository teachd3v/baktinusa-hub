import { Icon, type IconName } from "@/components/Icon";

export function BrandHeader({ title, subtitle, icon }: { title: string; subtitle?: string; icon?: IconName }) {
  return (
    <header className="brand-header">
      <div className="blob" aria-hidden={icon ? true : undefined}>
        {icon ? <Icon name={icon} className="notice-icon" /> : <img src="/logo.webp" alt="BAKTI NUSA" />}
      </div>
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
    </header>
  );
}
