import "server-only";

import { generateText, Output, type LanguageModel, type LanguageModelUsage } from "ai";

import type { PullRequestSnapshot } from "../pull-requests/types";
import { buildAnalysisPrompt } from "./prompt";
import { pullRequestAnalysisSchema, type PullRequestAnalysis } from "./schema";

/**
 * analyze の結果。
 */
export type PullRequestAnalysisResult = {
  /** 分析結果 */
  analysis: PullRequestAnalysis;
  /** patch の文字数上限を超えたため分析に含めなかったファイル */
  omittedFiles: string[];
  /** トークン使用量 */
  usage: LanguageModelUsage;
  /** 実際に応答したモデルの ID */
  modelId: string;
};

/**
 * Claude などの言語モデルで PR を分析するアナライザー。
 */
export type PullRequestAnalyzer = {
  /**
   * PR のスナップショットを分析する。
   * SDK のエラー（API エラー・スキーマ違反など）はそのまま投げる。リトライは SDK の既定（maxRetries: 2）に任せる。
   * @param snapshot 分析する PR のスナップショット
   * @param options オプション
   * @param options.maxPatchChars プロンプトに含める patch の合計文字数の上限
   * @returns 分析結果・省略したファイル・使用量・モデル ID
   */
  analyze: (
    snapshot: PullRequestSnapshot,
    options?: { maxPatchChars?: number },
  ) => Promise<PullRequestAnalysisResult>;
};

/**
 * PullRequestAnalyzer を生成する。
 * @param deps 依存するオブジェクト
 * @param deps.model 分析に使う言語モデル
 * @returns PullRequestAnalyzer
 */
export function createPullRequestAnalyzer({ model }: { model: LanguageModel }): PullRequestAnalyzer {
  return {
    analyze: async (snapshot, options) => {
      // PR の内容からプロンプトを組み立てる
      const { instructions, prompt, omittedFiles } = buildAnalysisPrompt(snapshot, options);

      // スキーマに沿った JSON を生成させる（スキーマに合わなければ SDK が例外を投げる）
      const result = await generateText({
        model,
        instructions,
        prompt,
        output: Output.object({
          schema: pullRequestAnalysisSchema,
          name: "pull_request_analysis",
        }),
      });

      return {
        analysis: result.output,
        omittedFiles,
        usage: result.usage,
        modelId: result.response.modelId,
      };
    },
  };
}
