import "server-only";

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/generated/prisma/client";

import { getDatabaseEnv } from "../env";

/**
 * 開発時のホットリロードで PrismaClient が増え続けないよう、globalThis にキャッシュする。
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/**
 * DB の接続 URL から PrismaClient を生成する（better-sqlite3 ドライバーアダプターを使う）。
 * @param url SQLite の接続 URL（file:./dev.db など）
 * @returns PrismaClient
 */
export function createPrismaClient(url: string): PrismaClient {
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

/**
 * アプリ全体で共有する PrismaClient を返す。初回呼び出し時に生成し、以降は同じインスタンスを返す。
 * @returns PrismaClient
 * @throws {ServerConfigError} DATABASE_URL が不正な場合
 */
export function getPrismaClient(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient(getDatabaseEnv().DATABASE_URL);
  return globalForPrisma.prisma;
}
