import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@apartment-finder/shared"],
  typedRoutes: true,
  // apify-client dynamically require()s 'proxy-agent' with a variable specifier,
  // which the Next.js bundler cannot trace. Externalize both so Node resolves
  // them from node_modules at runtime.
  serverExternalPackages: ["apify-client", "proxy-agent"],
};

export default nextConfig;
