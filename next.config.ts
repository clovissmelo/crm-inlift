import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typedRoutes: true,
  experimental: {
    optimizePackageImports: ["lucide-react"]
  }
};

export default nextConfig;
