import { z } from "zod";

import type { PullRequestSnapshot } from "./types";

/**
 * 変更ファイルのスキーマ。DB から読み戻した JSON の検証に使う。
 */
const changedFileSchema = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  status: z.enum(["added", "removed", "modified", "renamed", "copied", "changed", "unchanged"]),
  additions: z.number(),
  deletions: z.number(),
  patch: z.string().nullable(),
});

/**
 * PullRequestSnapshot のスキーマ。DB から読み戻した JSON の検証に使う。
 * 型定義（types.ts）とずれた場合は下の satisfies でコンパイルエラーになる。
 */
export const pullRequestSnapshotSchema = z.object({
  ref: z.object({ owner: z.string(), repo: z.string(), pullNumber: z.number() }),
  title: z.string(),
  body: z.string().nullable(),
  author: z.string(),
  state: z.enum(["open", "closed", "merged"]),
  draft: z.boolean(),
  url: z.string(),
  base: z.object({ ref: z.string(), sha: z.string() }),
  head: z.object({ ref: z.string(), sha: z.string() }),
  createdAt: z.string(),
  updatedAt: z.string(),
  stats: z.object({
    additions: z.number(),
    deletions: z.number(),
    changedFiles: z.number(),
  }),
  files: z.array(changedFileSchema),
  filesTruncated: z.boolean(),
  diff: z.string(),
  fetchedAt: z.string(),
}) satisfies z.ZodType<PullRequestSnapshot>;
