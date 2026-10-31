import { setupServer } from "msw/node";

/**
 * テスト全体で共有する MSW サーバー。ハンドラーは各テストで server.use() で登録する。
 */
export const server = setupServer();
