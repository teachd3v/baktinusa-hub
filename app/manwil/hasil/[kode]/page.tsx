import type { Metadata } from "next";
import { AwardeeDetailPage } from "@/components/results/DetailPage";

export const metadata: Metadata = { title: "Rincian Hasil" };

export default function Page(props: { params: Promise<{ kode: string }>; searchParams: Promise<{ periode?: string }> }) {
  return <AwardeeDetailPage role="manwil" basePath="/manwil/hasil" {...props} />;
}
