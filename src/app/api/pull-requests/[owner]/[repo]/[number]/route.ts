import type { NextRequest } from "next/server";

import { getPullRequestService } from "@/server/container";
import { createGetPullRequestSnapshotHandler } from "@/server/http/pull-request-snapshot-handler";

const handler = createGetPullRequestSnapshotHandler(getPullRequestService);

/**
 * プルリクエストのスナップショットを返す。
 * @param _req リクエスト（未使用）
 * @param ctx ルートのコンテキスト（params は Promise）
 * @returns スナップショットまたはエラーの JSON レスポンス
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/pull-requests/[owner]/[repo]/[number]">,
) {
  return handler(await ctx.params);
}
