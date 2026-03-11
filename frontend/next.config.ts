import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Non più 'export': Next.js gira come server per gestire le rotte NextAuth (/api/auth/*)
  // Express si occupa delle altre API (/api/*) e Next.js del rendering frontend
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
