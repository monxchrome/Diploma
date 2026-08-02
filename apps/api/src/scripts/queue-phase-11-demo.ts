import { Queue } from "bullmq";

const runId = process.env.BENCHMARK_DEMO_RUN_ID ?? "e0abfcba-8040-4fd8-b28d-82f8fd495ebb";
const queue = new Queue("benchmarks", { connection: { host: "localhost", port: 6379, db: 1 } });
await queue.add("execute", { benchmarkRunId: runId, requestId: `demo-retry-${Date.now()}` });
await queue.disconnect();
process.stdout.write(runId);
