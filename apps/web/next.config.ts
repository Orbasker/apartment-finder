import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@apartment-finder/shared"],
  typedRoutes: true,
  // apify-client dynamically require()s 'proxy-agent' with a variable specifier,
  // which the Next.js bundler cannot trace. Externalizing it lets Node resolve
  // apify-client (and its transitive proxy-agent dep) from node_modules at runtime.
  serverExternalPackages: ["apify-client"],
};

export default nextConfig;
