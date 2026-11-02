import "server-only";

import { z } from "zod";

/**
 * GitHub API 用の環境変数のスキーマ。
 */
const githubEnvSchema = z.object({
  GITHUB_TOKEN: z.string().min(1),
});

/**
 * Claude による分析用の環境変数のスキーマ。
 * GitHub 用と分けておき、ANTHROPIC_API_KEY がなくても PR 取得 API は動くようにする。
 */
const analysisEnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  ANALYSIS_MODEL: z.string().min(1).default("claude-sonnet-5-5"),
});

/**
 * データベース用の環境変数のスキーマ。秘密情報ではないため、未設定ならリポジトリ直下の dev.db を使う。
 */
const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1).default("file:./dev.db"),
});

/**
 * 検証済みの GitHub 用環境変数。
 */
export type GitHubEnv = z.infer<typeof githubEnvSchema>;

/**
 * 検証済みの分析用環境変数。
 */
export type AnalysisEnv = z.infer<typeof analysisEnvSchema>;

/**
 * 検証済みのデータベース用環境変数。
 */
export type DatabaseEnv = z.infer<typeof databaseEnvSchema>;

/** 環境変数の取得元（通常は process.env） */
type EnvSource = Record<string, string | undefined>;

/**
 * サーバーの設定（環境変数）が不足・不正なことを表すエラー。
 */
export class ServerConfigError extends Error {
  /**
   * ServerConfigError を生成する。
   * @param message エラーメッセージ（変数名のみを含め、値は含めない）
   */
  constructor(message: string) {
    super(message);
    this.name = "ServerConfigError";
  }
}

/**
 * スキーマで環境変数を検証する。
 * @param schema 検証に使うスキーマ
 * @param source 検証する環境変数
 * @returns 検証済みの値
 * @throws {ServerConfigError} 不足・不正な変数がある場合（メッセージには変数名だけを含める）
 */
function parseEnv<T extends z.ZodType>(schema: T, source: EnvSource): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    // 値が漏れないよう、問題のある変数名だけを集めてメッセージにする
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new ServerConfigError(
      `環境変数が設定されていないか不正です: ${names.join(", ")}`,
    );
  }
  return result.data;
}

/**
 * GitHub 用の環境変数を検証する。キャッシュしない純粋な処理で、テストではこちらを直接使う。
 * @param source 検証する環境変数（通常は process.env）
 * @returns 検証済みの GitHub 用環境変数
 * @throws {ServerConfigError} GITHUB_TOKEN が不足・不正な場合
 */
export function parseGitHubEnv(source: EnvSource): GitHubEnv {
  return parseEnv(githubEnvSchema, source);
}

/**
 * 分析用の環境変数を検証する。キャッシュしない純粋な処理で、テストではこちらを直接使う。
 * @param source 検証する環境変数（通常は process.env）
 * @returns 検証済みの分析用環境変数（ANALYSIS_MODEL は未設定なら既定値）
 * @throws {ServerConfigError} ANTHROPIC_API_KEY が不足・不正な場合
 */
export function parseAnalysisEnv(source: EnvSource): AnalysisEnv {
  return parseEnv(analysisEnvSchema, source);
}

/**
 * データベース用の環境変数を検証する。キャッシュしない純粋な処理で、テストではこちらを直接使う。
 * @param source 検証する環境変数（通常は process.env）
 * @returns 検証済みのデータベース用環境変数（DATABASE_URL は未設定なら既定値）
 * @throws {ServerConfigError} DATABASE_URL が不正な場合
 */
export function parseDatabaseEnv(source: EnvSource): DatabaseEnv {
  return parseEnv(databaseEnvSchema, source);
}

/** 検証済み環境変数のキャッシュ */
let cachedGitHubEnv: GitHubEnv | undefined;
let cachedAnalysisEnv: AnalysisEnv | undefined;
let cachedDatabaseEnv: DatabaseEnv | undefined;

/**
 * GitHub 用の環境変数を返す。初回呼び出し時に process.env を検証し、以降はキャッシュを返す。
 * @returns 検証済みの GitHub 用環境変数
 * @throws {ServerConfigError} GITHUB_TOKEN が不足・不正な場合
 */
export function getGitHubEnv(): GitHubEnv {
  cachedGitHubEnv ??= parseGitHubEnv(process.env);
  return cachedGitHubEnv;
}

/**
 * 分析用の環境変数を返す。初回呼び出し時に process.env を検証し、以降はキャッシュを返す。
 * @returns 検証済みの分析用環境変数
 * @throws {ServerConfigError} ANTHROPIC_API_KEY が不足・不正な場合
 */
export function getAnalysisEnv(): AnalysisEnv {
  cachedAnalysisEnv ??= parseAnalysisEnv(process.env);
  return cachedAnalysisEnv;
}

/**
 * データベース用の環境変数を返す。初回呼び出し時に process.env を検証し、以降はキャッシュを返す。
 * @returns 検証済みのデータベース用環境変数
 * @throws {ServerConfigError} DATABASE_URL が不正な場合
 */
export function getDatabaseEnv(): DatabaseEnv {
  cachedDatabaseEnv ??= parseDatabaseEnv(process.env);
  return cachedDatabaseEnv;
}
