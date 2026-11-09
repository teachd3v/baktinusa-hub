import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { NAV } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("admin");
  return (
    <AppShell
      user={user}
      nav={NAV.admin}
    >
      {children}
    </AppShell>
  );
}
