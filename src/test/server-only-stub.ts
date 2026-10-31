// テスト環境用の "server-only" の代替。
// 本物の server-only は "react-server" 条件以外で import されると例外を投げるため、
// Vitest（Node 環境）では vitest.config.ts の alias でこの空モジュールに差し替える。
export {};
