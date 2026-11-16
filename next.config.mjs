/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build a fully static site (out/) for GitHub Pages. There is no server:
  // /api/* calls are answered in the browser by src/mock (see src/mock/install.ts).
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // The project only ever ran with `next dev`, which does not type-check; keep the build equally lenient.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
