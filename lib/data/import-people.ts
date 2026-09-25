// Impor massal pengguna.
//
// Alurnya dua langkah dan sengaja begitu: **rencana** dulu (semua baris diperiksa, tidak ada yang ditulis),
// baru **terapkan** setelah Admin melihat apa yang akan terjadi. Berkasnya dibaca di browser — Worker hanya
// menerima baris yang sudah jadi JSON, jadi tidak ada pustaka pembaca Excel yang ikut terbawa ke server.
//
// Penulisannya tetap lewat createPerson/updatePerson yang sama dengan form satuan, jadi pagar yang berlaku
// di sana berlaku juga di sini — baris yang sudah "lolos" di tahap rencana pun diperiksa ulang saat ditulis.

import { checkLoginId, checkPassword, normalizeLoginId } from "./password.ts";
import { createPerson, updatePerson, type PersonInput } from "./people.ts";
import { ScopeError, type Role, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengimpor pengguna");
}

// Judul kolom template. Pembacanya tidak peka huruf besar-kecil dan spasi berlebih.
export const TEMPLATE_HEADERS = [
  "ID",
  "Nama",
  "Email",
  "Peran",
  "Wilayah",
  "Angkatan",
  "Kode Referal",
  "Kampus",
  "Kata Sandi",
  "Status",
] as const;

export const TEMPLATE_EXAMPLE: Record<string, string>[] = [
  {
    ID: "BA00226",
    Nama: "Nama Awardee",
    Email: "awardee@contoh.id",
    Peran: "Awardee",
    Wilayah: "Bogor",
    Angkatan: "BA16",
    "Kode Referal": "ABCD1234",
    Kampus: "Institut Pertanian Bogor",
    "Kata Sandi": "BA2026",
    Status: "aktif",
  },
  {
    ID: "MW00226",
    Nama: "Nama Manajer Wilayah",
    Email: "manwil@contoh.id",
    Peran: "Manwil",
    Wilayah: "Bogor",
    Angkatan: "",
    "Kode Referal": "",
    Kampus: "",
    "Kata Sandi": "BA2026",
    Status: "aktif",
  },
  {
    ID: "ADM002",
    Nama: "Nama Admin",
    Email: "admin2@contoh.id",
    Peran: "Admin",
    Wilayah: "",
    Angkatan: "",
    "Kode Referal": "",
    Kampus: "",
    "Kata Sandi": "BA2026",
    Status: "aktif",
  },
];

export type RawRow = Record<string, string>;

export type RowPlan = {
  line: number;
  action: "buat" | "perbarui" | "tolak";
  reason: string;
  name: string;
  loginId: string;
  role: Role | null;
  userId: number | null;
  input: PersonInput | null;
};

const pick = (row: RawRow, key: string) => {
  const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.toLowerCase());
  return (found ? row[found] ?? "" : "").toString().trim();
};

// Peran ditulis orang dengan macam-macam gaya; yang penting maksudnya jelas.
const ROLE_OF: Record<string, Role> = {
  admin: "admin",
  administrator: "admin",
  manwil: "manwil",
  "manajer wilayah": "manwil",
  "manager wilayah": "manwil",
  awardee: "awardee",
  peserta: "awardee",
};

const STATUS_OF: Record<string, "active" | "disabled"> = {
  "": "active",
  aktif: "active",
  active: "active",
  nonaktif: "disabled",
  "non-aktif": "disabled",
  disabled: "disabled",
  off: "disabled",
};

const tolak = (line: number, row: RawRow, reason: string): RowPlan => ({
  line,
  action: "tolak",
  reason,
  name: pick(row, "Nama"),
  loginId: pick(row, "ID"),
  role: null,
  userId: null,
  input: null,
});

