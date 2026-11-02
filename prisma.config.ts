import { existsSync } from "node:fs";

import { defineConfig } from "prisma/config";

// Prisma CLI は .env を自動で読まないため、Next.js と同じ .env.local があれば読み込む（Node 標準機能）
if (existsSync(".env.local")) {
  process.loadEnvFile(".env.local");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // DATABASE_URL は秘密情報ではないため、未設定ならアプリと同じ既定値を使う
    url: process.env.DATABASE_URL ?? "file:./dev.db",
  },
});
