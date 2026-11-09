import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PasswordForm } from "./PasswordForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Akun" };

const ROLE_LABEL = { admin: "Admin", manwil: "Manajer Wilayah", awardee: "Awardee" } as const;

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <>
      <div className="page-head">
        <h1>Akun</h1>
      </div>

      <section className="card">
        <h2 className="section-title">{user.name}</h2>
        <p className="section-hint">{ROLE_LABEL[user.role]}</p>
      </section>

      <section className="card" style={{ maxWidth: "32rem" }}>
        <h2 className="section-title">Ganti kata sandi</h2>
        <p className="section-hint">
          Kata sandi awal dari Admin boleh dipakai terus. Kalau ingin menggantinya, isi di bawah ini.
        </p>
        <PasswordForm />
      </section>
    </>
  );
}
