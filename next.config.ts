import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // next dev が AGENTS.md を自動生成しないようにする
  agentRules: false,
};

export default nextConfig;
