import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";

/**
 * テスト用の一時 SQLite データベース。
 */
export type TestDatabase = {
  /** Prisma に渡す接続 URL */
  url: string;
  /** データベースファイルのパス */
  filePath: string;
  /** 一時ディレクトリごと削除する */
  cleanup: () => void;
};

/**
 * 一時ディレクトリに SQLite ファイルを作り、prisma/migrations の SQL を順に適用する。
 * Prisma CLI を子プロセスで起動するより速く、テストごとに独立した DB を用意できる。
 * @returns 一時データベースの情報
 */
export function createTestDatabase(): TestDatabase {
  const dir = mkdtempSync(join(tmpdir(), "pr-impact-analyzer-test-"));
  const filePath = join(dir, "test.db");

  // マイグレーションはフォルダ名（タイムスタンプ付き）の順に適用する
  const migrationsDir = join(process.cwd(), "prisma", "migrations");
  const migrations = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const db = new Database(filePath);
  for (const name of migrations) {
    db.exec(readFileSync(join(migrationsDir, name, "migration.sql"), "utf8"));
  }
  db.close();

  return {
    url: `file:${filePath}`,
    filePath,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
