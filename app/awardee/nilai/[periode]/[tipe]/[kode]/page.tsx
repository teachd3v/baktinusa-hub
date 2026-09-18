import type { Metadata } from "next";
import { EvaluationPage } from "@/components/EvaluationPage";

export const metadata: Metadata = { title: "Isi Penilaian" };

export default function Page({ params }: { params: Promise<{ periode: string; tipe: string; kode: string }> }) {
  return <EvaluationPage params={params} returnTo="/awardee/nilai" />;
}
