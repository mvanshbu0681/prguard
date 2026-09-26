// OWNER: T0 (wave 0). FROZEN once T0 merges.
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // No dev "N" badge in screenshots or demos. Error overlays still appear.
  devIndicators: false,
  // Worktrees live inside the repo directory; pin both roots to this web/ directory
  // so Turbopack and output tracing never infer a parent (they must be equal).
  turbopack: { root: __dirname },
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
