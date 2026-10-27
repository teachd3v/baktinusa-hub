import type { Metadata } from "next";
import { AnalyticsOverview } from "@/components/analytics/AnalyticsOverview";
import type { FilterParams } from "@/components/analytics/readFilter";

export const metadata: Metadata = { title: "Analitik" };

export default function Page(props: { searchParams: Promise<FilterParams & { periode?: string }> }) {
  return <AnalyticsOverview role="admin" basePath="/admin/analitik" {...props} />;
}
