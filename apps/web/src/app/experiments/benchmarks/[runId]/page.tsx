import { BenchmarkRunPage } from "@/features/benchmarks/benchmark-run-page";

export default async function Page({ params }: Readonly<{ params: Promise<{ runId: string }> }>) {
  const { runId } = await params;
  return <BenchmarkRunPage runId={runId} />;
}
