import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { NAV } from "@/lib/nav";

export const dynamic = "force-dynamic";

export default async function ManwilLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("manwil");
  return (
    <AppShell
      user={user}
      nav={NAV.manwil}
    >
      {children}
    </AppShell>
  );
}
