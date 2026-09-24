import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {
    root: 'C:/Users/gabri',
  },
};

export default nextConfig;
