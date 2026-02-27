import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "10.66.20.5",
        port: "9000",
        pathname: "/pulseboard/**",
      },
    ],
  },
};

export default nextConfig;
