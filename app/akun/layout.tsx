import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { NAV } from "@/lib/nav";

export const dynamic = "force-dynamic";

// Halaman akun dipakai semua peran, jadi kerangkanya mengikuti peran pemakainya.
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <AppShell user={user} nav={NAV[user.role]}>
      {children}
    </AppShell>
  );
}
