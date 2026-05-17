import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
  },
  // Skip full tsc during docker build — already clean in dev before pushing.
  // SWC-only compilation cuts the CPU spike that was freezing the Unraid build host.
  typescript: { ignoreBuildErrors: true },
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "10.66.20.5",
        port: "9000",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
