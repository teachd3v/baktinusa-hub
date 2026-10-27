"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import type { CampusOption } from "@/lib/data/campuses";
import type { Person } from "@/lib/data/people";
import { deleteManyAction, type BulkState } from "./actions";
import { PersonRow } from "./PersonForms";

type Region = { id: number; name: string };

// Satu baris bisa berupa akun, data awardee tanpa akun, atau keduanya. Kalau ada akunnya, kuncinya "u:"
// — sama seperti tombol hapus per baris: yang dihapus akunnya, data awardee-nya sengaja ditinggal
// supaya penilaian yang sudah masuk tetap punya pemilik.
const keyOf = (p: Person) => (p.userId ? `u:${p.userId}` : `a:${p.awardeeId}`);

export function PeopleTable({
  people,
  regions,
  campuses,
  selfId,
}: {
  people: Person[];
  regions: Region[];
  campuses: CampusOption[];
  selfId: number;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState<BulkState, FormData>(deleteManyAction, null);
  const all = useRef<HTMLInputElement>(null);

  // Admin tidak bisa menghapus akunnya sendiri, jadi barisnya tidak ikut bisa dicentang.
  const bisa = people.filter((p) => p.userId !== selfId).map(keyOf);
  // Pilihan disaring ke baris yang masih ada: setelah penghapusan, daftarnya berubah di server.
  const dipilih = picked.filter((k) => bisa.includes(k));

  useEffect(() => {
    if (all.current) all.current.indeterminate = dipilih.length > 0 && dipilih.length < bisa.length;
  }, [dipilih.length, bisa.length]);

  // Begitu hasil penghapusan datang, centangnya dilepas — yang gagal pun sudah dilaporkan di bawah.
  useEffect(() => {
    if (state) {
      setPicked([]);
      setConfirming(false);
    }
  }, [state]);

  const toggle = (key: string) =>
    setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));

  return (
    <>
      {(dipilih.length > 0 || state) && (
        <form action={action} className="bulk-bar">
          {dipilih.map((k) => (
            <input key={k} type="hidden" name="pilih" value={k} />
          ))}

          {dipilih.length > 0 && (
            <div className="bulk-count">
              <b>{dipilih.length} baris dipilih</b>
              <span className="section-hint" style={{ margin: 0 }}>
                Yang punya akun: akunnya saja yang hilang, data awardee-nya tetap.
              </span>
            </div>
          )}

          <div className="bulk-actions">
            {dipilih.length > 0 &&
              // Saat bertanya, tombol merahnya pindah ke kanan: klik kedua yang tidak sengaja
              // jatuh di "Batal", bukan di penghapusan.
              (confirming ? (
                <>
                  <button type="button" className="btn-link" onClick={() => setConfirming(false)}>
                    Batal
                  </button>
                  <button type="submit" className="btn btn-small btn-danger" disabled={pending}>
                    {pending ? "Menghapus…" : `Ya, hapus ${dipilih.length} baris`}
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-small btn-danger" onClick={() => setConfirming(true)}>
                    Hapus terpilih
                  </button>
                  <button type="button" className="btn-link" onClick={() => setPicked([])}>
                    Bersihkan pilihan
                  </button>
                </>
              ))}
          </div>

          {state && (
            <div className="bulk-result" role="status">
              <p className={state.ok ? "section-hint" : "form-error"} style={{ margin: 0 }}>
                {state.ok ? "✓ " : ""}
                {state.message}
              </p>
              {state.failures.length > 0 && (
                <ul className="bulk-failures">
                  {state.failures.map((f, i) => (
                    <li key={i}>
                      <b>{f.name}</b>: {f.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </form>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th scope="col" className="check-col">
                <input
                  ref={all}
                  type="checkbox"
                  aria-label="Pilih semua yang tampil"
                  checked={bisa.length > 0 && dipilih.length === bisa.length}
                  disabled={bisa.length === 0}
                  onChange={(e) => setPicked(e.target.checked ? bisa : [])}
                />
              </th>
              <th scope="col">Nama</th>
              <th scope="col">ID masuk</th>
              <th scope="col">Peran</th>
              <th scope="col">Wilayah</th>
              <th scope="col">Data awardee</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Aksi</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => {
              const key = keyOf(p);
              return (
                <PersonRow
                  key={key}
                  person={p}
                  regions={regions}
                  campuses={campuses}
                  checked={dipilih.includes(key)}
                  onCheck={() => toggle(key)}
                  lockedReason={p.userId === selfId ? "Akun Anda sendiri" : undefined}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
