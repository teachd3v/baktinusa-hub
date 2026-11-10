// Impor massal orang: akun, data awardee, profil, LeadPro, dan status program dalam SATU berkas.
//
// Alurnya dua langkah dan sengaja begitu: **rencana** dulu (semua baris diperiksa, tidak ada yang ditulis),
// baru **terapkan** setelah Admin melihat apa yang akan terjadi. Berkasnya dibaca di browser — Worker hanya
// menerima baris yang sudah jadi JSON, jadi tidak ada pustaka pembaca Excel yang ikut terbawa ke server.
//
// Penulisannya tetap lewat fungsi yang sama dengan form satuan (createPerson/updatePerson, saveProfile,
// updateLeadpro, setAwardeeStatus), jadi pagar yang berlaku di sana berlaku juga di sini — baris yang sudah
// "lolos" di tahap rencana pun diperiksa ulang saat ditulis.
//
// Aturan isian: sel kosong berarti "biarkan data yang ada". Untuk benar-benar mengosongkan, tulis [kosongkan].

import { writeAudit } from "./audit.ts";
import { toLeadpro, updateLeadpro, validateLeadpro, type Leadpro } from "./leadpro.ts";
import { checkLoginId, checkPassword, normalizeLoginId } from "./password.ts";
import { createPerson, listPeople, updatePerson, type PersonInput } from "./people.ts";
import {
  AWARDEE_STATUSES,
  emptyProfile,
  PROFILE_FIELDS,
  PROFILE_LISTS,
  rowToProfile,
  saveProfile,
  setAwardeeStatus,
  validateProfile,
  type AwardeeStatus,
  type Profile,
} from "./profiles.ts";
import { ScopeError, type Role, type SessionUser } from "./scope.ts";

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengimpor pengguna");
}

// ---------- kolom ----------

const ACCOUNT_HEADERS = ["ID", "Nama", "Email", "Peran", "Wilayah", "Angkatan", "Kode Referal", "Kampus", "Kata Sandi", "Status"] as const;
const PROGRAM_HEADERS = ["Status Awardee", "Tanggal Bergabung"] as const;

type ProfileKey = keyof Profile;
// Judul kolom → isian profil. Judul ini yang dibaca pembaca berkas dan yang tertulis di template.
const PROFILE_COLUMNS: readonly (readonly [header: string, key: ProfileKey])[] = [
  ["Nama Panggilan", "nickname"],
  ["Jenis Kelamin", "gender"],
  ["Tempat Lahir", "birthPlace"],
  ["Tanggal Lahir", "birthDate"],
  ["WhatsApp", "whatsapp"],
  ["Email Pribadi", "personalEmail"],
  ["Alamat Domisili", "address"],
  ["Nama Kontak Darurat", "emergencyName"],
  ["Nomor Kontak Darurat", "emergencyPhone"],
  ["Fakultas", "faculty"],
  ["Program Studi", "studyProgram"],
  ["Tahun Masuk", "entryYear"],
  ["Perkiraan Lulus", "expectedGraduationYear"],
  ["NIM", "studentId"],
  ["Tagline", "tagline"],
  ["Bio", "bio"],
  ["Bidang Minat", "interests"],
  ["Keahlian", "skills"],
  ["Bahasa", "languages"],
  ["Organisasi Utama", "mainOrg"],
  ["Jabatan Organisasi", "mainOrgRole"],
  ["Instagram", "instagram"],
  ["LinkedIn", "linkedin"],
  ["Tautan Lain", "website"],
  ["Motivasi", "motivation"],
  ["Dampak", "impact"],
];
const LEADPRO_HEADERS = ["Nama LeadPro", "Bidang LeadPro", "Deskripsi LeadPro"] as const;

