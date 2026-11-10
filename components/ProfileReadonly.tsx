import { DEGREES, GENDERS, type ProfileView } from "@/lib/data/profiles";

const show = (v: string) => (v ? v : "—");

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="profile-row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

// Tampilan baca-saja untuk Manwil. Kolom pribadi sudah dikosongkan di lapisan data, jadi di sini tidak ada yang perlu disaring.
export function ProfileReadonly({ view }: { view: ProfileView }) {
  const p = view.profile;
  const gender = GENDERS.find((g) => g.value === p.gender)?.label ?? "";
  const degree = (DEGREES as readonly string[]).includes(p.degreeLevel) ? p.degreeLevel : "";
  return (
    <>
      <section className="card">
        <h2 className="section-title">Kontak dan identitas</h2>
        <dl className="profile-dl">
          <Row label="Nama panggilan">{show(p.nickname)}</Row>
          <Row label="Jenis kelamin">{show(gender)}</Row>
          <Row label="Tempat lahir">{show(p.birthPlace)}</Row>
          <Row label="No. WhatsApp">{show(p.whatsapp)}</Row>
          <Row label="Email pribadi">{show(p.personalEmail)}</Row>
          <Row label="Kota domisili">{show(p.city)}</Row>
        </dl>
      </section>

      <section className="card">
        <h2 className="section-title">Akademik</h2>
        <dl className="profile-dl">
          <Row label="Fakultas">{show(p.faculty)}</Row>
          <Row label="Program studi">{show(p.studyProgram)}</Row>
          <Row label="Jenjang">{show(degree)}</Row>
          <Row label="Tahun masuk">{show(p.entryYear)}</Row>
          <Row label="Perkiraan lulus">{show(p.expectedGraduationYear)}</Row>
          <Row label="NIM">{show(p.studentId)}</Row>
        </dl>
        {view.semesters.length > 0 && (
          <div className="table-wrap" style={{ marginTop: "1rem" }}>
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Semester</th>
                  <th scope="col">Tahun ajaran</th>
                  <th scope="col" className="num">IPK</th>
                </tr>
              </thead>
              <tbody>
                {view.semesters.map((s) => (
                  <tr key={s.semester}>
                    <td>{s.semester}</td>
                    <td>{s.academicYear}</td>
                    <td className="num">{s.gpa.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="section-title">Branding aktivis</h2>
        <dl className="profile-dl">
          <Row label="Tagline">{show(p.tagline)}</Row>
          <Row label="Bio">{show(p.bio)}</Row>
          <Row label="Bidang minat">{p.interests.length ? p.interests.join(", ") : "—"}</Row>
          <Row label="Keahlian">{p.skills.length ? p.skills.join(", ") : "—"}</Row>
          <Row label="Organisasi utama">{p.mainOrg ? `${p.mainOrg}${p.mainOrgRole ? `, ${p.mainOrgRole}` : ""}` : "—"}</Row>
          <Row label="Bahasa">{p.languages.length ? p.languages.join(", ") : "—"}</Row>
          <Row label="Instagram">{p.instagram ? `@${p.instagram}` : "—"}</Row>
          <Row label="LinkedIn">{show(p.linkedin)}</Row>
          <Row label="Tautan lain">{show(p.website)}</Row>
          <Row label="Motivasi">{show(p.motivation)}</Row>
          <Row label="Dampak yang ingin dicapai">{show(p.impact)}</Row>
        </dl>
      </section>
    </>
  );
}