// Memeriksa seluruh berkas tanpa menulis apa pun. Yang dicek: bentuk isian, bentrok dengan data yang sudah
// ada, dan bentrok antarbaris di dalam berkas itu sendiri.
export async function planImport(db: D1Database, actor: SessionUser, rows: RawRow[]): Promise<RowPlan[]> {
  assertAdmin(actor);

  const [{ results: regions }, { results: users }, { results: awardees }] = await Promise.all([
    db.prepare("SELECT id, name FROM regions").all<{ id: number; name: string }>(),
    db.prepare("SELECT id, login_id, email, role, awardee_id FROM users").all<{ id: number; login_id: string | null; email: string; role: Role; awardee_id: number | null }>(),
    db.prepare("SELECT id, referral_code, name FROM awardees").all<{ id: number; referral_code: string; name: string }>(),
  ]);

  const regionByName = new Map(regions.map((r) => [r.name.toLowerCase(), r.id]));
  const userByLoginId = new Map(users.filter((u) => u.login_id).map((u) => [u.login_id!.toUpperCase(), u]));
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const awardeeByCode = new Map(awardees.map((a) => [a.referral_code.toUpperCase(), a]));
  const awardeeTaken = new Set(users.filter((u) => u.awardee_id).map((u) => u.awardee_id!));

  const seenId = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const seenCode = new Map<string, number>();
  const plans: RowPlan[] = [];

  rows.forEach((row, index) => {
    const line = index + 2; // baris 1 di berkas adalah judul kolom
    const loginId = normalizeLoginId(pick(row, "ID"));
    const name = pick(row, "Nama");
    const email = pick(row, "Email").toLowerCase();
    const roleText = pick(row, "Peran").toLowerCase();
    const regionName = pick(row, "Wilayah");
    const batch = pick(row, "Angkatan").toUpperCase();
    const code = pick(row, "Kode Referal").toUpperCase();
    const campus = pick(row, "Kampus");
    const password = pick(row, "Kata Sandi");
    const statusText = pick(row, "Status").toLowerCase();

    // Baris kosong di ujung berkas sering ikut terbawa dari Excel; dilewati diam-diam, bukan jadi galat.
    if (!loginId && !name && !email && !roleText) return;

    const badId = checkLoginId(loginId);
    if (badId) return void plans.push(tolak(line, row, badId.message));

    const role = ROLE_OF[roleText];
    if (!role) return void plans.push(tolak(line, row, `Peran "${pick(row, "Peran")}" tidak dikenal. Isi Admin, Manwil, atau Awardee.`));

    const status = STATUS_OF[statusText];
    if (!status) return void plans.push(tolak(line, row, `Status "${pick(row, "Status")}" tidak dikenal. Isi aktif atau nonaktif.`));

    if (!name) return void plans.push(tolak(line, row, "Nama wajib diisi."));

    const existing = userByLoginId.get(loginId);

    // Bentrok di dalam berkas sendiri — lebih membingungkan kalau baru ketahuan saat ditulis.
    const idBefore = seenId.get(loginId);
    if (idBefore) return void plans.push(tolak(line, row, `ID "${loginId}" sudah dipakai di baris ${idBefore}.`));
    seenId.set(loginId, line);

    if (email) {
      const emailBefore = seenEmail.get(email);
      if (emailBefore) return void plans.push(tolak(line, row, `Email "${email}" sudah dipakai di baris ${emailBefore}.`));
      seenEmail.set(email, line);
      const owner = userByEmail.get(email);
      if (owner && owner.id !== existing?.id) return void plans.push(tolak(line, row, `Email "${email}" sudah dipakai akun lain.`));
    }

    let regionId: number | null = null;
    if (regionName) {
      regionId = regionByName.get(regionName.toLowerCase()) ?? null;
      if (!regionId) return void plans.push(tolak(line, row, `Wilayah "${regionName}" belum ada. Tambahkan dulu di menu Wilayah.`));
    }
    if (role === "manwil" && !regionId) return void plans.push(tolak(line, row, "Manwil wajib punya wilayah."));

    if (existing && existing.role !== role) {
      return void plans.push(tolak(line, row, `ID "${loginId}" sudah dipakai akun ${existing.role}; peran tidak bisa diubah lewat impor.`));
    }
    if (!existing && !password) return void plans.push(tolak(line, row, "Akun baru wajib punya kata sandi."));
    if (password) {
      const badPassword = checkPassword(password);
      if (badPassword) return void plans.push(tolak(line, row, badPassword.message));
    }

    // Awardee: kode referal yang sudah ada berarti "buatkan akun untuk orang ini", bukan bikin data baru.
    let awardeeId: number | null = existing?.awardee_id ?? null;
    if (role === "awardee" && !existing) {
      if (code) {
        const codeBefore = seenCode.get(code);
        if (codeBefore) return void plans.push(tolak(line, row, `Kode referal "${code}" sudah dipakai di baris ${codeBefore}.`));
        seenCode.set(code, line);

        const known = awardeeByCode.get(code);
        if (known) {
          if (awardeeTaken.has(known.id)) return void plans.push(tolak(line, row, `Awardee "${known.name}" (${code}) sudah punya akun.`));
          awardeeId = known.id;
        }
      }
      if (!awardeeId) {
        if (!regionId) return void plans.push(tolak(line, row, "Awardee baru wajib punya wilayah."));
        if (!batch) return void plans.push(tolak(line, row, "Awardee baru wajib punya angkatan, misalnya BA16."));
        if (!code) return void plans.push(tolak(line, row, "Awardee baru wajib punya kode referal."));
      }
    }

    const input: PersonInput = {
      role,
      loginId,
      name,
      email,
      password,
      status,
      regionId,
      awardeeId,
      batch,
      campus,
      referralCode: code,
    };

    plans.push({
      line,
      action: existing ? "perbarui" : "buat",
      reason: existing
        ? password
          ? "Akun sudah ada — data & kata sandinya diperbarui."
          : "Akun sudah ada — datanya diperbarui, kata sandi tetap."
        : awardeeId
          ? "Akun baru untuk data awardee yang sudah ada."
          : role === "awardee"
            ? "Akun & data awardee baru."
            : "Akun baru.",
      name,
      loginId,
      role,
      userId: existing?.id ?? null,
      input,
    });
  });

  return plans;
}

export type RowResult = { line: number; ok: boolean; message: string };

// Menulis satu potong rencana. Dipanggil berulang per 20 baris supaya satu permintaan tidak kelamaan —
// mengacak kata sandi butuh ~100 ms per baris.
export async function applyPlan(db: D1Database, actor: SessionUser, plans: RowPlan[]): Promise<RowResult[]> {
  assertAdmin(actor);
  const results: RowResult[] = [];

  for (const plan of plans) {
    if (plan.action === "tolak" || !plan.input) {
      results.push({ line: plan.line, ok: false, message: plan.reason });
      continue;
    }
    const written =
      plan.action === "perbarui" && plan.userId
        ? await updatePerson(db, actor, plan.userId, plan.input)
        : await createPerson(db, actor, plan.input);

    results.push({
      line: plan.line,
      ok: written.ok,
      message: written.ok ? (plan.action === "perbarui" ? "Diperbarui." : "Dibuat.") : written.message,
    });
  }

  return results;
}
