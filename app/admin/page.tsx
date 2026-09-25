import { redirect } from "next/navigation";

// Ringkasan nasional sementara disembunyikan; pintu masuk Admin langsung ke setup pengguna.
export default function AdminHome() {
  redirect("/admin/pengguna");
}
