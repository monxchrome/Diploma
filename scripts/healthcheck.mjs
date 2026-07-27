const endpoints = [
  ["Web", process.env.WEB_URL ?? "http://localhost:3000"],
  ["API", `${process.env.API_URL ?? "http://localhost:3001"}/api/health`],
  ["AI Service", `${process.env.AI_SERVICE_URL ?? "http://localhost:8000"}/health`],
];

const results = await Promise.all(
  endpoints.map(async ([name, url]) => {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return { name, ok: response.ok, status: response.status, url };
    } catch (error) {
      return {
        name,
        ok: false,
        status: error instanceof Error ? error.message : "unknown error",
        url,
      };
    }
  }),
);

for (const result of results) {
  console.log(`${result.ok ? "ok" : "fail"} ${result.name}: ${result.url} (${result.status})`);
}

if (results.some((result) => !result.ok)) {
  process.exitCode = 1;
}
