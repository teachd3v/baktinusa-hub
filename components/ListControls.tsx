"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Kendali daftar yang dipakai beberapa halaman Admin: dropdown saringan dan kotak cari otomatis. Keduanya
// mengubah alamat halaman (parameter query), jadi hasilnya tetap bisa dibagikan dan tombol Back bekerja.

const hrefFor = (path: string, params: Record<string, string>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value);
  const text = query.toString();
  return text ? `${path}?${text}` : path;
};

// Saringan sebagai dropdown, untuk menggantikan deretan chip di ponsel. `keep` = parameter lain yang dibawa serta.
export function ParamSelect({
  path,
  param,
  value,
  options,
  keep = {},
  label,
  className = "select mobile-select",
}: {
  path: string;
  param: string;
  value: string;
  options: [string, string][];
  keep?: Record<string, string>;
  label: string;
  className?: string;
}) {
  const router = useRouter();
  return (
    <select className={className} aria-label={label} value={value} onChange={(e) => router.push(hrefFor(path, { ...keep, [param]: e.target.value }))}>
      {options.map(([optionValue, text]) => (
        <option key={optionValue || "semua"} value={optionValue}>{text}</option>
      ))}
    </select>
  );
}

// Mencari sendiri begitu ada dua huruf; kotak yang dikosongkan mengembalikan daftar penuh. Satu huruf diabaikan
// supaya daftar tidak berkedip tiap ketukan. Enter tetap bekerja untuk yang mengetik cepat.
export function AutoSearch({
  path,
  param = "cari",
  value,
  keep = {},
  placeholder,
  label,
}: {
  path: string;
  param?: string;
  value: string;
  keep?: Record<string, string>;
  placeholder: string;
  label: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(value);
  const keepKey = JSON.stringify(keep);

  useEffect(() => {
    const query = text.trim();
    if (query.length === 1 || query === value) return;
    const timer = setTimeout(() => router.replace(hrefFor(path, { ...JSON.parse(keepKey), [param]: query })), 300);
    return () => clearTimeout(timer);
  }, [text, value, path, param, keepKey, router]);

  return (
    <form
      method="get"
      className="people-search"
      style={{ flex: 1, minWidth: 0 }}
      onSubmit={(e) => {
        e.preventDefault();
        const query = text.trim();
        if (query.length !== 1) router.replace(hrefFor(path, { ...keep, [param]: query }));
      }}
    >
      {Object.entries(keep).map(([key, v]) => v && <input key={key} type="hidden" name={key} value={v} />)}
      <input
        className="input"
        type="search"
        name={param}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        autoComplete="off"
        enterKeyHint="search"
      />
    </form>
  );
}
