import type { Metadata } from "next";
import { MeasurementAnalyticsPage } from "@/components/analytics/MeasurementAnalyticsPage";
import type { FilterParams } from "@/components/analytics/readFilter";

export const metadata: Metadata = { title: "Analitik Pengukuran" };

export default function Page(props: {
  params: Promise<{ kode: string }>;
  searchParams: Promise<FilterParams & { periode?: string }>;
}) {
  return <MeasurementAnalyticsPage role="manwil" basePath="/manwil/analitik" {...props} />;
}
