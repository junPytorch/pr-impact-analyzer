import "server-only";

import { z } from "zod";

/**
 * サーバー側で必要な環境変数のスキーマ。
 */
const serverEnvSchema = z.object({
  GITHUB_TOKEN: z.string().min(1),
});

/**
 * 検証済みのサーバー環境変数。
 */
export type ServerEnv = z.infer<typeof serverEnvSchema>;

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
 * 環境変数を検証して ServerEnv を返す。キャッシュしない純粋な処理で、テストではこちらを直接使う。
 * @param source 検証する環境変数（通常は process.env）
 * @returns 検証済みの環境変数
 * @throws {ServerConfigError} 必要な変数が不足・不正な場合（メッセージには変数名だけを含める）
 */
export function parseServerEnv(source: Record<string, string | undefined>): ServerEnv {
  const result = serverEnvSchema.safeParse(source);
  if (!result.success) {
    // 値が漏れないよう、問題のある変数名だけを集めてメッセージにする
    const names = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new ServerConfigError(
      `環境変数が設定されていないか不正です: ${names.join(", ")}`,
    );
  }
  return result.data;
}

/** 検証済み環境変数のキャッシュ */
let cachedEnv: ServerEnv | undefined;

/**
 * サーバー環境変数を返す。初回呼び出し時に process.env を検証し、以降はキャッシュを返す。
 * @returns 検証済みの環境変数
 * @throws {ServerConfigError} 必要な変数が不足・不正な場合
 */
export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}
