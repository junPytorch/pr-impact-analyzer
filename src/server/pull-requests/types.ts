import type { PullRequestRef } from "../github/types";

/**
 * 変更ファイルの変更種別（GitHub の files API の status と同じ値）。
 */
export type ChangedFileStatus =
  | "added"
  | "removed"
  | "modified"
  | "renamed"
  | "copied"
  | "changed"
  | "unchanged";

/**
 * プルリクエストで変更された 1 ファイル分の情報。
 */
export type ChangedFile = {
  /** 変更後のパス */
  path: string;
  /** リネーム前のパス（リネームでない場合は null） */
  previousPath: string | null;
  /** 変更種別 */
  status: ChangedFileStatus;
  /** 追加行数 */
  additions: number;
  /** 削除行数 */
  deletions: number;
  /** unified diff の hunk 部分（バイナリや巨大な差分で GitHub が省略した場合は null） */
  patch: string | null;
};

/**
 * ある時点で取得したプルリクエストの情報をまとめたもの。
 */
export type PullRequestSnapshot = {
  /** 対象のプルリクエスト */
  ref: PullRequestRef;
  /** タイトル */
  title: string;
  /** 本文 */
  body: string | null;
  /** 作成者のログイン名 */
  author: string;
  /** 状態（マージ済みの場合は merged） */
  state: "open" | "closed" | "merged";
  /** ドラフトかどうか */
  draft: boolean;
  /** GitHub 上の URL */
  url: string;
  /** マージ先ブランチ */
  base: { ref: string; sha: string };
  /** マージ元ブランチ */
  head: { ref: string; sha: string };
  /** 作成日時（ISO 8601） */
  createdAt: string;
  /** 更新日時（ISO 8601） */
  updatedAt: string;
  /** プルリクエスト全体の変更量 */
  stats: { additions: number; deletions: number; changedFiles: number };
  /** 変更ファイルの一覧 */
  files: ChangedFile[];
  /** files が GitHub の上限などで全件そろっていない場合は true */
  filesTruncated: boolean;
  /** プルリクエスト全体の diff テキスト */
  diff: string;
  /** 取得日時（ISO 8601） */
  fetchedAt: string;
};
