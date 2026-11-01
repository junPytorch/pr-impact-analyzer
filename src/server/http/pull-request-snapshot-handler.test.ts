import { describe, expect, it, vi } from "vitest";

import { ServerConfigError } from "../env";
import { GitHubApiError, type GitHubApiErrorKind } from "../github/errors";
import type { PullRequestSnapshot } from "../pull-requests/types";
import { createGetPullRequestSnapshotHandler } from "./pull-request-snapshot-handler";

// ハンドラーは中身をそのまま JSON にするだけなので、スナップショットは代表的なフィールドだけで十分
const snapshot = {
  ref: { owner: "octo", repo: "hello", pullNumber: 1 },
  title: "Add feature",
  files: [],
} as unknown as PullRequestSnapshot;

/**
 * 偽のサービスとハンドラーを生成する。
 * @param getSnapshot getSnapshot の実装
 * @returns ハンドラーと偽の getSnapshot
 */
function setup(getSnapshot = vi.fn(async () => snapshot)) {
  const handler = createGetPullRequestSnapshotHandler(() => ({ getSnapshot }));
  return { handler, getSnapshot };
}

/**
 * 指定した種別の GitHubApiError で失敗するハンドラーを呼び、レスポンスを返す。
 * @param kind GitHubApiError の種別
 * @returns ハンドラーのレスポンス
 */
async function respondWithGitHubError(kind: GitHubApiErrorKind) {
  const { handler } = setup(vi.fn(async () => Promise.reject(new GitHubApiError(kind, kind))));
  return handler({ owner: "octo", repo: "hello", number: "1" });
}

describe("createGetPullRequestSnapshotHandler", () => {
  it("正しいパラメーターなら 200 でスナップショットを返す", async () => {
    const { handler, getSnapshot } = setup();

    const res = await handler({ owner: "octo", repo: "hello", number: "1" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(snapshot);
    expect(getSnapshot).toHaveBeenCalledExactlyOnceWith({
      owner: "octo",
      repo: "hello",
      pullNumber: 1,
    });
  });

  it.each([
    { owner: "octo", repo: "hello", number: "abc" },
    { owner: "octo", repo: "hello", number: "0" },
    { owner: "octo/evil", repo: "hello", number: "1" },
  ])("不正なパラメーター %o は 400 invalid_params", async (params) => {
    const { handler, getSnapshot } = setup();

    const res = await handler(params);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_params" });
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it("not_found は 404", async () => {
    const res = await respondWithGitHubError("not_found");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });

  it("rate_limited は 503", async () => {
    const res = await respondWithGitHubError("rate_limited");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "rate_limited" });
  });

  it("unauthorized は 502 github_auth_error", async () => {
    const res = await respondWithGitHubError("unauthorized");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "github_auth_error" });
  });

  it("upstream は 502 upstream_error", async () => {
    const res = await respondWithGitHubError("upstream");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "upstream_error" });
  });

  it("getService が ServerConfigError を投げたら 500 server_misconfigured", async () => {
    const handler = createGetPullRequestSnapshotHandler(() => {
      throw new ServerConfigError("環境変数が設定されていないか不正です: GITHUB_TOKEN");
    });

    const res = await handler({ owner: "octo", repo: "hello", number: "1" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "server_misconfigured" });
  });

  it("想定外のエラーは 500 internal_error", async () => {
    const { handler } = setup(vi.fn(async () => Promise.reject(new Error("boom"))));

    const res = await handler({ owner: "octo", repo: "hello", number: "1" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal_error" });
  });
});
