import { env } from "cloudflare:workers";
import type { Metadata } from "next";
import { EvaluationTasks, SentBanner } from "@/components/EvaluationTasks";
import { requireUser } from "@/lib/auth";
import { listTasks } from "@/lib/data/evaluations";

export const metadata: Metadata = { title: "Penilaian" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ terkirim?: string }> }) {
  const user = await requireUser("manwil");
  const [{ terkirim }, tasks] = await Promise.all([searchParams, listTasks(env.DB, user)]);
  return (
    <>
      <div className="page-head">
        <h1>Penilaian</h1>
        <p>Penilaian Manajer Wilayah untuk awardee binaan Anda.</p>
      </div>
      <SentBanner receipt={terkirim} />
      <section className="card">
        <EvaluationTasks tasks={tasks} basePath="/manwil/nilai" />
      </section>
    </>
  );
}
