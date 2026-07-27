import { ProjectDetailPage } from "@/features/projects/project-detail-page";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;

  return <ProjectDetailPage projectId={projectId} />;
}
