import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Produces a self-contained server bundle so the runtime image does not need
  // the pnpm workspace or node_modules.
  output: 'standalone',
  // Without this, Next traces from apps/web and misses the hoisted workspace
  // node_modules at the repository root.
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
};

export default nextConfig;
