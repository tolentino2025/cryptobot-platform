/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  transpilePackages: ['@cryptobot/shared-types'],
};

module.exports = nextConfig;
