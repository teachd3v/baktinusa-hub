import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("admin");
  return (
    <AppShell
      user={user}
      nav={[
        { href: "/admin/pengguna", label: "Pengguna" },
        { href: "/admin/wilayah", label: "Wilayah" },
        { href: "/admin/periode", label: "Periode" },
      ]}
    >
      {children}
    </AppShell>
  );
}
