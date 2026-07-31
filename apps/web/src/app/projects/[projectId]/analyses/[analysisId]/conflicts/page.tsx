import { AnalysisRunViewPage } from "@/features/projects/analysis-detail-page";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ analysisId: string; projectId: string }> }>) {
  const { analysisId, projectId } = await params;
  return <AnalysisRunViewPage analysisId={analysisId} projectId={projectId} view="conflicts" />;
}
