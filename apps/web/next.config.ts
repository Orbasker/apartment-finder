import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@apartment-finder/shared"],
  experimental: {
    typedRoutes: true,
  },
};

export default nextConfig;
