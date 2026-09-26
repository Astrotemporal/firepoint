import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Directions moved onto the homepage map; keep old /map links working.
  async redirects() {
    return [{ source: "/map", destination: "/", permanent: false }];
  },
};

export default nextConfig;
