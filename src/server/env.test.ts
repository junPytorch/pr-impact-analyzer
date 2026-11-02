import { afterEach, describe, expect, it, vi } from "vitest";

import { parseAnalysisEnv, parseGitHubEnv, ServerConfigError } from "./env";

// get*Env はキャッシュを持つため、キャッシュのない parse*Env を process.env で直接検証する
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("parseGitHubEnv", () => {
  it("GITHUB_TOKEN がなければ変数名だけを含む ServerConfigError を投げる", () => {
    vi.stubEnv("GITHUB_TOKEN", "");

    expect(() => parseGitHubEnv(process.env)).toThrow(ServerConfigError);
    expect(() => parseGitHubEnv(process.env)).toThrow(/GITHUB_TOKEN/);
  });

  it("GITHUB_TOKEN があればその値を返す", () => {
    vi.stubEnv("GITHUB_TOKEN", "dummy-token");

    expect(parseGitHubEnv(process.env)).toEqual({ GITHUB_TOKEN: "dummy-token" });
  });

  it("ANTHROPIC_API_KEY がなくても GitHub 用の検証は通る", () => {
    vi.stubEnv("GITHUB_TOKEN", "dummy-token");
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    expect(parseGitHubEnv(process.env)).toEqual({ GITHUB_TOKEN: "dummy-token" });
  });
});

describe("parseAnalysisEnv", () => {
  it("ANTHROPIC_API_KEY がなければ変数名だけを含む ServerConfigError を投げる", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");

    expect(() => parseAnalysisEnv(process.env)).toThrow(ServerConfigError);
    expect(() => parseAnalysisEnv(process.env)).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("ANALYSIS_MODEL が未設定なら既定のモデルを使う", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "dummy-key");
    vi.stubEnv("ANALYSIS_MODEL", undefined);

    expect(parseAnalysisEnv(process.env)).toEqual({
      ANTHROPIC_API_KEY: "dummy-key",
      ANALYSIS_MODEL: "claude-sonnet-5-5",
    });
  });

  it("ANALYSIS_MODEL が設定されていればその値を使う", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "dummy-key");
    vi.stubEnv("ANALYSIS_MODEL", "claude-opus-5-5");

    expect(parseAnalysisEnv(process.env).ANALYSIS_MODEL).toBe("claude-opus-5-5");
  });
});
