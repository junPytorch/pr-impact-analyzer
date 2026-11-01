import { z } from "zod";

import { ServerConfigError } from "../env";
import { GitHubApiError, type GitHubApiErrorKind } from "../github/errors";
import type { PullRequestService } from "../pull-requests/service";

/** GitHub のオーナー名・リポジトリ名として許可する文字列 */
const nameSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,100}$/);

/**
 * URL のパスパラメーターのスキーマ。
 */
export const paramsSchema = z.object({
  owner: nameSchema,
  repo: nameSchema,
  number: z.coerce.number().int().positive(),
});

/**
 * GitHubApiError の種別ごとの HTTP ステータスとエラーコード。
 */
const githubErrorResponses: Record<
  GitHubApiErrorKind,
  { status: number; error: string }
> = {
  not_found: { status: 404, error: "not_found" },
  rate_limited: { status: 503, error: "rate_limited" },
  unauthorized: { status: 502, error: "github_auth_error" },
  forbidden: { status: 502, error: "github_auth_error" },
  upstream: { status: 502, error: "upstream_error" },
  unknown: { status: 500, error: "internal_error" },
};

/**
 * 例外をエラーレスポンスに変換する。
 * @param error 捕捉した例外
 * @returns 例外の種類に応じたステータスの JSON レスポンス
 */
function toErrorResponse(error: unknown): Response {
  // GitHub API のエラーは種別に応じて変換する
  if (error instanceof GitHubApiError) {
    const { status, error: code } = githubErrorResponses[error.kind];
    return Response.json({ error: code }, { status });
  }
  // 環境変数の不足はサーバー設定の問題として扱う
  if (error instanceof ServerConfigError) {
    return Response.json({ error: "server_misconfigured" }, { status: 500 });
  }
  return Response.json({ error: "internal_error" }, { status: 500 });
}

/**
 * エラーをログに出す。トークンを含みうるリクエスト情報は出さず、種別とメッセージだけを出す。
 * @param error 捕捉した例外
 */
function logError(error: unknown): void {
  if (error instanceof GitHubApiError) {
    console.error(`[pull-request-snapshot] GitHubApiError kind=${error.kind} status=${error.status ?? "-"}: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(`[pull-request-snapshot] ${error.name}: ${error.message}`);
  } else {
    console.error("[pull-request-snapshot] unknown error");
  }
}

/**
 * プルリクエストのスナップショットを返す GET ハンドラーを生成する。
 * Next.js に依存しないため、テストから直接呼び出せる。
 * @param getService PullRequestService を返す関数（呼び出し時に生成するため、設定エラーもここで捕捉できる）
 * @returns パスパラメーターを受け取ってレスポンスを返す関数
 */
export function createGetPullRequestSnapshotHandler(
  getService: () => Pick<PullRequestService, "getSnapshot">,
): (rawParams: unknown) => Promise<Response> {
  return async (rawParams) => {
    // パスパラメーターを検証する
    const parsed = paramsSchema.safeParse(rawParams);
    if (!parsed.success) {
      return Response.json(
        { error: "invalid_params", issues: z.flattenError(parsed.error) },
        { status: 400 },
      );
    }

    // スナップショットを取得して返す。失敗したら種類に応じたエラーレスポンスにする
    const { owner, repo, number } = parsed.data;
    try {
      const snapshot = await getService().getSnapshot({ owner, repo, pullNumber: number });
      return Response.json(snapshot);
    } catch (error) {
      logError(error);
      return toErrorResponse(error);
    }
  };
}
