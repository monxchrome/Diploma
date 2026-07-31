import { AnalysisFormPage } from "@/features/projects/analysis-form-page";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return <AnalysisFormPage projectId={projectId} />;
}
