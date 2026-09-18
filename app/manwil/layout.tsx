import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ManwilLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("manwil");
  return <AppShell user={user} nav={[{ href: "/manwil", label: "Wilayah saya" }, { href: "/manwil/nilai", label: "Penilaian" }]}>{children}</AppShell>;
}
