import "server-only";

import { getServerEnv } from "./env";
import { createGitHubClient } from "./github/client";
import {
  createPullRequestService,
  type PullRequestService,
} from "./pull-requests/service";

/** 生成済みの PullRequestService のキャッシュ */
let pullRequestService: PullRequestService | undefined;

/**
 * 具体的な依存を組み立てて PullRequestService を返す（コンポジションルート）。
 * 初回呼び出し時に一度だけ生成し、以降は同じインスタンスを返す。
 * @returns PullRequestService
 * @throws {ServerConfigError} GITHUB_TOKEN が設定されていない場合
 */
export function getPullRequestService(): PullRequestService {
  if (!pullRequestService) {
    const env = getServerEnv();
    const github = createGitHubClient({ token: env.GITHUB_TOKEN });
    pullRequestService = createPullRequestService({ github });
  }
  return pullRequestService;
}
