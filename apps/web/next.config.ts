import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@apartment-finder/shared"],
  typedRoutes: true,
};

export default nextConfig;
