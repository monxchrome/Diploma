import { ExperimentsPage } from "@/features/projects/experiments-page";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  return <ExperimentsPage projectId={projectId} view="list" />;
}
