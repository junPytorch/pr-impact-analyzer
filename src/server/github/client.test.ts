import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";

import { server } from "@/test/msw/server";

import { createGitHubClient } from "./client";
import { GitHubApiError } from "./errors";
import type { PullRequestRef } from "./types";

const TOKEN = "test-token";
const PR_URL = "https://api.github.com/repos/octo/hello/pulls/42";
const FILES_URL = `${PR_URL}/files`;
const ref: PullRequestRef = { owner: "octo", repo: "hello", pullNumber: 42 };

/**
 * テスト用のクライアントを生成する。リトライ待ちを 1ms 単位にして実時間の待機をなくす。
 * @returns テスト用の GitHubClient
 */
function createTestClient() {
  return createGitHubClient({
    token: TOKEN,
    retryAfterBaseValue: 1,
    logger: { warn: () => {} },
  });
}

/**
 * 現在時刻から指定秒数後の UNIX 時刻（秒）を返す。
 * @param seconds 現在からの秒数
 * @returns x-ratelimit-reset ヘッダーに入れる値
 */
function epochSecondsFromNow(seconds: number): string {
  return String(Math.floor(Date.now() / 1000) + seconds);
}

/**
 * プライマリレート制限を表す 429 レスポンスを生成する。
 * @param resetInSeconds 制限が解除されるまでの秒数
 * @returns 429 レスポンス
 */
function rateLimitedResponse(resetInSeconds: number) {
  return HttpResponse.json(
    { message: "API rate limit exceeded" },
    {
      status: 429,
      headers: {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": epochSecondsFromNow(resetInSeconds),
      },
    },
  );
}

/**
 * 非同期処理が GitHubApiError で失敗することを確認し、そのエラーを返す。
 * @param promise 失敗するはずの Promise
 * @returns 捕捉した GitHubApiError
 */
async function expectGitHubApiError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(GitHubApiError);
  return error as GitHubApiError;
}

describe("createGitHubClient", () => {
  it("getPullRequest はトークン付きでリクエストしてデータを返す", async () => {
    let authorization: string | null = null;
    server.use(
      http.get(PR_URL, ({ request }) => {
        authorization = request.headers.get("authorization");
        return HttpResponse.json({ number: 42, title: "Add feature" });
      }),
    );

    const pr = await createTestClient().getPullRequest(ref);

    expect(pr).toMatchObject({ number: 42, title: "Add feature" });
    expect(authorization).toContain(TOKEN);
  });

  it("listPullRequestFiles は Link ヘッダーをたどって全ページを連結する", async () => {
    const requestedUrls: URL[] = [];
    server.use(
      http.get(FILES_URL, ({ request }) => {
        const url = new URL(request.url);
        requestedUrls.push(url);
        // 2 ページ目
        if (url.searchParams.get("page") === "2") {
          return HttpResponse.json([{ filename: "b.ts" }]);
        }
        // 1 ページ目は次ページへの Link を付ける
        return HttpResponse.json([{ filename: "a.ts" }], {
          headers: {
            link: `<${FILES_URL}?per_page=100&page=2>; rel="next", <${FILES_URL}?per_page=100&page=2>; rel="last"`,
          },
        });
      }),
    );

    const files = await createTestClient().listPullRequestFiles(ref);

    expect(files.map((f) => f.filename)).toEqual(["a.ts", "b.ts"]);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[0].searchParams.get("per_page")).toBe("100");
  });

  it("getPullRequestDiff は diff の Accept ヘッダーで取得したテキストを返す", async () => {
    let accept: string | null = null;
    const diffText = "diff --git a/a.ts b/a.ts\n";
    server.use(
      http.get(PR_URL, ({ request }) => {
        accept = request.headers.get("accept");
        return HttpResponse.text(diffText, {
          headers: { "content-type": "application/vnd.github.diff; charset=utf-8" },
        });
      }),
    );

    const diff = await createTestClient().getPullRequestDiff(ref);

    expect(diff).toBe(diffText);
    expect(accept).toBe("application/vnd.github.v3.diff");
  });

  it("500 のあと 200 なら成功し、リクエストは 2 回", async () => {
    let count = 0;
    server.use(
      http.get(PR_URL, () => {
        count += 1;
        return count === 1
          ? HttpResponse.json({ message: "Server Error" }, { status: 500 })
          : HttpResponse.json({ number: 42 });
      }),
    );

    const pr = await createTestClient().getPullRequest(ref);

    expect(pr).toMatchObject({ number: 42 });
    expect(count).toBe(2);
  });

  it("404 は not_found で失敗し、リクエストは 1 回", async () => {
    let count = 0;
    server.use(
      http.get(PR_URL, () => {
        count += 1;
        return HttpResponse.json({ message: "Not Found" }, { status: 404 });
      }),
    );

    const error = await expectGitHubApiError(createTestClient().getPullRequest(ref));

    expect(error.kind).toBe("not_found");
    expect(error.status).toBe(404);
    expect(count).toBe(1);
  });

  it("429 が続く場合はレート制限のリトライを 1 回だけ行い、リクエストは 2 回", async () => {
    let count = 0;
    server.use(
      http.get(PR_URL, () => {
        count += 1;
        return rateLimitedResponse(1);
      }),
    );

    const error = await expectGitHubApiError(createTestClient().getPullRequest(ref));

    expect(error.kind).toBe("rate_limited");
    expect(count).toBe(2);
  });

  it("429 の解除時刻が上限より先ならリトライせず、リクエストは 1 回", async () => {
    let count = 0;
    server.use(
      http.get(PR_URL, () => {
        count += 1;
        return rateLimitedResponse(3600);
      }),
    );

    const error = await expectGitHubApiError(createTestClient().getPullRequest(ref));

    expect(error.kind).toBe("rate_limited");
    expect(count).toBe(1);
  });
});
