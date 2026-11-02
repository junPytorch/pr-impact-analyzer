import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import type { PullRequestSnapshot } from "../pull-requests/types";
import { createPullRequestAnalyzer } from "./analyzer";
import { buildAnalysisPrompt } from "./prompt";
import type { PullRequestAnalysis } from "./schema";

// アナライザーはスナップショットをプロンプトに変換するだけなので、使うフィールドを持つ最小限のデータで十分
const snapshot: PullRequestSnapshot = {
  ref: { owner: "octo", repo: "hello", pullNumber: 1 },
  title: "Rename name to displayName",
  body: null,
  author: "alice",
  state: "open",
  draft: false,
  url: "https://github.com/octo/hello/pull/1",
  base: { ref: "main", sha: "base-sha" },
  head: { ref: "feature", sha: "head-sha" },
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  stats: { additions: 1, deletions: 1, changedFiles: 1 },
  files: [
    {
      path: "src/types/user.ts",
      previousPath: null,
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: "@@ -1 +1 @@\n-  name: string;\n+  displayName: string;",
    },
  ],
  filesTruncated: false,
  diff: "",
  fetchedAt: "2026-01-01T00:00:00.000Z",
};

const validAnalysis: PullRequestAnalysis = {
  summary: "name を displayName に変更する。",
  riskLevel: "high",
  breakingChange: { isBreaking: true, reasons: ["レスポンスの name がなくなる"] },
  changedApis: [
    {
      method: "GET",
      path: "/api/users/:id",
      name: "getUser",
      changeKind: "modified",
      description: "name が displayName になる",
    },
  ],
  impacts: [
    {
      area: "response_format",
      severity: "high",
      description: "name を読むクライアントが壊れる",
      evidenceFiles: ["src/types/user.ts"],
    },
  ],
  suggestedTests: [{ description: "displayName を返すことを確認する", targetFile: null }],
  openQuestions: [],
};

/**
 * 指定したテキストを返すモックモデルを生成する。
 * @param text モデルが返すテキスト（JSON 文字列）
 * @returns MockLanguageModelV4
 */
function mockModelReturning(text: string) {
  return new MockLanguageModelV4({
    modelId: "mock-model",
    doGenerate: {
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: "end_turn" },
      usage: {
        inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 50, text: 50, reasoning: undefined },
      },
      warnings: [],
    },
  });
}

describe("createPullRequestAnalyzer", () => {
  it("モデルの JSON を検証して分析結果を返し、組み立てた指示とプロンプトを渡す", async () => {
    const model = mockModelReturning(JSON.stringify(validAnalysis));
    const analyzer = createPullRequestAnalyzer({ model });

    const result = await analyzer.analyze(snapshot);

    expect(result.analysis).toEqual(validAnalysis);
    expect(result.omittedFiles).toEqual([]);
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(result.modelId).toBe("mock-model");

    // モデルに渡ったメッセージに、組み立てた指示とプロンプトが含まれていること
    const { instructions, prompt } = buildAnalysisPrompt(snapshot);
    const messages = model.doGenerateCalls[0].prompt;
    expect(messages).toContainEqual({ role: "system", content: instructions });
    expect(JSON.stringify(messages)).toContain(JSON.stringify(prompt));
  });

  it("スキーマに合わない JSON が返ったら失敗する", async () => {
    const model = mockModelReturning(JSON.stringify({ ...validAnalysis, riskLevel: "extreme" }));
    const analyzer = createPullRequestAnalyzer({ model });

    await expect(analyzer.analyze(snapshot)).rejects.toThrow();
  });
});
