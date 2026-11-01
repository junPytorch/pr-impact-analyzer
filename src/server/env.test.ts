import { afterEach, describe, expect, it, vi } from "vitest";

import { parseServerEnv, ServerConfigError } from "./env";

// getServerEnv はキャッシュを持つため、キャッシュのない parseServerEnv を process.env で直接検証する
describe("parseServerEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("GITHUB_TOKEN がなければ変数名だけを含む ServerConfigError を投げる", () => {
    vi.stubEnv("GITHUB_TOKEN", "");

    expect(() => parseServerEnv(process.env)).toThrow(ServerConfigError);
    expect(() => parseServerEnv(process.env)).toThrow(/GITHUB_TOKEN/);
  });

  it("GITHUB_TOKEN があればその値を返す", () => {
    vi.stubEnv("GITHUB_TOKEN", "dummy-token");

    expect(parseServerEnv(process.env)).toEqual({ GITHUB_TOKEN: "dummy-token" });
  });
});
