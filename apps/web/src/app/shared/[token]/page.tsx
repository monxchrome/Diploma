import type { Metadata } from "next";

import { PublicSharedReportPage } from "@/features/projects/public-shared-report-page";

export const metadata: Metadata = {
  robots: { follow: false, index: false, nocache: true },
  title: "Shared report",
};

export default async function SharedReportRoute({
  params,
}: Readonly<{ params: Promise<{ token: string }> }>) {
  const { token } = await params;
  return <PublicSharedReportPage token={token} />;
}
