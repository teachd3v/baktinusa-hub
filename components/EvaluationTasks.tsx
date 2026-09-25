import Link from "next/link";
import type { EvalTask } from "@/lib/data/evaluations";
import { formatWib } from "@/lib/format";

const KIND_LABEL = { self: "Asesmen mandiri", peer: "Menilai rekan", manwil: "Menilai binaan" } as const;

// Daftar penilaian berakun, dikelompokkan per periode. `basePath` = "/awardee/nilai" atau "/manwil/nilai".
export function EvaluationTasks({ tasks, basePath }: { tasks: EvalTask[]; basePath: string }) {
  if (tasks.length === 0) {
    return <p className="section-hint" style={{ margin: 0 }}>Belum ada penilaian yang dibuka untuk Anda saat ini.</p>;
  }

  const periods = [...new Map(tasks.map((t) => [t.period.slug, t.period])).values()];
  return periods.map((period) => {
    const items = tasks.filter((t) => t.period.slug === period.slug);
    const done = items.filter((t) => t.submitted).length;
    return (
      <div key={period.slug} style={{ marginTop: "0.75rem" }}>
        <p className="label">
          {period.name}{" "}
          <span className={`pill ${done === items.length ? "pill-ok" : done > 0 ? "pill-warn" : "pill-bad"}`}>
            {done} / {items.length} selesai
          </span>
        </p>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Penilaian</th>
                <th scope="col">Yang dinilai</th>
                <th scope="col">Batas</th>
                <th scope="col"><span className="sr-only">Aksi</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map((task) => (
                <tr key={`${task.type.code}:${task.target.referralCode}`}>
                  <td>
                    <b>{task.type.name}</b>
                    <div className="section-hint" style={{ margin: 0 }}>{KIND_LABEL[task.kind]}</div>
                  </td>
                  <td>{task.kind === "self" ? "Diri sendiri" : task.target.name}</td>
                  <td>{task.period.closesAt ? formatWib(task.period.closesAt) : "—"}</td>
                  <td className="num">
                    {task.submitted ? (
                      <span className="pill pill-ok">terkirim</span>
                    ) : (
                      <Link className="btn btn-small" href={`${basePath}/${task.period.slug}/${task.type.code}/${task.target.referralCode}`}>
                        Isi
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  });
}

export function SentBanner({ receipt }: { receipt: string | undefined }) {
  if (!receipt || !/^[0-9A-F]{8}$/.test(receipt)) return null;
  return (
    <div className="card fade-in" role="status" style={{ borderLeft: "4px solid var(--ok)" }}>
      <h2 className="section-title">Terima kasih, penilaian terkirim ✅</h2>
      <p className="section-hint" style={{ margin: 0 }}>
        Kode bukti: <b>{receipt}</b>. Jawaban yang sudah dikirim tidak bisa diubah.
      </p>
    </div>
  );
}
