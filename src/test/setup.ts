import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

// ハンドラー未登録のリクエストはエラーにして、実際の GitHub API へ出ていかないようにする
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
// テストごとに登録したハンドラーを破棄する
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
