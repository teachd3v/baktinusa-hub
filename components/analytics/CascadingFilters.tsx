"use client";

import { useRef } from "react";
import type { AnalyticsType, AwardeeOption, RegionOption } from "@/lib/data/analytics";

// Saringan bertingkat: Siklus → Pengukuran → Wilayah → Awardee.
//
// Tetap form GET biasa, jadi hasilnya alamat yang bisa dibagikan dan tombol Back browser bekerja.
// JavaScript di sini hanya mempercepat satu hal: begitu dropdown diubah, formnya dikirim sendiri —
// tanpa itu orang harus memilih lalu menekan tombol terpisah tiap kali. Kalau JS mati, tombol
// "Terapkan" di bawahnya tetap mengerjakan hal yang sama.
//
// Bertingkatnya dikerjakan server: daftar awardee datang sudah tersaring wilayah yang sedang dipilih
// (lihat awardeeOptions), dan jenis pengukuran yang ditawarkan hanya yang dijalankan siklusnya.
// Yang perlu ditangani di sini hanya satu — saat wilayah atau siklus berganti, pilihan awardee lama bisa
// jadi bukan penghuni daftar baru, jadi ia dikosongkan sebelum form dikirim. Jenis dan wilayah dibawa
// serta; kalau jenisnya tidak ada di siklus baru, server membuangnya (lihat resolveFilter).

export type CycleOption = { slug: string; name: string };

export function CascadingFilters({
  cycles,
  types,
  regions,
  awardees,
  values,
  periode,
  // Halaman rincian sudah menyebut jenisnya di alamat dan menyediakan tab untuk berpindah, jadi di sana
  // dropdown jenis hanya akan jadi kemudi kedua yang tidak kemana-mana.
  showTypes = true,
  // Manwil hanya memegang satu wilayah, jadi memilih wilayah tidak ada artinya baginya.
  showRegions = true,
}: {
  cycles: CycleOption[];
  types: AnalyticsType[];
  regions: RegionOption[];
  awardees: AwardeeOption[];
  values: { code: string | null; regionId: number | null; awardeeId: number | null };
  periode: string;
  showTypes?: boolean;
  showRegions?: boolean;
}) {
  const form = useRef<HTMLFormElement>(null);
  const kirim = () => form.current?.requestSubmit();

  // Dipakai untuk wilayah dan siklus: keduanya mengubah siapa saja yang ada di daftar awardee.
  const kosongkanAwardee = () => {
    const pilihanAwardee = form.current?.elements.namedItem("awardee");
    if (pilihanAwardee instanceof HTMLSelectElement) pilihanAwardee.value = "";
    kirim();
  };

  return (
    <form ref={form} method="get" className="filter-row">
      <div className="field">
        <label className="label" htmlFor="saring-siklus">Siklus</label>
        <select id="saring-siklus" className="select" name="periode" defaultValue={periode} onChange={kosongkanAwardee}>
          {cycles.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>

      {showTypes && (
        <div className="field">
          <label className="label" htmlFor="saring-jenis">Pengukuran</label>
          <select id="saring-jenis" className="select" name="jenis" defaultValue={values.code ?? ""} onChange={kirim}>
            <option value="">Semua pengukuran</option>
            {types.map((t) => (
              <option key={t.code} value={t.code}>{t.name}</option>
            ))}
          </select>
        </div>
      )}

      {showRegions && (
        <div className="field">
          <label className="label" htmlFor="saring-wilayah">Wilayah</label>
          <select
            id="saring-wilayah"
            className="select"
            name="wilayah"
            defaultValue={values.regionId ?? ""}
            onChange={kosongkanAwardee}
            disabled={regions.length < 2}
          >
            <option value="">Semua wilayah</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label className="label" htmlFor="saring-awardee">Awardee</label>
        <select id="saring-awardee" className="select" name="awardee" defaultValue={values.awardeeId ?? ""} onChange={kirim}>
          <option value="">{values.regionId === null ? "Semua awardee" : "Semua awardee di wilayah ini"}</option>
          {awardees.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Jalur tanpa JavaScript, dan sekaligus penanda bahwa saringan memang perlu dikirim. */}
      <div className="field">
        <button type="submit" className="btn btn-small">Terapkan</button>
      </div>
    </form>
  );
}
