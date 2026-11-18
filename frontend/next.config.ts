import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's Next.js 16 build adapter handles output tracing directly and fails
  // in onBuildComplete when output: "standalone" is set. Keep standalone enabled
  // for Docker (frontend/Dockerfile + docker-compose.yml) and local builds.
  output: process.env.VERCEL ? undefined : "standalone",
  devIndicators: false,
};

export default nextConfig;
