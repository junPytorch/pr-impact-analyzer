import type { RestEndpointMethodTypes } from "@octokit/plugin-rest-endpoint-methods";

/**
 * GitHub 上のプルリクエストを一意に指し示す参照。
 */
export type PullRequestRef = {
  /** リポジトリのオーナー（ユーザー名または Organization 名） */
  owner: string;
  /** リポジトリ名 */
  repo: string;
  /** プルリクエスト番号 */
  pullNumber: number;
};

/**
 * GET /repos/{owner}/{repo}/pulls/{pull_number} のレスポンスデータ。
 */
export type GitHubPullRequest =
  RestEndpointMethodTypes["pulls"]["get"]["response"]["data"];

/**
 * GET /repos/{owner}/{repo}/pulls/{pull_number}/files のレスポンス配列の 1 要素。
 */
export type GitHubPullRequestFile =
  RestEndpointMethodTypes["pulls"]["listFiles"]["response"]["data"][number];
