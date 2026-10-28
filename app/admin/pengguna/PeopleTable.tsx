"use client";

import { useActionState, useEffect, useId, useRef, useState } from "react";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import { ModalButton } from "@/components/Modal";
import type { CampusOption } from "@/lib/data/campuses";
import type { Person } from "@/lib/data/people";
import { deleteManyAction, type BulkState } from "./actions";
import { PersonEditor, PersonRow, ROLE_LABEL } from "./PersonForms";

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
  expanded,
}: {
  people: Person[];
  regions: Region[];
  campuses: CampusOption[];
  selfId: number;
  expanded: boolean; // wilayah dibuka semua (saat mencari atau menyaring)
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const bulkForm = useId();
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
    }
  }, [state]);

  const toggle = (key: string) =>
    setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));

  return (
    <>
      {(dipilih.length > 0 || state) && (
        <form id={bulkForm} action={action} className="bulk-bar">
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
            {dipilih.length > 0 && (
              <>
                <ConfirmDelete
                  label="Hapus terpilih"
                  className="btn btn-small btn-danger"
                  title={`Hapus ${dipilih.length} baris?`}
                  confirmLabel={`Ya, hapus ${dipilih.length} baris`}
                  form={bulkForm}
                  pending={pending}
                >
                  <p>{dipilih.length} baris yang dipilih akan dihapus. Yang punya akun: akunnya saja yang hilang, data awardee-nya tetap.</p>
                  <p>Tindakan ini tidak bisa dibatalkan.</p>
                </ConfirmDelete>
                <button type="button" className="btn-link" onClick={() => setPicked([])}>
                  Bersihkan pilihan
                </button>
              </>
            )}
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

      <PeopleGroups
        people={people}
        regions={regions}
        campuses={campuses}
        expanded={expanded}
        selfId={selfId}
        picked={dipilih}
        onToggle={toggle}
        onSetMany={(keys, on) => setPicked((now) => (on ? Array.from(new Set([...now, ...keys])) : now.filter((k) => !keys.includes(k))))}
      />

      <div className="table-wrap people-table">
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

// Tampilan ponsel: satu bagian per wilayah yang bisa dilipat (satu Manwil dan beberapa Awardee), tiap orang
// cukup nama dan peran. Kotak centang per orang dan per wilayah memakai pilihan yang sama dengan tabel, jadi
// bilah "Hapus terpilih" di atas bekerja untuk keduanya. Mengetuk nama membuka jendela Edit.
function PeopleGroups({
  people,
  regions,
  campuses,
  expanded,
  selfId,
  picked,
  onToggle,
  onSetMany,
}: {
  people: Person[];
  regions: Region[];
  campuses: CampusOption[];
  expanded: boolean;
  selfId: number;
  picked: string[];
  onToggle: (key: string) => void;
  onSetMany: (keys: string[], on: boolean) => void;
}) {
  const groups = new Map<string, Person[]>();
  for (const p of people) groups.set(p.region ?? "Tanpa wilayah", [...(groups.get(p.region ?? "Tanpa wilayah") ?? []), p]);
  const rank = (p: Person) => (p.role === "admin" ? 0 : p.role === "manwil" ? 1 : 2);
  const ordered = [...groups.entries()]
    .sort(([a], [b]) => (a === "Tanpa wilayah" ? 1 : b === "Tanpa wilayah" ? -1 : a.localeCompare(b, "id")))
    .map(([name, members]) => [name, [...members].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, "id"))] as const);

  if (ordered.length === 0) return null;

  return (
    <div className="people-groups">
      {ordered.map(([name, members]) => {
        const selectable = members.filter((p) => p.userId !== selfId).map(keyOf);
        const chosen = selectable.filter((k) => picked.includes(k));
        const all = selectable.length > 0 && chosen.length === selectable.length;
        return (
          // key memuat expanded: saat pencarian mulai atau selesai, bagian dibuat ulang dengan keadaan buka-tutup yang benar.
          <details key={`${name}:${expanded}`} className="people-group" open={expanded}>
            <summary>
              <input
                type="checkbox"
                className="people-group-check"
                aria-label={`Pilih semua di ${name}`}
                checked={all}
                disabled={selectable.length === 0}
                ref={(el) => {
                  if (el) el.indeterminate = chosen.length > 0 && !all;
                }}
                onClick={(e) => e.stopPropagation()}
                onChange={() => onSetMany(selectable, !all)}
              />
              <span className="people-group-name">{name}</span>
              <span className="people-group-count">{members.length}</span>
            </summary>
            <ul className="people-list">
              {members.map((p) => {
                const key = keyOf(p);
                const self = p.userId === selfId;
                return (
                  <li key={key}>
                    <input
                      type="checkbox"
                      className="people-check"
                      checked={picked.includes(key)}
                      disabled={self}
                      onChange={() => onToggle(key)}
                      aria-label={self ? `${p.name} tidak bisa dipilih: akun Anda sendiri` : `Pilih ${p.name}`}
                    />
                    <ModalButton
                      label="Edit"
                      className="people-row"
                      title={`Edit ${p.name}`}
                      trigger={
                        <>
                          <span className="people-name">{p.name}</span>
                          <span className="people-role">{p.role ? ROLE_LABEL[p.role] : "Data awardee"}</span>
                        </>
                      }
                    >
                      <PersonEditor person={p} regions={regions} campuses={campuses} />
                    </ModalButton>
                  </li>
                );
              })}
            </ul>
          </details>
        );
      })}
    </div>
  );
}