export const TEMPLATE_GROUPS = [
  { title: "Akun", headers: [...ACCOUNT_HEADERS] },
  { title: "Program", headers: [...PROGRAM_HEADERS] },
  { title: "Profil", headers: PROFILE_COLUMNS.map(([h]) => h) },
  { title: "LeadPro", headers: [...LEADPRO_HEADERS] },
] as const;

// Judul kolom template. Pembacanya tidak peka huruf besar-kecil dan spasi berlebih.
export const TEMPLATE_HEADERS: string[] = TEMPLATE_GROUPS.flatMap((g) => [...g.headers]);

const blankRow = (): Record<string, string> => Object.fromEntries(TEMPLATE_HEADERS.map((h) => [h, ""]));

export const TEMPLATE_EXAMPLE: Record<string, string>[] = [
  {
    ...blankRow(),
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
    "Status Awardee": "aktif",
    "Tanggal Bergabung": "2026-08-01",
    "Nama Panggilan": "Nama",
    "Jenis Kelamin": "P",
    "Tempat Lahir": "Bogor",
    "Tanggal Lahir": "2004-05-17",
    WhatsApp: "081234567890",
    "Email Pribadi": "pribadi@contoh.id",
    "Alamat Domisili": "Jl. Contoh No. 1, Dramaga, Bogor",
    "Nama Kontak Darurat": "Nama Orang Tua",
    "Nomor Kontak Darurat": "081200000000",
    Fakultas: "Fakultas Pertanian",
    "Program Studi": "Agribisnis",
    "Tahun Masuk": "2023",
    "Perkiraan Lulus": "2027",
    NIM: "A1234567",
    Tagline: "Menumbuhkan desa lewat pendidikan",
    "Bidang Minat": "Pendidikan, Lingkungan",
    Keahlian: "Public speaking, Desain",
    Bahasa: "Indonesia, Inggris",
    "Nama LeadPro": "Nama Proyek",
    "Bidang LeadPro": "Pendidikan",
    "Deskripsi LeadPro": "Satu kalimat tentang proyek, maksimal 100 karakter.",
  },
  { ...blankRow(), ID: "MW00226", Nama: "Nama Manajer Wilayah", Email: "manwil@contoh.id", Peran: "Manwil", Wilayah: "Bogor", "Kata Sandi": "BA2026", Status: "aktif" },
  { ...blankRow(), ID: "ADM002", Nama: "Nama Admin", Email: "admin2@contoh.id", Peran: "Admin", "Kata Sandi": "BA2026", Status: "aktif" },
];

export type RawRow = Record<string, string>;

// Perubahan di luar akun, hanya untuk Awardee. Yang null tidak disentuh.
export type Extras = {
  status: AwardeeStatus | null;
  joinedAt: string | null; // "" = kosongkan
  profile: Profile | null;
  leadpro: Leadpro | null;
};

export type RowPlan = {
  line: number;
  action: "buat" | "perbarui" | "tetap" | "tolak";
  reason: string;
  warnings: string[];
  name: string;
  loginId: string;
  role: Role | null;
  userId: number | null;
  input: PersonInput | null;
  accountChanged: boolean;
  extras: Extras | null;
};

const pick = (row: RawRow, key: string) => {
  const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key.toLowerCase());
  return (found ? row[found] ?? "" : "").toString().trim();
};

const CLEAR = /^\[kosongkan\]$/i;

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
  aktif: "active",
  active: "active",
  nonaktif: "disabled",
  "non-aktif": "disabled",
  disabled: "disabled",
  off: "disabled",
};

const AWARDEE_STATUS_OF: Record<string, AwardeeStatus> = {
  aktif: "active",
  active: "active",
  lulus: "graduated",
  graduated: "graduated",
  dicabut: "revoked",
  revoked: "revoked",
};

// ---------- membaca isian ----------

