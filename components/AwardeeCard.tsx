"use client";

import { useState } from "react";

type Props = { name: string; region: string; campus: string | null; referralCode: string };

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");

export function AwardeeCard({ name, region, campus, referralCode }: Props) {
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <section className="awardee-card" aria-label="Awardee yang dinilai">
      {photoFailed ? (
        <div className="awardee-photo awardee-initials" aria-hidden="true">{initials(name)}</div>
      ) : (
        <img className="awardee-photo" src={`/foto/${referralCode}`} alt={`Foto ${name}`} onError={() => setPhotoFailed(true)} />
      )}
      <div>
        <h2 className="awardee-name">{name}</h2>
        <div className="badges">
          <span className="badge">📍 {region}</span>
          {campus && <span className="badge">🎓 {campus}</span>}
        </div>
      </div>
    </section>
  );
}
