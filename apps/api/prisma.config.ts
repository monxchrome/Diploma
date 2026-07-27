import "dotenv/config";

import { defineConfig, env } from "@prisma/config";

process.env.DATABASE_URL ??= "postgresql://dip_user:dip_password@localhost:5432/dip?schema=public";

export default defineConfig({
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    path: "prisma/migrations",
  },
  schema: "prisma/schema.prisma",
});