// Excel mengubah tanggal jadi angka seri dan sering membuang nol di depan nomor telepon; keduanya dipulihkan di sini.
function normalizeDate(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/);
  if (iso) return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]!.padStart(2, "0")}-${dmy[1]!.padStart(2, "0")}`;
  if (/^\d{5,6}(\.\d+)?$/.test(raw)) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(raw)) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }
  return raw;
}

const normalizePhoneCell = (raw: string) => (/^8\d{8,13}$/.test(raw.replace(/[\s-]/g, "")) ? `0${raw.replace(/[\s-]/g, "")}` : raw);

function normalizeGender(raw: string): string {
  const v = raw.toLowerCase();
  if (["l", "laki-laki", "laki laki", "pria", "male"].includes(v)) return "L";
  if (["p", "perempuan", "wanita", "female"].includes(v)) return "P";
  return raw;
}

const splitList = (raw: string) => raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

function profileCell(key: ProfileKey, raw: string): string {
  switch (key) {
    case "birthDate":
      return normalizeDate(raw);
    case "gender":
      return normalizeGender(raw);
    case "whatsapp":
    case "emergencyPhone":
      return normalizePhoneCell(raw);
    default:
      return raw;
  }
}

const labelOf = (key: ProfileKey): string =>
  PROFILE_FIELDS.find((f) => f.key === key)?.label ?? PROFILE_LISTS.find((l) => l.key === key)?.label ?? key;

const tolak = (line: number, row: RawRow, reason: string): RowPlan => ({
  line,
  action: "tolak",
  reason,
  warnings: [],
  name: pick(row, "Nama"),
  loginId: pick(row, "ID"),
  role: null,
  userId: null,
  input: null,
  accountChanged: false,
  extras: null,
});

const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

type Seen = Map<string, { line: number; loginId: string }>;
type Index = Map<string, number[]>;

const addTo = (index: Index, key: string, id: number) => {
  if (!key) return;
  const list = index.get(key) ?? [];
  list.push(id);
  index.set(key, list);
};

// Memeriksa seluruh berkas tanpa menulis apa pun. Yang dicek: bentuk isian, bentrok dengan data yang sudah
// ada, dan bentrok antarbaris di dalam berkas itu sendiri.
export async function planImport(db: D1Database, actor: SessionUser, rows: RawRow[]): Promise<RowPlan[]> {
  assertAdmin(actor);

  const [{ results: regions }, { results: users }, { results: awardees }, { results: campuses }, { results: profileRows }, { results: leadproRows }, { results: fieldRows }] =
    await Promise.all([
      db.prepare("SELECT id, name FROM regions").all<{ id: number; name: string }>(),
      db
        .prepare("SELECT id, login_id, email, name, role, status, region_id, awardee_id FROM users")
        .all<{ id: number; login_id: string | null; email: string; name: string; role: Role; status: "active" | "disabled"; region_id: number | null; awardee_id: number | null }>(),
      db
        .prepare("SELECT id, referral_code, name, batch, region_id, campus_id, status, joined_at FROM awardees")
        .all<{ id: number; referral_code: string; name: string; batch: string; region_id: number; campus_id: number | null; status: AwardeeStatus; joined_at: string | null }>(),
      db.prepare("SELECT id, region_id, name FROM campuses").all<{ id: number; region_id: number; name: string }>(),
      db.prepare("SELECT * FROM awardee_profiles").all<Record<string, unknown>>(),
      db
        .prepare("SELECT l.awardee_id, l.name, f.name AS field, l.description FROM leadpros l LEFT JOIN leadpro_fields f ON f.id = l.field_id")
        .all<{ awardee_id: number; name: string; field: string | null; description: string | null }>(),
      db.prepare("SELECT name FROM leadpro_fields ORDER BY name COLLATE NOCASE").all<{ name: string }>(),
    ]);

  const regionByName = new Map(regions.map((r) => [r.name.toLowerCase(), r.id]));
  // Kampus dikunci per wilayah: dua wilayah boleh punya kampus bernama sama, dan yang dipakai
  // harus kampus milik wilayah di baris itu.
  const campusByRegionName = new Map(campuses.map((c) => [`${c.region_id}|${c.name.toLowerCase()}`, c.id]));
  const userByLoginId = new Map(users.filter((u) => u.login_id).map((u) => [u.login_id!.toUpperCase(), u]));
  const userByEmail = new Map(users.map((u) => [u.email.toLowerCase(), u]));
  const awardeeByCode = new Map(awardees.map((a) => [a.referral_code.toUpperCase(), a]));
  const awardeeById = new Map(awardees.map((a) => [a.id, a]));
  const awardeeTaken = new Set(users.filter((u) => u.awardee_id).map((u) => u.awardee_id!));
  const profileByAwardee = new Map(profileRows.map((r) => [r.awardee_id as number, rowToProfile(r)]));
  const leadproByAwardee = new Map(leadproRows.map((r) => [r.awardee_id, toLeadpro(r.name, r.field, r.description)]));
  const fieldNames = fieldRows.map((f) => f.name);

  // Indeks untuk peringatan duplikat: nilai → awardee yang sudah memilikinya.
  const nameIndex: Index = new Map();
  const emailIndex: Index = new Map();
  const nimIndex: Index = new Map();
  const phoneIndex: Index = new Map();
  const projectIndex: Index = new Map();
  for (const a of awardees) addTo(nameIndex, normName(a.name), a.id);
  for (const [id, p] of profileByAwardee) {
    addTo(emailIndex, p.personalEmail.toLowerCase(), id);
    addTo(nimIndex, p.studentId.toLowerCase(), id);
    addTo(phoneIndex, p.whatsapp, id);
  }
  for (const [id, l] of leadproByAwardee) addTo(projectIndex, normName(l.name), id);

  const seenId = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const seenCode = new Map<string, number>();
  const seenName: Seen = new Map();
  const seenPersonalEmail: Seen = new Map();
  const seenNim: Seen = new Map();
  const seenPhone: Seen = new Map();
  const seenProject: Seen = new Map();
  const plans: RowPlan[] = [];

  rows.forEach((row, index) => {
    const line = index + 2; // baris 1 di berkas adalah judul kolom
    const loginId = normalizeLoginId(pick(row, "ID"));
    const name = pick(row, "Nama");
    const roleText = pick(row, "Peran").toLowerCase();
    const regionName = pick(row, "Wilayah");
    const batch = pick(row, "Angkatan").toUpperCase();
    const code = pick(row, "Kode Referal").toUpperCase();
    const campus = pick(row, "Kampus");
    const password = pick(row, "Kata Sandi");
    const statusText = pick(row, "Status").toLowerCase();

    // Baris kosong di ujung berkas sering ikut terbawa dari Excel; dilewati diam-diam, bukan jadi galat.
    if (!loginId && !name && !pick(row, "Email") && !roleText) return;

    const badId = checkLoginId(loginId);
    if (badId) return void plans.push(tolak(line, row, badId.message));

    const role = ROLE_OF[roleText];
    if (!role) return void plans.push(tolak(line, row, `Peran "${pick(row, "Peran")}" tidak dikenal. Isi Admin, Manwil, atau Awardee.`));

    const existing = userByLoginId.get(loginId);
    const existingAwardee = existing?.awardee_id ? awardeeById.get(existing.awardee_id) : undefined;

    // Status kosong pada akun yang sudah ada berarti "biarkan", bukan "aktifkan lagi".
    const status = statusText === "" ? (existing?.status ?? "active") : STATUS_OF[statusText];
    if (!status) return void plans.push(tolak(line, row, `Status "${pick(row, "Status")}" tidak dikenal. Isi aktif atau nonaktif.`));

    if (!name) return void plans.push(tolak(line, row, "Nama wajib diisi."));
    const email = (pick(row, "Email") || existing?.email || "").toLowerCase();

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
    } else if (role === "manwil" && existing) {
      regionId = existing.region_id;
    }
    if (role === "manwil" && !regionId) return void plans.push(tolak(line, row, "Manwil wajib punya wilayah."));

    // Kampus sengaja TIDAK dibuat otomatis dari berkas. Kalau salah ketik jadi kampus baru, daftar
    // pilihannya akan berisi banyak ejaan untuk satu kampus — persis masalah yang tabel ini hindari.
    let campusId: number | null = null;
    if (campus) {
      if (!regionId) return void plans.push(tolak(line, row, `Kampus "${campus}" perlu wilayah; isi dulu kolom Wilayah.`));
      campusId = campusByRegionName.get(`${regionId}|${campus.toLowerCase()}`) ?? null;
      if (!campusId) {
        return void plans.push(
          tolak(line, row, `Kampus "${campus}" belum ada di wilayah ${regionName}. Tambahkan dulu lewat menu Wilayah.`),
        );
      }
    } else if (existingAwardee && (!regionId || regionId === existingAwardee.region_id)) {
      campusId = existingAwardee.campus_id; // kosong = biarkan
    }

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

    // ----- kolom di luar akun: hanya untuk Awardee -----
    const profileCells = PROFILE_COLUMNS.filter(([h]) => pick(row, h) !== "");
    const leadproCells = LEADPRO_HEADERS.filter((h) => pick(row, h) !== "");
    const programCells = PROGRAM_HEADERS.filter((h) => pick(row, h) !== "");
    if (role !== "awardee" && profileCells.length + leadproCells.length + programCells.length > 0) {
      return void plans.push(tolak(line, row, "Kolom profil, LeadPro, dan program hanya untuk Awardee. Kosongkan untuk Admin dan Manwil."));
    }

    const changes: string[] = [];
    const extras: Extras = { status: null, joinedAt: null, profile: null, leadpro: null };
    const warnings: string[] = [];
    const isNewAwardee = role === "awardee" && !awardeeId;

    if (role === "awardee") {
      // Profil: nilai yang ada ditimpa hanya oleh sel yang terisi.
      const base = (awardeeId && profileByAwardee.get(awardeeId)) || emptyProfile();
      if (profileCells.length > 0) {
        const merged: Profile = { ...base, interests: [...base.interests], skills: [...base.skills], languages: [...base.languages] };
        for (const [header, key] of profileCells) {
          const raw = pick(row, header);
          if (PROFILE_LISTS.some((l) => l.key === key)) (merged as Record<string, unknown>)[key] = CLEAR.test(raw) ? [] : splitList(raw);
          else (merged as Record<string, unknown>)[key] = CLEAR.test(raw) ? "" : profileCell(key, raw);
        }
        const checked = validateProfile(merged);
        if (!checked.ok) return void plans.push(tolak(line, row, checked.message));
        const changed = profileCells.map(([, key]) => key).filter((key) => JSON.stringify(base[key]) !== JSON.stringify(checked.value[key]));
        if (changed.length > 0) {
          extras.profile = checked.value;
          changes.push(`profil: ${changed.map(labelOf).join(", ")}`);
        }

        // Peringatan duplikat: nilai yang sama dengan awardee lain, di database maupun di baris lain berkas ini.
        const check = (label: string, value: string, index: Index, seen: Seen, touched: boolean) => {
          if (!value || !touched) return;
          const others = (index.get(value) ?? []).filter((id) => id !== awardeeId);
          if (others.length > 0) {
            const who = others.slice(0, 2).map((id) => awardeeById.get(id)?.name ?? "awardee lain").join(", ");
            warnings.push(`${label} sama dengan milik ${who}.`);
          }
          const before = seen.get(value);
          if (before && before.loginId !== loginId) warnings.push(`${label} sama dengan baris ${before.line}.`);
          seen.set(value, { line, loginId });
        };
        const touched = (key: ProfileKey) => changed.includes(key);
        check("Email pribadi", checked.value.personalEmail.toLowerCase(), emailIndex, seenPersonalEmail, touched("personalEmail"));
        check("NIM", checked.value.studentId.toLowerCase(), nimIndex, seenNim, touched("studentId"));
        check("Nomor WhatsApp", checked.value.whatsapp, phoneIndex, seenPhone, touched("whatsapp"));
      }

      // LeadPro: bidang harus sudah ada di tabel acuan (sama seperti kampus, tidak dibuat otomatis dari berkas).
      if (leadproCells.length > 0) {
        const base = (awardeeId && leadproByAwardee.get(awardeeId)) || toLeadpro("", "", "");
        const merged = { ...base };
        const set = (header: string, key: keyof Leadpro) => {
          const raw = pick(row, header);
          if (raw) merged[key] = CLEAR.test(raw) ? "" : raw;
        };
        set("Nama LeadPro", "name");
        set("Bidang LeadPro", "field");
        set("Deskripsi LeadPro", "description");
        if (merged.field) {
          const hit = fieldNames.find((f) => f.toLowerCase() === merged.field.toLowerCase());
          if (!hit) {
            return void plans.push(tolak(line, row, `Bidang LeadPro "${merged.field}" belum ada. Pilihan: ${fieldNames.join(", ")}.`));
          }
          merged.field = hit;
        }
        const checked = validateLeadpro(merged);
        if (!checked.ok) return void plans.push(tolak(line, row, checked.message));
        const changed = [
          base.name !== checked.value.name && "nama",
          base.field !== checked.value.field && "bidang",
          base.description !== checked.value.description && "deskripsi",
        ].filter(Boolean);
        if (changed.length > 0) {
          extras.leadpro = checked.value;
          changes.push(`LeadPro: ${changed.join(", ")}`);
          const projectName = normName(checked.value.name);
          if (projectName && base.name !== checked.value.name) {
            const others = (projectIndex.get(projectName) ?? []).filter((id) => id !== awardeeId);
            if (others.length > 0) warnings.push(`Nama LeadPro sama dengan milik ${awardeeById.get(others[0]!)?.name ?? "awardee lain"}.`);
            const before = seenProject.get(projectName);
            if (before && before.loginId !== loginId) warnings.push(`Nama LeadPro sama dengan baris ${before.line}.`);
            seenProject.set(projectName, { line, loginId });
          }
        }
      }

      // Status program dan tanggal bergabung.
      if (programCells.length > 0) {
        const statusRaw = pick(row, "Status Awardee");
        const joinedRaw = pick(row, "Tanggal Bergabung");
        if (statusRaw) {
          const value = AWARDEE_STATUS_OF[statusRaw.toLowerCase()];
          if (!value) return void plans.push(tolak(line, row, `Status Awardee "${statusRaw}" tidak dikenal. Isi aktif, lulus, atau dicabut.`));
          if (value !== (existingAwardee?.status ?? "active") || isNewAwardee) {
            extras.status = value;
            changes.push(`status ${AWARDEE_STATUSES.find((s) => s.value === value)!.label.toLowerCase()}`);
          }
        }
        if (joinedRaw) {
          const value = CLEAR.test(joinedRaw) ? "" : normalizeDate(joinedRaw);
          if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return void plans.push(tolak(line, row, `Tanggal bergabung "${joinedRaw}" tidak valid. Tulis 2026-08-01 atau 01/08/2026.`));
          }
          if (value !== (existingAwardee?.joined_at ?? "")) {
            extras.joinedAt = value;
            changes.push("tanggal bergabung");
          }
        }
      }

      // Nama kembar: hanya peringatan, karena orang berbeda memang bisa bernama sama.
      const nameKey = normName(name);
      const sameName = (nameIndex.get(nameKey) ?? []).filter((id) => id !== awardeeId);
      if (sameName.length > 0 && (isNewAwardee || nameKey !== normName(existingAwardee?.name ?? ""))) {
        warnings.push(`Nama sama dengan awardee lain (${sameName.length} orang). Pastikan bukan data ganda.`);
      }
      const nameBefore = seenName.get(nameKey);
      if (nameBefore && nameBefore.loginId !== loginId) warnings.push(`Nama sama dengan baris ${nameBefore.line}. Pastikan bukan data ganda.`);
      seenName.set(nameKey, { line, loginId });
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
      campusId,
      referralCode: code,
    };

    const hasExtras = Object.values(extras).some((v) => v !== null);
    const accountSame = Boolean(
      existing &&
        !password &&
        name === existing.name &&
        email === existing.email.toLowerCase() &&
        status === existing.status &&
        (role !== "manwil" || regionId === existing.region_id) &&
        (role !== "awardee" ||
          !existingAwardee ||
          (name === existingAwardee.name &&
            (!regionId || regionId === existingAwardee.region_id) &&
            (!batch || batch === existingAwardee.batch) &&
            campusId === existingAwardee.campus_id &&
            (!code || code === existingAwardee.referral_code))),
    );

    if (existing && accountSame && !hasExtras) {
      return void plans.push({ ...tolak(line, row, "Tidak ada yang berubah."), action: "tetap", role, userId: existing.id });
    }

    const base = existing
      ? password
        ? "Akun sudah ada — data & kata sandinya diperbarui."
        : "Akun sudah ada — datanya diperbarui, kata sandi tetap."
      : awardeeId
        ? "Akun baru untuk data awardee yang sudah ada."
        : role === "awardee"
          ? "Akun & data awardee baru."
          : "Akun baru.";

    plans.push({
      line,
      action: existing ? "perbarui" : "buat",
      reason: changes.length > 0 ? `${base} Ikut berubah: ${changes.join("; ")}.` : base,
      warnings,
      name,
      loginId,
      role,
      userId: existing?.id ?? null,
      input,
      accountChanged: !accountSame,
      extras: hasExtras ? extras : null,
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
    if (plan.action === "tetap") {
      results.push({ line: plan.line, ok: true, message: "Tidak berubah." });
      continue;
    }
    if (plan.action === "tolak" || !plan.input) {
      results.push({ line: plan.line, ok: false, message: plan.reason });
      continue;
    }

    let userId = plan.userId;
    if (plan.action === "perbarui" && plan.userId) {
      if (plan.accountChanged) {
        const written = await updatePerson(db, actor, plan.userId, plan.input);
        if (!written.ok) {
          results.push({ line: plan.line, ok: false, message: written.message });
          continue;
        }
      }
    } else {
      const written = await createPerson(db, actor, plan.input);
      if (!written.ok) {
        results.push({ line: plan.line, ok: false, message: written.message });
        continue;
      }
      userId = written.userId;
    }

    const done = plan.action === "perbarui" ? "Diperbarui." : "Dibuat.";
    if (!plan.extras || plan.input.role !== "awardee") {
      results.push({ line: plan.line, ok: true, message: done });
      continue;
    }

    // Data awardee dicari dari akunnya, bukan dari isi rencana yang dikirim browser.
    const owner = await db.prepare("SELECT awardee_id FROM users WHERE id = ?").bind(userId).first<{ awardee_id: number | null }>();
    const awardeeId = owner?.awardee_id;
    if (!awardeeId) {
      results.push({ line: plan.line, ok: false, message: "Akun tersimpan, tetapi tidak terhubung ke data awardee." });
      continue;
    }

    const problems: string[] = [];
    const { extras } = plan;
    if (extras.profile) {
      const r = await saveProfile(db, actor, awardeeId, extras.profile);
      if (!r.ok) problems.push(`Profil: ${r.message}`);
    }
    if (extras.leadpro) {
      const r = await updateLeadpro(db, actor, awardeeId, extras.leadpro);
      if (!r.ok) problems.push(`LeadPro: ${r.message}`);
    }
    if (extras.status !== null || extras.joinedAt !== null) {
      const current = await db.prepare("SELECT status, joined_at FROM awardees WHERE id = ?").bind(awardeeId).first<{ status: AwardeeStatus; joined_at: string | null }>();
      const r = await setAwardeeStatus(db, actor, awardeeId, extras.status ?? current?.status ?? "active", extras.joinedAt ?? current?.joined_at ?? "");
      if (!r.ok) problems.push(`Program: ${r.message}`);
    }

    results.push(
      problems.length > 0
        ? { line: plan.line, ok: false, message: `Akun tersimpan, tetapi ${problems.join(" ")}` }
        : { line: plan.line, ok: true, message: done },
    );
  }

  return results;
}

// ---------- unduh data saat ini ----------

// Seluruh data orang dalam bentuk baris template, supaya Admin bisa mengubahnya di Excel lalu mengunggah lagi.
// Kata sandi tidak pernah ikut. Berkasnya memuat data pribadi, jadi pengunduhan dicatat di Jejak perubahan.
export async function exportCurrentRows(db: D1Database, actor: SessionUser): Promise<RawRow[]> {
  assertAdmin(actor);
  const [people, { results: profileRows }, { results: leadproRows }, { results: awardeeRows }] = await Promise.all([
    listPeople(db, actor),
    db.prepare("SELECT * FROM awardee_profiles").all<Record<string, unknown>>(),
    db
      .prepare("SELECT l.awardee_id, l.name, f.name AS field, l.description FROM leadpros l LEFT JOIN leadpro_fields f ON f.id = l.field_id")
      .all<{ awardee_id: number; name: string; field: string | null; description: string | null }>(),
    db.prepare("SELECT id, status, joined_at FROM awardees").all<{ id: number; status: AwardeeStatus; joined_at: string | null }>(),
  ]);
  const profiles = new Map(profileRows.map((r) => [r.awardee_id as number, rowToProfile(r)]));
  const leadpros = new Map(leadproRows.map((r) => [r.awardee_id, toLeadpro(r.name, r.field, r.description)]));
  const awardees = new Map(awardeeRows.map((a) => [a.id, a]));

  const roleLabel = { admin: "Admin", manwil: "Manwil", awardee: "Awardee" } as const;
  const rows = people.map((p) => {
    const row = blankRow();
    row.ID = p.loginId ?? "";
    row.Nama = p.name;
    row.Email = p.email ?? "";
    row.Peran = roleLabel[p.role ?? "awardee"];
    row.Wilayah = p.region ?? "";
    row.Angkatan = p.batch ?? "";
    row["Kode Referal"] = p.referralCode ?? "";
    row.Kampus = p.campus ?? "";
    row.Status = p.status === "disabled" ? "nonaktif" : "aktif";

    const awardee = p.awardeeId ? awardees.get(p.awardeeId) : undefined;
    if (awardee) {
      row["Status Awardee"] = { active: "aktif", graduated: "lulus", revoked: "dicabut" }[awardee.status];
      row["Tanggal Bergabung"] = awardee.joined_at ?? "";
    }
    const profile = p.awardeeId ? profiles.get(p.awardeeId) : undefined;
    if (profile) {
      for (const [header, key] of PROFILE_COLUMNS) {
        const value = profile[key];
        row[header] = Array.isArray(value) ? value.join(", ") : value;
      }
    }
    const leadpro = p.awardeeId ? leadpros.get(p.awardeeId) : undefined;
    if (leadpro) {
      row["Nama LeadPro"] = leadpro.name;
      row["Bidang LeadPro"] = leadpro.field;
      row["Deskripsi LeadPro"] = leadpro.description;
    }
    return row;
  });

  await writeAudit(db, actor, {
    action: "impor.unduh-data",
    entity: "user",
    summary: `Mengunduh data ${rows.length} orang sebagai berkas impor (memuat data pribadi)`,
  });
  return rows;
}
