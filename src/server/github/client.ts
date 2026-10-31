import "server-only";

import { Octokit } from "@octokit/core";
import { paginateRest } from "@octokit/plugin-paginate-rest";
import { restEndpointMethods } from "@octokit/plugin-rest-endpoint-methods";
import { retry } from "@octokit/plugin-retry";
import { throttling } from "@octokit/plugin-throttling";

import { GitHubApiError, toGitHubApiError } from "./errors";
import type {
  GitHubPullRequest,
  GitHubPullRequestFile,
  PullRequestRef,
} from "./types";

/**
 * REST メソッド・ページネーション・リトライ・レート制限対応を組み込んだ Octokit クラス。
 */
const GitHubOctokit = Octokit.plugin(
  restEndpointMethods,
  paginateRest,
  retry,
  throttling,
);

/**
 * 警告の出力先。
 */
export type GitHubClientLogger = {
  /**
   * 警告メッセージを出力する。
   * @param message 出力するメッセージ
   */
  warn: (message: string) => void;
};

/**
 * createGitHubClient に渡すオプション。
 */
export type GitHubClientOptions = {
  /** GitHub のアクセストークン */
  token: string;
  /** API のベース URL（GitHub Enterprise 用。省略時は https://api.github.com） */
  baseUrl?: string;
  /** レート制限時に待ってリトライしてよい最大秒数（既定 10 秒） */
  maxRateLimitWaitSeconds?: number;
  /** リトライ待ち時間の単位（ミリ秒。既定 1000。テストでは 1 程度を渡す） */
  retryAfterBaseValue?: number;
  /** 警告の出力先（既定は console） */
  logger?: GitHubClientLogger;
};

/**
 * プルリクエストの情報を取得する GitHub API クライアント。
 */
export type GitHubClient = {
  /**
   * プルリクエスト本体の情報を取得する。
   * @param ref 対象のプルリクエスト
   * @returns プルリクエストの情報
   * @throws {GitHubApiError} API 呼び出しに失敗した場合
   */
  getPullRequest: (ref: PullRequestRef) => Promise<GitHubPullRequest>;
  /**
   * プルリクエストで変更されたファイルの一覧を全ページ分取得する（GitHub 側の上限は 3000 件）。
   * @param ref 対象のプルリクエスト
   * @returns 変更ファイルの一覧
   * @throws {GitHubApiError} API 呼び出しに失敗した場合
   */
  listPullRequestFiles: (ref: PullRequestRef) => Promise<GitHubPullRequestFile[]>;
  /**
   * プルリクエストの差分を unified diff 形式のテキストで取得する。
   * @param ref 対象のプルリクエスト
   * @returns diff テキスト
   * @throws {GitHubApiError} API 呼び出しに失敗した場合、またはレスポンスが文字列でない場合
   */
  getPullRequestDiff: (ref: PullRequestRef) => Promise<string>;
};

/**
 * PullRequestRef を Octokit のリクエストパラメーターに変換する。
 * @param ref 対象のプルリクエスト
 * @returns owner / repo / pull_number を持つパラメーター
 */
function toParams(ref: PullRequestRef) {
  return { owner: ref.owner, repo: ref.repo, pull_number: ref.pullNumber };
}

/**
 * 非同期処理を実行し、失敗した場合は GitHubApiError に変換して投げ直す。
 * @param fn 実行する非同期処理
 * @returns fn の結果
 * @throws {GitHubApiError} fn が失敗した場合
 */
async function withErrorMapping<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toGitHubApiError(error);
  }
}

/**
 * GitHub API クライアントを生成する。
 * 5xx はリトライプラグインが最大 3 回リトライし、レート制限（403/429）は
 * スロットリングプラグインが待ち時間が上限以内の場合に限り 1 回だけリトライする。
 * @param options トークンやリトライ設定などのオプション
 * @returns プルリクエスト取得用のクライアント
 */
export function createGitHubClient(options: GitHubClientOptions): GitHubClient {
  const {
    token,
    baseUrl,
    maxRateLimitWaitSeconds = 10,
    retryAfterBaseValue = 1000,
    logger = console,
  } = options;

  /**
   * レート制限に達したときにリトライするかを決める（主・二次レート制限で共通）。
   * @param retryAfter リトライまでに待つ秒数
   * @param requestOptions 失敗したリクエストのオプション
   * @param _octokit Octokit インスタンス（未使用）
   * @param retryCount これまでのリトライ回数
   * @returns リトライする場合は true
   */
  const onLimit = (
    retryAfter: number,
    requestOptions: { method: string; url: string },
    _octokit: unknown,
    retryCount: number,
  ): boolean => {
    // 1 回目かつ待ち時間が上限以内ならリトライする
    if (retryCount < 1 && retryAfter <= maxRateLimitWaitSeconds) {
      return true;
    }
    // それ以外は諦めて呼び出し元にエラーを返す
    logger.warn(
      `GitHub のレート制限によりリクエストを中止しました: ${requestOptions.method} ${requestOptions.url}（retryAfter=${retryAfter}s, retryCount=${retryCount}）`,
    );
    return false;
  };

  const octokit = new GitHubOctokit({
    auth: token,
    ...(baseUrl ? { baseUrl } : {}),
    retry: {
      // 4xx（429 を含む）はリトライせず、5xx のみリトライプラグインに任せる
      doNotRetry: [400, 401, 403, 404, 410, 422, 429, 451],
      retryAfterBaseValue,
    },
    throttle: {
      retryAfterBaseValue,
      onRateLimit: onLimit,
      onSecondaryRateLimit: onLimit,
    },
  });

  return {
    getPullRequest: (ref) =>
      withErrorMapping(async () => {
        const { data } = await octokit.rest.pulls.get(toParams(ref));
        return data;
      }),

    listPullRequestFiles: (ref) =>
      withErrorMapping(() =>
        octokit.paginate("GET /repos/{owner}/{repo}/pulls/{pull_number}/files", {
          ...toParams(ref),
          per_page: 100,
        }),
      ),

    getPullRequestDiff: (ref) =>
      withErrorMapping(async () => {
        const { data } = await octokit.rest.pulls.get({
          ...toParams(ref),
          mediaType: { format: "diff" },
        });
        // diff 形式を指定しても型上は JSON のままなので、実行時に文字列か確認する
        const diff: unknown = data;
        if (typeof diff !== "string") {
          throw new GitHubApiError(
            "unknown",
            "diff のレスポンスが文字列ではありませんでした",
          );
        }
        return diff;
      }),
  };
}
