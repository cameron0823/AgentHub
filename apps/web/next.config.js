/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["postgres"],
  async rewrites() {
    return [];
  },
};

module.exports = nextConfig;
