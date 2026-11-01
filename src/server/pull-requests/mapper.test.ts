import { describe, expect, it } from "vitest";

import type {
  GitHubPullRequest,
  GitHubPullRequestFile,
  PullRequestRef,
} from "../github/types";
import { toChangedFile, toPullRequestSnapshot } from "./mapper";

const ref: PullRequestRef = { owner: "octo", repo: "hello", pullNumber: 42 };

/**
 * テスト用のプルリクエストを生成する。
 * mapper が参照するフィールドだけを持つ。GitHub の型は数百のフィールドを持ち全部を用意するのは
 * 非現実的で、mapper はここにあるフィールドしか読まないため as unknown as でキャストしてよい。
 * @param overrides 既定値を上書きするフィールド
 * @returns テスト用の GitHubPullRequest
 */
function makePullRequest(overrides: Record<string, unknown> = {}): GitHubPullRequest {
  return {
    title: "Add feature",
    body: "本文",
    user: { login: "alice" },
    state: "open",
    merged_at: null,
    draft: false,
    html_url: "https://github.com/octo/hello/pull/42",
    base: { ref: "main", sha: "base-sha" },
    head: { ref: "feature", sha: "head-sha" },
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-02T00:00:00Z",
    additions: 10,
    deletions: 3,
    changed_files: 1,
    ...overrides,
  } as unknown as GitHubPullRequest;
}

/**
 * テスト用の変更ファイルを生成する。
 * makePullRequest と同じ理由で、mapper が参照するフィールドだけを持たせてキャストする。
 * @param overrides 既定値を上書きするフィールド
 * @returns テスト用の GitHubPullRequestFile
 */
function makeFile(overrides: Record<string, unknown> = {}): GitHubPullRequestFile {
  return {
    filename: "src/a.ts",
    status: "modified",
    additions: 2,
    deletions: 1,
    patch: "@@ -1 +1 @@\n-a\n+b",
    ...overrides,
  } as unknown as GitHubPullRequestFile;
}

/**
 * 指定したプルリクエストとファイルでスナップショットを生成する。
 * @param pullRequest プルリクエスト
 * @param files 変更ファイルの一覧
 * @returns 生成したスナップショット
 */
function snapshotOf(
  pullRequest: GitHubPullRequest,
  files: GitHubPullRequestFile[] = [makeFile()],
) {
  return toPullRequestSnapshot({
    ref,
    pullRequest,
    files,
    diff: "diff text",
    fetchedAt: new Date("2026-01-03T04:05:06Z"),
  });
}

describe("toPullRequestSnapshot", () => {
  it("基本的な項目を変換する", () => {
    const snapshot = snapshotOf(makePullRequest());

    expect(snapshot).toMatchObject({
      ref,
      title: "Add feature",
      body: "本文",
      author: "alice",
      url: "https://github.com/octo/hello/pull/42",
      base: { ref: "main", sha: "base-sha" },
      head: { ref: "feature", sha: "head-sha" },
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-02T00:00:00Z",
      stats: { additions: 10, deletions: 3, changedFiles: 1 },
      diff: "diff text",
      fetchedAt: "2026-01-03T04:05:06.000Z",
    });
  });

  it("merged_at の有無で merged / closed / open を判定する", () => {
    expect(
      snapshotOf(makePullRequest({ state: "closed", merged_at: "2026-01-02T00:00:00Z" })).state,
    ).toBe("merged");
    expect(snapshotOf(makePullRequest({ state: "closed", merged_at: null })).state).toBe(
      "closed",
    );
    expect(snapshotOf(makePullRequest({ state: "open" })).state).toBe("open");
  });

  it("draft がない場合は false にする", () => {
    expect(snapshotOf(makePullRequest({ draft: undefined })).draft).toBe(false);
  });

  it("changed_files が取得件数より多い場合だけ filesTruncated を true にする", () => {
    const threeFiles = [makeFile(), makeFile(), makeFile()];

    expect(snapshotOf(makePullRequest({ changed_files: 5 }), threeFiles).filesTruncated).toBe(
      true,
    );
    expect(snapshotOf(makePullRequest({ changed_files: 3 }), threeFiles).filesTruncated).toBe(
      false,
    );
  });
});

describe("toChangedFile", () => {
  it("リネームの場合は previousPath を設定し、通常は null にする", () => {
    const renamed = toChangedFile(
      makeFile({ filename: "src/new.ts", previous_filename: "src/old.ts", status: "renamed" }),
    );
    const normal = toChangedFile(makeFile());

    expect(renamed).toMatchObject({
      path: "src/new.ts",
      previousPath: "src/old.ts",
      status: "renamed",
    });
    expect(normal.previousPath).toBeNull();
  });

  it("patch がない場合は null にする", () => {
    expect(toChangedFile(makeFile({ patch: undefined })).patch).toBeNull();
  });
});
