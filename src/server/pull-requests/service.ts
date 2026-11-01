import "server-only";

import type { GitHubClient } from "../github/client";
import type { PullRequestRef } from "../github/types";
import { toPullRequestSnapshot } from "./mapper";
import type { PullRequestSnapshot } from "./types";

/**
 * PullRequestService が必要とする GitHub クライアントの機能。
 */
export type PullRequestSource = Pick<
  GitHubClient,
  "getPullRequest" | "listPullRequestFiles" | "getPullRequestDiff"
>;

/**
 * プルリクエストのスナップショットを取得するサービス。
 */
export type PullRequestService = {
  /**
   * プルリクエスト本体・変更ファイル・diff を取得してスナップショットにまとめる。
   * @param ref 対象のプルリクエスト
   * @returns 取得したスナップショット
   * @throws GitHub クライアントが投げたエラーをそのまま投げ直す
   */
  getSnapshot: (ref: PullRequestRef) => Promise<PullRequestSnapshot>;
};

/**
 * PullRequestService を生成する。
 * @param deps 依存するオブジェクト
 * @param deps.github プルリクエストの取得元
 * @param deps.now 現在時刻を返す関数（テストで固定するため。既定は new Date()）
 * @returns PullRequestService
 */
export function createPullRequestService({
  github,
  now = () => new Date(),
}: {
  github: PullRequestSource;
  now?: () => Date;
}): PullRequestService {
  return {
    getSnapshot: async (ref) => {
      // 3 つの API を並行して呼ぶ。どれかが失敗したらそのエラーをそのまま呼び出し元に伝える
      const [pullRequest, files, diff] = await Promise.all([
        github.getPullRequest(ref),
        github.listPullRequestFiles(ref),
        github.getPullRequestDiff(ref),
      ]);

      // 取得結果をスナップショットにまとめる
      return toPullRequestSnapshot({
        ref,
        pullRequest,
        files,
        diff,
        fetchedAt: now(),
      });
    },
  };
}
