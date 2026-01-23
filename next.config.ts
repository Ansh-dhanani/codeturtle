import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Suppress source map warnings in production builds
  productionBrowserSourceMaps: false,
  // Reduce build output verbosity
  logging: {
    fetches: {
      fullUrl: false,
    },
  },
  // Configure Turbopack (empty config to acknowledge Turbopack usage)
  turbopack: {},
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'avatars.githubusercontent.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
