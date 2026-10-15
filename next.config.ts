import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "50mb",
    },
    // Requests pass through the middleware, which by default hands the route only
    // the first 10 MB of a body — silently. An archive image of 12 MB then arrived
    // cut off and decoded as a "truncated JPEG" (2026-10-15). Above the agent
    // route's own 100 MB cap.
    proxyClientMaxBodySize: "110mb",
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
        pathname: "/pulseboard*/**",
      },
    ],
  },
};

export default nextConfig;
