import "server-only";

import { createAnthropic } from "@ai-sdk/anthropic";

import { createPullRequestAnalyzer, type PullRequestAnalyzer } from "./analysis/analyzer";
import { getAnalysisEnv, getGitHubEnv } from "./env";
import { createGitHubClient } from "./github/client";
import {
  createPullRequestService,
  type PullRequestService,
} from "./pull-requests/service";
import {
  createAnalysisRepository,
  type AnalysisRepository,
} from "./storage/analysis-repository";
import { getPrismaClient } from "./storage/prisma";

/** 生成済みの PullRequestService のキャッシュ */
let pullRequestService: PullRequestService | undefined;
/** 生成済みの PullRequestAnalyzer のキャッシュ */
let pullRequestAnalyzer: PullRequestAnalyzer | undefined;
/** 生成済みの AnalysisRepository のキャッシュ */
let analysisRepository: AnalysisRepository | undefined;

/**
 * 具体的な依存を組み立てて PullRequestService を返す（コンポジションルート）。
 * 初回呼び出し時に一度だけ生成し、以降は同じインスタンスを返す。
 * @returns PullRequestService
 * @throws {ServerConfigError} GITHUB_TOKEN が設定されていない場合
 */
export function getPullRequestService(): PullRequestService {
  if (!pullRequestService) {
    const env = getGitHubEnv();
    const github = createGitHubClient({ token: env.GITHUB_TOKEN });
    pullRequestService = createPullRequestService({ github });
  }
  return pullRequestService;
}

/**
 * 具体的な依存を組み立てて PullRequestAnalyzer を返す（コンポジションルート）。
 * API キーは環境変数を暗黙に読ませず、検証済みの値を明示的に渡す。
 * @returns PullRequestAnalyzer
 * @throws {ServerConfigError} ANTHROPIC_API_KEY が設定されていない場合
 */
export function getPullRequestAnalyzer(): PullRequestAnalyzer {
  if (!pullRequestAnalyzer) {
    const env = getAnalysisEnv();
    const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY });
    pullRequestAnalyzer = createPullRequestAnalyzer({ model: anthropic(env.ANALYSIS_MODEL) });
  }
  return pullRequestAnalyzer;
}

/**
 * 共有の PrismaClient を使う AnalysisRepository を返す（コンポジションルート）。
 * @returns AnalysisRepository
 * @throws {ServerConfigError} DATABASE_URL が不正な場合
 */
export function getAnalysisRepository(): AnalysisRepository {
  analysisRepository ??= createAnalysisRepository(getPrismaClient());
  return analysisRepository;
}
