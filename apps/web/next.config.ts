import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@openlabel/contracts"],
  serverExternalPackages: ["postgres"],
};

export default config;
