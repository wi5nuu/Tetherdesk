/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile workspace packages
  transpilePackages: ['@tetherdesk/crypto', '@tetherdesk/protocol'],
};

module.exports = nextConfig;
