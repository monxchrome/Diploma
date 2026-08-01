import { ReportPrintPage } from "@/features/projects/report-print-page";

export default async function PrintReportRoute({
  params,
}: Readonly<{ params: Promise<{ snapshotId: string }> }>) {
  const { snapshotId } = await params;
  return <ReportPrintPage snapshotId={snapshotId} />;
}
