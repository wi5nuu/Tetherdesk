/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile workspace packages
  transpilePackages: ['@tetherdesk/crypto', '@tetherdesk/protocol'],
  
  // Configure webpack to resolve workspace dependencies
  webpack: (config) => {
    // Ensure monorepo workspace packages are resolved correctly
    config.resolve.alias = {
      ...config.resolve.alias,
      '@tetherdesk/crypto': require.resolve('@tetherdesk/crypto'),
      '@tetherdesk/protocol': require.resolve('@tetherdesk/protocol'),
    };
    
    return config;
  },
};

module.exports = nextConfig;
