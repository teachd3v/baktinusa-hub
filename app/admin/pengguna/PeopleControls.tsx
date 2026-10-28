"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const hrefFor = (peran: string, cari: string) => {
  const query = new URLSearchParams();
  if (peran) query.set("peran", peran);
  if (cari) query.set("cari", cari);
  const text = query.toString();
  return text ? `/admin/pengguna?${text}` : "/admin/pengguna";
};

// Saringan peran sebagai dropdown. Hanya tampil di ponsel (lihat .role-select); di layar lebar chip yang dipakai.
export function RoleSelect({ tabs, peran, cari }: { tabs: [string, string][]; peran: string; cari: string }) {
  const router = useRouter();
  return (
    <select className="select role-select" aria-label="Saring menurut peran" value={peran} onChange={(e) => router.push(hrefFor(e.target.value, cari))}>
      {tabs.map(([value, label]) => (
        <option key={value || "semua"} value={value}>{label}</option>
      ))}
    </select>
  );
}

// Mencari sendiri begitu ada dua huruf; kotak yang dikosongkan mengembalikan daftar penuh. Satu huruf diabaikan
// supaya daftar tidak berkedip tiap ketukan. Enter tetap bekerja untuk yang mengetik cepat.
export function PeopleSearch({ peran, cari }: { peran: string; cari: string }) {
  const router = useRouter();
  const [text, setText] = useState(cari);

  useEffect(() => {
    const query = text.trim();
    if (query.length === 1 || query === cari) return;
    const timer = setTimeout(() => router.replace(hrefFor(peran, query)), 300);
    return () => clearTimeout(timer);
  }, [text, peran, cari, router]);

  return (
    <form
      method="get"
      className="people-search"
      onSubmit={(e) => {
        e.preventDefault();
        const query = text.trim();
        if (query.length !== 1) router.replace(hrefFor(peran, query));
      }}
    >
      {peran && <input type="hidden" name="peran" value={peran} />}
      <input
        className="input"
        type="search"
        name="cari"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Cari nama, ID, wilayah (min. 2 huruf)"
        aria-label="Cari orang"
        autoComplete="off"
        enterKeyHint="search"
      />
    </form>
  );
}
