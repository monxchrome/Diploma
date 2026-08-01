import { HomePage } from "@/features/home/home-page";

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<{ project?: string }> }>) {
  const { project } = await searchParams;
  return <HomePage initialProjectId={project} />;
}
