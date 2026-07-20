import { existsSync, readFileSync } from "node:fs"
import { defineConfig } from "prisma/config"

const DEFAULT_URL = "file:./prisma/voice-log.db"

function getDatabaseUrl(): string {
  if (!existsSync("./config.json")) return DEFAULT_URL
  const config = JSON.parse(readFileSync("./config.json", "utf-8"))
  return config.sqlite?.databaseUrl || DEFAULT_URL
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: getDatabaseUrl(),
  },
  migrations: {
    path: "prisma/migrations",
  },
})
