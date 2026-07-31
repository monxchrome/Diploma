import { AnalysesPage } from "@/features/projects/analyses-page";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return <AnalysesPage projectId={projectId} />;
}
