import { loadEnvConfig } from "@next/env";
import { defineConfig } from "prisma/config";

// Match Next.js environment loading, including ignored .env.local files.
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // Validation/generation need no database. Database commands still require a URL.
  datasource: {
    url:
      process.env.DIRECT_URL?.trim() ||
      process.env.DATABASE_URL?.trim() ||
      "",
  },
});
