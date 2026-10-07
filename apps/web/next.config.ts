import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  // Identifies each build. Browsers still holding a page from an older build get a full reload
  // instead of calling Server Actions that no longer exist ("Failed to find Server Action").
  ...(process.env.OPENLABEL_BUILD_ID ? { deploymentId: process.env.OPENLABEL_BUILD_ID } : {}),
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@openlabel/contracts"],
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  serverExternalPackages: ["postgres", "@aws-sdk/client-s3"],
};

export default config;
