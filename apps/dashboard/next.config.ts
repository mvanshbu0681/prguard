import path from "node:path";
import type { NextConfig } from "next";

// The repo root holds the hoisted node_modules (npm workspaces) and the API contracts.
const repoRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  devIndicators: false,
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
};

export default nextConfig;
