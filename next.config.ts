import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    // Keep Turbopack scoped to this app when parent directories have lockfiles.
    root: __dirname,
  },
  images: {
    remotePatterns: [{ protocol: 'https', hostname: '**' }],
  },
  // pdfmake uses Node fs/pdfkit; keep it out of the bundler and ship the Thai fonts with the server build.
  serverExternalPackages: ['pdfmake'],
  outputFileTracingIncludes: {
    '/api/documents/**': ['./lib/documents/fonts/**'],
  },
};

export default nextConfig;
