import type { LanguageModelUsage } from "ai";
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";

import { pullRequestAnalysisSchema, type PullRequestAnalysis } from "../analysis/schema";
import type { PullRequestRef } from "../github/types";
import { pullRequestSnapshotSchema } from "../pull-requests/schema";
import type { PullRequestSnapshot } from "../pull-requests/types";

/**
 * DB に保存されたデータが想定の形式でないことを表すエラー。
 */
export class CorruptedRecordError extends Error {
  /**
   * CorruptedRecordError を生成する。
   * @param message エラーメッセージ
   * @param options 元のエラー
   */
  constructor(message: string, options: { cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "CorruptedRecordError";
  }
}

/**
 * saveAnalysis に渡す内容。
 */
export type SaveAnalysisInput = {
  /** 分析対象のスナップショットの ID */
  snapshotId: string;
  /** 分析結果 */
  analysis: PullRequestAnalysis;
  /** 分析に含めなかったファイル */
  omittedFiles: string[];
  /** 応答したモデルの ID */
  modelId: string;
  /** トークン使用量 */
  usage: Pick<LanguageModelUsage, "inputTokens" | "outputTokens">;
};

/**
 * 保存済みの分析結果（スナップショット付き）。
 */
export type StoredAnalysis = {
  /** 分析結果の ID */
  id: string;
  /** 分析した日時 */
  createdAt: Date;
  /** 応答したモデルの ID */
  modelId: string;
  /** 分析結果 */
  analysis: PullRequestAnalysis;
  /** 分析に含めなかったファイル */
  omittedFiles: string[];
  /** トークン使用量（記録がなければ null） */
  usage: { inputTokens: number | null; outputTokens: number | null };
  /** 分析対象のスナップショット */
  snapshot: { id: string; data: PullRequestSnapshot };
};

/**
 * PR スナップショットと分析結果を保存・取得するリポジトリ。
 */
export type AnalysisRepository = {
  /**
   * スナップショットを保存する。同じ PR・同じ head コミットなら既存の行を更新し、同じ ID を返す。
   * @param snapshot 保存するスナップショット
   * @returns スナップショットの ID
   */
  saveSnapshot: (snapshot: PullRequestSnapshot) => Promise<string>;
  /**
   * 分析結果を保存する。
   * @param input 保存する分析結果
   * @returns 分析結果の ID
   */
  saveAnalysis: (input: SaveAnalysisInput) => Promise<string>;
  /**
   * PR の最新の分析結果を、スナップショットと一緒に取得する（head コミットは問わない）。
   * @param ref 対象のプルリクエスト
   * @returns 最新の分析結果。まだなければ null
   * @throws {CorruptedRecordError} 保存されている JSON が想定の形式でない場合
   */
  findLatestAnalysis: (ref: PullRequestRef) => Promise<StoredAnalysis | null>;
};

/**
 * DB から読んだ JSON をスキーマで検証する。
 * @param schema 検証に使うスキーマ
 * @param value DB から読んだ値
 * @param label エラーメッセージに使う項目名
 * @returns 検証済みの値
 * @throws {CorruptedRecordError} スキーマに合わない場合
 */
function parseStored<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CorruptedRecordError(`保存されている ${label} の形式が不正です`, {
      cause: result.error,
    });
  }
  return result.data;
}

/**
 * AnalysisRepository を生成する。
 * @param prisma 使用する PrismaClient
 * @returns AnalysisRepository
 */
export function createAnalysisRepository(prisma: PrismaClient): AnalysisRepository {
  return {
    saveSnapshot: async (snapshot) => {
      const key = {
        owner: snapshot.ref.owner,
        repo: snapshot.ref.repo,
        pullNumber: snapshot.ref.pullNumber,
        headSha: snapshot.head.sha,
      };
      const content = {
        title: snapshot.title,
        payload: snapshot,
        fetchedAt: new Date(snapshot.fetchedAt),
      };
      // (owner, repo, pullNumber, headSha) の一意制約で upsert し、同じコミットなら同じ行を使う
      const row = await prisma.pullRequestSnapshot.upsert({
        where: { owner_repo_pullNumber_headSha: key },
        create: { ...key, ...content },
        update: content,
        select: { id: true },
      });
      return row.id;
    },

    saveAnalysis: async ({ snapshotId, analysis, omittedFiles, modelId, usage }) => {
      const row = await prisma.analysis.create({
        data: {
          snapshotId,
          modelId,
          // 一覧表示や絞り込みに使う項目は列にも持たせる
          riskLevel: analysis.riskLevel,
          isBreaking: analysis.breakingChange.isBreaking,
          result: analysis,
          omittedFiles,
          inputTokens: usage.inputTokens ?? null,
          outputTokens: usage.outputTokens ?? null,
        },
        select: { id: true },
      });
      return row.id;
    },

    findLatestAnalysis: async (ref) => {
      // 対象 PR のスナップショットに紐づく分析のうち、最も新しいものを取得する
      let row;
      try {
        row = await prisma.analysis.findFirst({
          where: {
            snapshot: { owner: ref.owner, repo: ref.repo, pullNumber: ref.pullNumber },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: { snapshot: true },
        });
      } catch (error) {
        // JSON として読めない値が入っていると Prisma 自体が失敗するので、不正データとして扱う
        if (error instanceof SyntaxError) {
          throw new CorruptedRecordError("保存されている JSON を読み取れません", { cause: error });
        }
        throw error;
      }
      if (!row) {
        return null;
      }

      // JSON 列は型が保証されないため、スキーマで検証してから返す
      return {
        id: row.id,
        createdAt: row.createdAt,
        modelId: row.modelId,
        analysis: parseStored(pullRequestAnalysisSchema, row.result, "分析結果"),
        omittedFiles: parseStored(z.array(z.string()), row.omittedFiles, "省略ファイル"),
        usage: { inputTokens: row.inputTokens, outputTokens: row.outputTokens },
        snapshot: {
          id: row.snapshot.id,
          data: parseStored(pullRequestSnapshotSchema, row.snapshot.payload, "スナップショット"),
        },
      };
    },
  };
}
