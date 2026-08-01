import { redirect } from "next/navigation";

export default async function Page({
  params,
}: Readonly<{ params: Promise<{ projectId: string }> }>) {
  const { projectId } = await params;
  redirect(`/home?project=${projectId}#composer`);
}
