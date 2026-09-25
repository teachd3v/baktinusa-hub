import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/data/scope";

export const dynamic = "force-dynamic";

// Halaman depan tidak punya isi sendiri: yang sudah masuk langsung ke berandanya, sisanya ke halaman masuk.
// Responden publik tidak pernah lewat sini — mereka membuka /s/<kode> dari tautan yang dibagikan awardee.
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : "/masuk");
}
