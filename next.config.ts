import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    // Keep Turbopack scoped to this app when parent directories have lockfiles.
    root: __dirname,
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
};

export default nextConfig;
