import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("admin");
  return (
    <AppShell
      user={user}
      nav={[
        { href: "/admin", label: "Ringkasan" },
        { href: "/admin/hasil", label: "Hasil" },
        { href: "/admin/periode", label: "Periode" },
        { href: "/admin/awardee", label: "Awardee" },
        { href: "/admin/respons", label: "Respons" },
        { href: "/admin/pengingat", label: "Pengingat" },
        { href: "/admin/pengguna", label: "Pengguna" },
        { href: "/admin/jejak", label: "Jejak" },
      ]}
    >
      {children}
    </AppShell>
  );
}
