import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AwardeeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("awardee");
  return <AppShell user={user} nav={[{ href: "/awardee", label: "Beranda" }, { href: "/awardee/nilai", label: "Penilaian" }]}>{children}</AppShell>;
}
