import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@openlabel/contracts"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  serverExternalPackages: ["postgres", "@aws-sdk/client-s3"],
};

export default config;
