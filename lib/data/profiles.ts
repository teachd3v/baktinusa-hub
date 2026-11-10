// Profil awardee: data personal, akademik, dan branding aktivis. Awardee mengisi sendiri, Admin bisa mengedit semuanya,
// Manwil hanya membaca profil wilayahnya (tanpa tanggal lahir).
//
// Semua pembacaan lewat Scope, seperti data awardee lainnya. Kolom skalar di sisi aplikasi selalu string ("" = kosong),
// supaya form tidak perlu membedakan null dan kosong; di basis data yang kosong disimpan sebagai NULL.

import { writeAudit } from "./audit.ts";
import type { Fail } from "./admin-periods.ts";
import { toLeadpro, type Leadpro } from "./leadpro.ts";
import { awardeeFilter, ScopeError, scopeFor, type SessionUser } from "./scope.ts";

export const GENDERS = [
  { value: "L", label: "Laki-laki" },
  { value: "P", label: "Perempuan" },
] as const;
export const INTEREST_OPTIONS = [
  "Pendidikan",
  "Lingkungan",
  "Kesehatan",
  "Ekonomi dan kewirausahaan",
  "Teknologi",
  "Sosial dan kemanusiaan",
  "Budaya dan seni",
  "Hukum dan HAM",
  "Politik dan kebijakan",
  "Pertanian dan pangan",
] as const;
export const AWARDEE_STATUSES = [
  { value: "active", label: "Aktif" },
  { value: "graduated", label: "Lulus" },
  { value: "revoked", label: "Dicabut" },
] as const;
export type AwardeeStatus = (typeof AWARDEE_STATUSES)[number]["value"];

type Kind = "text" | "year" | "date";
type FieldDef = { key: string; column: string; label: string; kind: Kind; max: number; required?: boolean };

// Satu tabel untuk semua kolom skalar: validasi, penyimpanan, dan kelengkapan membaca dari sini.
const FIELDS = [
  { key: "nickname", column: "nickname", label: "Nama panggilan", kind: "text", max: 40, required: true },
  { key: "gender", column: "gender", label: "Jenis kelamin", kind: "text", max: 1, required: true },
  { key: "birthPlace", column: "birth_place", label: "Tempat lahir", kind: "text", max: 80, required: true },
  { key: "birthDate", column: "birth_date", label: "Tanggal lahir", kind: "date", max: 10, required: true },
  { key: "whatsapp", column: "whatsapp", label: "No. WhatsApp", kind: "text", max: 20, required: true },
  { key: "personalEmail", column: "personal_email", label: "Email pribadi", kind: "text", max: 120, required: true },
  { key: "address", column: "address", label: "Alamat domisili", kind: "text", max: 250, required: true },
  { key: "emergencyName", column: "emergency_name", label: "Nama kontak darurat", kind: "text", max: 120, required: true },
  { key: "emergencyPhone", column: "emergency_phone", label: "Nomor kontak darurat", kind: "text", max: 20, required: true },
  { key: "faculty", column: "faculty", label: "Fakultas", kind: "text", max: 120, required: true },
  { key: "studyProgram", column: "study_program", label: "Program studi", kind: "text", max: 120, required: true },
  { key: "entryYear", column: "entry_year", label: "Tahun masuk", kind: "year", max: 4, required: true },
  { key: "expectedGraduationYear", column: "expected_graduation_year", label: "Perkiraan lulus", kind: "year", max: 4, required: true },
  { key: "studentId", column: "student_id", label: "NIM", kind: "text", max: 30 },
  { key: "tagline", column: "tagline", label: "Tagline", kind: "text", max: 100, required: true },
  { key: "bio", column: "bio", label: "Bio singkat", kind: "text", max: 500, required: true },
  { key: "mainOrg", column: "main_org", label: "Organisasi utama", kind: "text", max: 120 },
  { key: "mainOrgRole", column: "main_org_role", label: "Jabatan di organisasi utama", kind: "text", max: 80 },
  { key: "instagram", column: "instagram", label: "Instagram", kind: "text", max: 120 },
  { key: "linkedin", column: "linkedin", label: "LinkedIn", kind: "text", max: 200 },
  { key: "website", column: "website", label: "Tautan lain", kind: "text", max: 200 },
  { key: "motivation", column: "motivation", label: "Motivasi bergabung", kind: "text", max: 500 },
  { key: "impact", column: "impact", label: "Dampak yang ingin dicapai", kind: "text", max: 500 },
] as const satisfies readonly FieldDef[];

