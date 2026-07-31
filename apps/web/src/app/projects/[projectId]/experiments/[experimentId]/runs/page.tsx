import { ExperimentsPage } from "@/features/projects/experiments-page";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ experimentId: string; projectId: string }> }>) {
  const { experimentId, projectId } = await params;
  return <ExperimentsPage experimentId={experimentId} projectId={projectId} view="runs" />;
}
