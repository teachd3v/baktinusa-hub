"use client";

import { startTransition, useActionState } from "react";
import { DEGREES, GENDERS, INTEREST_OPTIONS, type Profile } from "@/lib/data/profiles";

export type ProfileState = { ok: boolean; message: string } | null;

type Props = {
  profile: Profile;
  action: (previous: ProfileState, form: FormData) => Promise<ProfileState>;
  // Awardee yang belum pernah menyetujui harus mencentang. Admin tidak bisa menyetujui atas nama awardee.
  mode: "self" | "admin";
  consented: boolean;
  awardeeId?: number;
  // Berubah setiap kali profil tersimpan: isian disegarkan dari data yang sudah dinormalkan, sementara pesan hasil tetap.
  version: string;
};

// Kolom daftar (keahlian, bahasa) tampil sebagai teks berkoma.
const valueOf = (profile: Profile, name: keyof Profile) => {
  const v = profile[name];
  return Array.isArray(v) ? v.join(", ") : String(v ?? "");
};

function Field({
  name,
  label,
  profile,
  type = "text",
  max,
  required,
  hint,
  placeholder,
  autoComplete,
}: {
  name: keyof Profile;
  label: string;
  profile: Profile;
  type?: string;
  max?: number;
  required?: boolean;
  hint?: string;
  placeholder?: string;
  autoComplete?: string;
}) {
  const id = `pf-${name}`;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        className="input"
        name={name}
        type={type}
        defaultValue={valueOf(profile, name)}
        maxLength={max}
        placeholder={placeholder}
        autoComplete={autoComplete}
        inputMode={type === "tel" ? "tel" : undefined}
      />
      {hint && <p className="section-hint" style={{ margin: "0.35rem 0 0" }}>{hint}</p>}
    </div>
  );
}

function Area({ name, label, profile, max, required, hint }: { name: keyof Profile; label: string; profile: Profile; max: number; required?: boolean; hint?: string }) {
  const id = `pf-${name}`;
  return (
    <div className="field">
      <label className="label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <textarea id={id} className="textarea" name={name} rows={4} maxLength={max} defaultValue={String(profile[name] ?? "")} />
      <p className="section-hint" style={{ margin: "0.35rem 0 0" }}>{hint ?? `Maksimal ${max} karakter.`}</p>
    </div>
  );
}