export const PROFILE_FIELDS = FIELDS;
type ScalarKey = (typeof FIELDS)[number]["key"];
const LISTS = [
  { key: "interests", column: "interests", label: "Bidang minat", max: 8 },
  { key: "skills", column: "skills", label: "Keahlian", max: 10 },
  { key: "languages", column: "languages", label: "Bahasa", max: 6 },
] as const;
export const PROFILE_LISTS = LISTS;
type ListKey = (typeof LISTS)[number]["key"];

export type Profile = { [K in ScalarKey]: string } & { [K in ListKey]: string[] };
export type ProfileMeta = { exists: boolean; consentAt: string | null; updatedAt: string | null };

// Hanya terlihat oleh pemiliknya dan Admin. Kontak darurat sengaja tidak di sini: Manwil perlu menghubunginya saat darurat.
const PRIVATE_FOR_MANWIL: ScalarKey[] = ["birthDate"];

export function emptyProfile(): Profile {
  const base = {} as Record<string, string | string[]>;
  for (const f of FIELDS) base[f.key] = "";
  for (const l of LISTS) base[l.key] = [];
  return base as Profile;
}

const parseList = (raw: unknown): string[] => {
  try {
    const value = JSON.parse(String(raw ?? "[]"));
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
};

export function rowToProfile(row: Record<string, unknown> | null): Profile {
  const profile = emptyProfile();
  if (!row) return profile;
  for (const f of FIELDS) {
    const v = row[f.column];
    (profile as Record<string, unknown>)[f.key] = v === null || v === undefined ? "" : String(v);
  }
  for (const l of LISTS) (profile as Record<string, unknown>)[l.key] = parseList(row[l.column]);
  return profile;
}

// ---------- kelengkapan ----------

export type Completeness = { percent: number; done: number; total: number; missing: string[] };

// Kolom wajib ditambah persetujuan data. Dihitung tiap kali dibaca, tidak disimpan.
export function completeness(profile: Profile, consentAt: string | null): Completeness {
  const required = FIELDS.filter((f) => "required" in f && f.required);
  const missing: string[] = required.filter((f) => !profile[f.key].trim()).map((f) => f.label);
  if (!consentAt) missing.push("Persetujuan penggunaan data");
  const total = required.length + 1;
  const done = total - missing.length;
  return { percent: Math.round((done / total) * 100), done, total, missing };
}

// ---------- validasi ----------

export type ProfileInput = Profile;

const isBlank = (s: string) => s.trim() === "";
const clean = (s: unknown) => String(s ?? "").replace(/\s+/g, " ").trim();

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[\s().-]/g, "");
  if (!/^\+?\d{8,15}$/.test(digits)) return null;
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+62${digits.slice(1)}`;
  if (digits.startsWith("62")) return `+${digits}`;
  return `+${digits}`;
}

function normalizeUrl(raw: string): string | null {
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

const validDate = (s: string, today: Date): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false;
  const year = Number(s.slice(0, 4));
  return year >= 1950 && year <= today.getUTCFullYear() - 14;
};

export function validateProfile(input: ProfileInput, today = new Date()): { ok: true; value: Profile } | Fail {
  const value = emptyProfile();
  const bad = (message: string): Fail => ({ ok: false, message });

  for (const f of FIELDS) {
    // Bio, motivasi, dan dampak boleh berparagraf, jadi hanya spasi di ujung yang dibuang.
    const multiline = f.key === "bio" || f.key === "motivation" || f.key === "impact";
    const raw = multiline ? String(input[f.key] ?? "").replace(/\r\n/g, "\n").trim() : clean(input[f.key]);
    if (raw.length > f.max) return bad(`${f.label} terlalu panjang (maksimal ${f.max} karakter).`);
    (value as Record<string, unknown>)[f.key] = raw;
  }

  if (value.gender && !GENDERS.some((g) => g.value === value.gender)) return bad("Jenis kelamin tidak dikenal.");
  if (value.birthDate && !validDate(value.birthDate, today)) return bad("Tanggal lahir tidak valid.");

  for (const key of ["whatsapp", "emergencyPhone"] as const) {
    if (isBlank(value[key])) continue;
    const phone = normalizePhone(value[key]);
    if (!phone) return bad(`${key === "whatsapp" ? "No. WhatsApp" : "Nomor kontak darurat"} tidak valid. Contoh: 081234567890.`);
    value[key] = phone;
  }
  if (isBlank(value.emergencyName) !== isBlank(value.emergencyPhone)) {
    return bad("Kontak darurat diisi lengkap (nama dan nomor), atau dikosongkan dua-duanya.");
  }

  if (value.personalEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.personalEmail)) return bad("Email pribadi tidak valid.");

  const thisYear = today.getUTCFullYear();
  for (const key of ["entryYear", "expectedGraduationYear"] as const) {
    if (isBlank(value[key])) continue;
    const year = Number(value[key]);
    if (!Number.isInteger(year) || year < 2000 || year > thisYear + 10) return bad(`${key === "entryYear" ? "Tahun masuk" : "Perkiraan lulus"} tidak valid.`);
  }
  if (value.entryYear && value.expectedGraduationYear && Number(value.expectedGraduationYear) < Number(value.entryYear)) {
    return bad("Perkiraan lulus tidak boleh lebih awal dari tahun masuk.");
  }

  if (value.instagram) {
    const handle = value.instagram.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/^@/, "").replace(/\/.*$/, "");
    if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return bad("Instagram tidak valid. Tulis nama akunnya saja, misalnya baktinusa.");
    value.instagram = handle;
  }
  if (value.linkedin) {
    const url = normalizeUrl(value.linkedin);
    if (!url || !/(^|\.)linkedin\.com$/i.test(new URL(url).hostname)) return bad("Tautan LinkedIn tidak valid.");
    value.linkedin = url;
  }
  if (value.website) {
    const url = normalizeUrl(value.website);
    if (!url) return bad("Tautan lain tidak valid.");
    value.website = url;
  }
  if (value.linkedin.length > 200 || value.website.length > 200) return bad("Tautan terlalu panjang (maksimal 200 karakter).");

  for (const l of LISTS) {
    const seen = new Set<string>();
    const items: string[] = [];
    for (const item of input[l.key] ?? []) {
      const text = clean(item);
      if (!text) continue;
      if (text.length > 40) return bad(`Setiap isian ${l.label.toLowerCase()} maksimal 40 karakter.`);
      if (seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      items.push(text);
    }
    if (items.length > l.max) return bad(`${l.label} maksimal ${l.max} isian.`);
    value[l.key] = items;
  }
  return { ok: true, value };
}

// ---------- membaca ----------

export type ProfileView = {
  awardee: {
    id: number;
    name: string;
    batch: string;
    region: string;
    campus: string | null;
    status: AwardeeStatus;
    joinedAt: string | null;
    referralCode: string;
  };
  profile: Profile;
  meta: ProfileMeta;
  completeness: Completeness;
  // Leadership Project awardee; null kalau belum diisi Admin.
  leadpro: Leadpro | null;
};

// Profil satu awardee, disaring menurut peran: awardee hanya dirinya, Manwil hanya wilayahnya (dan tanpa kolom
// pribadi), Admin semuanya. Di luar lingkup hasilnya null, sama seperti awardee yang tidak ada.
export async function getProfileView(db: D1Database, user: SessionUser, awardeeId: number): Promise<ProfileView | null> {
  const scope = scopeFor(user);
  const f = awardeeFilter(scope);
  const a = await db
    .prepare(
      `SELECT a.id, a.name, a.batch, a.status, a.joined_at, a.referral_code, r.name AS region, c.name AS campus,
              l.name AS leadpro_name, lf.name AS leadpro_field, l.description AS leadpro_description
       FROM awardees a JOIN regions r ON r.id = a.region_id LEFT JOIN campuses c ON c.id = a.campus_id
       LEFT JOIN leadpros l ON l.awardee_id = a.id LEFT JOIN leadpro_fields lf ON lf.id = l.field_id
       WHERE ${f.sql} AND a.id = ?`,
    )
    .bind(...f.params, awardeeId)
    .first<{ id: number; name: string; batch: string; status: AwardeeStatus; joined_at: string | null; referral_code: string; region: string; campus: string | null; leadpro_name: string | null; leadpro_field: string | null; leadpro_description: string | null }>();
  if (!a) return null;
  const leadpro = toLeadpro(a.leadpro_name, a.leadpro_field, a.leadpro_description);

  const row = await db.prepare("SELECT * FROM awardee_profiles WHERE awardee_id = ?").bind(awardeeId).first<Record<string, unknown>>();
  const profile = rowToProfile(row);
  const consentAt = row ? (row.consent_at as string | null) : null;
  // Kelengkapan dihitung sebelum kolom pribadi dikosongkan: Manwil melihat persen yang sama dengan Admin.
  const done = completeness(profile, consentAt);
  if (user.role === "manwil") for (const key of PRIVATE_FOR_MANWIL) profile[key] = "";

  return {
    awardee: {
      id: a.id,
      name: a.name,
      batch: a.batch,
      region: a.region,
      campus: a.campus,
      status: a.status,
      joinedAt: a.joined_at,
      referralCode: a.referral_code,
    },
    profile,
    meta: { exists: Boolean(row), consentAt, updatedAt: row ? (row.updated_at as string) : null },
    completeness: done,
    leadpro: leadpro.name ? leadpro : null,
  };
}

export type ProfileListRow = {
  awardeeId: number;
  name: string;
  batch: string;
  region: string;
  campus: string | null;
  status: AwardeeStatus;
  percent: number;
  missingCount: number;
  updatedAt: string | null;
};

// Daftar kelengkapan untuk Admin (semua) dan Manwil (wilayahnya). Awardee tidak punya daftar.
export async function listProfileStatus(db: D1Database, user: SessionUser): Promise<ProfileListRow[]> {
  if (user.role === "awardee") throw new ScopeError("Awardee tidak boleh melihat daftar profil");
  const f = awardeeFilter(scopeFor(user));
  const { results } = await db
    .prepare(
      `SELECT a.id AS aid, a.name AS awardee_name, a.batch, a.status, r.name AS region, c.name AS campus, p.*
       FROM awardees a JOIN regions r ON r.id = a.region_id
       LEFT JOIN campuses c ON c.id = a.campus_id
       LEFT JOIN awardee_profiles p ON p.awardee_id = a.id
       WHERE ${f.sql} ORDER BY r.name, a.name`,
    )
    .bind(...f.params)
    .all<Record<string, unknown>>();

  return results.map((row) => {
    const done = completeness(rowToProfile(row.awardee_id !== null ? row : null), (row.consent_at as string | null) ?? null);
    return {
      awardeeId: row.aid as number,
      name: row.awardee_name as string,
      batch: row.batch as string,
      region: row.region as string,
      campus: (row.campus as string | null) ?? null,
      status: row.status as AwardeeStatus,
      percent: done.percent,
      missingCount: done.missing.length,
      updatedAt: (row.updated_at as string | null) ?? null,
    };
  });
}

// ---------- menulis ----------

function canWrite(user: SessionUser, awardeeId: number): boolean {
  if (user.role === "admin") return true;
  return user.role === "awardee" && user.awardeeId === awardeeId;
}

const COLUMNS = [...FIELDS.map((f) => f.column), ...LISTS.map((l) => l.column)];

const toDb = (profile: Profile): (string | number | null)[] => [
  ...FIELDS.map((f) => {
    const v = profile[f.key];
    if (v === "") return null;
    return f.kind === "year" ? Number(v) : v;
  }),
  ...LISTS.map((l) => JSON.stringify(profile[l.key])),
];

// Menyimpan profil. Boleh disimpan belum lengkap: kelengkapan hanya penanda, bukan syarat simpan.
// Persetujuan data dicatat sekali oleh awardee sendiri; Admin tidak bisa menyetujui atas nama awardee.
export async function saveProfile(
  db: D1Database,
  user: SessionUser,
  awardeeId: number,
  input: ProfileInput,
  consent = false,
  today = new Date(),
): Promise<{ ok: true } | Fail> {
  if (!canWrite(user, awardeeId)) throw new ScopeError("Tidak boleh mengubah profil ini");
  const awardee = await db.prepare("SELECT id, name FROM awardees WHERE id = ?").bind(awardeeId).first<{ id: number; name: string }>();
  if (!awardee) return { ok: false, message: "Awardee tidak ditemukan." };

  const checked = validateProfile(input, today);
  if (!checked.ok) return checked;

  const existing = await db
    .prepare("SELECT * FROM awardee_profiles WHERE awardee_id = ?")
    .bind(awardeeId)
    .first<Record<string, unknown>>();
  const hadConsent = Boolean(existing?.consent_at);
  if (user.role === "awardee" && !hadConsent && !consent) {
    return { ok: false, message: "Centang persetujuan penggunaan data untuk menyimpan profil." };
  }
  const now = new Date().toISOString();
  const consentAt = hadConsent ? (existing!.consent_at as string) : user.role === "awardee" && consent ? now : null;

  const values = toDb(checked.value);
  await db
    .prepare(
      `INSERT INTO awardee_profiles (awardee_id, ${COLUMNS.join(", ")}, consent_at, updated_at, updated_by)
       VALUES (?, ${COLUMNS.map(() => "?").join(", ")}, ?, ?, ?)
       ON CONFLICT(awardee_id) DO UPDATE SET ${COLUMNS.map((c) => `${c} = excluded.${c}`).join(", ")},
         consent_at = excluded.consent_at, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .bind(awardeeId, ...values, consentAt, now, user.id)
    .run();

  // Jejak hanya untuk suntingan Admin, dan hanya mencatat nama kolom yang berubah (isinya data pribadi).
  if (user.role === "admin") {
    const before = rowToProfile(existing ?? null);
    const changed = [
      ...FIELDS.filter((f) => before[f.key] !== checked.value[f.key]).map((f) => f.label),
      ...LISTS.filter((l) => JSON.stringify(before[l.key]) !== JSON.stringify(checked.value[l.key])).map((l) => l.label),
    ];
    if (changed.length > 0) {
      await writeAudit(db, user, {
        action: "profile.update",
        entity: "awardee_profile",
        entityId: awardeeId,
        summary: `Mengubah profil ${awardee.name}: ${changed.join(", ")}`,
      });
    }
  }
  return { ok: true };
}

