import { z } from "zod";

/** 重大度・リスクの 3 段階 */
const levelSchema = z.enum(["low", "medium", "high"]);

/**
 * Claude に出力させる PR 分析結果のスキーマ。
 * 構造化出力との相性のため、値がないことがあるフィールドは optional ではなく nullable にする。
 */
export const pullRequestAnalysisSchema = z.object({
  summary: z.string().describe("PR の変更内容の要約（日本語で 2〜4 文）"),
  riskLevel: levelSchema.describe("マージした場合のリスクの総合評価"),
  breakingChange: z
    .object({
      isBreaking: z
        .boolean()
        .describe("既存のクライアントや利用者を壊す変更を含むかどうか"),
      reasons: z
        .array(z.string())
        .describe("破壊的変更と判断した理由。破壊的でなければ空配列"),
    })
    .describe("破壊的変更の有無"),
  changedApis: z
    .array(
      z.object({
        method: z
          .string()
          .nullable()
          .describe("HTTP メソッド（GET など）。HTTP API でなければ null"),
        path: z
          .string()
          .nullable()
          .describe("API のパス（/api/users/:id など）。HTTP API でなければ null"),
        name: z.string().describe("API・関数・型などの名前"),
        changeKind: z
          .enum(["added", "modified", "removed"])
          .describe("変更の種類"),
        description: z.string().describe("何がどう変わったか"),
      }),
    )
    .describe("追加・変更・削除された公開 API やインターフェース"),
  impacts: z
    .array(
      z.object({
        area: z
          .enum(["api_contract", "auth", "response_format", "data_model", "docs", "other"])
          .describe("影響の領域"),
        severity: levelSchema.describe("影響の大きさ"),
        description: z.string().describe("影響の内容と、影響を受ける相手"),
        evidenceFiles: z
          .array(z.string())
          .describe("根拠となる変更ファイルのパス（PR に含まれるものだけ）"),
      }),
    )
    .describe("この変更が与える影響"),
  suggestedTests: z
    .array(
      z.object({
        description: z.string().describe("追加・確認すべきテストの内容"),
        targetFile: z
          .string()
          .nullable()
          .describe("テスト対象のファイルパス。特定できなければ null"),
      }),
    )
    .describe("マージ前に追加・確認すべきテスト"),
  openQuestions: z
    .array(z.string())
    .describe("PR の情報だけでは判断できず、作成者に確認すべきこと"),
});

/**
 * PR 分析結果。
 */
export type PullRequestAnalysis = z.infer<typeof pullRequestAnalysisSchema>;
