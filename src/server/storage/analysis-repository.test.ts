import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createTestDatabase, type TestDatabase } from "@/test/sqlite";

import type { PullRequestAnalysis } from "../analysis/schema";
import type { PullRequestSnapshot } from "../pull-requests/types";
import {
  createAnalysisRepository,
  CorruptedRecordError,
  type AnalysisRepository,
} from "./analysis-repository";
import { createPrismaClient } from "./prisma";

/**
 * テスト用のスナップショットを生成する。
 * @param headSha head コミットの SHA
 * @returns テスト用の PullRequestSnapshot
 */
function makeSnapshot(headSha = "sha-1"): PullRequestSnapshot {
  return {
    ref: { owner: "octo", repo: "hello", pullNumber: 1 },
    title: "Rename name to displayName",
    body: null,
    author: "alice",
    state: "open",
    draft: false,
    url: "https://github.com/octo/hello/pull/1",
    base: { ref: "main", sha: "base-sha" },
    head: { ref: "feature", sha: headSha },
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
        patch: "@@ -1 +1 @@\n-a\n+b",
      },
    ],
    filesTruncated: false,
    diff: "diff --git a/src/types/user.ts b/src/types/user.ts\n",
    fetchedAt: "2026-01-02T00:00:00.000Z",
  };
}

/**
 * テスト用の分析結果を生成する。
 * @param riskLevel リスクの評価
 * @returns テスト用の PullRequestAnalysis
 */
function makeAnalysis(riskLevel: PullRequestAnalysis["riskLevel"] = "high"): PullRequestAnalysis {
  return {
    summary: "name を displayName に変更する。",
    riskLevel,
    breakingChange: { isBreaking: true, reasons: ["name がなくなる"] },
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
        description: "クライアントが壊れる",
        evidenceFiles: ["src/types/user.ts"],
      },
    ],
    suggestedTests: [{ description: "displayName を返す", targetFile: null }],
    openQuestions: [],
  };
}

let testDb: TestDatabase;
let prisma: PrismaClient;
let repository: AnalysisRepository;

// テストごとに新しい DB を用意し、テスト同士が影響しないようにする
beforeEach(() => {
  testDb = createTestDatabase();
  prisma = createPrismaClient(testDb.url);
  repository = createAnalysisRepository(prisma);
});

afterEach(async () => {
  await prisma.$disconnect();
  testDb.cleanup();
});

describe("saveSnapshot", () => {
  it("同じ head コミットを 2 回保存しても同じ ID で 1 行だけになる", async () => {
    const first = await repository.saveSnapshot(makeSnapshot("sha-1"));
    const second = await repository.saveSnapshot(makeSnapshot("sha-1"));

    expect(second).toBe(first);
    expect(await prisma.pullRequestSnapshot.count()).toBe(1);
  });

  it("head コミットが変われば別の行になる", async () => {
    const first = await repository.saveSnapshot(makeSnapshot("sha-1"));
    const second = await repository.saveSnapshot(makeSnapshot("sha-2"));

    expect(second).not.toBe(first);
    expect(await prisma.pullRequestSnapshot.count()).toBe(2);
  });
});

describe("saveAnalysis / findLatestAnalysis", () => {
  it("最新の分析結果を、保存した内容と同じ形で返す", async () => {
    const oldSnapshotId = await repository.saveSnapshot(makeSnapshot("sha-1"));
    await repository.saveAnalysis({
      snapshotId: oldSnapshotId,
      analysis: makeAnalysis("low"),
      omittedFiles: [],
      modelId: "model-a",
      usage: { inputTokens: 10, outputTokens: 5 },
    });
    const snapshot = makeSnapshot("sha-2");
    const snapshotId = await repository.saveSnapshot(snapshot);
    const analysis = makeAnalysis("high");
    const analysisId = await repository.saveAnalysis({
      snapshotId,
      analysis,
      omittedFiles: ["big.ts"],
      modelId: "model-b",
      usage: { inputTokens: 100, outputTokens: undefined },
    });

    const latest = await repository.findLatestAnalysis(snapshot.ref);

    expect(latest).toMatchObject({
      id: analysisId,
      modelId: "model-b",
      analysis,
      omittedFiles: ["big.ts"],
      usage: { inputTokens: 100, outputTokens: null },
      snapshot: { id: snapshotId, data: snapshot },
    });
  });

  it("分析がない PR では null を返す", async () => {
    expect(
      await repository.findLatestAnalysis({ owner: "octo", repo: "unknown", pullNumber: 9 }),
    ).toBeNull();
  });

  it("スナップショットを削除すると分析結果も削除される", async () => {
    const snapshotId = await repository.saveSnapshot(makeSnapshot());
    await repository.saveAnalysis({
      snapshotId,
      analysis: makeAnalysis(),
      omittedFiles: [],
      modelId: "model-a",
      usage: { inputTokens: 1, outputTokens: 1 },
    });

    await prisma.pullRequestSnapshot.delete({ where: { id: snapshotId } });

    expect(await prisma.analysis.count()).toBe(0);
  });

  it("保存されている分析結果がスキーマに合わなければ CorruptedRecordError を投げる", async () => {
    const snapshot = makeSnapshot();
    const snapshotId = await repository.saveSnapshot(snapshot);
    const analysisId = await repository.saveAnalysis({
      snapshotId,
      analysis: makeAnalysis(),
      omittedFiles: [],
      modelId: "model-a",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    await prisma.analysis.update({
      where: { id: analysisId },
      data: { result: { ...makeAnalysis(), riskLevel: "extreme" } },
    });

    await expect(repository.findLatestAnalysis(snapshot.ref)).rejects.toThrow(
      CorruptedRecordError,
    );
  });

  it("JSON として読めない値が入っていても CorruptedRecordError を投げる", async () => {
    const snapshot = makeSnapshot();
    const snapshotId = await repository.saveSnapshot(snapshot);
    const analysisId = await repository.saveAnalysis({
      snapshotId,
      analysis: makeAnalysis(),
      omittedFiles: [],
      modelId: "model-a",
      usage: { inputTokens: 1, outputTokens: 1 },
    });
    // Prisma を通さずに、壊れた JSON を直接書き込む
    const db = new Database(testDb.filePath);
    db.prepare('UPDATE "Analysis" SET "result" = ? WHERE "id" = ?').run("{not json", analysisId);
    db.close();

    await expect(repository.findLatestAnalysis(snapshot.ref)).rejects.toThrow(
      CorruptedRecordError,
    );
  });
});
