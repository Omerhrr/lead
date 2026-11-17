import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit reads its AFM font metrics from disk at runtime — keep it external
  // so the bundler does not inline it.
  serverExternalPackages: ["pdfkit"],
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
