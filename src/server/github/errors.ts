/**
 * GitHub API 呼び出しの失敗を分類した種別。
 */
export type GitHubApiErrorKind =
  | "not_found"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "upstream"
  | "unknown";

/**
 * GitHub API 呼び出しの失敗を表すアプリケーション共通のエラー。
 */
export class GitHubApiError extends Error {
  /** 失敗の種別 */
  readonly kind: GitHubApiErrorKind;
  /** HTTP ステータスコード（レスポンスを受け取れた場合のみ） */
  readonly status?: number;

  /**
   * GitHubApiError を生成する。
   * @param kind 失敗の種別
   * @param message エラーメッセージ
   * @param options HTTP ステータスと元のエラー
   */
  constructor(
    kind: GitHubApiErrorKind,
    message: string,
    options: { status?: number; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "GitHubApiError";
    this.kind = kind;
    this.status = options.status;
  }
}

/**
 * Octokit の RequestError が持つプロパティのうち、分類に使うもの。
 */
type HttpErrorLike = {
  name: "HttpError";
  status: number;
  message: string;
  response?: { headers?: Record<string, string | number | undefined> };
};

/**
 * 値が Octokit の RequestError（name が "HttpError" で数値の status を持つ）かを判定する。
 * @octokit/request-error は直接の依存ではないため、instanceof ではなく形で判定する。
 * @param error 判定する値
 * @returns RequestError とみなせる場合は true
 */
function isHttpError(error: unknown): error is HttpErrorLike {
  return (
    error instanceof Error &&
    error.name === "HttpError" &&
    typeof (error as { status?: unknown }).status === "number"
  );
}

/**
 * 403 レスポンスがレート制限によるものかを判定する。
 * @param error 403 の RequestError
 * @returns 残りリクエスト数が 0、またはメッセージにレート制限を含む場合は true
 */
function isRateLimited403(error: HttpErrorLike): boolean {
  const remaining = error.response?.headers?.["x-ratelimit-remaining"];
  return String(remaining) === "0" || /rate limit/i.test(error.message);
}

/**
 * 任意の例外を GitHubApiError に変換する。
 * @param error Octokit などから投げられた例外
 * @returns HTTP ステータスに応じて種別を付けた GitHubApiError
 */
export function toGitHubApiError(error: unknown): GitHubApiError {
  // 変換済みのものはそのまま返す
  if (error instanceof GitHubApiError) {
    return error;
  }

  // HTTP レスポンスを伴わない例外（ネットワーク障害など）は unknown
  if (!isHttpError(error)) {
    const message = error instanceof Error ? error.message : String(error);
    return new GitHubApiError("unknown", message, { cause: error });
  }

  // HTTP ステータスに応じて種別を決める
  const { status, message } = error;
  let kind: GitHubApiErrorKind;
  if (status === 404) {
    kind = "not_found";
  } else if (status === 401) {
    kind = "unauthorized";
  } else if (status === 429) {
    kind = "rate_limited";
  } else if (status === 403) {
    kind = isRateLimited403(error) ? "rate_limited" : "forbidden";
  } else if (status >= 500) {
    kind = "upstream";
  } else {
    kind = "unknown";
  }
  return new GitHubApiError(kind, message, { status, cause: error });
}
