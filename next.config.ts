import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // pdfkit reads its AFM font metrics from disk at runtime — keep it external
  // so the bundler does not inline it.
  serverExternalPackages: ["pdfkit"],
  // Turbopack's persistent dev cache corrupts when the dev server is killed
  // mid-write (sandbox harness restarts it per work block) and then panics on
  // boot. In-memory compilation avoids the whole failure mode.
  experimental: {
    turbopackFileSystemCacheForDev: false,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