export function ProfileForm({ profile, action, mode, consented, awardeeId, version }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const extraInterests = profile.interests.filter((i) => !(INTEREST_OPTIONS as readonly string[]).includes(i));

  return (
    // Dikirim lewat onSubmit, bukan prop action: React 19 mengosongkan form setelah aksi selesai, dan isian yang gagal
    // validasi tidak boleh hilang.
    <form
      key={version}
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {awardeeId !== undefined && <input type="hidden" name="awardeeId" value={awardeeId} />}

      <section className="card">
        <h2 className="section-title">Identitas dan kontak</h2>
        <p className="section-hint">Tanda * wajib diisi. Tanggal lahir dan kontak darurat hanya terlihat oleh Anda dan Admin.</p>
        <div className="form-row">
          <Field name="nickname" label="Nama panggilan" profile={profile} max={40} required autoComplete="nickname" />
          <div className="field">
            <label className="label" htmlFor="pf-gender">Jenis kelamin <span aria-hidden="true">*</span></label>
            <select id="pf-gender" className="select" name="gender" defaultValue={profile.gender}>
              <option value="">Pilih</option>
              {GENDERS.map((g) => (
                <option key={g.value} value={g.value}>{g.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-row">
          <Field name="birthPlace" label="Tempat lahir" profile={profile} max={80} required />
          <Field name="birthDate" label="Tanggal lahir" profile={profile} type="date" required />
        </div>
        <div className="form-row">
          <Field name="whatsapp" label="No. WhatsApp aktif" profile={profile} type="tel" max={20} required placeholder="081234567890" autoComplete="tel" />
          <Field name="personalEmail" label="Email pribadi" profile={profile} type="email" max={120} required autoComplete="email" />
        </div>
        <Field name="city" label="Kota domisili" profile={profile} max={80} required />
        <div className="form-row">
          <Field name="emergencyName" label="Kontak darurat: nama" profile={profile} max={120} hint="Opsional. Isi nama dan nomor, atau kosongkan keduanya." />
          <Field name="emergencyPhone" label="Kontak darurat: nomor" profile={profile} type="tel" max={20} />
        </div>
      </section>

      <section className="card">
        <h2 className="section-title">Akademik</h2>
        <div className="form-row">
          <Field name="faculty" label="Fakultas" profile={profile} max={120} required />
          <Field name="studyProgram" label="Program studi" profile={profile} max={120} required />
        </div>
        <div className="form-row">
          <div className="field">
            <label className="label" htmlFor="pf-degreeLevel">Jenjang <span aria-hidden="true">*</span></label>
            <select id="pf-degreeLevel" className="select" name="degreeLevel" defaultValue={profile.degreeLevel}>
              <option value="">Pilih</option>
              {DEGREES.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <Field name="entryYear" label="Tahun masuk" profile={profile} type="number" max={4} required placeholder="2024" />
          <Field name="expectedGraduationYear" label="Perkiraan lulus" profile={profile} type="number" max={4} required placeholder="2028" />
        </div>
        <Field name="studentId" label="NIM" profile={profile} max={30} hint="Opsional." />
      </section>

      <section className="card">
        <h2 className="section-title">Branding aktivis</h2>
        <p className="section-hint">Bagian ini jadi wajah Anda di CV dan materi program.</p>
        <Field name="tagline" label="Tagline" profile={profile} max={100} required hint="Satu kalimat, maksimal 100 karakter. Contoh: Mahasiswa Kehutanan IPB, penggerak literasi desa." />
        <Area name="bio" label="Bio singkat" profile={profile} max={500} required />

        <fieldset className="field" style={{ border: 0, padding: 0, margin: "0 0 1rem" }}>
          <legend className="label">Bidang minat dan fokus advokasi</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem 1.25rem", margin: "0.35rem 0 0.75rem" }}>
            {INTEREST_OPTIONS.map((option) => (
              <label key={option} style={{ display: "inline-flex", gap: "0.4rem", alignItems: "center", fontSize: "var(--text-sm)" }}>
                <input type="checkbox" name="interests" value={option} defaultChecked={profile.interests.includes(option)} />
                {option}
              </label>
            ))}
          </div>
          <input className="input" name="interestsExtra" aria-label="Bidang lain" placeholder="Bidang lain, pisahkan dengan koma" defaultValue={extraInterests.join(", ")} />
        </fieldset>

        <Field name="skills" label="Keahlian" profile={profile} max={400} hint="Pisahkan dengan koma, maksimal 10. Contoh: public speaking, desain grafis, riset." />
        <div className="form-row">
          <Field name="mainOrg" label="Organisasi utama" profile={profile} max={120} />
          <Field name="mainOrgRole" label="Jabatan saat ini" profile={profile} max={80} />
        </div>
        <Field name="languages" label="Bahasa" profile={profile} max={300} hint="Pisahkan dengan koma. Contoh: Indonesia (ibu), Inggris (aktif), Arab (dasar)." />
      </section>

      <section className="card">
        <h2 className="section-title">Kehadiran daring</h2>
        <div className="form-row">
          <Field name="instagram" label="Instagram" profile={profile} max={120} placeholder="nama akun saja" />
          <Field name="linkedin" label="LinkedIn" profile={profile} max={200} placeholder="linkedin.com/in/…" />
        </div>
        <Field name="website" label="Tautan lain" profile={profile} max={200} hint="Blog atau portofolio daring, opsional." />
      </section>

      <section className="card">
        <h2 className="section-title">Cerita Anda</h2>
        <Area name="motivation" label="Motivasi bergabung" profile={profile} max={500} hint="Opsional. Maksimal 500 karakter." />
        <Area name="impact" label="Dampak yang ingin dicapai" profile={profile} max={500} hint="Opsional. Maksimal 500 karakter." />
      </section>

      <section className="card">
        {mode === "self" && !consented ? (
          <label style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontSize: "var(--text-sm)", lineHeight: 1.5 }}>
            <input type="checkbox" name="consent" value="1" style={{ marginTop: "0.25rem" }} />
            <span>
              Saya menyetujui BAKTINUSA menyimpan dan memakai data ini untuk pengelolaan program, pembuatan CV dan transkrip,
              serta komunikasi program. Data pribadi tidak dibagikan di luar program.
            </span>
          </label>
        ) : (
          <p className="section-hint" style={{ margin: 0 }}>
            {consented ? "✓ Persetujuan penggunaan data sudah dicatat." : "Awardee belum menyetujui penggunaan data. Persetujuan hanya bisa dicatat oleh awardee sendiri."}
          </p>
        )}
        <button type="submit" className="btn" style={{ width: "100%", marginTop: "1rem" }} disabled={pending}>
          {pending ? "Menyimpan…" : "Simpan profil"}
        </button>
        {state && (
          <p className={state.ok ? "section-hint" : "form-error"} role={state.ok ? "status" : "alert"} style={{ margin: "0.75rem 0 0" }}>
            {state.ok ? "✓ " : ""}
            {state.message}
          </p>
        )}
      </section>
    </form>
  );
}