// ---------- kolom yang dikunci (Admin) ----------

export async function setAwardeeStatus(
  db: D1Database,
  admin: SessionUser,
  awardeeId: number,
  status: string,
  joinedAt: string,
): Promise<{ ok: true } | Fail> {
  if (admin.role !== "admin") throw new ScopeError("Hanya Admin yang boleh mengubah status awardee");
  if (!AWARDEE_STATUSES.some((s) => s.value === status)) return { ok: false, message: "Status tidak dikenal." };
  const joined = joinedAt.trim();
  if (joined && !/^\d{4}-\d{2}-\d{2}$/.test(joined)) return { ok: false, message: "Tanggal bergabung harus berbentuk tahun-bulan-tanggal." };
  const row = await db.prepare("SELECT name FROM awardees WHERE id = ?").bind(awardeeId).first<{ name: string }>();
  if (!row) return { ok: false, message: "Awardee tidak ditemukan." };

  await db.prepare("UPDATE awardees SET status = ?, joined_at = ? WHERE id = ?").bind(status, joined || null, awardeeId).run();
  await writeAudit(db, admin, {
    action: "awardee.status",
    entity: "awardee",
    entityId: awardeeId,
    summary: `Status ${row.name}: ${AWARDEE_STATUSES.find((s) => s.value === status)!.label}`,
  });
  return { ok: true };
}
