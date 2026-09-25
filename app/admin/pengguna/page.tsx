import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { listAwardeesWithoutAccount, listRegions, listUsers } from "@/lib/data/users";
import { formatWib } from "@/lib/format";
import { setStatusAction } from "./actions";
import { CredentialsForm } from "./CredentialsForm";
import { NewUserForm } from "./NewUserForm";

export const metadata: Metadata = { title: "Pengguna" };

const ROLE_LABEL = { admin: "Admin", manwil: "Manwil", awardee: "Awardee" } as const;

export default async function UsersPage() {
  const admin = await requireUser("admin");
  const [users, regions, freeAwardees] = await Promise.all([
    listUsers(env.DB, admin),
    listRegions(env.DB),
    listAwardeesWithoutAccount(env.DB, admin),
  ]);

  return (
    <>
      <div className="page-head">
        <h1>Pengguna</h1>
        <p>Akun Admin, Manajer Wilayah, dan Awardee. Hub tidak memakai kata sandi — setiap orang masuk lewat tautan sekali pakai.</p>
      </div>

      <section className="card">
        <h2 className="section-title">Tambah akun</h2>
        <NewUserForm regions={regions} awardees={freeAwardees} />
      </section>

      <section className="card">
        <h2 className="section-title">Daftar akun</h2>
        <p className="section-hint">{users.length} akun</p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">ID masuk</th>
                <th scope="col">Peran</th>
                <th scope="col">Wilayah</th>
                <th scope="col">Terakhir masuk</th>
                <th scope="col">ID &amp; kata sandi</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    <b>{u.name}</b>
                    <div className="section-hint" style={{ margin: 0 }}>{u.email}</div>
                  </td>
                  <td>
                    {u.loginId ? <code style={{ fontSize: "0.78rem" }}>{u.loginId}</code> : <span className="pill pill-warn">belum ada</span>}
                  </td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>{u.region ?? "—"}</td>
                  <td>{u.lastLoginAt ? formatWib(u.lastLoginAt) : <span className="pill pill-muted">belum pernah</span>}</td>
                  <td>
                    {u.status === "active" ? <CredentialsForm userId={u.id} name={u.name} loginId={u.loginId} /> : "—"}
                  </td>
                  <td>
                    {u.id === admin.id ? (
                      <span className="pill pill-ok">aktif</span>
                    ) : (
                      <form action={setStatusAction}>
                        <input type="hidden" name="userId" value={u.id} />
                        <input type="hidden" name="status" value={u.status === "active" ? "disabled" : "active"} />
                        <span className={`pill ${u.status === "active" ? "pill-ok" : "pill-bad"}`}>{u.status === "active" ? "aktif" : "nonaktif"}</span>{" "}
                        <button type="submit" className="btn-link">{u.status === "active" ? "Nonaktifkan" : "Aktifkan"}</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
