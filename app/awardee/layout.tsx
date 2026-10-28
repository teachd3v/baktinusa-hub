import { env } from "cloudflare:workers";
import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";
import { listAwardees } from "@/lib/data/awardees";
import { scopeFor } from "@/lib/data/scope";
import { awardeePhotoUrl } from "@/lib/photo";

export const dynamic = "force-dynamic";

export default async function AwardeeLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser("awardee");
  // Foto profil menggantikan inisial di bilah ponsel. Data awardee-nya bisa kosong; tanpa itu yang tampil inisial.
  const [me] = await listAwardees(env.DB, scopeFor(user));
  const photoSrc = me?.region ? awardeePhotoUrl(me.region, me.name) : undefined;
  return (
    <AppShell
      user={user}
      photoSrc={photoSrc}
      nav={[{ href: "/awardee", label: "Beranda" }, { href: "/awardee/nilai", label: "Penilaian" }, { href: "/awardee/hasil", label: "Hasil" }]}
    >
      {children}
    </AppShell>
  );
}
