import { AnalysisRunViewPage } from "@/features/projects/analysis-detail-page";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string; analysisId: string }> }>) {
  const { projectId, analysisId } = await params;
  return <AnalysisRunViewPage analysisId={analysisId} projectId={projectId} view="report" />;
}
