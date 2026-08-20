/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@sendwhats/shared'],
  // A production `next build` writes to the same directory `next dev` serves from,
  // which breaks a running dev server. Verification builds set NEXT_DIST_DIR so the
  // two never share output.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};

export default nextConfig;
