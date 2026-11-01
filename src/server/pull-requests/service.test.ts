import { describe, expect, it, vi } from "vitest";

import { GitHubApiError } from "../github/errors";
import type {
  GitHubPullRequest,
  GitHubPullRequestFile,
  PullRequestRef,
} from "../github/types";
import { toPullRequestSnapshot } from "./mapper";
import { createPullRequestService, type PullRequestSource } from "./service";

const ref: PullRequestRef = { owner: "octo", repo: "hello", pullNumber: 42 };
const fixedNow = new Date("2026-01-01T00:00:00Z");

// mapper が参照するフィールドだけを持つ最小限のデータ。サービスは中身を mapper に渡すだけなのでキャストで十分
const pullRequest = {
  title: "Add feature",
  body: null,
  user: { login: "alice" },
  state: "open",
  merged_at: null,
  html_url: "https://github.com/octo/hello/pull/42",
  base: { ref: "main", sha: "base-sha" },
  head: { ref: "feature", sha: "head-sha" },
  created_at: "2025-12-31T00:00:00Z",
  updated_at: "2025-12-31T01:00:00Z",
  additions: 1,
  deletions: 0,
  changed_files: 1,
} as unknown as GitHubPullRequest;
const files = [
  { filename: "src/a.ts", status: "added", additions: 1, deletions: 0, patch: "@@ +1 @@\n+a" },
] as unknown as GitHubPullRequestFile[];
const diff = "diff --git a/src/a.ts b/src/a.ts\n";

/**
 * 固定データを返す偽の PullRequestSource を生成する。
 * @param overrides 差し替えるメソッド
 * @returns vi.fn() で作った偽のソース
 */
function makeSource(overrides: Partial<PullRequestSource> = {}) {
  return {
    getPullRequest: vi.fn(async () => pullRequest),
    listPullRequestFiles: vi.fn(async () => files),
    getPullRequestDiff: vi.fn(async () => diff),
    ...overrides,
  } satisfies PullRequestSource;
}

describe("createPullRequestService", () => {
  it("3 つの API を同じ ref で 1 回ずつ呼び、mapper の結果を返す", async () => {
    const github = makeSource();
    const service = createPullRequestService({ github, now: () => fixedNow });

    const snapshot = await service.getSnapshot(ref);

    expect(github.getPullRequest).toHaveBeenCalledExactlyOnceWith(ref);
    expect(github.listPullRequestFiles).toHaveBeenCalledExactlyOnceWith(ref);
    expect(github.getPullRequestDiff).toHaveBeenCalledExactlyOnceWith(ref);
    expect(snapshot).toEqual(
      toPullRequestSnapshot({ ref, pullRequest, files, diff, fetchedAt: fixedNow }),
    );
  });

  it("取得に失敗した場合は同じエラーインスタンスをそのまま投げる", async () => {
    const error = new GitHubApiError("not_found", "Not Found", { status: 404 });
    const github = makeSource({ listPullRequestFiles: vi.fn(async () => Promise.reject(error)) });
    const service = createPullRequestService({ github, now: () => fixedNow });

    const caught = await service.getSnapshot(ref).catch((e: unknown) => e);

    expect(caught).toBe(error);
  });
});
