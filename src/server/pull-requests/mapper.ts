import type {
  GitHubPullRequest,
  GitHubPullRequestFile,
  PullRequestRef,
} from "../github/types";
import type { ChangedFile, PullRequestSnapshot } from "./types";

/**
 * GitHub の変更ファイル情報をアプリ内の ChangedFile に変換する。
 * @param file files API のレスポンス 1 要素
 * @returns 変換後の ChangedFile
 */
export function toChangedFile(file: GitHubPullRequestFile): ChangedFile {
  return {
    path: file.filename,
    previousPath: file.previous_filename ?? null,
    status: file.status,
    additions: file.additions,
    deletions: file.deletions,
    patch: file.patch ?? null,
  };
}

/**
 * GitHub のプルリクエストの状態を、マージ済みを区別した状態に変換する。
 * @param pullRequest プルリクエストの情報
 * @returns merged_at があれば merged、なければ GitHub の state のまま
 */
function toState(pullRequest: GitHubPullRequest): PullRequestSnapshot["state"] {
  return pullRequest.merged_at != null ? "merged" : pullRequest.state;
}

/**
 * GitHub から取得した各データを PullRequestSnapshot にまとめる。I/O を行わない純粋関数。
 * @param input 変換元のデータ
 * @param input.ref 対象のプルリクエスト
 * @param input.pullRequest プルリクエスト本体の情報
 * @param input.files 変更ファイルの一覧
 * @param input.diff プルリクエスト全体の diff テキスト
 * @param input.fetchedAt 取得日時
 * @returns まとめた PullRequestSnapshot
 */
export function toPullRequestSnapshot(input: {
  ref: PullRequestRef;
  pullRequest: GitHubPullRequest;
  files: GitHubPullRequestFile[];
  diff: string;
  fetchedAt: Date;
}): PullRequestSnapshot {
  const { ref, pullRequest, files, diff, fetchedAt } = input;
  const changedFiles = files.map(toChangedFile);

  return {
    // プルリクエストの基本情報
    ref,
    title: pullRequest.title,
    body: pullRequest.body,
    author: pullRequest.user.login,
    state: toState(pullRequest),
    draft: pullRequest.draft ?? false,
    url: pullRequest.html_url,
    base: { ref: pullRequest.base.ref, sha: pullRequest.base.sha },
    head: { ref: pullRequest.head.ref, sha: pullRequest.head.sha },
    createdAt: pullRequest.created_at,
    updatedAt: pullRequest.updated_at,

    // 変更量と変更ファイル（取得できた件数が全体より少なければ欠けているとみなす）
    stats: {
      additions: pullRequest.additions,
      deletions: pullRequest.deletions,
      changedFiles: pullRequest.changed_files,
    },
    files: changedFiles,
    filesTruncated: pullRequest.changed_files > changedFiles.length,

    diff,
    fetchedAt: fetchedAt.toISOString(),
  };
}
