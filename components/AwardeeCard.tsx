"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";
import { awardeePhotoUrl } from "@/lib/photo";

type Props = { name: string; region: string; campus: string | null };

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join("");


export function AwardeeCard({ name, region, campus }: Props) {
  const [photoFailed, setPhotoFailed] = useState(false);
  return (
    <section className="awardee-card" aria-label="Awardee yang dinilai">
      {photoFailed ? (
        <div className="awardee-photo awardee-initials" aria-hidden="true">{initials(name)}</div>
      ) : (
        <img className="awardee-photo" src={awardeePhotoUrl(region, name)} alt={`Foto ${name}`} onError={() => setPhotoFailed(true)} />
      )}
      <div>
        <h2 className="awardee-name">{name}</h2>
        <div className="badges">
          <span className="badge"><Icon name="pin" className="badge-icon" />{region}</span>
          {campus && <span className="badge"><Icon name="cap" className="badge-icon" />{campus}</span>}
        </div>
      </div>
    </section>
  );
}
